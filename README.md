# AlertOps

**AlertOps** is a self-hosted monitoring and alerting platform featuring AI-driven incident diagnostics. It can be deployed with a single command and integrates Prometheus, Loki, Alertmanager, and Grafana into a single, user-friendly interface.

## Overview

AlertOps bridges the gap between raw monitoring data and actionable insights. Instead of manually correlating metrics, logs, and alerts across multiple tools, you get a unified dashboard where you can:

- **Browse Grafana dashboards** and create alert rules directly from any panel
- **Generate alert rules with AI** — the system suggests 3 variations based on the panel's query
- **Receive instant alerts** via Alertmanager webhooks
- **Get AI-powered diagnosis** — automatically fetches relevant logs from Loki and analyzes them with an LLM

## Screenshots

### Dashboard Browser
Browse all Grafana dashboards and panels. Click any panel to create an alert.
<!-- TODO: Add screenshot: assets/screenshots/dashboards.png -->
![Dashboard Browser](assets/screenshots/dashboards.png)

### Alert Creation Wizard
Generate AI-powered alert rules from panel queries. Edit and validate before saving.
<!-- TODO: Add screenshot: assets/screenshots/create-alert.png -->
![Alert Creation Wizard](assets/screenshots/create-alert.png)

### Active Alerts
Real-time alert feed with AI diagnosis. New alerts appear instantly; diagnosis updates asynchronously.
<!-- TODO: Add screenshot: assets/screenshots/active-alerts.png -->
![Active Alerts](assets/screenshots/active-alerts.png)

### Alert History
Search and filter past alerts. Click any alert to view full details and diagnosis.
<!-- TODO: Add screenshot: assets/screenshots/alert-history.png -->
![Alert History](assets/screenshots/alert-history.png)

### LLM Provider Settings
Manage multiple LLM providers. Supports DeepSeek, OpenAI, and any OpenAI-compatible API.
<!-- TODO: Add screenshot: assets/screenshots/providers.png -->
![LLM Provider Settings](assets/screenshots/providers.png)

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Prometheus │────▶│ Alertmanager│────▶│   Backend   │
│   (metrics) │     │  (routing)  │     │  (webhook)  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
                       ┌────────────────────────┘
                       ▼
              ┌─────────────────┐
              │  Alert File     │◄── Instant save
              │  (JSON storage) │
              └─────────────────┘
                       │
                       ▼ (background task)
              ┌─────────────────┐     ┌─────────────┐
              │   Loki Query    │────▶│    LLM      │
              │  (fetch logs)   │     │ (diagnosis) │
              └─────────────────┘     └─────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Updated Alert  │◄── UI polling/SSE
              │  (with diagnosis)│
              └─────────────────┘
```

## Key Features

- **One-command deployment** — `docker compose up -d`
- **No database required** — file-based JSON storage with atomic writes
- **Instant alerts** — webhook response is immediate; diagnosis runs asynchronously
- **AI alert generation** — create rules from Grafana panels with LLM suggestions
- **AI diagnosis** — automatic log correlation and root cause analysis
- **Dark theme UI** — modern, minimal design inspired by Grafana/Linear

## Quick Start

### Prerequisites

- Docker Engine 24.0+
- Docker Compose 2.20+

### Installation

```bash
git clone <repository-url>
cd alertops
cp .env.example .env
docker compose up -d
```

### Access the Services

| Service | URL | Default Credentials |
|---------|-----|---------------------|
| AlertOps UI | http://localhost:8080 | none (open access) |
| Grafana | http://localhost:3000 | admin / admin |
| Prometheus | http://localhost:9090 | none |
| Alertmanager | http://localhost:9093 | none |
| Loki | http://localhost:3100 | none |
| Backend API | http://localhost:8000 | none |

## Configuration

### Environment Variables

Create `.env` from `.env.example`:

```bash
# LLM Provider (for AI diagnosis and alert generation)
LLM_PROVIDER=deepseek
LLM_API_KEY=your-api-key-here
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat

# Grafana API Key (optional, for dashboard listing)
GRAFANA_API_KEY=
```

### LLM Providers

AlertOps supports any OpenAI-compatible API out of the box. Add providers via the UI:

1. Open **Settings → LLM Providers**
2. Click **Add Provider**
3. Fill in: Name, Base URL, API Key, Model
4. Set as default

Supported providers:
- **DeepSeek** (`https://api.deepseek.com/v1`, model: `deepseek-chat`)
- **OpenAI** (`https://api.openai.com/v1`, model: `gpt-4`)
- **Local models** (Ollama, LM Studio, etc.)

### Prometheus Configuration

Edit `config/prometheus/prometheus.yml` to add your scrape targets:

```yaml
scrape_configs:
  - job_name: 'my-app'
    static_configs:
      - targets: ['my-app:8080']
```

Rules are auto-generated to `config/prometheus/rules/`.

### Loki Configuration

Edit `config/loki/local-config.yaml` to adjust retention or storage.

### Alertmanager Configuration

Edit `config/alertmanager/alertmanager.yml` to customize routing:

```yaml
route:
  receiver: 'alertops-webhook'
receivers:
  - name: 'alertops-webhook'
    webhook_configs:
      - url: 'http://backend:8000/api/webhooks/alerts'
        send_resolved: true
```

### Grafana Configuration

Datasources and dashboards are provisioned automatically:

- **Datasources**: `config/grafana/provisioning/datasources/datasources.yml`
- **Dashboards**: `config/grafana/provisioning/dashboards/dashboards.yml`
- **Default dashboards**: `config/grafana/dashboards/`

To add your own dashboards, place JSON files in `config/grafana/dashboards/`.

## How It Works

### 1. Dashboard Browsing

The UI fetches dashboards from Grafana via its HTTP API. Each panel shows its query (PromQL or LogQL). Click **Create Alert** to start the wizard.

### 2. Alert Creation Wizard

- **Step 1**: View the extracted query. If multiple queries exist, manual input is required.
- **Step 2**: Click **Generate Variations** to get 3 AI-suggested alert rules.
- **Step 3**: Select a variation or write your own query. Add name and description.
- **Step 4**: Save — the rule is written as a YAML file and Prometheus is reloaded.

### 3. Alert Processing Pipeline

When an alert fires:

1. **Alertmanager** sends webhook to backend
2. **Backend immediately saves** the alert to a JSON file (status: `new`)
3. **UI instantly shows** the alert card (via polling)
4. **Background task** fetches logs from Loki and queries the LLM
5. **Diagnosis is appended** to the same file (status: `completed`)
6. **UI updates** the card with the AI diagnosis

This ensures critical alerts are never delayed by LLM latency.

### 4. File Storage

All data is stored in `./data/`:

```
data/
├── backend/
│   ├── alerts/
│   │   ├── active/      # Currently firing alerts
│   │   └── history/     # Resolved alerts
│   ├── providers/       # LLM provider configs
│   └── rules/           # Alert rule definitions
├── prometheus/          # Prometheus TSDB
├── loki/               # Loki chunks and indexes
├── grafana/            # Grafana database
└── alertmanager/       # Alertmanager state
```

Backup is trivial: `tar -czf backup.tar.gz data/`

## Troubleshooting

### Services not starting

```bash
docker compose logs <service-name>
```

Check health status:
```bash
docker compose ps
```

### No logs in Loki

Ensure promtail can access Docker socket:
```bash
docker compose logs promtail
```

Verify labels:
```bash
curl http://localhost:3100/loki/api/v1/label/container/values
```

### LLM diagnosis not working

Check provider configuration in the UI. Without an API key, the system falls back to demo mode with generic advice.

### Grafana dashboards not showing

Verify Grafana API is reachable:
```bash
curl http://localhost:3000/api/health
```

## Development

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Running Tests

```bash
cd backend
pytest tests/
```

## License

MIT