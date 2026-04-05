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
  const catRegex = /(?:^|\n)\s*#*\s*(.+?)\s*[-—]+\s*Grade:?\s*([A-F][+-]?)/gi;
  let m;
  while ((m = catRegex.exec(text)) !== null) {
    const name = m[1].replace(/^\*+|\*+$/g, '').replace(/^#+\s*/, '').trim();
    const grade = m[2].toUpperCase();
    if (name.toLowerCase() !== 'overall' && GRADE_VALUES[grade] !== undefined) {
      categories.push({ name, grade, value: GRADE_VALUES[grade] });
    }
  }
  const overallMatch = text.match(/Overall:?\s*(?:Grade:?\s*)?([A-F][+-]?)/i);
  const overall = overallMatch ? overallMatch[1].toUpperCase() : null;
  const gpa = categories.length > 0
    ? categories.reduce((sum, c) => sum + c.value, 0) / categories.length
    : (overall ? GRADE_VALUES[overall] || null : null);
  return { categories, overall, gpa };
}

// --- Attack Parsing ---

function parseAttacks(text) {
  if (!text || typeof text !== 'string') return null;

  // Try structured ```attacks block first
  const blockMatch = text.match(/```attacks\s*\n([\s\S]*?)```/);
  if (blockMatch) {
    const block = blockMatch[1];
    const get = (key) => {
      const m = block.match(new RegExp(key + ':\\s*(.+)'));
      return m ? m[1].trim() : null;
    };
    const topIpsRaw = get('top_ips') || '';
    const topIps = topIpsRaw.split(',').map(s => {
      const parts = s.trim().split(':');
      return parts.length === 2 ? { ip: parts[0].trim(), count: parseInt(parts[1]) || 0 } : null;
    }).filter(Boolean);

    return {
      totalFailed: parseInt(get('total_failed')) || 0,
      currentlyBanned: parseInt(get('currently_banned')) || 0,
      totalBanned: parseInt(get('total_banned')) || 0,
      recentAttempts: parseInt(get('recent_attempts_5min')) || 0,
      topIps
    };
  }

  // Fallback: try to extract from fail2ban output in the text
  const totalFailedMatch = text.match(/Total failed:\s*(\d+)/i);
  const currentlyBannedMatch = text.match(/Currently banned:\s*(\d+)/i);
  const totalBannedMatch = text.match(/Total banned:\s*(\d+)/i);

  if (totalFailedMatch || currentlyBannedMatch || totalBannedMatch) {
    return {
      totalFailed: parseInt(totalFailedMatch?.[1]) || 0,
      currentlyBanned: parseInt(currentlyBannedMatch?.[1]) || 0,
      totalBanned: parseInt(totalBannedMatch?.[1]) || 0,
      recentAttempts: 0,
      topIps: []
    };
  }

  return null;
}

function gradeColor(grade) {
  if (!grade) return '#64748b';
  switch (grade.charAt(0)) {
    case 'A': return '#34d399';
    case 'B': return '#60a5fa';
    case 'C': return '#fbbf24';
    case 'D': return '#fb923c';
    case 'F': return '#f87171';
    default:  return '#64748b';
  }
}

function gradeBg(grade) {
  if (!grade) return '#1e293b';
  switch (grade.charAt(0)) {
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
    const attacks = parseAttacks(summary);

    const report = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      status: req.body.status || 'unknown',
      summary,
      grades,
      attacks,
      raw: req.body
    };

    const reports = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    reports.unshift(report);
    if (reports.length > 200) reports.length = 200;
    fs.writeFileSync(DATA_FILE, JSON.stringify(reports, null, 2));

    const attackInfo = attacks ? ` | ${attacks.recentAttempts} recent attacks, ${attacks.currentlyBanned} banned` : '';
    console.log(`[${report.timestamp}] Report: ${grades.overall || '?'}${attackInfo}`);
    res.json({ ok: true, id: report.id, gradesParsed: grades.categories.length, attacksParsed: !!attacks });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports', (req, res) => {
  const reports = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  res.json(reports);
});

// --- Dashboard ---

app.get('/', (req, res) => {
  const reports = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  reports.forEach(r => {
    if (!r.grades) r.grades = parseGrades(r.summary);
    if (!r.attacks && r.attacks !== null) r.attacks = parseAttacks(r.summary);
  });
  res.send(renderDashboard(reports));
});

function renderGradeChart(grades) {
  if (!grades?.categories?.length) return '';
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

function renderDashboard(reports) {
  const latest = reports[0];
  const latestGrades = latest?.grades;
  const latestAttacks = latest?.attacks;

  // Score ring
  const overallGrade = latestGrades?.overall || '—';
  const overallPct = latestGrades?.overall ? gradeToPercent(latestGrades.overall) : 0;
  const overallColor = gradeColor(latestGrades?.overall);
  const circumference = 2 * Math.PI * 54;
  const dashOffset = circumference - (overallPct / 100) * circumference;

  // Aggregate attack stats across all reports
  const reportsWithAttacks = reports.filter(r => r.attacks);
  const totalAttacksAllTime = reportsWithAttacks.reduce((sum, r) => sum + (r.attacks.recentAttempts || 0), 0);
  const maxBanned = reportsWithAttacks.reduce((max, r) => Math.max(max, r.attacks.totalBanned || 0), 0);

  // Collect all attacker IPs across reports for the "most wanted" list
  const ipCounts = {};
  reportsWithAttacks.forEach(r => {
    (r.attacks.topIps || []).forEach(entry => {
      ipCounts[entry.ip] = (ipCounts[entry.ip] || 0) + entry.count;
    });
  });
  const mostWanted = Object.entries(ipCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([ip, count]) => ({ ip, count }));

  // Trend data for charts (last 20, reversed to chronological)
  const trendData = reports.slice(0, 20).reverse();
  const trendLabels = trendData.map(r => {
    const d = new Date(r.timestamp);
    return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
  });

  // Report cards
  const reportCards = reports.slice(0, 30).map((r, i) => {
    const date = new Date(r.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
    const statusBadge = r.status === 'completed'
      ? '<span class="badge ok">✅ Passed</span>'
      : r.status === 'failed'
        ? '<span class="badge fail">❌ Failed</span>'
        : '<span class="badge unknown">⏳ ' + escapeHtml(r.status || '') + '</span>';

    const content = typeof r.summary === 'string' ? r.summary : JSON.stringify(r.summary, null, 2);
    const grades = r.grades || parseGrades(r.summary);
    const attacks = r.attacks;
    const gradeChart = renderGradeChart(grades);

    const attackBadge = attacks
      ? `<span class="badge" style="background:#7f1d1d; color:#fca5a5;">🔫 ${attacks.recentAttempts} attacks</span>
         ${attacks.currentlyBanned > 0 ? `<span class="badge" style="background:#78350f; color:#fcd34d;">🚫 ${attacks.currentlyBanned} banned</span>` : ''}`
      : '';

    const overallBadge = grades?.overall
      ? `<span class="badge" style="color:${gradeColor(grades.overall)}; background:${gradeBg(grades.overall)}; font-size:0.85rem; padding:0.25rem 0.75rem;">${grades.overall}</span>`
      : '';

    return `
      <div class="report-card ${i === 0 ? 'latest' : ''}">
        <div class="report-header">
          <span class="report-date">${date} UTC</span>
          ${statusBadge} ${overallBadge} ${attackBadge}
          ${i === 0 ? '<span class="badge latest-badge">LATEST</span>' : ''}
          <button class="toggle-btn" onclick="this.closest('.report-card').classList.toggle('expanded')">▼</button>
        </div>
        ${gradeChart}
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
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0e17; color: #e0e6ed; min-height: 100vh; }
    .container { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem; }

    header { text-align: center; padding: 2rem 0 1.5rem; border-bottom: 1px solid #1e2a3a; margin-bottom: 2rem; }
    header h1 { font-size: 2rem; font-weight: 700; }
    header h1 span { color: #3b82f6; }
    .subtitle { color: #64748b; margin-top: 0.5rem; font-size: 0.95rem; }

    /* Hero row */
    .hero-row { display: flex; gap: 1.5rem; margin-bottom: 2rem; align-items: stretch; }
    .score-ring-card {
      background: #111827; border: 1px solid #1e2a3a; border-radius: 16px;
      padding: 1.5rem; display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 180px;
    }
    .score-ring-card .ring-label { font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem; }
    .score-ring { position: relative; width: 120px; height: 120px; }
    .score-ring svg { transform: rotate(-90deg); }
    .score-ring .ring-bg { fill: none; stroke: #1e293b; stroke-width: 8; }
    .score-ring .ring-fg { fill: none; stroke-width: 8; stroke-linecap: round; transition: stroke-dashoffset 1s ease; }
    .score-ring .ring-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 2rem; font-weight: 800; }
    .score-ring .ring-subtext { position: absolute; top: 68%; left: 50%; transform: translate(-50%, 0); font-size: 0.7rem; color: #64748b; }

    .stats-grid { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .stat-card { background: #111827; border: 1px solid #1e2a3a; border-radius: 12px; padding: 1rem; text-align: center; }
    .stat-value { font-size: 1.6rem; font-weight: 700; color: #3b82f6; }
    .stat-value.red { color: #f87171; }
    .stat-value.amber { color: #fbbf24; }
    .stat-value.green { color: #34d399; }
    .stat-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.15rem; }

    /* Attack panel */
    .attack-panel {
      background: linear-gradient(135deg, #1a0a0a 0%, #111827 100%);
      border: 1px solid #7f1d1d;
      border-radius: 16px;
      padding: 1.5rem;
      margin-bottom: 2rem;
    }
    .attack-panel-header {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;
    }
    .attack-panel-title { font-size: 1rem; font-weight: 700; color: #fca5a5; }
    .attack-live-dot {
      width: 8px; height: 8px; background: #f87171; border-radius: 50%;
      display: inline-block; margin-right: 0.4rem;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

    .attack-stats-row { display: flex; gap: 1rem; margin-bottom: 1.25rem; }
    .attack-stat {
      flex: 1; text-align: center; padding: 0.75rem;
      background: rgba(127, 29, 29, 0.2); border-radius: 10px; border: 1px solid rgba(248, 113, 113, 0.15);
    }
    .attack-stat-value { font-size: 1.8rem; font-weight: 800; color: #f87171; }
    .attack-stat-label { font-size: 0.7rem; color: #fca5a5; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.15rem; }

    /* Attacker table */
    .attacker-section { display: flex; gap: 1.5rem; }
    .attacker-list { flex: 1; }
    .attacker-list-title { font-size: 0.8rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.6rem; font-weight: 600; }
    .attacker-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.4rem 0.6rem; border-radius: 6px; margin-bottom: 0.3rem;
      font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.8rem;
    }
    .attacker-row:nth-child(odd) { background: rgba(255,255,255,0.02); }
    .attacker-ip { color: #f87171; }
    .attacker-count { color: #fca5a5; font-weight: 600; }
    .attacker-bar { flex: 1; margin: 0 0.75rem; height: 4px; background: #1e293b; border-radius: 2px; overflow: hidden; }
    .attacker-bar-fill { height: 100%; background: linear-gradient(90deg, #f87171, #ef4444); border-radius: 2px; }

    /* Attack trend mini chart */
    .attack-trend { flex: 1; }
    .attack-trend-title { font-size: 0.8rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.6rem; font-weight: 600; }
    .trend-chart-container { position: relative; height: 100px; }
    .trend-chart { position: relative; height: 100%; display: flex; align-items: flex-end; gap: 2px; padding-bottom: 1.2rem; }
    .trend-bar-group { flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; height: 100%; justify-content: flex-end; }
    .trend-bar {
      width: 100%; max-width: 28px; border-radius: 3px 3px 0 0; transition: height 0.6s ease;
      min-height: 2px; position: relative;
    }
    .trend-bar:hover { filter: brightness(1.3); cursor: pointer; }
    .trend-bar .tooltip {
      display: none; position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
      background: #1e293b; color: #e0e6ed; padding: 0.3rem 0.5rem; border-radius: 6px;
      font-size: 0.7rem; white-space: nowrap; z-index: 10; border: 1px solid #334155;
    }
    .trend-bar:hover .tooltip { display: block; }
    .trend-date { font-size: 0.6rem; color: #475569; margin-top: 0.2rem; position: absolute; bottom: 0; }

    /* GPA trend card */
    .trend-card {
      background: #111827; border: 1px solid #1e2a3a; border-radius: 16px;
      padding: 1.25rem; margin-bottom: 2rem;
    }
    .trend-title { font-weight: 600; font-size: 0.85rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 1rem; }

    /* Grade chart (per report) */
    .grade-chart { padding: 1rem 1.25rem; border-bottom: 1px solid #1e2a3a; }
    .grade-chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
    .grade-chart-title { font-weight: 600; font-size: 0.85rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.04em; }
    .overall-grade { font-size: 0.8rem; padding: 0.2rem 0.65rem; border-radius: 999px; font-weight: 700; }
    .grade-row { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.45rem; }
    .grade-label { width: 160px; font-size: 0.8rem; color: #cbd5e1; text-align: right; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .grade-bar-track { flex: 1; height: 10px; background: #1e293b; border-radius: 5px; overflow: hidden; }
    .grade-bar-fill { height: 100%; border-radius: 5px; transition: width 0.8s ease; }
    .grade-letter { width: 32px; text-align: center; font-weight: 700; font-size: 0.8rem; padding: 0.15rem 0.3rem; border-radius: 6px; flex-shrink: 0; }

    /* Report cards */
    .report-card { background: #111827; border: 1px solid #1e2a3a; border-radius: 12px; margin-bottom: 1rem; overflow: hidden; transition: border-color 0.2s; }
    .report-card:hover { border-color: #3b82f6; }
    .report-card.latest { border-color: #3b82f6; box-shadow: 0 0 20px rgba(59,130,246,0.1); }
    .report-header { display: flex; align-items: center; gap: 0.75rem; padding: 1rem 1.25rem; background: #0d1321; border-bottom: 1px solid #1e2a3a; flex-wrap: wrap; }
    .report-date { font-weight: 600; font-size: 0.9rem; }
    .badge { font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 999px; font-weight: 600; }
    .badge.ok { background: #064e3b; color: #34d399; }
    .badge.fail { background: #7f1d1d; color: #fca5a5; }
    .badge.unknown { background: #78350f; color: #fcd34d; }
    .badge.latest-badge { background: #1e3a5f; color: #60a5fa; }
    .toggle-btn { margin-left: auto; background: none; border: 1px solid #334155; color: #64748b; border-radius: 6px; padding: 0.2rem 0.5rem; cursor: pointer; font-size: 0.75rem; transition: all 0.2s; }
    .toggle-btn:hover { border-color: #3b82f6; color: #3b82f6; }
    .report-body { max-height: 0; overflow: hidden; transition: max-height 0.4s ease; }
    .report-card.expanded .report-body { max-height: 3000px; }
    .report-card.expanded .toggle-btn { transform: rotate(180deg); }
    .report-body pre { padding: 1.25rem; white-space: pre-wrap; word-break: break-word; font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace; font-size: 0.82rem; line-height: 1.6; color: #94a3b8; }

    .section-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem; color: #e0e6ed; }
    .empty-state { text-align: center; padding: 4rem 2rem; color: #475569; }
    .empty-state .icon { font-size: 3rem; margin-bottom: 1rem; }
    footer { text-align: center; padding: 2rem 0; color: #334155; font-size: 0.8rem; }

    @media (max-width: 600px) {
      .hero-row, .attacker-section, .attack-stats-row { flex-direction: column; }
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
      <p class="subtitle">Automated audit every 5 min by OpenClaw · Live attack monitoring</p>
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
          <div class="stat-value">${latestGrades?.categories?.length || 0}</div>
          <div class="stat-label">Categories</div>
        </div>
        <div class="stat-card">
          <div class="stat-value red">${latestAttacks?.totalFailed || 0}</div>
          <div class="stat-label">Failed Logins</div>
        </div>
        <div class="stat-card">
          <div class="stat-value green">${latestAttacks?.totalBanned || 0}</div>
          <div class="stat-label">IPs Banned</div>
        </div>
      </div>
    </div>

    <!-- Attack Panel -->
    ${latestAttacks ? `
    <div class="attack-panel">
      <div class="attack-panel-header">
        <div class="attack-panel-title"><span class="attack-live-dot"></span> Live Attack Monitor</div>
        <span style="font-size:0.75rem; color:#64748b;">Updated every 5 min</span>
      </div>

      <div class="attack-stats-row">
        <div class="attack-stat">
          <div class="attack-stat-value">${latestAttacks.recentAttempts}</div>
          <div class="attack-stat-label">Attacks (last 5 min)</div>
        </div>
        <div class="attack-stat">
          <div class="attack-stat-value">${latestAttacks.currentlyBanned}</div>
          <div class="attack-stat-label">Currently Banned</div>
        </div>
        <div class="attack-stat">
          <div class="attack-stat-value">${latestAttacks.totalBanned}</div>
          <div class="attack-stat-label">Total Bans</div>
        </div>
        <div class="attack-stat">
          <div class="attack-stat-value">${latestAttacks.totalFailed}</div>
          <div class="attack-stat-label">All-Time Failed</div>
        </div>
      </div>

      <div class="attacker-section">
        <!-- Most wanted IPs -->
        <div class="attacker-list">
          <div class="attacker-list-title">🎯 Most Wanted IPs</div>
          ${mostWanted.length > 0 ? mostWanted.map((entry, i) => {
            const maxCount = mostWanted[0].count;
            const pct = Math.max(5, (entry.count / maxCount) * 100);
            return `
              <div class="attacker-row">
                <span class="attacker-ip">${escapeHtml(entry.ip)}</span>
                <div class="attacker-bar"><div class="attacker-bar-fill" style="width:${pct}%"></div></div>
                <span class="attacker-count">${entry.count}</span>
              </div>`;
          }).join('') : '<div style="color:#475569; font-size:0.8rem; padding:0.5rem;">No attacker IPs recorded yet</div>'}
        </div>

        <!-- Attack trend mini chart -->
        <div class="attack-trend">
          <div class="attack-trend-title">📈 Attack Frequency</div>
          <div class="trend-chart-container">
            <div class="trend-chart">
              ${trendData.map((r, i) => {
                const attempts = r.attacks?.recentAttempts || 0;
                const maxAttempts = Math.max(1, ...trendData.map(x => x.attacks?.recentAttempts || 0));
                const heightPct = Math.max(3, (attempts / maxAttempts) * 100);
                const color = attempts === 0 ? '#1e293b' : attempts <= 2 ? '#fbbf24' : '#f87171';
                return `
                  <div class="trend-bar-group">
                    <div class="trend-bar" style="height:${heightPct}%; background:${color}">
                      <div class="tooltip">${attempts} attacks — ${trendLabels[i]}</div>
                    </div>
                    <span class="trend-date">${trendLabels[i]}</span>
                  </div>`;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>` : ''}

    <!-- GPA Trend -->
    ${trendData.filter(r => r.grades?.gpa).length >= 1 ? `
    <div class="trend-card">
      <div class="trend-title">📊 Security GPA Trend (last ${trendData.length} audits)</div>
      <div class="trend-chart" style="height:100px;">
        ${trendData.map((r, i) => {
          const gpa = r.grades?.gpa || 0;
          const heightPct = Math.max(5, (gpa / 4.3) * 100);
          const grade = r.grades?.overall || '?';
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

    <!-- Reports -->
    <div class="section-title">📋 Audit Reports</div>
    ${reports.length === 0 ? `
      <div class="empty-state">
        <div class="icon">📡</div>
        <p>Waiting for first security report...</p>
      </div>
    ` : reportCards}

    <footer>Powered by OpenClaw · Auto-refreshes every 30s</footer>
  </div>
  <script>
    setTimeout(() => location.reload(), 30000);
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
