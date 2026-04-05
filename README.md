# 🛡️ OpenClaw Security Dashboard

A self-monitoring security dashboard built by an AI agent, for an AI agent.

An [OpenClaw](https://openclaw.ai) agent audits the server daily using a cron job, then delivers the results via webhook to a live dashboard.

## What It Does

```
Cron (daily 9am UTC) → Spawns isolated AI agent → Runs security checks →
Agent writes graded report → Webhook POST → Dashboard updates
```

The agent checks:
- **Open ports** — anything unexpected listening externally?
- **SSH config** — root login restricted? password auth disabled?
- **Running services** — anything unnecessary?
- **Disk usage** — any partition above 80%?
- **Failed login attempts** — brute force activity?
- **Unattended upgrades** — enabled and working?
- **Pending updates** — any security patches waiting?

Each category gets a letter grade (A-F). Results are stored and displayed on a dark-themed dashboard.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  OpenClaw   │────▶│  Isolated Agent  │────▶│   Dashboard     │
│  Cron Job   │     │  (security audit)│     │  (Express app)  │
│  (9am UTC)  │     │  runs commands,  │     │  receives POST, │
│             │     │  grades findings │     │  renders HTML   │
└─────────────┘     └──────────────────┘     └─────────────────┘
```

## Setup

### 1. Dashboard Server

```bash
cd security-dashboard
npm install
node server.js
# Runs on http://localhost:3847
```

### 2. Reverse Proxy (Caddy example)

```
handle /dashboard* {
    uri strip_prefix /dashboard
    reverse_proxy localhost:3847
}

handle /webhook {
    reverse_proxy localhost:3847
}
```

### 3. OpenClaw Cron Job

Create via OpenClaw CLI or let your agent set it up:

```json
{
  "name": "daily-security-audit",
  "schedule": { "kind": "cron", "expr": "0 9 * * *", "tz": "UTC" },
  "sessionTarget": "isolated",
  "payload": {
    "kind": "agentTurn",
    "message": "Run a security audit of this server...",
    "timeoutSeconds": 120
  },
  "delivery": {
    "mode": "webhook",
    "to": "https://your-server.com/webhook"
  }
}
```

### 4. Systemd Service (optional)

```bash
sudo cp security-dashboard.service /etc/systemd/system/
sudo systemctl enable --now security-dashboard
```

## Customizing

- **Change the audit prompt** — edit `scripts/security-audit.md` or the cron job's `payload.message`
- **Add checks** — the agent can run any command, so add whatever you want to the prompt
- **Style the dashboard** — all CSS is inline in `server.js`, easy to tweak
- **Add alerts** — check grades in the webhook handler and send notifications for anything below B

## Built With

- [OpenClaw](https://openclaw.ai) — agentic runtime (cron, sub-agents, webhooks)
- [Express](https://expressjs.com/) — dashboard server
- [Caddy](https://caddyserver.com/) — reverse proxy with auto-HTTPS

## License

MIT — do whatever you want with it.
