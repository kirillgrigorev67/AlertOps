import asyncio
import json
import logging
from typing import Any, Dict

import httpx

from .base import BaseNotifier

logger = logging.getLogger(__name__)


class WebhookNotifier(BaseNotifier):
    """Generic HTTP webhook notifier."""

    @property
    def channel_type(self) -> str:
        return "webhook"

    async def send(self, alert: Dict[str, Any]) -> bool:
        url = self.config.get("url")
        method = self.config.get("method", "POST").upper()
        headers = self.config.get("headers", {})
        timeout = self.config.get("timeout_seconds", 30)

        if not url:
            logger.error("Webhook notifier missing URL")
            return False

        # Merge default headers with user-provided ones
        default_headers = {"Content-Type": "application/json"}
        default_headers.update(headers)

        payload = {
            "alertname": alert.get("alertname"),
            "status": alert.get("status"),
            "severity": alert.get("severity"),
            "description": alert.get("description"),
            "summary": alert.get("summary"),
            "labels": alert.get("labels", {}),
            "annotations": alert.get("annotations", {}),
            "starts_at": alert.get("starts_at"),
            "ends_at": alert.get("ends_at"),
            "diagnosis": alert.get("diagnosis"),
            "generator_url": alert.get("generator_url"),
            "fingerprint": alert.get("fingerprint"),
            "formatted_message": self._format_message(alert),
        }

        max_retries = 3
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    if method == "GET":
                        response = await client.get(
                            url, headers=default_headers, params={"payload": json.dumps(payload)}
                        )
                    elif method == "PUT":
                        response = await client.put(url, headers=default_headers, json=payload)
                    elif method == "PATCH":
                        response = await client.patch(url, headers=default_headers, json=payload)
                    else:
                        response = await client.post(url, headers=default_headers, json=payload)

                if 200 <= response.status_code < 300:
                    logger.info(
                        "Webhook notification sent for alert %s to %s",
                        alert.get("alertname"), url
                    )
                    return True

                logger.error(
                    "Webhook returned %s %s: %s",
                    response.status_code, response.reason_phrase, response.text[:200]
                )
                return False

            except httpx.RequestError as exc:
                logger.error("Webhook request failed to %s: %s", url, exc)
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
                    continue
                return False

        return False

    def _format_message(self, alert: Dict[str, Any]) -> str:
        """Format alert as HTML message matching AlertOps UI design."""
        severity = alert.get("severity", "warning")
        status = alert.get("status", "firing")

        severity_colors = {
            "critical": "#ef4444",
            "warning": "#f59e0b",
            "info": "#3b82f6",
        }
        severity_color = severity_colors.get(severity, "#6b7280")

        status_text = "FIRING" if status == "firing" else "RESOLVED"
        status_icon = "🚨" if status == "firing" else "✅"

        lines = []

        # Header
        lines.append('<div style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; max-width: 600px; background: #0f172a; color: #e2e8f0; border-radius: 8px; overflow: hidden; border: 1px solid #1e293b;">')

        # Top bar with branding
        lines.append('  <div style="background: #1e293b; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #334155;">')
        lines.append('    <div style="display: flex; align-items: center; gap: 8px;">')
        lines.append('      <span style="font-size: 18px;">⚡</span>')
        lines.append('      <span style="font-weight: 700; color: #6366f1; font-size: 14px;">AlertOps</span>')
        lines.append('    </div>')
        bg_color = "#ef444420" if status == "firing" else "#22c55e20"
        text_color = "#ef4444" if status == "firing" else "#22c55e"
        lines.append(f'    <span style="background: {bg_color}; color: {text_color}; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600;">{status_icon} {status_text}</span>')
        lines.append('  </div>')

        # Body
        lines.append('  <div style="padding: 16px;">')

        # Alert name
        alert_name = alert.get("alertname", "Unknown Alert")
        lines.append(f'    <div style="font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #f8fafc;">{alert_name}</div>')

        # Severity
        lines.append('    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 12px;">')
        lines.append(f'      <span style="width: 8px; height: 8px; border-radius: 50%; background: {severity_color}; display: inline-block;"></span>')
        lines.append(f'      <span style="font-size: 13px; color: {severity_color}; font-weight: 500; text-transform: uppercase;">{severity.upper()}</span>')
        lines.append('    </div>')

        # Description
        if alert.get("description"):
            lines.append('    <div style="margin-bottom: 16px;">')
            lines.append('      <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Description</div>')
            lines.append(f'      <div style="font-size: 13px; color: #cbd5e1; line-height: 1.5;">{alert["description"]}</div>')
            lines.append('    </div>')

        # AI Diagnosis
        if alert.get("diagnosis"):
            lines.append('    <div style="background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 6px; padding: 12px; margin-bottom: 16px;">')
            lines.append('      <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">')
            lines.append('        <span style="font-size: 14px;">🔮</span>')
            lines.append('        <span style="font-size: 12px; font-weight: 600; color: #818cf8;">AI Diagnosis</span>')
            lines.append('      </div>')
            diagnosis = alert["diagnosis"].replace("<", "<").replace(">", ">")
            lines.append(f'      <div style="font-size: 12px; color: #c7d2fe; line-height: 1.6; white-space: pre-wrap;">{diagnosis}</div>')
            lines.append('    </div>')

        # Labels
        labels = alert.get("labels", {})
        if labels:
            lines.append('    <div style="margin-bottom: 12px;">')
            lines.append('      <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Labels</div>')
            lines.append('      <div style="display: flex; flex-wrap: wrap; gap: 6px;">')
            for k, v in labels.items():
                lines.append(f'        <span style="background: #1e293b; color: #94a3b8; padding: 3px 8px; border-radius: 4px; font-size: 11px; border: 1px solid #334155;"><span style="color: #64748b;">{k}:</span> {v}</span>')
            lines.append('      </div>')
            lines.append('    </div>')

        lines.append('  </div>')

        # Footer
        lines.append('  <div style="background: #1e293b; padding: 10px 16px; border-top: 1px solid #334155; display: flex; align-items: center; gap: 6px;">')
        starts_at = alert.get("starts_at", "")
        if starts_at:
            lines.append(f'    <span style="font-size: 11px; color: #64748b;">⏱ Started: {starts_at}</span>')
        lines.append('  </div>')

        lines.append('</div>')

        return "\n".join(lines)