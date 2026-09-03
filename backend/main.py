import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
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
    NotificationChannel,
    Panel,
    QueryRangeRequest,
    QueryRangeResponse,
)
from storage import storage
from notifiers import BaseNotifier, TelegramNotifier, WebhookNotifier
from grafana_client import grafana
from rule_generator import rule_generator
from query_validator import query_validator
import folders as folder_manager
from alert_ai_generator import alert_ai_generator
from diagnosis import diagnosis_service
from cleanup import cleanup_service
from webhook_queue import webhook_queue

def utc_now_iso() -> str:
    """Return current UTC time in ISO 8601 format with 'Z' suffix."""
    return datetime.utcnow().isoformat() + "Z"


DATA_DIR = os.environ.get("DATA_DIR", "./data")


async def _process_delayed_resolve(alert_id: str, resolve_at: str):
    """Background task: move alert to history after resolve_timeout expires."""
    try:
        # Parse resolve_at (offset-aware with 'Z')
        resolve_dt = datetime.fromisoformat(resolve_at.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        
        # Calculate sleep duration
        sleep_seconds = (resolve_dt - now).total_seconds()
        if sleep_seconds > 0:
            await asyncio.sleep(sleep_seconds)
        
        # Check if alert is still resolving
        alert = storage.get("alerts/active", alert_id)
        if alert and alert.get("status") == "resolving":
            now = utc_now_iso()
            alert["status"] = "resolved"
            alert["ends_at"] = now
            alert["updated_at"] = now
            storage.save("alerts/history", alert_id, alert)
            storage.delete("alerts/active", alert_id)
            # Remove from persistent queue if present
            webhook_queue.dequeue(alert_id)
            # Send resolved notification
            asyncio.create_task(_send_notifications(alert_id, alert))
            print(f"Alert {alert_id} auto-resolved after timeout")
    except Exception as e:
        print(f"Error in delayed resolve for {alert_id}: {e}")


async def _process_webhook_queue():
    """Process pending resolved alerts from persistent queue on startup."""
    pending = webhook_queue.list_pending()
    if not pending:
        return
    
    print(f"Processing {len(pending)} pending resolved alerts from queue")
    for item in pending:
        alert_id = item.get("alert_id")
        resolve_at = item.get("resolve_at")
        
        if not alert_id or not resolve_at:
            webhook_queue.dequeue(alert_id)
            continue
        
        # Check if alert still exists and is in resolving state
        alert = storage.get("alerts/active", alert_id)
        if not alert:
            # Alert already gone, remove from queue
            webhook_queue.dequeue(alert_id)
            continue
        
        if alert.get("status") == "resolving":
            # Check if timeout already expired
            try:
                resolve_dt = datetime.fromisoformat(resolve_at.replace("Z", "+00:00"))
                if datetime.now(timezone.utc) >= resolve_dt:
                    # Expired, resolve immediately
                    alert["status"] = "resolved"
                    alert["ends_at"] = utc_now_iso()
                    alert["updated_at"] = utc_now_iso()
                    storage.save("alerts/history", alert_id, alert)
                    storage.delete("alerts/active", alert_id)
                    webhook_queue.dequeue(alert_id)
                    # Send resolved notification
                    asyncio.create_task(_send_notifications(alert_id, alert))
                    print(f"Alert {alert_id} resolved from queue (expired timeout)")
                else:
                    # Re-schedule background task
                    asyncio.create_task(_process_delayed_resolve(alert_id, resolve_at))
                    print(f"Re-scheduled delayed resolve from queue for {alert_id}")
            except Exception as e:
                print(f"Error processing queued alert {alert_id}: {e}")
                webhook_queue.increment_attempts(alert_id)
        elif alert.get("status") in ("firing", "acknowledged"):
            # Alert was reset to firing, need to re-resolve
            alert["status"] = "resolving"
            alert["resolve_at"] = resolve_at
            alert["updated_at"] = utc_now_iso()
            storage.save("alerts/active", alert_id, alert)
            asyncio.create_task(_process_delayed_resolve(alert_id, resolve_at))
            print(f"Re-queued resolve for {alert_id} (was firing/acknowledged)")
        else:
            # Already resolved or moved, clean up queue
            webhook_queue.dequeue(alert_id)


async def _cleanup_resolving_alerts():
    """On startup: check all resolving alerts and process expired ones."""
    active_alerts = storage.list("alerts/active")
    now = datetime.now(timezone.utc)
    
    for alert in active_alerts:
        if alert.get("status") == "resolving":
            resolve_at = alert.get("resolve_at")
            if resolve_at:
                try:
                    alert_id = alert["id"]
                    # Ensure resolve_dt is offset-aware
                    if resolve_at.endswith("Z"):
                        resolve_dt = datetime.fromisoformat(resolve_at.replace("Z", "+00:00"))
                    elif "+" not in resolve_at and "-" not in resolve_at[10:]:
                        # No timezone info, assume UTC
                        resolve_dt = datetime.fromisoformat(resolve_at).replace(tzinfo=timezone.utc)
                    else:
                        resolve_dt = datetime.fromisoformat(resolve_at)
                    
                    # Ensure now is offset-aware
                    if now.tzinfo is None:
                        now = now.replace(tzinfo=timezone.utc)
                    
                    if now >= resolve_dt:
                        # Already expired, resolve immediately
                        alert["status"] = "resolved"
                        alert["ends_at"] = utc_now_iso()
                        alert["updated_at"] = utc_now_iso()
                        storage.save("alerts/history", alert_id, alert)
                        storage.delete("alerts/active", alert_id)
                        # Send resolved notification
                        asyncio.create_task(_send_notifications(alert_id, alert))
                        print(f"Alert {alert_id} resolved on startup (expired timeout)")
                    else:
                        # Re-schedule background task
                        asyncio.create_task(_process_delayed_resolve(alert_id, resolve_at))
                        print(f"Re-scheduled delayed resolve for {alert_id}")
                except Exception as e:
                    print(f"Error processing resolving alert {alert['id']}: {e}")


async def _send_notifications(alert_id: str, alert_data: Dict[str, Any]):
    """Background task: send notifications to channels configured for this alert's rule.
    
    If the alert's rule has specific channels configured, only those channels are used.
    If no channels are configured for the rule, ALL enabled channels are used (backward compatibility).
    Errors are logged but do not affect alert processing.
    """
    try:
        # Get ALL enabled notification channels
        all_channels = storage.list("notification_channels")
        all_enabled = [ch for ch in all_channels if ch.get("enabled", True)]
        
        if not all_enabled:
            print(f"No enabled notification channels found for alert {alert_id}")
            return
        
        # Find the rule for this alert to get configured channels
        alertname = alert_data.get("alertname", "")
        rules = storage.list("rules")
        matching_rule = None
        for rule in rules:
            if rule.get("name") == alertname:
                matching_rule = rule
                break
        
        # Determine which channels to use
        # Check if channels key exists and is not None (distinguish [] from None)
        rule_channels = matching_rule.get("channels") if matching_rule else None
        
        if rule_channels is not None:
            # Rule has explicit channels configuration (could be [] or [id1, id2, ...])
            if len(rule_channels) == 0:
                # User explicitly set no channels — do NOT send notifications
                print(f"Rule '{alertname}' has no channels configured, skipping notification")
                return
            
            rule_channel_ids = set(rule_channels)
            channels = [ch for ch in all_enabled if ch.get("id") in rule_channel_ids]
            if not channels:
                print(f"Rule '{alertname}' has channels configured but none are enabled, skipping notification")
                return
            print(f"Using {len(channels)} channel(s) configured for rule '{alertname}'")
        else:
            # No rule found or channels not set (None) - use all enabled channels (backward compatibility)
            channels = all_enabled
            print(f"No specific channels configured for rule '{alertname}', using all {len(channels)} enabled channel(s)")
        
        # Build alert payload
        alert_payload = {
            "alertname": alert_data.get("alertname"),
            "status": alert_data.get("status", "firing"),
            "severity": alert_data.get("severity", "warning"),
            "description": alert_data.get("description"),
            "summary": alert_data.get("summary"),
            "labels": alert_data.get("labels", {}),
            "annotations": alert_data.get("annotations", {}),
            "starts_at": alert_data.get("starts_at"),
            "ends_at": alert_data.get("ends_at"),
            "diagnosis": alert_data.get("diagnosis"),
            "generator_url": alert_data.get("generator_url"),
            "fingerprint": alert_data.get("fingerprint"),
        }
        
        # Send to each channel
        for ch in channels:
            ch_type = ch.get("channel_type")
            config = ch.get("config", {})
            notifier: Optional[BaseNotifier] = None
            
            if ch_type == "telegram":
                notifier = TelegramNotifier(config)
            elif ch_type == "webhook":
                notifier = WebhookNotifier(config)
            
            if notifier:
                try:
                    success = await notifier.send(alert_payload)
                    if success:
                        print(f"Notification sent via {ch_type} channel '{ch.get('name')}' for alert {alert_id}")
                    else:
                        print(f"Notification failed via {ch_type} channel '{ch.get('name')}' for alert {alert_id}")
                except Exception as e:
                    print(f"Error sending notification via {ch_type} channel '{ch.get('name')}': {e}")
    except Exception as e:
        print(f"Error in _send_notifications for alert {alert_id}: {e}")


async def _diagnose_and_notify(alert_id: str):
    """Run AI diagnosis first, then send notification with diagnosis result.
    
    This ensures the notification contains the AI diagnosis instead of
    sending two separate messages (alert first, diagnosis later).
    """
    try:
        # Run diagnosis first
        await diagnosis_service.run_diagnosis(alert_id)
        
        # Get updated alert with diagnosis
        alert = storage.get("alerts/active", alert_id)
        if not alert:
            alert = storage.get("alerts/history", alert_id)
        
        if alert:
            # Send notification with diagnosis included
            await _send_notifications(alert_id, alert)
            print(f"Notification sent with diagnosis for alert {alert_id}")
        else:
            print(f"Alert {alert_id} not found after diagnosis, skipping notification")
    except Exception as e:
        print(f"Error in diagnose_and_notify for {alert_id}: {e}")
        # Fallback: send notification without diagnosis
        try:
            alert = storage.get("alerts/active", alert_id)
            if alert:
                await _send_notifications(alert_id, alert)
                print(f"Fallback notification sent (no diagnosis) for alert {alert_id}")
        except Exception as fallback_e:
            print(f"Fallback notification also failed for {alert_id}: {fallback_e}")


def _run_diagnose_and_notify_sync(alert_id: str):
    """Synchronous wrapper for _diagnose_and_notify to use with BackgroundTasks."""
    asyncio.create_task(_diagnose_and_notify(alert_id))


async def _check_rule_exists_in_prometheus(alertname: str) -> bool:
    """Check if a rule with given alertname exists in Prometheus."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.prometheus_url}/api/v1/rules",
                timeout=5.0,
            )
            if response.status_code != 200:
                return False
            
            data = response.json()
            for group in data.get("data", {}).get("groups", []):
                for rule in group.get("rules", []):
                    if rule.get("name") == alertname:
                        return True
            return False
    except Exception as e:
        print(f"Error checking rule in Prometheus: {e}")
        return False


async def _sync_with_alertmanager():
    """Periodic sync: check Alertmanager for active alerts and clean up zombies.
    
    Logic:
    - firing + AM knows about it → keep as-is
    - firing + AM doesn't know → zombie cleanup
    - acknowledged + AM says active/firing → reset to firing (alert is still firing)
    - acknowledged + AM says resolved → start resolving (delayed move to history)
    - acknowledged + AM doesn't know + rule exists in Prometheus → reset to firing (fingerprint changed)
    - acknowledged + AM doesn't know + rule deleted → zombie cleanup
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.alertmanager_url}/api/v2/alerts?active=true"
            )
            if response.status_code != 200:
                return
            
            am_alerts = response.json()
            # Build map of (fingerprint, alertname) -> alert data from Alertmanager
            am_map = {}
            am_names = set()  # Set of alertnames that AM knows about
            for am_alert in am_alerts:
                fp = am_alert.get("fingerprint", "")
                name = am_alert.get("labels", {}).get("alertname", "")
                if name:
                    am_names.add(name)
                if fp and name:
                    status_obj = am_alert.get("status", {})
                    if isinstance(status_obj, dict):
                        state = status_obj.get("state", "active")
                    else:
                        state = "active"
                    am_map[(fp, name)] = {
                        "state": state,
                        "ends_at": am_alert.get("endsAt"),
                    }
            
            # Check our active alerts
            active_alerts = storage.list("alerts/active")
            cleaned = 0
            reset_to_firing = 0
            
            for alert in active_alerts:
                fp = alert.get("fingerprint", "")
                name = alert.get("alertname", "")
                alert_id = alert["id"]
                status = alert.get("status")
                am_data = am_map.get((fp, name))
                
                if status == "firing":
                    if not am_data:
                        # AM doesn't know this exact fingerprint
                        # Check if AM knows the alertname at all
                        if name in am_names:
                            # AM knows the alertname but with different fingerprint
                            # → rule was recreated, update fingerprint
                            new_fp = None
                            for (am_fp, am_name), am_info in am_map.items():
                                if am_name == name and am_info["state"] == "active":
                                    new_fp = am_fp
                                    break
                            
                            if new_fp:
                                alert["fingerprint"] = new_fp
                                alert["updated_at"] = utc_now_iso()
                                storage.save("alerts/active", alert_id, alert)
                                print(f"Updated fingerprint for firing alert {alert_id} ({name})")
                            # If no active alert found with this name, keep as-is
                            # (might be resolved but not yet processed)
                        else:
                            # AM doesn't know this alertname at all
                            # Check if rule still exists in Prometheus
                            rule_exists = await _check_rule_exists_in_prometheus(name)
                            if rule_exists:
                                # Rule exists but AM doesn't know about it → alert is resolved
                                # Start delayed resolve (same as resolved webhook)
                                resolve_timeout = alert.get("resolve_timeout", 5)
                                resolve_at = (datetime.now(timezone.utc) + __import__('datetime').timedelta(minutes=resolve_timeout)).isoformat().replace("+00:00", "Z")
                                alert["status"] = "resolving"
                                alert["resolve_at"] = resolve_at
                                alert["updated_at"] = utc_now_iso()
                                storage.save("alerts/active", alert_id, alert)
                                webhook_queue.enqueue(alert_id, resolve_at)
                                asyncio.create_task(_process_delayed_resolve(alert_id, resolve_at))
                                print(f"Alert {alert_id} ({name}) started resolving (not in Alertmanager, rule exists)")
                            else:
                                # Rule deleted → zombie cleanup
                                alert["status"] = "resolved"
                                alert["ends_at"] = utc_now_iso()
                                alert["updated_at"] = utc_now_iso()
                                alert["resolution_reason"] = "zombie_cleanup"
                                storage.save("alerts/history", alert_id, alert)
                                storage.delete("alerts/active", alert_id)
                                webhook_queue.dequeue(alert_id)
                                cleaned += 1
                                print(f"Cleaned up zombie alert {alert_id} ({name}) (rule deleted)")
                    # If AM knows about it, do nothing (keep firing)
                
                elif status == "acknowledged":
                    if am_data and am_data["state"] == "active":
                        # Alertmanager knows about it and it's active → reset to firing
                        alert["status"] = "firing"
                        alert["acknowledged_at"] = None
                        alert["updated_at"] = utc_now_iso()
                        storage.save("alerts/active", alert_id, alert)
                        # Send notification when alert becomes active again
                        asyncio.create_task(_send_notifications(alert_id, alert))
                        reset_to_firing += 1
                        print(f"Reset acknowledged alert {alert_id} ({name}) to firing (still active in AM)")
                    elif not am_data:
                        # Alertmanager doesn't know about this exact fingerprint
                        # Check if AM knows about the alertname at all
                        if name in am_names:
                            # AM knows the alertname but with different fingerprint
                            # → rule was recreated, reset to firing with new fingerprint
                            # Find the new fingerprint from AM
                            new_fp = None
                            for (am_fp, am_name), am_info in am_map.items():
                                if am_name == name and am_info["state"] == "active":
                                    new_fp = am_fp
                                    break
                            
                            if new_fp:
                                alert["status"] = "firing"
                                alert["fingerprint"] = new_fp
                                alert["acknowledged_at"] = None
                                alert["updated_at"] = utc_now_iso()
                                storage.save("alerts/active", alert_id, alert)
                                # Send notification when alert becomes active again
                                asyncio.create_task(_send_notifications(alert_id, alert))
                                reset_to_firing += 1
                                print(f"Reset acknowledged alert {alert_id} ({name}) to firing with new fingerprint")
                            else:
                                # AM knows the name but no active alerts → might be resolved
                                # Keep as acknowledged, wait for resolved webhook
                                pass
                        else:
                            # AM doesn't know this alertname at all
                            # Check if rule still exists in Prometheus
                            rule_exists = await _check_rule_exists_in_prometheus(name)
                            if rule_exists:
                                # Rule exists but AM doesn't know about it → might be transient
                                # Reset to firing to let user re-acknowledge if needed
                                alert["status"] = "firing"
                                alert["acknowledged_at"] = None
                                alert["updated_at"] = utc_now_iso()
                                storage.save("alerts/active", alert_id, alert)
                                # Send notification when alert becomes active again
                                asyncio.create_task(_send_notifications(alert_id, alert))
                                reset_to_firing += 1
                                print(f"Reset acknowledged alert {alert_id} ({name}) to firing (rule exists in Prometheus)")
                            else:
                                # Rule deleted → zombie cleanup
                                alert["status"] = "resolved"
                                alert["ends_at"] = utc_now_iso()
                                alert["updated_at"] = utc_now_iso()
                                alert["resolution_reason"] = "zombie_cleanup"
                                storage.save("alerts/history", alert_id, alert)
                                storage.delete("alerts/active", alert_id)
                                webhook_queue.dequeue(alert_id)
                                cleaned += 1
                                print(f"Cleaned up zombie acknowledged alert {alert_id} ({name}) (rule deleted)")
            
            if cleaned > 0 or reset_to_firing > 0:
                print(f"Alertmanager sync: cleaned up {cleaned} zombies, reset {reset_to_firing} to firing")
    except Exception as e:
        print(f"Alertmanager sync error: {e}")


async def _alertmanager_sync_loop():
    """Background loop: sync with Alertmanager every 60 seconds."""
    while True:
        await asyncio.sleep(60)
        await _sync_with_alertmanager()


async def _auto_unsilence_loop():
    """Background loop: periodically check and auto-clear expired silences."""
    while True:
        await asyncio.sleep(300)  # Check every 5 minutes
        try:
            now = datetime.now(timezone.utc)
            cleared_rules = 0
            cleared_folders = 0
            unsilenced_names = []
            
            # Check rules
            rules = storage.list("rules")
            for rule in rules:
                silenced_until = rule.get("silenced_until")
                if silenced_until:
                    try:
                        dt = datetime.fromisoformat(silenced_until.replace("Z", "+00:00"))
                        if now >= dt:
                            rule["silenced_until"] = None
                            rule["updated_at"] = utc_now_iso()
                            storage.save("rules", rule["id"], rule)
                            cleared_rules += 1
                            unsilenced_names.append(rule.get("name"))
                    except (ValueError, TypeError):
                        pass
            
            # Check folders
            folders = folder_manager.list_folders()
            for folder in folders:
                silenced_until = folder.get("silenced_until")
                if silenced_until:
                    try:
                        dt = datetime.fromisoformat(silenced_until.replace("Z", "+00:00"))
                        if now >= dt:
                            folder_manager.set_folder_silenced(folder["name"], None)
                            cleared_folders += 1
                            # Also collect alertnames from rules in this folder
                            for rule in rules:
                                if rule.get("folder") == folder["name"]:
                                    unsilenced_names.append(rule.get("name"))
                    except (ValueError, TypeError):
                        pass
            
            # Sync active alerts for auto-unsilenced rules
            for alertname in unsilenced_names:
                await _sync_active_alerts_from_alertmanager(alertname_filter=alertname)
            
            if cleared_rules > 0 or cleared_folders > 0:
                print(f"Auto-unsilence: cleared {cleared_rules} rules, {cleared_folders} folders, synced {len(unsilenced_names)} alertnames")
        except Exception as e:
            print(f"Auto-unsilence loop error: {e}")


async def _is_rule_silenced(rule_name: str) -> bool:
    """Check if a rule or its folder is currently silenced.
    
    Priority: rule-level silence overrides folder-level.
    - If rule has silenced_until set (not None, not missing) → check if expired
    - If rule has silenced_until = null (explicitly unsilenced) → NOT silenced, ignore folder
    - If rule has no silenced_until key → inherit from folder
    """
    rules = storage.list("rules")
    for rule in rules:
        if rule.get("name") == rule_name:
            # Check if rule has explicit silence setting
            if "silenced_until" in rule:
                silenced_until = rule["silenced_until"]
                if silenced_until is None:
                    # null could mean "never set" or "explicitly unsilenced"
                    # Only ignore folder if user explicitly unsilenced
                    if rule.get("user_unsilenced") is True:
                        return False
                    # Otherwise (never silenced), fall through to folder check
                else:
                    # Has explicit silence timestamp — check if expired
                    try:
                        dt = datetime.fromisoformat(silenced_until.replace("Z", "+00:00"))
                        if datetime.now(timezone.utc) < dt:
                            return True
                        # Expired — fall through to folder check
                    except (ValueError, TypeError):
                        pass
            
            # No explicit rule-level silence (or expired) — check folder
            folder_name = rule.get("folder")
            if folder_name:
                return folder_manager.is_folder_silenced(folder_name)
            
            return False
    
    return False


async def _sync_active_alerts_from_alertmanager(alertname_filter: Optional[str] = None):
    """On startup or after unsilence: fetch active alerts from Alertmanager and create missing ones.
    
    Args:
        alertname_filter: If provided, only sync alerts with this alertname (for unsilence of specific rule)
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.alertmanager_url}/api/v2/alerts?active=true"
            )
            if response.status_code != 200:
                print(f"Failed to fetch alerts from Alertmanager: {response.status_code}")
                return
            
            am_alerts = response.json()
            created = 0
            
            for am_alert in am_alerts:
                # Alertmanager v2 API: status is an object with "state" field
                status_obj = am_alert.get("status", {})
                if isinstance(status_obj, dict):
                    if status_obj.get("state") != "active":
                        continue
                elif status_obj != "firing":
                    continue
                
                fingerprint = am_alert.get("fingerprint", "")
                alertname = am_alert.get("labels", {}).get("alertname", "Unknown")
                
                if not fingerprint:
                    continue
                
                # Filter by alertname if specified
                if alertname_filter and alertname != alertname_filter:
                    continue
                
                # Skip silenced rules
                if await _is_rule_silenced(alertname):
                    continue
                
                # Check if we already have this alert
                active_alerts = storage.list("alerts/active")
                existing = None
                for a in active_alerts:
                    if a.get("fingerprint") == fingerprint and a.get("alertname") == alertname:
                        existing = a
                        break
                
                if existing:
                    continue  # Already have this alert
                
                # Create new alert from Alertmanager data
                now = utc_now_iso()
                alert_id = str(uuid.uuid4())
                
                # Try to find matching rule for resolve_timeout and folder
                resolve_timeout = 5
                folder = None
                rules = storage.list("rules")
                for rule in rules:
                    if rule.get("name") == alertname:
                        resolve_timeout = rule.get("resolve_timeout", 5)
                        folder = rule.get("folder")
                        break
                
                alert = {
                    "id": alert_id,
                    "alertname": alertname,
                    "status": "firing",
                    "severity": am_alert.get("labels", {}).get("severity", "warning"),
                    "summary": am_alert.get("annotations", {}).get("summary", ""),
                    "description": am_alert.get("annotations", {}).get("description", ""),
                    "labels": am_alert.get("labels", {}),
                    "annotations": am_alert.get("annotations", {}),
                    "starts_at": am_alert.get("startsAt", now),
                    "ends_at": None,
                    "generator_url": am_alert.get("generatorURL", ""),
                    "fingerprint": fingerprint,
                    "diagnosis": None,
                    "diagnosis_status": "pending",
                    "read": False,
                    "created_at": now,
                    "updated_at": now,
                    "resolve_timeout": resolve_timeout,
                    "resolve_at": None,
                    "folder": folder,
                }
                storage.save("alerts/active", alert_id, alert)
                # Run diagnosis first, then send notification with diagnosis
                asyncio.create_task(_diagnose_and_notify(alert_id))
                created += 1
                print(f"Created alert from Alertmanager sync: {alertname} ({fingerprint})")
            
            if created > 0:
                print(f"Alertmanager sync: created {created} missing active alerts")
            elif alertname_filter:
                print(f"Alertmanager sync: no active alerts found for {alertname_filter}")
    except Exception as e:
        print(f"Error syncing active alerts from Alertmanager: {e}")


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
    
    # Cleanup resolving alerts from previous run
    await _cleanup_resolving_alerts()
    
    # Process pending resolved alerts from persistent queue
    await _process_webhook_queue()
    
    # Start scheduled cleanup job for alert history
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        cleanup_service.run_cleanup,
        CronTrigger(hour=3, minute=0),  # Daily at 3:00 AM
        id="alert_history_cleanup",
        name="Alert History Cleanup",
        replace_existing=True,
    )
    scheduler.start()
    print(f"Started alert history cleanup scheduler (retention: {settings.alert_history_retention_days} days, action: {settings.alert_history_cleanup_action})")
    
    # Sync active alerts from Alertmanager on startup
    await _sync_active_alerts_from_alertmanager()
    
    # Start background sync loop with Alertmanager
    asyncio.create_task(_alertmanager_sync_loop())
    print("Started Alertmanager sync loop (every 60s)")
    
    # Start auto-unsilence background loop
    asyncio.create_task(_auto_unsilence_loop())
    print("Started auto-unsilence loop (every 5min)")
    
    yield
    
    # Shutdown
    scheduler.shutdown()


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
async def list_rules(folder: Optional[str] = None):
    rules = storage.list("rules")
    if folder is not None:
        if folder == "":
            rules = [r for r in rules if not r.get("folder")]
        else:
            rules = [r for r in rules if r.get("folder") == folder]
    return rules


@api_router.get("/rules/folders")
async def list_folders():
    """Return all folder names, including empty ones."""
    return folder_manager.list_folders()


@api_router.post("/rules/folders")
async def create_folder(data: Dict[str, str]):
    """Create a new folder."""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    try:
        folder_manager.create_folder(name)
        return {"status": "created", "name": name}
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@api_router.post("/rules/folders/rename")
async def rename_folder(data: Dict[str, str]):
    """Rename a folder across all alert rules and the folder list."""
    old_name = data.get("old_name", "").strip()
    new_name = data.get("new_name", "").strip()
    if not old_name:
        raise HTTPException(status_code=400, detail="old_name is required")
    if old_name == new_name:
        return {"status": "no_change", "updated": 0}
    
    try:
        folder_manager.rename_folder(old_name, new_name)
        return {"status": "renamed", "from": old_name, "to": new_name}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.delete("/rules/folders/{folder_name}")
async def delete_folder(folder_name: str):
    """Delete a folder. Rules in this folder become uncategorized."""
    try:
        folder_manager.delete_folder(folder_name)
        return {"status": "deleted", "name": folder_name}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/rules/folders/{folder_name}/silence")
async def silence_folder(folder_name: str, duration_minutes: int = 60):
    """Silence all alerts in a folder. Duration in minutes, or -1 for indefinite."""
    
    if duration_minutes == -1:
        # Indefinite silence
        silenced_until = None
    else:
        silenced_until = (datetime.now(timezone.utc) + __import__('datetime').timedelta(minutes=duration_minutes)).isoformat().replace("+00:00", "Z")
    
    folder = folder_manager.set_folder_silenced(folder_name, silenced_until)
    
    # Silence ALL rules in this folder (folder silence overrides individual unsilence)
    rules = storage.list("rules")
    silenced_rules = 0
    silenced_alertnames = []
    for rule in rules:
        if rule.get("folder") == folder_name:
            rule["silenced_until"] = silenced_until
            rule["updated_at"] = utc_now_iso()
            # Remove user_unsilenced flag since folder is now silencing it
            if "user_unsilenced" in rule:
                del rule["user_unsilenced"]
            storage.save("rules", rule["id"], rule)
            silenced_rules += 1
            silenced_alertnames.append(rule.get("name"))
    
    # Move active alerts for silenced rules to history
    moved_count = 0
    active_alerts = storage.list("alerts/active")
    for alert in active_alerts:
        if alert.get("alertname") in silenced_alertnames:
            now = utc_now_iso()
            alert["status"] = "resolved"
            alert["ends_at"] = now
            alert["updated_at"] = now
            alert["resolution_reason"] = "silenced"
            alert["silenced_by"] = f"folder:{folder_name}"
            alert["silenced_at"] = now
            storage.save("alerts/history", alert["id"], alert)
            storage.delete("alerts/active", alert["id"])
            webhook_queue.dequeue(alert["id"])
            moved_count += 1
    
    return {
        "status": "silenced",
        "folder": folder_name,
        "silenced_until": silenced_until,
        "rules_affected": silenced_rules,
        "alerts_moved_to_history": moved_count,
    }


@api_router.post("/rules/folders/{folder_name}/unsilence")
async def unsilence_folder(folder_name: str):
    """Unsilence a folder and all alerts within it."""
    folder = folder_manager.set_folder_silenced(folder_name, None)
    
    # Also unsilence all rules in this folder
    rules = storage.list("rules")
    unsilenced_rules = 0
    unsilenced_names = []
    for rule in rules:
        if rule.get("folder") == folder_name:
            rule["silenced_until"] = None
            rule["updated_at"] = utc_now_iso()
            storage.save("rules", rule["id"], rule)
            unsilenced_rules += 1
            unsilenced_names.append(rule.get("name"))
    
    # Sync active alerts from Alertmanager for unsilenced rules
    for alertname in unsilenced_names:
        await _sync_active_alerts_from_alertmanager(alertname_filter=alertname)
    
    return {
        "status": "unsilenced",
        "folder": folder_name,
        "rules_affected": unsilenced_rules,
    }


@api_router.post("/rules/{rule_id}/silence")
async def silence_rule(rule_id: str, duration_minutes: int = 60):
    """Silence a single alert rule. Duration in minutes, or -1 for indefinite."""
    rule = storage.get("rules", rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    if duration_minutes == -1:
        silenced_until = None
    else:
        silenced_until = (datetime.now(timezone.utc) + __import__('datetime').timedelta(minutes=duration_minutes)).isoformat().replace("+00:00", "Z")
    
    rule_name = rule.get("name")
    rule["silenced_until"] = silenced_until
    rule["updated_at"] = utc_now_iso()
    storage.save("rules", rule_id, rule)
    
    # Move active alerts for this rule to history
    moved_count = 0
    active_alerts = storage.list("alerts/active")
    for alert in active_alerts:
        if alert.get("alertname") == rule_name:
            now = utc_now_iso()
            alert["status"] = "resolved"
            alert["ends_at"] = now
            alert["updated_at"] = now
            alert["resolution_reason"] = "silenced"
            alert["silenced_by"] = f"rule:{rule_name}"
            alert["silenced_at"] = now
            storage.save("alerts/history", alert["id"], alert)
            storage.delete("alerts/active", alert["id"])
            webhook_queue.dequeue(alert["id"])
            moved_count += 1
    
    return {
        "status": "silenced",
        "rule_id": rule_id,
        "rule_name": rule_name,
        "silenced_until": silenced_until,
        "alerts_moved_to_history": moved_count,
    }


@api_router.post("/rules/{rule_id}/unsilence")
async def unsilence_rule(rule_id: str):
    """Unsilence a single alert rule."""
    rule = storage.get("rules", rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    rule_name = rule.get("name")
    rule["silenced_until"] = None
    rule["user_unsilenced"] = True  # Mark as explicitly unsilenced by user
    rule["updated_at"] = utc_now_iso()
    storage.save("rules", rule_id, rule)
    
    # Sync active alerts from Alertmanager for this rule
    await _sync_active_alerts_from_alertmanager(alertname_filter=rule_name)
    
    return {
        "status": "unsilenced",
        "rule_id": rule_id,
        "rule_name": rule_name,
    }


@api_router.post("/rules", response_model=AlertRule)
async def create_rule(rule: AlertRule):
    now = utc_now_iso()
    rule.created_at = now
    rule.updated_at = now
    storage.save("rules", rule.id, rule.dict())
    
    # Ensure folder is tracked in folders list
    if rule.folder:
        try:
            folder_manager.create_folder(rule.folder)
        except ValueError:
            # Folder already exists, ignore
            pass
    
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
        
        # Move active alerts with the same name to history
        rule_name = rule.get("name")
        if rule_name:
            active_alerts = storage.list("alerts/active")
            moved_count = 0
            for alert in active_alerts:
                if alert.get("alertname") == rule_name:
                    now = utc_now_iso()
                    alert["status"] = "resolved"
                    alert["ends_at"] = now
                    alert["updated_at"] = now
                    alert["resolution_reason"] = "rule_deleted"
                    storage.save("alerts/history", alert["id"], alert)
                    storage.delete("alerts/active", alert["id"])
                    moved_count += 1
    
    return {"status": "deleted"}


@api_router.put("/rules/{rule_id}", response_model=AlertRule)
async def update_rule(rule_id: str, rule: AlertRule):
    """Update an existing alert rule."""
    existing = storage.get("rules", rule_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    # Preserve original id and created_at
    now = utc_now_iso()
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
        now = utc_now_iso()
        status = alert_data.get("status", "firing")
        fingerprint = alert_data.get("fingerprint", "")
        alertname = alert_data.get("labels", {}).get("alertname", "Unknown")
        
        # Check if rule is silenced (either directly or via folder)
        is_silenced = False
        matching_rule = None
        rules = storage.list("rules")
        for rule in rules:
            if rule.get("name") == alertname:
                matching_rule = rule
                break
        
        if matching_rule:
            # Check rule-level silence first (has priority over folder)
            if "silenced_until" in matching_rule:
                silence_until = matching_rule["silenced_until"]
                if silence_until is None:
                    # null could mean "never set" or "explicitly unsilenced"
                    # Only ignore folder if user explicitly unsilenced
                    if matching_rule.get("user_unsilenced") is True:
                        is_silenced = False
                    else:
                        # Never silenced, check folder
                        folder_name = matching_rule.get("folder")
                        if folder_name:
                            is_silenced = folder_manager.is_folder_silenced(folder_name)
                else:
                    try:
                        dt = datetime.fromisoformat(silence_until.replace("Z", "+00:00"))
                        if datetime.now(timezone.utc) < dt:
                            is_silenced = True
                    except (ValueError, TypeError):
                        pass
            else:
                # No explicit rule-level silence — check folder
                folder_name = matching_rule.get("folder")
                if folder_name:
                    is_silenced = folder_manager.is_folder_silenced(folder_name)
        
        if is_silenced:
            # Silenced alert: skip creation/diagnosis but log it
            print(f"Alert '{alertname}' is silenced, skipping webhook processing")
            continue
        
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
                # If was resolving, cancel the delayed resolve by resetting status
                if existing.get("status") == "resolving":
                    existing["resolve_at"] = None
                existing["status"] = "firing"
                storage.save("alerts/active", existing["id"], existing)
            else:
                # Create new active alert
                alert_id = str(uuid.uuid4())
                # Try to find matching rule to get resolve_timeout and folder
                resolve_timeout = 5  # default
                folder = None
                rules = storage.list("rules")
                for rule in rules:
                    if rule.get("name") == alertname:
                        resolve_timeout = rule.get("resolve_timeout", 5)
                        folder = rule.get("folder")
                        break
                
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
                    "resolve_timeout": resolve_timeout,
                    "resolve_at": None,
                    "folder": folder,
                }
                storage.save("alerts/active", alert_id, alert)
                # Run diagnosis first, then send notification with diagnosis
                # Use asyncio.create_task directly - it works correctly in async context
                asyncio.create_task(_diagnose_and_notify(alert_id))
                created_count += 1
        
        elif status == "resolved":
            # Find active alert with same fingerprint
            active_alerts = storage.list("alerts/active")
            existing = None
            for a in active_alerts:
                if a.get("fingerprint") == fingerprint and a.get("alertname") == alertname:
                    existing = a
                    break
            
            if existing:
                # Start delayed resolve instead of immediate move to history
                existing_status = existing.get("status")
                if existing_status in ("firing", "acknowledged"):
                    resolve_timeout = existing.get("resolve_timeout", 5)
                    resolve_at = (datetime.now(timezone.utc) + __import__('datetime').timedelta(minutes=resolve_timeout)).isoformat().replace("+00:00", "Z")
                    existing["status"] = "resolving"
                    existing["resolve_at"] = resolve_at
                    existing["updated_at"] = now
                    storage.save("alerts/active", existing["id"], existing)
                    # Save to persistent queue for reliability across restarts
                    webhook_queue.enqueue(existing["id"], resolve_at)
                    # Schedule background task to complete resolve after timeout
                    # Use asyncio.create_task for async function in async context
                    asyncio.create_task(_process_delayed_resolve(existing["id"], resolve_at))
                    # Do NOT send notification here - it will be sent when alert is fully resolved
                    # This prevents duplicate notifications (one on resolve webhook, one after timeout)
                    resolved_count += 1
                # If already resolving, do nothing (timeout already scheduled)
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
            alert["updated_at"] = utc_now_iso()
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
    alert["updated_at"] = utc_now_iso()
    storage.save("alerts/active", alert_id, alert)
    
    return {"status": "read"}


@api_router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str):
    """Manually acknowledge an alert. Does NOT move to history - only Alertmanager resolved webhook does that."""
    alert = storage.get("alerts/active", alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    alert["status"] = "acknowledged"
    alert["acknowledged_at"] = utc_now_iso()
    alert["updated_at"] = utc_now_iso()
    
    # Keep in active, just mark as acknowledged
    storage.save("alerts/active", alert_id, alert)
    
    return {"status": "acknowledged"}


@api_router.post("/alerts/{alert_id}/force-resolve")
async def force_resolve_alert(alert_id: str):
    """Force move an alert to history immediately. Use when Alertmanager resolved webhook was lost."""
    alert = storage.get("alerts/active", alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    now = utc_now_iso()
    alert["status"] = "resolved"
    alert["ends_at"] = now
    alert["updated_at"] = now
    alert["resolution_reason"] = "manual_force_resolve"
    
    storage.save("alerts/history", alert_id, alert)
    storage.delete("alerts/active", alert_id)
    webhook_queue.dequeue(alert_id)
    
    # Send resolved notification
    asyncio.create_task(_send_notifications(alert_id, alert))
    
    return {"status": "resolved", "message": "Alert moved to history"}


@api_router.get("/webhooks/queue")
async def get_webhook_queue():
    """Get pending resolved alerts from persistent queue (for debugging)."""
    pending = webhook_queue.list_pending()
    return {
        "pending_count": len(pending),
        "items": pending,
    }


# Notification Channels
@api_router.get("/notification-channels", response_model=List[NotificationChannel])
async def list_notification_channels():
    return storage.list("notification_channels")


@api_router.post("/notification-channels", response_model=NotificationChannel)
async def create_notification_channel(channel: NotificationChannel):
    if not channel.id:
        channel.id = str(uuid.uuid4())
    now = utc_now_iso()
    channel.created_at = now
    channel.updated_at = now
    storage.save("notification_channels", channel.id, channel.dict())
    return channel


@api_router.put("/notification-channels/{channel_id}", response_model=NotificationChannel)
async def update_notification_channel(channel_id: str, channel: NotificationChannel):
    existing = storage.get("notification_channels", channel_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    channel.id = channel_id
    channel.created_at = existing.get("created_at")
    channel.updated_at = utc_now_iso()
    storage.save("notification_channels", channel_id, channel.dict())
    return channel


@api_router.delete("/notification-channels/{channel_id}")
async def delete_notification_channel(channel_id: str):
    existing = storage.get("notification_channels", channel_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    # Remove channel from any rules that reference it
    rules = storage.list("rules")
    for rule in rules:
        if channel_id in rule.get("channels", []):
            rule["channels"] = [c for c in rule["channels"] if c != channel_id]
            rule["updated_at"] = utc_now_iso()
            storage.save("rules", rule["id"], rule)
    
    storage.delete("notification_channels", channel_id)
    return {"status": "deleted"}


@api_router.post("/notification-channels/{channel_id}/test")
async def test_notification_channel(channel_id: str):
    """Test notification channel by sending a test alert."""
    channel_data = storage.get("notification_channels", channel_id)
    if not channel_data:
        raise HTTPException(status_code=404, detail="Channel not found")
    
    ch_type = channel_data.get("channel_type")
    config = channel_data.get("config", {})
    
    test_alert = {
        "alertname": "Test Alert",
        "status": "firing",
        "severity": "warning",
        "description": "This is a test notification from AlertOps.",
        "summary": "Test notification",
        "labels": {"test": "true", "source": "alertops"},
        "annotations": {},
        "starts_at": utc_now_iso(),
        "diagnosis": None,
        "generator_url": "",
        "fingerprint": "test-fingerprint",
    }
    
    notifier: Optional[BaseNotifier] = None
    if ch_type == "telegram":
        notifier = TelegramNotifier(config)
    elif ch_type == "webhook":
        notifier = WebhookNotifier(config)
    
    if not notifier:
        raise HTTPException(status_code=400, detail=f"Unknown channel type: {ch_type}")
    
    success = await notifier.send(test_alert)
    if success:
        return {"status": "sent", "channel_id": channel_id}
    else:
        raise HTTPException(status_code=502, detail="Failed to send test notification")


# LLM Providers
@api_router.get("/providers", response_model=List[LLMProvider])
async def list_providers():
    return storage.list("providers")


@api_router.post("/providers", response_model=LLMProvider)
async def create_provider(provider: LLMProvider):
    now = utc_now_iso()
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


# Cleanup endpoints
@api_router.post("/cleanup/run")
async def run_cleanup(dry_run: bool = False):
    """Manually trigger alert history cleanup."""
    return cleanup_service.run_cleanup(dry_run=dry_run)


@api_router.get("/cleanup/logs")
async def get_cleanup_logs(limit: int = 100):
    """Get recent cleanup operation logs."""
    return {"logs": cleanup_service.get_logs(limit)}


@api_router.get("/cleanup/config")
async def get_cleanup_config():
    """Get current cleanup configuration."""
    return {
        "retention_days": settings.alert_history_retention_days,
        "action": settings.alert_history_cleanup_action,
        "schedule": "Daily at 3:00 AM UTC",
    }


@api_router.get("/cleanup/archives")
async def get_archives():
    """Get information about archived alert history."""
    return cleanup_service.get_archive_info()


# Register router
app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)