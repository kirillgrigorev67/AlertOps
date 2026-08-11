import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from config import settings
from models import (
    Alert,
    AlertRule,
    AlertVariant,
    Dashboard,
    HealthStatus,
    LLMProvider,
    Panel,
    QueryRangeRequest,
    QueryRangeResponse,
)
from storage import storage
from grafana_client import grafana
from rule_generator import rule_generator
from query_validator import query_validator
from alert_ai_generator import alert_ai_generator
from diagnosis import diagnosis_service

DATA_DIR = os.environ.get("DATA_DIR", "./data")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    os.makedirs(os.path.join(DATA_DIR, "alerts/active"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, "alerts/history"), exist_ok=True)
    
    # Create default Demo provider if no providers exist
    providers = storage.list("providers")
    if not providers:
        demo_provider = {
            "id": "demo-default",
            "name": "Demo (Built-in)",
            "provider_type": "demo",
            "base_url": "",
            "api_key": "",
            "model": "demo",
            "is_default": True,
            "created_at": datetime.now().isoformat(),
        }
        storage.save("providers", "demo-default", demo_provider)
        print("Created default Demo provider")
    
    yield
    
    # Shutdown: nothing special needed for file storage


app = FastAPI(title="AlertOps API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@api_router.get("/health/services", response_model=List[HealthStatus])
async def services_health():
    services = []
    
    # Check Prometheus
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{settings.prometheus_url}/-/healthy",
                timeout=5.0,
            )
            services.append(
                HealthStatus(
                    service="prometheus",
                    status="healthy" if response.status_code == 200 else "unhealthy",
                    url=settings.prometheus_url,
                )
            )
    except Exception as e:
        services.append(
            HealthStatus(
                service="prometheus",
                status="unhealthy",
                url=settings.prometheus_url,
                error=str(e),
            )
        )
    
    # Check Loki
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{settings.loki_url}/ready",
                timeout=5.0,
            )
            services.append(
                HealthStatus(
                    service="loki",
                    status="healthy" if response.status_code == 200 else "unhealthy",
                    url=settings.loki_url,
                )
            )
    except Exception as e:
        services.append(
            HealthStatus(
                service="loki",
                status="unhealthy",
                url=settings.loki_url,
                error=str(e),
            )
        )
    
    # Check Alertmanager
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{settings.alertmanager_url}/-/healthy",
                timeout=5.0,
            )
            services.append(
                HealthStatus(
                    service="alertmanager",
                    status="healthy" if response.status_code == 200 else "unhealthy",
                    url=settings.alertmanager_url,
                )
            )
    except Exception as e:
        services.append(
            HealthStatus(
                service="alertmanager",
                status="unhealthy",
                url=settings.alertmanager_url,
                error=str(e),
            )
        )
    
    # Check Grafana
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{settings.grafana_url}/api/health",
                timeout=5.0,
            )
            services.append(
                HealthStatus(
                    service="grafana",
                    status="healthy" if response.status_code == 200 else "unhealthy",
                    url=settings.grafana_url,
                )
            )
    except Exception as e:
        services.append(
            HealthStatus(
                service="grafana",
                status="unhealthy",
                url=settings.grafana_url,
                error=str(e),
            )
        )
    
    return services


# Dashboards
@api_router.get("/dashboards", response_model=List[Dashboard])
async def list_dashboards():
    return await grafana.get_dashboards()


@api_router.get("/dashboards/{uid}/panels", response_model=List[Panel])
async def get_panels(uid: str):
    return await grafana.get_panels(uid)


# Alert Rules
@api_router.get("/rules", response_model=List[AlertRule])
async def list_rules():
    return storage.list("rules")


@api_router.post("/rules", response_model=AlertRule)
async def create_rule(rule: AlertRule):
    now = datetime.utcnow().isoformat()
    rule.created_at = now
    rule.updated_at = now
    storage.save("rules", rule.id, rule.dict())
    
    # Generate and write rule file
    if rule.query_type == "logql":
        rule_data = rule_generator.generate_loki_rule(
            name=rule.name,
            query=rule.query,
            condition=rule.condition,
            duration=rule.duration,
            severity=rule.severity,
            labels=rule.labels,
            annotations=rule.annotations,
        )
        rule_generator.write_rule_file(rule.id, rule_data, "logql")
        await rule_generator.reload_loki()
    else:
        rule_data = rule_generator.generate_prometheus_rule(
            name=rule.name,
            query=rule.query,
            condition=rule.condition,
            duration=rule.duration,
            severity=rule.severity,
            labels=rule.labels,
            annotations=rule.annotations,
        )
        rule_generator.write_rule_file(rule.id, rule_data, "promql")
        await rule_generator.reload_prometheus()
    
    return rule


@api_router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: str):
    # Get rule to know which type it is for proper file deletion and reload
    rule = storage.get("rules", rule_id)
    
    # Delete from storage first
    storage.delete("rules", rule_id)
    
    # Delete rule file and reload service
    if rule:
        query_type = rule.get("query_type", "promql")
        rule_generator.delete_rule_file(rule_id, query_type)
        
        if query_type == "logql":
            await rule_generator.reload_loki()
        else:
            await rule_generator.reload_prometheus()
    
    return {"status": "deleted"}


@api_router.put("/rules/{rule_id}", response_model=AlertRule)
async def update_rule(rule_id: str, rule: AlertRule):
    """Update an existing alert rule."""
    existing = storage.get("rules", rule_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    # Preserve original id and created_at
    now = datetime.utcnow().isoformat()
    rule.id = rule_id
    rule.created_at = existing.get("created_at", now)
    rule.updated_at = now
    
    # Save updated rule to storage
    storage.save("rules", rule_id, rule.dict())
    
    # Regenerate and update rule file
    if rule.query_type == "logql":
        rule_data = rule_generator.generate_loki_rule(
            name=rule.name,
            query=rule.query,
            condition=rule.condition,
            duration=rule.duration,
            severity=rule.severity,
            labels=rule.labels,
            annotations=rule.annotations,
        )
        rule_generator.update_rule_file(rule_id, rule_data, "logql")
        await rule_generator.reload_loki()
    else:
        rule_data = rule_generator.generate_prometheus_rule(
            name=rule.name,
            query=rule.query,
            condition=rule.condition,
            duration=rule.duration,
            severity=rule.severity,
            labels=rule.labels,
            annotations=rule.annotations,
        )
        rule_generator.update_rule_file(rule_id, rule_data, "promql")
        await rule_generator.reload_prometheus()
    
    return rule


# AI Alert Generation
@api_router.post("/ai/generate-alerts", response_model=List[AlertVariant])
async def generate_alert_variants(data: Dict[str, Any]):
    query = data.get("query")
    query_type = data.get("query_type", "promql")
    dashboard_title = data.get("dashboard_title", "")
    panel_title = data.get("panel_title", "")
    provider_id = data.get("provider_id")
    
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")
    
    return await alert_ai_generator.generate_variants(
        query=query,
        query_type=query_type,
        dashboard_title=dashboard_title,
        panel_title=panel_title,
        provider_id=provider_id,
    )


@api_router.post("/validate-query")
async def validate_query(data: Dict[str, Any]):
    query = data.get("query")
    query_type = data.get("query_type", "promql")
    
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")
    
    return await query_validator.validate(query, query_type)


# Webhook
@api_router.post("/webhooks/alerts")
async def receive_alert_webhook(
    data: Dict[str, Any], background_tasks: BackgroundTasks
):
    """Receive alerts from Alertmanager. Save immediately, diagnose in background.
    
    Deduplication logic:
    - Firing: check if active alert with same fingerprint exists. If yes, update starts_at.
      If no, create new active alert.
    - Resolved: find active alert with same fingerprint, move to history. If no active found,
      do nothing (user may have already resolved it manually).
    """
    alerts = data.get("alerts", [])
    created_count = 0
    resolved_count = 0
    
    for alert_data in alerts:
        now = datetime.utcnow().isoformat()
        status = alert_data.get("status", "firing")
        fingerprint = alert_data.get("fingerprint", "")
        alertname = alert_data.get("labels", {}).get("alertname", "Unknown")
        
        if status == "firing":
            # Check for existing active alert with same fingerprint
            active_alerts = storage.list("alerts/active")
            existing = None
            for a in active_alerts:
                if a.get("fingerprint") == fingerprint and a.get("alertname") == alertname:
                    existing = a
                    break
            
            if existing:
                # Update existing alert's start time, don't create duplicate
                existing["starts_at"] = alert_data.get("startsAt", now)
                existing["updated_at"] = now
                existing["status"] = "firing"
                storage.save("alerts/active", existing["id"], existing)
            else:
                # Create new active alert
                alert_id = str(uuid.uuid4())
                alert = {
                    "id": alert_id,
                    "alertname": alertname,
                    "status": "firing",
                    "severity": alert_data.get("labels", {}).get("severity", "warning"),
                    "summary": alert_data.get("annotations", {}).get("summary", ""),
                    "description": alert_data.get("annotations", {}).get("description", ""),
                    "labels": alert_data.get("labels", {}),
                    "annotations": alert_data.get("annotations", {}),
                    "starts_at": alert_data.get("startsAt", now),
                    "ends_at": None,
                    "generator_url": alert_data.get("generatorURL", ""),
                    "fingerprint": fingerprint,
                    "diagnosis": None,
                    "diagnosis_status": "pending",
                    "read": False,
                    "created_at": now,
                    "updated_at": now,
                }
                storage.save("alerts/active", alert_id, alert)
                # Trigger background diagnosis only for new firing alerts
                background_tasks.add_task(diagnosis_service.run_diagnosis, alert_id)
                created_count += 1
        
        elif status == "resolved":
            # Find active alert with same fingerprint and move to history
            active_alerts = storage.list("alerts/active")
            existing = None
            for a in active_alerts:
                if a.get("fingerprint") == fingerprint and a.get("alertname") == alertname:
                    existing = a
                    break
            
            if existing:
                # Move to history
                existing["status"] = "resolved"
                existing["ends_at"] = alert_data.get("endsAt", now)
                existing["updated_at"] = now
                storage.save("alerts/history", existing["id"], existing)
                storage.delete("alerts/active", existing["id"])
                resolved_count += 1
            # If no active alert found, do nothing (already resolved manually)
    
    return {
        "status": "received",
        "count": len(alerts),
        "created": created_count,
        "resolved": resolved_count,
    }


# Alert History - MUST be before /alerts/{alert_id} to avoid route conflict
@api_router.get("/alerts/history", response_model=List[Alert])
async def list_alert_history(
    q: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    alerts = storage.list("alerts/history")
    
    if q:
        alerts = [
            alert
            for alert in alerts
            if q.lower() in alert.get("alertname", "").lower()
            or q.lower() in alert.get("description", "").lower()
        ]
    
    if start or end:
        from datetime import datetime as dt
        
        start_dt = dt.fromisoformat(start) if start else None
        end_dt = dt.fromisoformat(end) if end else None
        
        filtered = []
        for alert in alerts:
            try:
                alert_dt = dt.fromisoformat(alert.get("starts_at", ""))
                if start_dt and alert_dt < start_dt:
                    continue
                if end_dt and alert_dt > end_dt:
                    continue
                filtered.append(alert)
            except (ValueError, TypeError):
                continue
        alerts = filtered
    
    return alerts


@api_router.delete("/alerts/history")
async def clear_alert_history():
    """Clear all alert history. Active alerts are preserved."""
    import shutil
    history_dir = os.path.join(settings.data_dir, "alerts", "history")
    if os.path.exists(history_dir):
        shutil.rmtree(history_dir)
        os.makedirs(history_dir, exist_ok=True)
    return {"status": "cleared", "message": "Alert history cleared"}


# Active Alerts
@api_router.get("/alerts", response_model=List[Alert])
async def list_active_alerts():
    return storage.list("alerts/active")


@api_router.get("/alerts/unread-count")
async def get_unread_count():
    """Return the number of all active alerts (including acknowledged)."""
    alerts = storage.list("alerts/active")
    # Count all alerts in active list (firing + acknowledged)
    return {"unread_count": len(alerts)}


@api_router.post("/alerts/mark-all-read")
async def mark_all_alerts_read():
    """Mark all active alerts as read."""
    alerts = storage.list("alerts/active")
    count = 0
    for alert in alerts:
        if not alert.get("read", False):
            alert["read"] = True
            alert["updated_at"] = datetime.utcnow().isoformat()
            storage.save("alerts/active", alert["id"], alert)
            count += 1
    
    return {"status": "read", "count": count}


@api_router.get("/alerts/{alert_id}", response_model=Alert)
async def get_alert(alert_id: str):
    alert = storage.get("alerts/active", alert_id)
    if not alert:
        # Check history
        alert = storage.get("alerts/history", alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")
    return Alert(**alert)


@api_router.post("/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: str):
    """Mark a single alert as read."""
    alert = storage.get("alerts/active", alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    alert["read"] = True
    alert["updated_at"] = datetime.utcnow().isoformat()
    storage.save("alerts/active", alert_id, alert)
    
    return {"status": "read"}


@api_router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str):
    """Manually acknowledge an alert. Does NOT move to history - only Alertmanager resolved webhook does that."""
    alert = storage.get("alerts/active", alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    alert["status"] = "acknowledged"
    alert["acknowledged_at"] = datetime.utcnow().isoformat()
    alert["updated_at"] = datetime.utcnow().isoformat()
    
    # Keep in active, just mark as acknowledged
    storage.save("alerts/active", alert_id, alert)
    
    return {"status": "acknowledged"}


# LLM Providers
@api_router.get("/providers", response_model=List[LLMProvider])
async def list_providers():
    return storage.list("providers")


@api_router.post("/providers", response_model=LLMProvider)
async def create_provider(provider: LLMProvider):
    now = datetime.utcnow().isoformat()
    provider.created_at = now
    
    # If this is the first provider or marked as default, unset others
    if provider.is_default:
        existing = storage.list("providers")
        for p in existing:
            if p.get("is_default"):
                p["is_default"] = False
                storage.save("providers", p["id"], p)
    
    storage.save("providers", provider.id, provider.dict())
    return provider


@api_router.put("/providers/{provider_id}", response_model=LLMProvider)
async def update_provider(provider_id: str, provider: LLMProvider):
    """Update an existing LLM provider."""
    if provider_id == "demo-default":
        raise HTTPException(status_code=403, detail="Cannot edit the built-in Demo provider")
    
    existing = storage.get("providers", provider_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Provider not found")
    
    # Preserve created_at
    provider.id = provider_id
    provider.created_at = existing.get("created_at")
    
    # If setting as default, unset others
    if provider.is_default:
        existing_providers = storage.list("providers")
        for p in existing_providers:
            if p.get("id") != provider_id and p.get("is_default"):
                p["is_default"] = False
                storage.save("providers", p["id"], p)
    
    storage.save("providers", provider_id, provider.dict())
    return provider


@api_router.delete("/providers/{provider_id}")
async def delete_provider(provider_id: str):
    if provider_id == "demo-default":
        raise HTTPException(status_code=403, detail="Cannot delete the built-in Demo provider")
    
    storage.delete("providers", provider_id)
    return {"status": "deleted"}


@api_router.post("/providers/{provider_id}/default")
async def set_default_provider(provider_id: str):
    provider = storage.get("providers", provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    
    # Unset all others
    existing = storage.list("providers")
    for p in existing:
        if p.get("is_default"):
            p["is_default"] = False
            storage.save("providers", p["id"], p)
    
    provider["is_default"] = True
    storage.save("providers", provider_id, provider)
    
    return {"status": "updated"}


@api_router.post("/providers/{provider_id}/test")
async def test_provider(provider_id: str):
    """Test LLM provider connectivity by making a minimal API call."""
    provider_data = storage.get("providers", provider_id)
    if not provider_data:
        raise HTTPException(status_code=404, detail="Provider not found")
    
    provider_type = provider_data.get("provider_type", "openai")
    
    # Demo provider is always healthy
    if provider_type == "demo":
        return {"status": "healthy", "provider_id": provider_id, "error": None}
    
    base_url = provider_data.get("base_url", "").strip()
    api_key = provider_data.get("api_key", "")
    model = provider_data.get("model", "gpt-4")
    
    if not base_url or base_url == "http://localhost":
        return {"status": "unhealthy", "provider_id": provider_id, "error": "Invalid base URL"}
    
    try:
        from llm import get_provider
        
        llm = get_provider(provider_type, base_url, api_key, model)
        # Make a minimal test call
        response = await llm.generate("Say 'ok' and nothing else.", temperature=0, max_tokens=10)
        
        if response and len(response.strip()) > 0:
            return {"status": "healthy", "provider_id": provider_id, "error": None}
        else:
            return {"status": "unhealthy", "provider_id": provider_id, "error": "Empty response"}
            
    except httpx.ConnectError as e:
        return {"status": "unhealthy", "provider_id": provider_id, "error": f"Connection failed: {str(e)}"}
    except httpx.HTTPStatusError as e:
        return {"status": "unhealthy", "provider_id": provider_id, "error": f"HTTP {e.response.status_code}: {e.response.text[:200]}"}
    except Exception as e:
        return {"status": "unhealthy", "provider_id": provider_id, "error": str(e)[:200]}


# Grafana embed proxy - fixes relative paths in Grafana 11 solo panels
@api_router.get("/grafana-proxy/solo/{uid}/{slug}")
async def grafana_solo_proxy(uid: str, slug: str, request: Request):
    """
    Proxy Grafana solo panel requests and fix relative paths.
    Grafana 11 generates relative paths like 'public/build/...' 
    which break when loaded from /d-solo/... paths.
    """
    query_string = str(request.query_params)
    grafana_url = f"http://grafana:3000/d-solo/{uid}/{slug}"
    if query_string:
        grafana_url += f"?{query_string}"
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(grafana_url)
            resp.raise_for_status()
            html = resp.text
            
            # Fix relative paths by adding leading slash
            html = html.replace('src="public/', 'src="/public/')
            html = html.replace('href="public/', 'href="/public/')
            
            return HTMLResponse(content=html, status_code=200)
    except Exception as e:
        return HTMLResponse(
            content=f"<html><body>Failed to load panel: {e}</body></html>",
            status_code=502
        )


@api_router.post("/query-range", response_model=QueryRangeResponse)
async def query_range(req: QueryRangeRequest):
    """
    Execute a range query against Prometheus or Loki and return time-series data for charting.
    """
    now = datetime.utcnow()
    start = now.timestamp() - req.seconds
    end = now.timestamp()
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if req.query_type == "logql":
                # Loki range query
                url = f"{settings.loki_url}/loki/api/v1/query_range"
                params = {
                    "query": req.query,
                    "start": int(start * 1e9),  # nanoseconds
                    "end": int(end * 1e9),
                    "step": req.step or "30s",
                }
            else:
                # Prometheus range query
                url = f"{settings.prometheus_url}/api/v1/query_range"
                params = {
                    "query": req.query,
                    "start": start,
                    "end": end,
                    "step": req.step or "30s",
                }
            
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            
            if data.get("status") != "success":
                return QueryRangeResponse(
                    status="error",
                    error=data.get("error", "Query failed"),
                    series=[],
                )
            
            result = data.get("data", {}).get("result", [])
            series = []
            
            for item in result:
                metric = item.get("metric", {})
                values = item.get("values", [])
                
                # Convert to simple [timestamp, value] pairs
                points = []
                for v in values:
                    if isinstance(v, list) and len(v) == 2:
                        ts = float(v[0])
                        val = v[1]
                        # Try to parse as float, fallback to string
                        try:
                            val = float(val)
                        except (ValueError, TypeError):
                            pass
                        points.append([ts, val])
                
                series.append({
                    "metric": metric,
                    "values": points,
                })
            
            return QueryRangeResponse(
                status="success",
                series=series,
            )
            
    except Exception as e:
        return QueryRangeResponse(
            status="error",
            error=str(e),
            series=[],
        )


# Register router
app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)