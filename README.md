# 🛡️ OpenClaw Security Dashboard

A self-monitoring security dashboard built by an AI agent, for an AI agent.

An [OpenClaw](https://openclaw.ai) agent audits the server using a cron job, then delivers the results via webhook to a live dashboard.

## What It Does

```
Cron (every 5 min) → Spawns isolated AI agent → Runs security checks →
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
│  (5 min)    │     │  runs as scanner │     │  receives POST, │
│             │     │  user, read-only │     │  renders HTML   │
└─────────────┘     └──────────────────┘     └─────────────────┘
```

## Security Model

The audit agent runs with **least-privilege access** enforced at the OS level:

1. **Dedicated `scanner` user** — a system user with no write permissions
2. **Narrow `sudoers`** — can only run `ss -tlnp` (port scan) and `fail2ban-client status sshd`
3. **`adm` group membership** — grants read access to system logs via `journalctl`
4. **`security-scan` wrapper** — a bash script at `/usr/local/bin/security-scan` that exposes only predefined read-only subcommands (`ports`, `ssh-config`, `services`, `disk`, `fail2ban`, `attack-count`, `top-ips`)
5. **Dedicated OpenClaw agent** — the `security-scanner` agent is configured with `tools.allow: [exec, read]` only (no file writes, no browser, no messaging)

The agent cannot modify SSH config, restart services, install packages, or write files. It can only observe and report.

## Setup

### 1. Create the scanner user

```bash
# Create system user with adm group (for journalctl access)
useradd -r -s /bin/bash -G adm -m scanner

# Grant narrow sudo for port scanning and fail2ban
cat > /etc/sudoers.d/scanner << 'EOF'
scanner ALL=(root) NOPASSWD: /usr/bin/ss -tlnp
scanner ALL=(root) NOPASSWD: /usr/bin/fail2ban-client status sshd
EOF
chmod 440 /etc/sudoers.d/scanner
```

### 2. Install the security-scan wrapper

```bash
sudo cp scripts/security-scan /usr/local/bin/security-scan
sudo chmod +x /usr/local/bin/security-scan
```

The wrapper script runs all commands as the `scanner` user. Available subcommands:

```
security-scan ports        # Open ports with process names
security-scan ssh-config   # SSH server configuration
security-scan services     # Running systemd services
security-scan disk         # Disk usage
security-scan fail2ban     # fail2ban jail status
security-scan attack-count # Failed SSH attempts (last 5 min)
security-scan top-ips      # Top attacker IPs (last 5 min)
```

### 3. Dashboard Server

```bash
cd security-dashboard
npm install
node server.js
# Runs on http://localhost:3847
```

### 4. Reverse Proxy (Caddy example)

```
handle /dashboard* {
    uri strip_prefix /dashboard
    reverse_proxy localhost:3847
}

handle /webhook {
    reverse_proxy localhost:3847
}
```

### 5. OpenClaw Agent Configuration

Add a dedicated `security-scanner` agent to your `openclaw.json`:

```json
{
  "agents": {
    "list": [
      {
        "id": "security-scanner",
        "name": "Security Scanner",
        "tools": {
          "allow": ["exec", "read"],
          "exec": { "security": "full" }
        }
      }
    ]
  }
}
```

### 6. OpenClaw Cron Job

Create via OpenClaw CLI or let your agent set it up:

```json
{
  "name": "daily-security-audit",
  "schedule": { "kind": "cron", "expr": "0 9 * * *", "tz": "UTC" },
  "sessionTarget": "isolated",
  "agentId": "security-scanner",
  "payload": {
    "kind": "agentTurn",
    "message": "You are a READ-ONLY security scanner. Use the security-scan command to run checks. Do NOT attempt to fix or modify anything. Run: security-scan ports, security-scan ssh-config, security-scan services, security-scan disk, security-scan fail2ban, security-scan attack-count, security-scan top-ips. Grade each category A-F.",
    "timeoutSeconds": 90
  },
  "delivery": {
    "mode": "webhook",
    "to": "https://your-server.com/webhook"
  }
}
```

### 7. Systemd Service (optional)

```bash
sudo cp security-dashboard.service /etc/systemd/system/
sudo systemctl enable --now security-dashboard
```

## Customizing

- **Change the audit prompt** — edit `scripts/security-audit.md` or the cron job's `payload.message`
- **Add checks** — add new subcommands to `scripts/security-scan` (they'll run as the `scanner` user automatically)
- **Style the dashboard** — all CSS is inline in `server.js`, easy to tweak
- **Add alerts** — check grades in the webhook handler and send notifications for anything below B

## Built With

- [OpenClaw](https://openclaw.ai) — agentic runtime (cron, sub-agents, webhooks)
- [Express](https://expressjs.com/) — dashboard server
- [Caddy](https://caddyserver.com/) — reverse proxy with auto-HTTPS

## License

MIT — do whatever you want with it.
