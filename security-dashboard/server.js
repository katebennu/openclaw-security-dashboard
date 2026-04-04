const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3847;
const DATA_FILE = path.join(__dirname, 'reports.json');

// Ensure data file exists
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]');
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Webhook endpoint — receives cron job results
app.post('/webhook', (req, res) => {
  try {
    const report = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      // OpenClaw webhook sends the full run result
      status: req.body.status || 'unknown',
      summary: req.body.summary || req.body.result || req.body.text || JSON.stringify(req.body),
      raw: req.body
    };

    const reports = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    reports.unshift(report); // newest first
    // Keep last 90 reports (3 months of daily)
    if (reports.length > 90) reports.length = 90;
    fs.writeFileSync(DATA_FILE, JSON.stringify(reports, null, 2));

    console.log(`[${report.timestamp}] Report received (${report.status})`);
    res.json({ ok: true, id: report.id });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// API endpoint — get all reports
app.get('/api/reports', (req, res) => {
  const reports = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  res.json(reports);
});

// Dashboard
app.get('/', (req, res) => {
  const reports = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  res.send(renderDashboard(reports));
});

function renderDashboard(reports) {
  const latest = reports[0];
  const reportCards = reports.map((r, i) => {
    const date = new Date(r.timestamp).toLocaleString('en-US', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC'
    });
    const statusBadge = r.status === 'completed'
      ? '<span class="badge ok">✅ Passed</span>'
      : r.status === 'failed'
        ? '<span class="badge fail">❌ Failed</span>'
        : '<span class="badge unknown">⏳ ' + r.status + '</span>';

    // Extract the text content from the summary
    const content = typeof r.summary === 'string' ? r.summary : JSON.stringify(r.summary, null, 2);

    return `
      <div class="report-card ${i === 0 ? 'latest' : ''}">
        <div class="report-header">
          <span class="report-date">${date} UTC</span>
          ${statusBadge}
          ${i === 0 ? '<span class="badge latest-badge">LATEST</span>' : ''}
        </div>
        <div class="report-body">
          <pre>${escapeHtml(content)}</pre>
        </div>
      </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🛡️ Security Dashboard — OpenClaw</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0e17;
      color: #e0e6ed;
      min-height: 100vh;
    }
    .container { max-width: 900px; margin: 0 auto; padding: 2rem 1.5rem; }

    header {
      text-align: center;
      padding: 2rem 0 1rem;
      border-bottom: 1px solid #1e2a3a;
      margin-bottom: 2rem;
    }
    header h1 { font-size: 2rem; font-weight: 700; }
    header h1 span { color: #3b82f6; }
    .subtitle {
      color: #64748b;
      margin-top: 0.5rem;
      font-size: 0.95rem;
    }

    .stats-row {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      flex: 1;
      background: #111827;
      border: 1px solid #1e2a3a;
      border-radius: 12px;
      padding: 1.25rem;
      text-align: center;
    }
    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: #3b82f6;
    }
    .stat-label {
      font-size: 0.8rem;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 0.25rem;
    }

    .report-card {
      background: #111827;
      border: 1px solid #1e2a3a;
      border-radius: 12px;
      margin-bottom: 1rem;
      overflow: hidden;
      transition: border-color 0.2s;
    }
    .report-card:hover { border-color: #3b82f6; }
    .report-card.latest { border-color: #3b82f6; box-shadow: 0 0 20px rgba(59,130,246,0.1); }

    .report-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem 1.25rem;
      background: #0d1321;
      border-bottom: 1px solid #1e2a3a;
    }
    .report-date { font-weight: 600; font-size: 0.9rem; }

    .badge {
      font-size: 0.75rem;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      font-weight: 600;
    }
    .badge.ok { background: #064e3b; color: #34d399; }
    .badge.fail { background: #7f1d1d; color: #fca5a5; }
    .badge.unknown { background: #78350f; color: #fcd34d; }
    .badge.latest-badge { background: #1e3a5f; color: #60a5fa; }

    .report-body {
      padding: 1.25rem;
    }
    .report-body pre {
      white-space: pre-wrap;
      word-break: break-word;
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 0.85rem;
      line-height: 1.6;
      color: #cbd5e1;
    }

    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
      color: #475569;
    }
    .empty-state .icon { font-size: 3rem; margin-bottom: 1rem; }
    .empty-state p { font-size: 1.1rem; }
    .empty-state .hint {
      margin-top: 0.5rem;
      font-size: 0.85rem;
      color: #334155;
    }

    footer {
      text-align: center;
      padding: 2rem 0;
      color: #334155;
      font-size: 0.8rem;
    }

    @media (max-width: 600px) {
      .stats-row { flex-direction: column; }
      .container { padding: 1rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🛡️ Security <span>Dashboard</span></h1>
      <p class="subtitle">Automated daily audit by OpenClaw · Reports delivered via webhook</p>
    </header>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value">${reports.length}</div>
        <div class="stat-label">Total Reports</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${reports.filter(r => r.status === 'completed').length}</div>
        <div class="stat-label">Passed</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${latest ? new Date(latest.timestamp).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : '—'}</div>
        <div class="stat-label">Last Audit</div>
      </div>
    </div>

    ${reports.length === 0 ? `
      <div class="empty-state">
        <div class="icon">📡</div>
        <p>Waiting for first security report...</p>
        <p class="hint">The daily audit runs at 09:00 UTC, or you can trigger it manually.</p>
      </div>
    ` : reportCards}

    <footer>
      Powered by OpenClaw · Auto-refreshes on new webhook delivery
    </footer>
  </div>
  <script>
    // Auto-refresh every 60s
    setTimeout(() => location.reload(), 60000);
  </script>
</body>
</html>`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`🛡️  Security Dashboard running on http://127.0.0.1:${PORT}`);
});
