import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    prometheus_url: str = "http://prometheus:9090"
    loki_url: str = "http://loki:3100"
    alertmanager_url: str = "http://alertmanager:9093"
    grafana_url: str = "http://grafana:3000"
    grafana_public_url: str = "http://localhost:3000"
    grafana_api_key: str = ""
    grafana_user: str = "admin"
    grafana_password: str = "admin"
    data_dir: str = "/app/data"
    rules_dir: str = "/app/rules"
    loki_rules_dir: str = "/app/loki-rules"

    llm_provider: str = "deepseek"
    llm_api_key: str = ""
    llm_base_url: str = "https://api.deepseek.com/v1"
    llm_model: str = "deepseek-chat"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()