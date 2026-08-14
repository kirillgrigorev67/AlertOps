import httpx
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from llm import get_provider, DemoProvider
from storage import storage
from config import settings
from diagnosis_cache import diagnosis_cache


DIAGNOSIS_PROMPT = """You are a DevOps expert analyzing a system alert. Based on the alert details and logs, provide:
1. Probable root cause
2. Recommended actions to resolve
3. Severity assessment

Alert: {alertname}
Severity: {severity}
Labels: {labels}
Description: {description}

Logs from the affected system:
{logs}

Provide a concise diagnosis in 3-4 sentences. Be specific and actionable.
"""


MOCK_DIAGNOSIS = """**Alert Analysis (Demo Mode)**

No LLM provider configured. To enable AI diagnosis:
1. Go to Settings → LLM Providers
2. Add your DeepSeek/OpenAI API key
3. Set as default provider

**Manual Analysis Tips:**
- Check system resources (CPU, memory, disk)
- Review recent deployments or configuration changes
- Examine application logs for error patterns
- Verify network connectivity to dependent services
"""


class DiagnosisService:
    def __init__(self):
        self._provider = None
        self._provider_error = None
        self._init_provider()

    def _init_provider(self):
        """Initialize LLM provider."""
        try:
            if not settings.llm_api_key or settings.llm_api_key == "your-api-key-here":
                # Use DemoProvider when no API key is configured
                self._provider = DemoProvider(model="demo")
                self._provider_error = None
                return
            
            self._provider = get_provider(
                settings.llm_provider,
                settings.llm_base_url,
                settings.llm_api_key,
                settings.llm_model,
            )
            self._provider_error = None
        except Exception as e:
            # Fallback to DemoProvider on any error
            self._provider = DemoProvider(model="demo")
            self._provider_error = None

    def _is_configured(self) -> bool:
        """Check if LLM provider is properly configured."""
        if self._provider_error:
            return False
        if not self._provider:
            return False
        return True

    async def run_diagnosis(self, alert_id: str) -> None:
        """Run diagnosis as background task - does not block webhook response."""
        alert = storage.get("alerts/active", alert_id)
        if not alert:
            return

        # Update status to analyzing
        alert["diagnosis_status"] = "analyzing"
        alert["updated_at"] = datetime.utcnow().isoformat()
        storage.save("alerts/active", alert_id, alert)

        try:
            # Fetch logs from Loki
            logs = await self._fetch_logs(alert)

            # Check cache first
            fingerprint = alert.get("fingerprint", "")
            cached = diagnosis_cache.get(fingerprint, logs)

            if cached:
                # Use cached diagnosis
                alert["diagnosis"] = cached["diagnosis"]
                alert["diagnosis_status"] = "completed"
                alert["diagnosis_cached"] = True
                alert["updated_at"] = datetime.utcnow().isoformat()
                storage.save("alerts/active", alert_id, alert)
                return

            # Generate diagnosis via LLM
            diagnosis = await self._generate_diagnosis(alert, logs)

            # Store in cache for future identical alerts
            diagnosis_cache.set(fingerprint, logs, diagnosis)

            # Update alert with diagnosis
            alert["diagnosis"] = diagnosis
            alert["diagnosis_status"] = "completed"
            alert["diagnosis_cached"] = False
            alert["updated_at"] = datetime.utcnow().isoformat()
            storage.save("alerts/active", alert_id, alert)

        except Exception as e:
            # Even if diagnosis fails, alert remains visible
            alert["diagnosis"] = f"Diagnosis failed: {str(e)}"
            alert["diagnosis_status"] = "failed"
            alert["diagnosis_cached"] = False
            alert["updated_at"] = datetime.utcnow().isoformat()
            storage.save("alerts/active", alert_id, alert)

    async def _fetch_logs(self, alert: Dict[str, Any]) -> str:
        """Fetch logs from Loki based on alert labels.
        
        Promtail creates labels: container, job, logstream, service.
        We map alert labels (job, instance) to container names.
        """
        labels = alert.get("labels", {})
        
        # Try to find container name from alert labels
        container_name = None
        
        # instance often contains "container:port" format
        instance = labels.get("instance", "")
        if instance:
            # Extract container name from "container:port"
            container_name = instance.split(":")[0]
        
        # Also check job label
        if not container_name:
            job = labels.get("job", "")
            if job and job != "prometheus":
                container_name = job
        
        # Build LogQL query
        if container_name:
            query = f'{{container="{container_name}"}}'
        else:
            # Fallback: get all container logs
            query = '{job="docker"}'
        
        # Get logs from last 15 minutes before alert
        try:
            starts_at_str = alert.get("starts_at", "")
            if starts_at_str:
                starts_at_str = starts_at_str.replace("Z", "+00:00")
                starts_at = datetime.fromisoformat(starts_at_str)
            else:
                starts_at = datetime.utcnow()
        except (ValueError, AttributeError):
            starts_at = datetime.utcnow()
        
        end_time = starts_at
        start_time = end_time - timedelta(minutes=15)
        
        params = {
            "query": query,
            "start": int(start_time.timestamp() * 1e9),
            "end": int(end_time.timestamp() * 1e9),
            "limit": 100,
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{settings.loki_url}/loki/api/v1/query_range",
                    params=params,
                    timeout=15.0,
                )
                data = response.json()
                if data.get("status") == "success":
                    result = data.get("data", {}).get("result", [])
                    logs = []
                    for stream in result:
                        for value in stream.get("values", []):
                            logs.append(value[1])
                    return "\n".join(logs[-20:])  # Last 20 log lines
                return "No logs available"
        except Exception as e:
            return f"Failed to fetch logs: {str(e)}"

    async def _generate_diagnosis(self, alert: Dict[str, Any], logs: str) -> str:
        
        prompt = DIAGNOSIS_PROMPT.format(
            alertname=alert.get("alertname", "Unknown"),
            severity=alert.get("severity", "unknown"),
            labels=str(alert.get("labels", {})),
            description=alert.get("description", "No description"),
            logs=logs or "No logs available",
        )
        
        try:
            result = await self._provider.generate(prompt, temperature=0.3, max_tokens=500)
            return result
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                return "AI diagnosis unavailable: Invalid API key (401 Unauthorized). Please check your LLM provider settings."
            elif e.response.status_code == 429:
                return "AI diagnosis unavailable: Rate limit exceeded (429). Please try again later."
            else:
                return f"AI diagnosis unavailable: HTTP {e.response.status_code} error. Please check your LLM provider configuration."
        except httpx.ConnectError:
            return "AI diagnosis unavailable: Cannot connect to LLM API. Please check your network and LLM provider URL."
        except Exception as e:
            return f"AI diagnosis unavailable: {str(e)}"


diagnosis_service = DiagnosisService()