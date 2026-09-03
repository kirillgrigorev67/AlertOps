import asyncio
import html
import logging
from typing import Any, Dict

import httpx

from .base import BaseNotifier

logger = logging.getLogger(__name__)


class TelegramNotifier(BaseNotifier):
    """Telegram Bot API notifier."""

    @property
    def channel_type(self) -> str:
        return "telegram"

    async def send(self, alert: Dict[str, Any]) -> bool:
        token = self.config.get("bot_token")
        chat_id = self.config.get("chat_id")

        if not token or not chat_id:
            logger.error("Telegram notifier missing bot_token or chat_id")
            return False

        text = self._format_message(alert)
        url = f"https://api.telegram.org/bot{token}/sendMessage"

        payload = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }

        max_retries = 3
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    response = await client.post(url, json=payload)

                if response.status_code == 200:
                    logger.info("Telegram notification sent for alert %s", alert.get("alertname"))
                    return True

                if response.status_code == 429:
                    data = response.json()
                    retry_after = data.get("parameters", {}).get("retry_after", 5)
                    logger.warning(
                        "Telegram rate limited (429), retry_after=%s, attempt=%d/%d",
                        retry_after, attempt + 1, max_retries
                    )
                    if attempt < max_retries - 1:
                        await asyncio.sleep(retry_after)
                        continue

                logger.error(
                    "Telegram API error: %s %s - %s",
                    response.status_code, response.reason_phrase, response.text
                )
                return False

            except httpx.RequestError as exc:
                logger.error("Telegram request failed: %s", exc)
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
                    continue
                return False

        return False

    def _format_message(self, alert: Dict[str, Any]) -> str:
        severity = alert.get("severity", "warning")
        status = alert.get("status", "firing")

        # Severity emoji mapping matching AlertOps UI colors
        severity_emojis = {
            "critical": "🔴",
            "warning": "🟡",
            "info": "🔵",
        }
        severity_emoji = severity_emojis.get(severity, "⚪")

        status_text = "FIRING" if status == "firing" else "RESOLVED"
        status_icon = "🚨" if status == "firing" else "✅"

        # Build structured message using only Telegram-supported HTML tags:
        # <b>, <strong>, <i>, <em>, <u>, <ins>, <s>, <strike>, <del>, <a>, <code>, <pre>
        lines = []

        # Header with AlertOps branding
        lines.append(f'<b>⚡ AlertOps</b>  |  {status_icon} <b>{status_text}</b>')
        lines.append(f'<code>{"─" * 40}</code>')

        # Alert name
        alert_name = alert.get("alertname", "Unknown Alert")
        lines.append(f'')
        lines.append(f'<b>{alert_name}</b>')

        # Severity badge (no <span> — Telegram doesn't support it)
        lines.append(f'')
        lines.append(f'{severity_emoji} <b>Severity:</b> {severity.upper()}')

        # Description
        if alert.get("description"):
            lines.append(f'')
            lines.append(f'📝 <b>Description</b>')
            lines.append(f'<i>{alert["description"]}</i>')

        # AI Diagnosis
        if alert.get("diagnosis"):
            lines.append(f'')
            lines.append(f'🔮 <b>AI Diagnosis</b>')
            # Escape HTML entities in diagnosis to prevent parsing errors
            diagnosis = html.escape(alert["diagnosis"])
            lines.append(f'<pre>{diagnosis}</pre>')

        # Labels
        labels = alert.get("labels", {})
        if labels:
            lines.append(f'')
            lines.append(f'🏷 <b>Labels</b>')
            for k, v in labels.items():
                lines.append(f'  • <code>{k}</code>: {v}')

        # Footer with timestamp
        lines.append(f'')
        lines.append(f'<code>{"─" * 40}</code>')
        starts_at = alert.get("starts_at", "")
        if starts_at:
            lines.append(f'⏱ <b>Started:</b> {starts_at}')

        message = "\n".join(lines)

        # Telegram has a 4096 character limit for messages
        if len(message) > 4096:
            truncation_notice = "\n\n<i>... (message truncated due to Telegram limit)</i>"
            max_length = 4096 - len(truncation_notice)
            message = message[:max_length] + truncation_notice

        return message