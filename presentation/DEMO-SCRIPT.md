# 🛡️ Agentic Security Dashboard — Demo Script

## Elevator Pitch (30 sec)
"I gave an AI agent root access to a server on the internet and told it to keep itself safe. It audited the server, found security issues, fixed them, built its own monitoring dashboard, and now runs a security check every 5 minutes — catching real attacks happening live. The whole thing took about an hour to build."

---

## Presentation Flow

### 1. THE HOOK (2 min)
**Open with the dashboard** — https://164.92.98.129/dashboard

- "This is a live server on the internet. Right now, people are trying to break into it."
- Point to the **attack panel** — real IPs, real attempts, pulsing red dot
- "An AI agent built this dashboard, runs the audits, and is watching the server right now."

### 2. WHAT IS OPENCLAW? (2 min)
OpenClaw is an open-source agentic runtime. It gives AI agents:
- **Tools** — shell access, web browsing, file system
- **Memory** — persistent workspace, daily logs, long-term memory files
- **Scheduling** — cron jobs that spawn isolated agents
- **Sub-agents** — parallel isolated sessions for different tasks
- **Webhooks** — agents can deliver results to external systems
- **Safety rails** — approval flows for destructive commands, sandboxing

### 3. THE BUILD STORY (5 min)
Walk through what we built, in order:

**Step 1: Discovery**
- Spawned 3 sub-agents in parallel:
  - One checked Hacker News
  - One ran a security audit
  - One wrote a poem about waking up
- Showed: sub-agent parallelism, session isolation, result synthesis

**Step 2: Security Remediation**
- Agent found issues: root SSH login enabled, no firewall, unnecessary services
- Agent fixed them live: hardened SSH, disabled ModemManager
- Showed: agent taking real system actions with human oversight

**Step 3: Dashboard**
- Agent wrote an Express.js server (~200 lines)
- Set up Caddy reverse proxy
- Created a systemd service
- Showed: agent as a full-stack developer deploying to production

**Step 4: Cron + Webhooks**
- Created a cron job: every 5 min, spawn isolated agent → audit → webhook → dashboard
- Showed: autonomous agent loop with external delivery

**Step 5: Attack Monitoring**
- Added attack parsing from fail2ban data
- Most-wanted IP list, attack frequency trends
- Real brute-force attempts visible live
- Showed: agents processing real-world security data

### 4. LIVE DEMO (5 min)
Pick 2-3 of these:

**Option A: "Talk to the agent"**
- Open webchat, ask the agent a question about the server
- Show it running commands, reasoning about results

**Option B: "Trigger an audit"**
- Fire the cron job manually, refresh dashboard, watch new report appear
- Point out grade parsing, attack data, trend charts updating

**Option C: "Spawn a sub-agent"**
- Ask the agent to research something — show it spawning an isolated session
- Results flow back automatically

**Option D: "Show the safety model"**
- Show how destructive commands require approval
- "The agent has root, but it still asks before doing dangerous things"

### 5. ARCHITECTURE SLIDE (1 min)
```
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│   OpenClaw   │────▶│  Isolated Agent  │────▶│   Dashboard    │
│  Cron (5min) │     │  runs audit      │     │   (Express)    │
│              │     │  parses grades   │     │   renders UI   │
└──────────────┘     │  counts attacks  │     │   stores data  │
                     └──────────────────┘     └────────────────┘
                              │                        │
                     ┌────────▼────────┐      ┌────────▼───────┐
                     │  Server itself  │      │  Caddy proxy   │
                     │  (the patient   │      │  (HTTPS + TLS) │
                     │   IS the doctor)│      └────────────────┘
                     └─────────────────┘
```

### 6. KEY TAKEAWAYS (1 min)
1. **Agents can build AND operate** — not just generate code, but deploy, monitor, respond
2. **Isolation matters** — each audit runs in its own session, can't corrupt others
3. **Webhooks bridge agent ↔ world** — agents aren't trapped in chat
4. **Safety is a feature** — approval flows, sandboxing, memory isolation
5. **Real attacks, real defense** — this isn't a toy, it's catching actual intrusions

### 7. Q&A
Likely questions:
- "How much did this cost?" → ~$X in API calls over the session
- "Could the agent break the server?" → Approval flow for destructive commands
- "How is this different from a bash script?" → Agent adapts, reasons about findings, can escalate
- "What model is it using?" → Claude Opus, but swappable

---

## Demo Checklist
- [ ] Dashboard is live and has recent reports: https://164.92.98.129/dashboard
- [ ] Cron job is running (check: last report < 5 min ago)
- [ ] Webchat is accessible for live agent interaction
- [ ] Have the git log ready to show build progression
- [ ] Tab with reports.json open to show raw data if asked

## Talking Points to Weave In
- "Built in ~1 hour of conversation with the agent"
- "The server is being attacked RIGHT NOW" (point at dashboard)
- "The agent is the sysadmin — I just told it what to care about"
- "Everything is open source — OpenClaw, the dashboard code, all of it"
