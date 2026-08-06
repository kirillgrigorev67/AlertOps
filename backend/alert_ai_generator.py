import json
import httpx
from typing import Any, Dict, List, Optional
from fastapi import HTTPException
from llm import get_provider, DemoProvider
from query_validator import query_validator
from models import AlertVariant
from config import settings
from storage import storage


ALERT_GENERATION_PROMPT = """You are a monitoring and alerting expert. Given a query and its context, generate 3 different alert rule variants.

Query: {query}
Query Type: {query_type}
Dashboard: {dashboard_title}
Panel: {panel_title}

Generate exactly 3 alert variants in JSON format. Each variant should have:
- name: short name for the alert
- description: what this alert monitors (1 sentence)
- query: the exact query to use (can be modified from original)
- condition: the threshold condition (e.g. "> 80", "== 0", "< 100")
- duration: how long condition must persist (e.g. "5m", "1m", "15m")

Return ONLY a JSON array with 3 objects, no markdown, no explanation.

Example:
[
  {{
    "name": "High CPU Usage",
    "description": "Triggers when CPU usage exceeds 80% for 5 minutes",
    "query": "100 - (avg by(instance) (irate(node_cpu_seconds_total{{mode='idle'}}[5m])) * 100)",
    "condition": "> 80",
    "duration": "5m"
  }},
  ...
]
"""


class AlertAIGenerator:
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

    def _get_provider(self, provider_id: Optional[str] = None):
        """Get provider by ID, or fall back to default/env provider.
        
        If provider_id is explicitly provided and the provider is invalid,
        raises an exception instead of falling back — the user chose a 
        specific provider and should know it's not working.
        """
        if provider_id:
            provider_data = storage.get("providers", provider_id)
            if not provider_data:
                raise ValueError(f"Provider '{provider_id}' not found")
            
            provider_type = provider_data.get("provider_type", "openai")
            if provider_type == "demo":
                return DemoProvider(model=provider_data.get("model", "demo"))
            
            base_url = provider_data.get("base_url", "").strip()
            if not base_url or base_url == "http://localhost":
                raise ValueError(f"Provider '{provider_data.get('name')}' has invalid base URL: '{base_url}'")
            
            return get_provider(
                provider_type,
                base_url,
                provider_data.get("api_key", ""),
                provider_data.get("model", "gpt-4"),
            )
        
        # No provider_id specified — use fallback chain: default → env → demo
        providers = storage.list("providers")
        default = next((p for p in providers if p.get("is_default")), None)
        if default:
            provider_type = default.get("provider_type", "openai")
            if provider_type == "demo":
                return DemoProvider(model=default.get("model", "demo"))
            base_url = default.get("base_url", "").strip()
            if base_url and base_url != "http://localhost":
                return get_provider(
                    provider_type,
                    base_url,
                    default.get("api_key", ""),
                    default.get("model", "gpt-4"),
                )
        
        # Fall back to initialized provider (env or demo)
        return self._provider

    async def generate_variants(
        self,
        query: str,
        query_type: str,
        dashboard_title: str,
        panel_title: str,
        provider_id: Optional[str] = None,
    ) -> List[AlertVariant]:
        try:
            provider = self._get_provider(provider_id)
        except ValueError as e:
            # Re-raise config errors (invalid provider, bad URL, etc.)
            raise HTTPException(status_code=400, detail=str(e))
        
        prompt = ALERT_GENERATION_PROMPT.format(
            query=query,
            query_type=query_type,
            dashboard_title=dashboard_title,
            panel_title=panel_title,
        )

        try:
            response = await provider.generate(prompt, temperature=0.3, max_tokens=1500)
            variants = self._parse_variants(response)
            
            # Validate each variant
            valid_variants = []
            for variant in variants:
                validation = await query_validator.validate(variant.query, query_type)
                if validation["valid"]:
                    valid_variants.append(variant)
            
            return valid_variants[:3] if valid_variants else self._fallback_variants(query, query_type)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                # Return fallback variants with note
                variants = self._fallback_variants(query, query_type)
                for v in variants:
                    v.name = f"{v.name} (LLM: Invalid API key)"
                return variants
            elif e.response.status_code == 429:
                variants = self._fallback_variants(query, query_type)
                for v in variants:
                    v.name = f"{v.name} (LLM: Rate limited)"
                return variants
            else:
                return self._fallback_variants(query, query_type)
        except httpx.ConnectError:
            return self._fallback_variants(query, query_type)
        except HTTPException:
            raise
        except Exception:
            return self._fallback_variants(query, query_type)

    def _parse_variants(self, response: str) -> List[AlertVariant]:
        # Extract JSON from response
        text = response.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        
        data = json.loads(text)
        variants = []
        for item in data:
            variants.append(AlertVariant(
                name=item.get("name", "Unnamed Alert"),
                description=item.get("description", ""),
                query=item.get("query", ""),
                condition=item.get("condition", "> 0"),
                duration=item.get("duration", "5m"),
            ))
        return variants

    def _fallback_variants(self, query: str, query_type: str) -> List[AlertVariant]:
        return [
            AlertVariant(
                name="Threshold Exceeded",
                description="Triggers when metric exceeds threshold",
                query=query,
                condition="> 80",
                duration="5m",
            ),
            AlertVariant(
                name="No Data",
                description="Triggers when data is missing",
                query=query,
                condition="== 0",
                duration="5m",
            ),
            AlertVariant(
                name="High Value",
                description="Triggers on high values",
                query=query,
                condition="> 95",
                duration="1m",
            ),
        ]


alert_ai_generator = AlertAIGenerator()