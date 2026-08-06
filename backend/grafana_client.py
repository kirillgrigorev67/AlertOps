import httpx
from typing import Any, Dict, List, Optional
from config import settings
from models import Dashboard, Panel


class GrafanaClient:
    def __init__(self):
        self.base_url = settings.grafana_url
        self.api_key = settings.grafana_api_key
        self.user = settings.grafana_user
        self.password = settings.grafana_password
        self.headers = {}
        if self.api_key:
            self.headers["Authorization"] = f"Bearer {self.api_key}"

    async def _request(self, method: str, path: str, **kwargs) -> Any:
        url = f"{self.base_url}/api{path}"
        async with httpx.AsyncClient() as client:
            response = await client.request(method, url, headers=self.headers, **kwargs)
            response.raise_for_status()
            return response.json()

    async def get_dashboards(self) -> List[Dashboard]:
        data = await self._request("GET", "/search")
        return [
            Dashboard(
                uid=item.get("uid", ""),
                title=item.get("title", ""),
                url=item.get("url", ""),
            )
            for item in data
            if item.get("type") == "dash-db"
        ]

    async def get_dashboard(self, uid: str) -> Dict[str, Any]:
        return await self._request("GET", f"/dashboards/uid/{uid}")

    async def get_panels(self, uid: str) -> List[Panel]:
        dashboard = await self.get_dashboard(uid)
        dashboard_data = dashboard.get("dashboard", {})
        meta = dashboard.get("meta", {})
        panels = []
        
        # Get dashboard slug for embed URL
        slug = meta.get("slug", uid)
        dashboard_title = dashboard_data.get("title", uid)
        if not slug or slug == uid:
            # Generate slug from title
            slug = dashboard_title.lower().replace(" ", "-").replace("_", "-")

        for panel in dashboard_data.get("panels", []):
            if panel.get("type") in ["timeseries", "graph", "stat", "gauge", "singlestat"]:
                targets = panel.get("targets", [])
                query = None
                query_type = None
                multiple_queries = len(targets) > 1

                if not multiple_queries and targets:
                    target = targets[0]
                    query = target.get("expr") or target.get("query")
                    datasource = panel.get("datasource")
                    if isinstance(datasource, dict):
                        datasource = datasource.get("uid")
                    
                    # Определяем тип запроса
                    if query:
                        ds_type = await self._get_datasource_type(datasource)
                        if ds_type == "loki":
                            query_type = "logql"
                        else:
                            query_type = "promql"

                # Generate embed URL for the panel (use public URL for browser access)
                panel_id = panel.get("id", 0)
                public_url = settings.grafana_public_url
                embed_url = f"{public_url}/d-solo/{uid}/{slug}?panelId={panel_id}&orgId=1&theme=dark&refresh=30s"

                panels.append(
                    Panel(
                        id=panel_id,
                        title=panel.get("title", ""),
                        type=panel.get("type", ""),
                        datasource=datasource,
                        targets=targets,
                        query=query,
                        query_type=query_type,
                        multiple_queries=multiple_queries,
                        embed_url=embed_url,
                        dashboard_slug=slug,
                    )
                )

        return panels

    async def _get_datasource_type(self, uid: Optional[str]) -> Optional[str]:
        if not uid:
            return None
        try:
            ds = await self._request("GET", f"/datasources/uid/{uid}")
            return ds.get("type")
        except Exception:
            return None

    async def get_datasources(self) -> List[Dict[str, Any]]:
        return await self._request("GET", "/datasources")


grafana = GrafanaClient()