import os
import yaml
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List
from config import settings


class RuleGenerator:
    def __init__(self):
        self.prometheus_rules_dir = Path(settings.rules_dir)
        self.loki_rules_dir = Path(settings.loki_rules_dir)
        self.prometheus_rules_dir.mkdir(parents=True, exist_ok=True)
        self.loki_rules_dir.mkdir(parents=True, exist_ok=True)

    def generate_prometheus_rule(
        self,
        name: str,
        query: str,
        condition: str,
        duration: str = "5m",
        severity: str = "warning",
        labels: Dict[str, str] = None,
        annotations: Dict[str, str] = None,
    ) -> Dict[str, Any]:
        if labels is None:
            labels = {}
        if annotations is None:
            annotations = {}

        labels["severity"] = severity

        rule = {
            "groups": [
                {
                    "name": f"{name.lower().replace(' ', '_')}_alerts",
                    "rules": [
                        {
                            "alert": name,
                            "expr": f"{query} {condition}",
                            "for": duration,
                            "labels": labels,
                            "annotations": {
                                "summary": annotations.get("summary", f"Alert: {name}"),
                                "description": annotations.get(
                                    "description", f"Condition triggered: {query} {condition}"
                                ),
                            },
                        }
                    ],
                }
            ]
        }
        return rule

    def generate_loki_rule(
        self,
        name: str,
        query: str,
        condition: str,
        duration: str = "5m",
        severity: str = "warning",
        labels: Dict[str, str] = None,
        annotations: Dict[str, str] = None,
    ) -> Dict[str, Any]:
        if labels is None:
            labels = {}
        if annotations is None:
            annotations = {}

        labels["severity"] = severity

        rule = {
            "groups": [
                {
                    "name": f"{name.lower().replace(' ', '_')}_alerts",
                    "rules": [
                        {
                            "alert": name,
                            "expr": f"{query} {condition}",
                            "for": duration,
                            "labels": labels,
                            "annotations": {
                                "summary": annotations.get("summary", f"Alert: {name}"),
                                "description": annotations.get(
                                    "description", f"Condition triggered: {query} {condition}"
                                ),
                            },
                        }
                    ],
                }
            ]
        }
        return rule

    def write_rule_file(
        self,
        rule_id: str,
        rule_data: Dict[str, Any],
        query_type: str = "promql",
    ) -> Path:
        if query_type == "logql":
            rules_dir = self.loki_rules_dir
            filename = f"loki_alert_{rule_id}.yml"
        else:
            rules_dir = self.prometheus_rules_dir
            filename = f"prom_alert_{rule_id}.yml"

        filepath = rules_dir / filename
        with open(filepath, "w", encoding="utf-8") as f:
            yaml.dump(rule_data, f, default_flow_style=False, allow_unicode=True)
        return filepath

    async def reload_prometheus(self) -> bool:
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{settings.prometheus_url}/-/reload",
                    timeout=10.0,
                )
                return response.status_code == 200
        except Exception:
            return False

    async def reload_loki(self) -> bool:
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{settings.loki_url}/loki/api/v1/admin/rules",
                    timeout=10.0,
                )
                return response.status_code in (200, 202)
        except Exception:
            return False

    def delete_rule_file(self, rule_id: str, query_type: str = "promql") -> bool:
        """Delete a rule file from disk. Returns True if file was deleted."""
        if query_type == "logql":
            rules_dir = self.loki_rules_dir
            filename = f"loki_alert_{rule_id}.yml"
        else:
            rules_dir = self.prometheus_rules_dir
            filename = f"prom_alert_{rule_id}.yml"

        filepath = rules_dir / filename
        if filepath.exists():
            filepath.unlink()
            return True
        return False

    def update_rule_file(
        self,
        rule_id: str,
        rule_data: Dict[str, Any],
        query_type: str = "promql",
    ) -> Path:
        """Update an existing rule file. Returns the file path."""
        if query_type == "logql":
            rules_dir = self.loki_rules_dir
            filename = f"loki_alert_{rule_id}.yml"
        else:
            rules_dir = self.prometheus_rules_dir
            filename = f"prom_alert_{rule_id}.yml"

        filepath = rules_dir / filename
        with open(filepath, "w", encoding="utf-8") as f:
            yaml.dump(rule_data, f, default_flow_style=False, allow_unicode=True)
        return filepath


rule_generator = RuleGenerator()
