import httpx
from typing import Any, Dict, Optional
from config import settings


class QueryValidator:
    async def validate_prometheus_query(self, query: str) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{settings.prometheus_url}/api/v1/query",
                    params={"query": query},
                    timeout=10.0,
                )
                data = response.json()
                if data.get("status") == "success":
                    result = data.get("data", {}).get("result", [])
                    return {
                        "valid": True,
                        "has_data": len(result) > 0,
                        "result_count": len(result),
                    }
                else:
                    return {
                        "valid": False,
                        "has_data": False,
                        "error": data.get("error", "Unknown error"),
                    }
        except Exception as e:
            return {
                "valid": False,
                "has_data": False,
                "error": str(e),
            }

    async def validate_loki_query(self, query: str) -> Dict[str, Any]:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{settings.loki_url}/loki/api/v1/query",
                    params={"query": query, "limit": 1},
                    timeout=10.0,
                )
                data = response.json()
                if data.get("status") == "success":
                    result = data.get("data", {}).get("result", [])
                    return {
                        "valid": True,
                        "has_data": len(result) > 0,
                        "result_count": len(result),
                    }
                else:
                    return {
                        "valid": False,
                        "has_data": False,
                        "error": data.get("error", "Unknown error"),
                    }
        except Exception as e:
            return {
                "valid": False,
                "has_data": False,
                "error": str(e),
            }

    async def validate(self, query: str, query_type: str) -> Dict[str, Any]:
        if query_type == "logql":
            return await self.validate_loki_query(query)
        else:
            return await self.validate_prometheus_query(query)


query_validator = QueryValidator()