from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class Dashboard(BaseModel):
    uid: str
    title: str
    url: str


class Panel(BaseModel):
    id: int
    title: str
    type: str
    datasource: Optional[str] = None
    targets: List[Dict[str, Any]] = Field(default_factory=list)
    query: Optional[str] = None
    query_type: Optional[str] = None
    multiple_queries: bool = False
    embed_url: Optional[str] = None
    dashboard_slug: Optional[str] = None


class AlertVariant(BaseModel):
    name: str
    description: str
    query: str
    condition: str
    duration: str = "5m"


class AlertRule(BaseModel):
    id: str
    name: str
    description: str
    query: str
    query_type: str  # promql or logql
    condition: str
    duration: str
    severity: str = "warning"
    folder: Optional[str] = None  # folder/tag for grouping; null/empty = "Uncategorized"
    labels: Dict[str, str] = Field(default_factory=dict)
    annotations: Dict[str, str] = Field(default_factory=dict)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    panel_uid: Optional[str] = None
    dashboard_uid: Optional[str] = None
    resolve_timeout: int = 5  # minutes to wait before closing after metric recovery
    silenced_until: Optional[str] = None  # ISO timestamp until which the alert is silenced; null = not silenced
    channels: List[str] = Field(default_factory=list)  # list of notification channel IDs


class Alert(BaseModel):
    id: str
    alertname: str
    status: str  # firing, resolving, acknowledged, resolved
    severity: str
    summary: Optional[str] = None
    description: Optional[str] = None
    labels: Dict[str, str] = Field(default_factory=dict)
    annotations: Dict[str, str] = Field(default_factory=dict)
    starts_at: str
    ends_at: Optional[str] = None
    generator_url: Optional[str] = None
    fingerprint: str
    diagnosis: Optional[str] = None
    diagnosis_status: str = "pending"  # pending, analyzing, completed, failed
    diagnosis_cached: bool = False  # True if diagnosis came from cache
    read: bool = False
    created_at: str
    updated_at: str
    resolve_timeout: int = 5  # minutes (inherited from rule)
    resolve_at: Optional[str] = None  # when resolving will complete
    folder: Optional[str] = None  # inherited from rule at alert creation time
    resolution_reason: Optional[str] = None  # why alert was resolved: silenced, rule_deleted, manual_force_resolve, zombie_cleanup
    silenced_by: Optional[str] = None  # "folder:name" or "rule:name" if resolved by silence
    silenced_at: Optional[str] = None  # ISO timestamp when silence was applied


class NotificationChannel(BaseModel):
    id: Optional[str] = None
    name: str
    channel_type: str  # telegram or webhook
    enabled: bool = True
    config: Dict[str, Any] = Field(default_factory=dict)
    # telegram config: {"bot_token": "...", "chat_id": "..."}
    # webhook config: {"url": "...", "method": "POST", "headers": {}, "timeout_seconds": 30}
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class LLMProvider(BaseModel):
    id: str
    name: str
    provider_type: str = "openai"
    base_url: str
    api_key: str
    model: str
    is_default: bool = False
    created_at: Optional[str] = None


class HealthStatus(BaseModel):
    service: str
    status: str  # healthy, unhealthy
    url: str
    error: Optional[str] = None


class QueryRangeRequest(BaseModel):
    query: str
    query_type: str = "promql"  # promql or logql
    seconds: int = 3600  # time range in seconds
    step: Optional[str] = "30s"


class QueryRangeResponse(BaseModel):
    status: str  # success or error
    error: Optional[str] = None
    series: List[Dict[str, Any]] = Field(default_factory=list)