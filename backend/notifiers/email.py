import asyncio
import logging
from email.mime.text import MIMEText
from typing import Any, Dict

import aiosmtplib

from .base import BaseNotifier

logger = logging.getLogger(__name__)


class EmailNotifier(BaseNotifier):
    """SMTP email notifier."""

    @property
    def channel_type(self) -> str:
        return "email"

    async def send(self, alert: Dict[str, Any]) -> bool:
        host = self.config.get("host")
        port_str = self.config.get("port", "587")
        username = self.config.get("username", "")
        password = self.config.get("password", "")
        from_addr = self.config.get("from_address")
        to_addrs_raw = self.config.get("to_addresses", "")

        if not host or not from_addr or not to_addrs_raw:
            logger.error("Email notifier missing required config (host, from, to)")
            return False

        try:
            port = int(port_str)
        except ValueError:
            port = 587

        to_addrs = [a.strip() for a in to_addrs_raw.split(",") if a.strip()]
        if not to_addrs:
            logger.error("Email notifier has no valid recipients")
            return False

        severity = alert.get("severity", "warning")
        status = alert.get("status", "firing")
        alertname = alert.get("alertname", "Unknown Alert")
        description = alert.get("description") or ""
        diagnosis = alert.get("diagnosis") or ""
        starts_at = alert.get("starts_at", "")
        ends_at = alert.get("ends_at", "")
        labels = alert.get("labels", {})

        status_icon = chr(128680) if status == "firing" else chr(9989)
        status_text = "FIRING" if status == "firing" else "RESOLVED"

        sev_color = "#ef4444" if severity == "critical" else "#f59e0b" if severity == "warning" else "#3b82f6"
        sev_bg = sev_color + "18"
        stat_bg = "#ef444420" if status == "firing" else "#22c55e20"
        stat_color = "#ef4444" if status == "firing" else "#22c55e"

        html_parts = []
        html_parts.append("<!DOCTYPE html><html><body style=\"font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8fafc;\">")
        html_parts.append('<div style="background: #1e293b; color: #e2e8f0; border-radius: 8px; overflow: hidden; border: 1px solid #334155;">')
        html_parts.append('<div style="background: #0f172a; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #334155;">')
        html_parts.append('<div style="display: flex; align-items: center; gap: 8px;"><span style="font-size: 18px;">&#9889;</span><span style="font-weight: 700; color: #6366f1;">AlertOps</span></div>')
        html_parts.append(f'<span style="background: {stat_bg}; color: {stat_color}; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600;">{status_icon} {status_text}</span>')
        html_parts.append('</div>')
        html_parts.append('<div style="padding: 20px;">')
        html_parts.append(f'<h2 style="margin: 0 0 12px; font-size: 18px; color: #f8fafc;">{alertname}</h2>')
        html_parts.append(f'<span style="background: {sev_bg}; color: {sev_color}; padding: 3px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase;">{severity}</span>')
        html_parts.append("</div>")

        if description:
            html_parts.append(f'<p style="color: #cbd5e1; line-height: 1.6; margin: 16px 0 0;">{description}</p>')

        if diagnosis:
            html_parts.append('<div style="background: rgba(99,102,241,0.08); border-left: 3px solid #6366f1; padding: 12px; border-radius: 6px; margin: 16px 0;">')
            html_parts.append('<p style="font-size: 12px; font-weight: 600; color: #818cf8; margin: 0 0 4px;">AI Diagnosis</p>')
            html_parts.append(f'<p style="font-size: 13px; color: #c7d2fe; line-height: 1.6; margin: 0;">{diagnosis}</p>')
            html_parts.append("</div>")

        if labels:
            html_parts.append('<div style="margin: 16px 0;"><p style="font-size: 11px; color: #94a3b8; text-transform: uppercase; margin: 0 0 6px;">Labels</p><div style="display: flex; flex-wrap: wrap; gap: 6px;">')
            for k, v in list(labels.items())[:15]:
                html_parts.append(f'<span style="background: #1e293b; color: #94a3b8; padding: 2px 8px; border-radius: 4px; font-size: 11px; border: 1px solid #334155;"><span style="color: #64748b;">{k}:</span> {v}</span>')
            html_parts.append("</div></div>")

        html_parts.append("</div>")
        html_parts.append('<div style="background: #1e293b; padding: 12px 20px; border-top: 1px solid #334155; font-size: 12px; color: #64748b;">')
        html_parts.append(f'<span>Started: {starts_at}</span>')
        if status == "resolved" and ends_at:
            html_parts.append(f' | Resolved: {ends_at}')
        html_parts.append("</div></div></body></html>")

        text_lines = ["AlertOps - " + status_text, "-" * 40, alertname, "Severity: " + severity.upper(), "Status: " + status_text]
        if description:
            text_lines.extend(["", "Description:", description])
        if diagnosis:
            text_lines.extend(["", "AI Diagnosis:", diagnosis])
        if labels:
            text_lines.append("")
            text_lines.append("Labels:")
            for k, v in labels.items():
                text_lines.append("  " + k + ": " + str(v))
        text_lines.extend(["-" * 40, "Started: " + starts_at])
        if status == "resolved" and ends_at:
            text_lines.append("Resolved: " + ends_at)
        text_body = "\n".join(text_lines)

        max_retries = 3
        for attempt in range(max_retries):
            try:
                msg_plain = MIMEText(text_body, "plain", "utf-8")
                msg_html = MIMEText("\n".join(html_parts), "html", "utf-8")

                import email.mime.multipart
                msg_root = email.mime.multipart.MIMEMultipart("alternative")
                msg_root["Subject"] = "[AlertOps] " + status_text + ": " + alertname
                msg_root["From"] = from_addr
                msg_root["To"] = ", ".join(to_addrs)
                msg_root.attach(msg_plain)
                msg_root.attach(msg_html)

                transport = aiosmtplib.SMTP(hostname=host, port=port, start_tls=True)
                async with transport:
                    if username and password:
                        await transport.login(username, password)
                    await transport.send_messages([msg_root])

                logger.info("Email notification sent for alert %s to %s", alertname, ", ".join(to_addrs))
                return True

            except Exception as exc:
                logger.error("Email request failed: %s", exc)
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
                    continue
                return False

        return False
