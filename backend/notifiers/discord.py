import asyncio
import logging
from typing import Any, Dict

import httpx

from .base import BaseNotifier

logger = logging.getLogger(__name__)

SEVERITY_COLORS = {
    "critical": 0xE74C3C,
    "warning": 0xF39C12,
    "info": 0x3498DB,
}


class DiscordNotifier(BaseNotifier):
    """Discord webhook notifier using embeds."""

    @property
    def channel_type(self) -> str:
        return "discord"

    async def send(self, alert: Dict[str, Any]) -> bool:
        url = self.config.get("webhook_url")
        if not url:
            logger.error("Discord notifier missing webhook_url")
            return False

        status = alert.get("status", "firing")
        severity = alert.get("severity", "warning")
        color = SEVERITY_COLORS.get(severity, 0x808080)

        if status == "resolved":
            color = 0x2ECC71

        title = f"{'🚨' if status == 'firing' else '✅'} {alert.get('alertname', 'Unknown Alert')}"
        description = alert.get("description") or ""

        fields = [
            {"name": "Severity", "value": severity.upper(), "inline": True},
            {"name": "Status", "value": status.upper(), "inline": True},
        ]

        labels = alert.get("labels", {})
        if labels:
            fields.append({"name": "Labels", "value": "\n".join(f"`{k}`: {v}" for k, v in list(labels.items())[:10]), "inline": False})

        diagnosis = alert.get("diagnosis")
        if diagnosis:
            fields.append({"name": "AI Diagnosis", "value": diagnosis, "inline": False})

        footer_text = f"AlertOps | Started: {alert.get('starts_at', '')}"
        if status == "resolved" and alert.get("ends_at"):
            footer_text += f" | Resolved: {alert.get('ends_at')}"

        payload = {
            "embeds": [{
                "title": title,
                "description": description[:4000] or None,
                "color": color,
                "fields": fields,
                "footer": {"text": footer_text},
                "timestamp": alert.get("starts_at"),
            }],
        }

        max_retries = 3
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    response = await client.post(url, json=payload)

                if response.status_code in (200, 204):
                    logger.info("Discord notification sent for alert %s", alert.get("alertname"))
                    return True

                logger.error("Discord API error %s: %s", response.status_code, response.text[:200])
                return False

            except httpx.RequestError as exc:
                logger.error("Discord request failed: %s", exc)
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
                    continue
                return False

        return False
