const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3847;
const DATA_FILE = path.join(__dirname, 'reports.json');

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]');
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Grade Parsing ---

const GRADE_VALUES = { 'A+': 4.3, 'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7, 'C+': 2.3, 'C': 2.0, 'C-': 1.7, 'D+': 1.3, 'D': 1.0, 'D-': 0.7, 'F': 0.0 };

function parseGrades(text) {
  if (!text || typeof text !== 'string') return { categories: [], overall: null, gpa: null };

  const categories = [];
  // Match patterns like "Category — Grade: X" or "Category — Grade X" or "## Category — Grade: X"
  const catRegex = /(?:^|\n)\s*#*\s*(.+?)\s*[-—]+\s*Grade:?\s*([A-F][+-]?)/gi;
  let m;
  while ((m = catRegex.exec(text)) !== null) {
    const name = m[1].replace(/^\*+|\*+$/g, '').replace(/^#+\s*/, '').trim();
    const grade = m[2].toUpperCase();
    if (name.toLowerCase() !== 'overall' && GRADE_VALUES[grade] !== undefined) {
      categories.push({ name, grade, value: GRADE_VALUES[grade] });
    }
  }

  // Overall grade — look for "Overall: X" or "Overall Grade: X"
  const overallMatch = text.match(/Overall:?\s*(?:Grade:?\s*)?([A-F][+-]?)/i);
  const overall = overallMatch ? overallMatch[1].toUpperCase() : null;

  // Calculate GPA from categories
  const gpa = categories.length > 0
    ? categories.reduce((sum, c) => sum + c.value, 0) / categories.length
    : (overall ? GRADE_VALUES[overall] || null : null);

  return { categories, overall, gpa };
}

function gradeColor(grade) {
  if (!grade) return '#64748b';
  const g = grade.charAt(0);
  switch (g) {
    case 'A': return '#34d399';  // emerald
    case 'B': return '#60a5fa';  // blue
    case 'C': return '#fbbf24';  // amber
    case 'D': return '#fb923c';  // orange
    case 'F': return '#f87171';  // red
    default:  return '#64748b';
  }
}

function gradeBg(grade) {
  if (!grade) return '#1e293b';
  const g = grade.charAt(0);
  switch (g) {
    case 'A': return '#064e3b';
    case 'B': return '#1e3a5f';
    case 'C': return '#78350f';
    case 'D': return '#7c2d12';
    case 'F': return '#7f1d1d';
    default:  return '#1e293b';
  }
}

function gradeToPercent(grade) {
  if (!grade || GRADE_VALUES[grade] === undefined) return 0;
  return Math.round((GRADE_VALUES[grade] / 4.3) * 100);
}

// --- Webhook ---

app.post('/webhook', (req, res) => {
  try {
    const summary = req.body.summary || req.body.result || req.body.text || JSON.stringify(req.body);
    const grades = parseGrades(summary);

    const report = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      status: req.body.status || 'unknown',
      summary,
      grades,
      raw: req.body
    };

    const reports = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    reports.unshift(report);
    if (reports.length > 90) reports.length = 90;
    fs.writeFileSync(DATA_FILE, JSON.stringify(reports, null, 2));

    console.log(`[${report.timestamp}] Report received — ${grades.categories.length} grades parsed, overall: ${grades.overall || 'N/A'}`);
    res.json({ ok: true, id: report.id, gradesParsed: grades.categories.length });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- API ---

app.get('/api/reports', (req, res) => {
  const reports = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  res.json(reports);
});

// --- Dashboard ---

app.get('/', (req, res) => {
  const reports = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  // Backfill grades for old reports that don't have them
  reports.forEach(r => { if (!r.grades) r.grades = parseGrades(r.summary); });
  res.send(renderDashboard(reports));
});

function renderGradeChart(grades) {
  if (!grades || !grades.categories || grades.categories.length === 0) return '';

  const bars = grades.categories.map(c => {
    const pct = gradeToPercent(c.grade);
    const color = gradeColor(c.grade);
    const bg = gradeBg(c.grade);
    return `
      <div class="grade-row">
        <div class="grade-label">${escapeHtml(c.name)}</div>
        <div class="grade-bar-track">
          <div class="grade-bar-fill" style="width:${pct}%; background:${color}"></div>
        </div>
        <div class="grade-letter" style="color:${color}; background:${bg}">${c.grade}</div>
      </div>`;
  }).join('');

  const overallColor = gradeColor(grades.overall);
  const overallBg = gradeBg(grades.overall);

  return `
    <div class="grade-chart">
      <div class="grade-chart-header">
        <span class="grade-chart-title">Score Breakdown</span>
        ${grades.overall ? `<span class="overall-grade" style="color:${overallColor}; background:${overallBg}">Overall: ${grades.overall}</span>` : ''}
      </div>
      ${bars}
    </div>`;
}

function renderOverallBadge(grades) {
  if (!grades || !grades.overall) return '';
  const color = gradeColor(grades.overall);
  const bg = gradeBg(grades.overall);
  return `<span class="badge" style="color:${color}; background:${bg}; font-size:0.85rem; padding:0.25rem 0.75rem;">${grades.overall}</span>`;
}

function renderDashboard(reports) {
  const latest = reports[0];
  const latestGrades = latest?.grades;

  // Build the big overall score ring for the hero section
  const overallGrade = latestGrades?.overall || '—';
  const overallPct = latestGrades?.overall ? gradeToPercent(latestGrades.overall) : 0;
  const overallColor = gradeColor(latestGrades?.overall);
  const circumference = 2 * Math.PI * 54; // r=54
  const dashOffset = circumference - (overallPct / 100) * circumference;

  const reportCards = reports.map((r, i) => {
    const date = new Date(r.timestamp).toLocaleString('en-US', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC'
    });
    const statusBadge = r.status === 'completed'
      ? '<span class="badge ok">✅ Passed</span>'
      : r.status === 'failed'
        ? '<span class="badge fail">❌ Failed</span>'
        : '<span class="badge unknown">⏳ ' + escapeHtml(r.status) + '</span>';

    const content = typeof r.summary === 'string' ? r.summary : JSON.stringify(r.summary, null, 2);
    const grades = r.grades || parseGrades(r.summary);
    const gradeChart = renderGradeChart(grades);

    return `
      <div class="report-card ${i === 0 ? 'latest' : ''}">
        <div class="report-header">
          <span class="report-date">${date} UTC</span>
          ${statusBadge}
          ${renderOverallBadge(grades)}
          ${i === 0 ? '<span class="badge latest-badge">LATEST</span>' : ''}
          <button class="toggle-btn" onclick="this.closest('.report-card').classList.toggle('expanded')">▼</button>
        </div>
        ${gradeChart}
        <div class="report-body">
          <pre>${escapeHtml(content)}</pre>
        </div>
      </div>`;
  }).join('\n');

  // Trend data: last 10 reports with GPA
  const trendReports = reports.slice(0, 10).reverse();
  const trendLabels = trendReports.map(r => {
    const d = new Date(r.timestamp);
    return `${d.getMonth()+1}/${d.getDate()}`;
  });
  const trendValues = trendReports.map(r => {
    const g = r.grades || parseGrades(r.summary);
    return g.gpa !== null ? g.gpa.toFixed(2) : null;
  });

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
    .container { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem; }

    header {
      text-align: center;
      padding: 2rem 0 1.5rem;
      border-bottom: 1px solid #1e2a3a;
      margin-bottom: 2rem;
    }
    header h1 { font-size: 2rem; font-weight: 700; }
    header h1 span { color: #3b82f6; }
    .subtitle { color: #64748b; margin-top: 0.5rem; font-size: 0.95rem; }

    /* --- Hero Score Ring --- */
    .hero-row {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 2rem;
      align-items: stretch;
    }
    .score-ring-card {
      background: #111827;
      border: 1px solid #1e2a3a;
      border-radius: 16px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 180px;
    }
    .score-ring-card .ring-label { font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem; }
    .score-ring { position: relative; width: 120px; height: 120px; }
    .score-ring svg { transform: rotate(-90deg); }
    .score-ring .ring-bg { fill: none; stroke: #1e293b; stroke-width: 8; }
    .score-ring .ring-fg { fill: none; stroke-width: 8; stroke-linecap: round; transition: stroke-dashoffset 1s ease; }
    .score-ring .ring-text {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      font-size: 2rem; font-weight: 800;
    }
    .score-ring .ring-subtext {
      position: absolute; top: 68%; left: 50%; transform: translate(-50%, 0);
      font-size: 0.7rem; color: #64748b;
    }

    /* --- Stats Cards --- */
    .stats-grid {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    .stat-card {
      background: #111827;
      border: 1px solid #1e2a3a;
      border-radius: 12px;
      padding: 1rem;
      text-align: center;
    }
    .stat-value { font-size: 1.6rem; font-weight: 700; color: #3b82f6; }
    .stat-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.15rem; }

    /* --- Grade Chart (per report) --- */
    .grade-chart {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid #1e2a3a;
    }
    .grade-chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }
    .grade-chart-title { font-weight: 600; font-size: 0.85rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.04em; }
    .overall-grade { font-size: 0.8rem; padding: 0.2rem 0.65rem; border-radius: 999px; font-weight: 700; }

    .grade-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin-bottom: 0.45rem;
    }
    .grade-label {
      width: 160px;
      font-size: 0.8rem;
      color: #cbd5e1;
      text-align: right;
      flex-shrink: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .grade-bar-track {
      flex: 1;
      height: 10px;
      background: #1e293b;
      border-radius: 5px;
      overflow: hidden;
    }
    .grade-bar-fill {
      height: 100%;
      border-radius: 5px;
      transition: width 0.8s ease;
    }
    .grade-letter {
      width: 32px;
      text-align: center;
      font-weight: 700;
      font-size: 0.8rem;
      padding: 0.15rem 0.3rem;
      border-radius: 6px;
      flex-shrink: 0;
    }

    /* --- Trend Chart --- */
    .trend-card {
      background: #111827;
      border: 1px solid #1e2a3a;
      border-radius: 16px;
      padding: 1.25rem;
      margin-bottom: 2rem;
    }
    .trend-title { font-weight: 600; font-size: 0.85rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 1rem; }
    .trend-chart { position: relative; height: 120px; display: flex; align-items: flex-end; gap: 2px; padding-bottom: 1.5rem; }
    .trend-bar-group { flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; height: 100%; justify-content: flex-end; }
    .trend-bar {
      width: 100%;
      max-width: 40px;
      border-radius: 4px 4px 0 0;
      transition: height 0.6s ease;
      position: relative;
      min-height: 4px;
    }
    .trend-bar:hover { filter: brightness(1.3); cursor: pointer; }
    .trend-bar .tooltip {
      display: none;
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      background: #1e293b;
      color: #e0e6ed;
      padding: 0.3rem 0.5rem;
      border-radius: 6px;
      font-size: 0.7rem;
      white-space: nowrap;
      z-index: 10;
      border: 1px solid #334155;
    }
    .trend-bar:hover .tooltip { display: block; }
    .trend-date { font-size: 0.65rem; color: #475569; margin-top: 0.3rem; position: absolute; bottom: 0; }

    /* --- Report Cards --- */
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
      flex-wrap: wrap;
    }
    .report-date { font-weight: 600; font-size: 0.9rem; }

    .badge { font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 999px; font-weight: 600; }
    .badge.ok { background: #064e3b; color: #34d399; }
    .badge.fail { background: #7f1d1d; color: #fca5a5; }
    .badge.unknown { background: #78350f; color: #fcd34d; }
    .badge.latest-badge { background: #1e3a5f; color: #60a5fa; }

    .toggle-btn {
      margin-left: auto;
      background: none;
      border: 1px solid #334155;
      color: #64748b;
      border-radius: 6px;
      padding: 0.2rem 0.5rem;
      cursor: pointer;
      font-size: 0.75rem;
      transition: all 0.2s;
    }
    .toggle-btn:hover { border-color: #3b82f6; color: #3b82f6; }

    .report-body {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.4s ease;
    }
    .report-card.expanded .report-body { max-height: 2000px; }
    .report-card.expanded .toggle-btn { transform: rotate(180deg); }
    .report-body pre {
      padding: 1.25rem;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 0.82rem;
      line-height: 1.6;
      color: #94a3b8;
    }

    .empty-state { text-align: center; padding: 4rem 2rem; color: #475569; }
    .empty-state .icon { font-size: 3rem; margin-bottom: 1rem; }

    footer { text-align: center; padding: 2rem 0; color: #334155; font-size: 0.8rem; }

    @media (max-width: 600px) {
      .hero-row { flex-direction: column; }
      .stats-grid { grid-template-columns: 1fr; }
      .grade-label { width: 100px; }
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

    <!-- Hero: Score Ring + Stats -->
    <div class="hero-row">
      <div class="score-ring-card">
        <div class="ring-label">Overall Score</div>
        <div class="score-ring">
          <svg viewBox="0 0 120 120" width="120" height="120">
            <circle class="ring-bg" cx="60" cy="60" r="54" />
            <circle class="ring-fg" cx="60" cy="60" r="54"
              stroke="${overallColor}"
              stroke-dasharray="${circumference.toFixed(1)}"
              stroke-dashoffset="${dashOffset.toFixed(1)}" />
          </svg>
          <div class="ring-text" style="color:${overallColor}">${overallGrade}</div>
          ${latestGrades?.gpa ? `<div class="ring-subtext">${latestGrades.gpa.toFixed(1)} GPA</div>` : ''}
        </div>
      </div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${reports.length}</div>
          <div class="stat-label">Total Audits</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${reports.filter(r => r.status === 'completed').length}</div>
          <div class="stat-label">Completed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${latestGrades?.categories?.length || 0}</div>
          <div class="stat-label">Categories</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${latest ? new Date(latest.timestamp).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : '—'}</div>
          <div class="stat-label">Last Audit</div>
        </div>
      </div>
    </div>

    <!-- Trend Chart -->
    ${trendValues.filter(v => v !== null).length >= 1 ? `
    <div class="trend-card">
      <div class="trend-title">GPA Trend (last ${trendLabels.length} audits)</div>
      <div class="trend-chart">
        ${trendReports.map((r, i) => {
          const gpa = trendValues[i] !== null ? parseFloat(trendValues[i]) : 0;
          const heightPct = Math.max(5, (gpa / 4.3) * 100);
          const grade = (r.grades || parseGrades(r.summary)).overall || '?';
          const color = gradeColor(grade !== '?' ? grade : null);
          return `
            <div class="trend-bar-group">
              <div class="trend-bar" style="height:${heightPct}%; background:${color}">
                <div class="tooltip">${grade} (${gpa.toFixed(1)}) — ${trendLabels[i]}</div>
              </div>
              <span class="trend-date">${trendLabels[i]}</span>
            </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <!-- Report Cards -->
    ${reports.length === 0 ? `
      <div class="empty-state">
        <div class="icon">📡</div>
        <p>Waiting for first security report...</p>
      </div>
    ` : reportCards}

    <footer>Powered by OpenClaw · Auto-refreshes every 60s</footer>
  </div>
  <script>
    setTimeout(() => location.reload(), 60000);
    // Auto-expand latest report
    const first = document.querySelector('.report-card.latest');
    if (first) first.classList.add('expanded');
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
