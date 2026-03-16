// HTML report generator — produces a self-contained HTML quality report.
// Includes: summary stats, trend chart (Chart.js), gate breakdown, baseline comparison.
// All data values are HTML-escaped to prevent XSS.
// ── HTML Escaping ──────────────────────────────────────────────
/**
 * Escape a string for safe HTML insertion. Prevents XSS by encoding
 * all HTML-special characters.
 *
 * @param str - Raw string to escape
 * @returns HTML-safe string
 */
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}
/**
 * Safely convert an unknown value to an HTML-escaped string.
 *
 * @param value - Any value to render
 * @returns HTML-safe string representation
 */
function safeValue(value) {
    if (value === null || value === undefined)
        return '';
    return escapeHtml(String(value));
}
function computeStats(events) {
    const forgeRuns = events
        .filter((e) => e.event_type === 'forge_run')
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (forgeRuns.length === 0) {
        return {
            totalRuns: 0,
            passCount: 0,
            warnCount: 0,
            failCount: 0,
            errorCount: 0,
            passRate: 0,
            avgDurationMs: 0,
            dateRange: { from: '', to: '' },
        };
    }
    let passCount = 0;
    let warnCount = 0;
    let failCount = 0;
    let errorCount = 0;
    let totalDuration = 0;
    for (const run of forgeRuns) {
        if (run.status === 'pass')
            passCount++;
        else if (run.status === 'warn')
            warnCount++;
        else if (run.status === 'fail')
            failCount++;
        else if (run.status === 'error')
            errorCount++;
        totalDuration += run.duration_ms;
    }
    return {
        totalRuns: forgeRuns.length,
        passCount,
        warnCount,
        failCount,
        errorCount,
        passRate: forgeRuns.length > 0 ? passCount / forgeRuns.length : 0,
        avgDurationMs: forgeRuns.length > 0 ? totalDuration / forgeRuns.length : 0,
        dateRange: {
            from: forgeRuns[0].timestamp,
            to: forgeRuns[forgeRuns.length - 1].timestamp,
        },
    };
}
function computeDailyTrends(events) {
    const forgeRuns = events.filter((e) => e.event_type === 'forge_run');
    const byDate = {};
    for (const run of forgeRuns) {
        const date = run.timestamp.split('T')[0];
        if (!byDate[date])
            byDate[date] = { passes: 0, failures: 0 };
        if (run.status === 'pass' || run.status === 'warn') {
            byDate[date].passes++;
        }
        else {
            byDate[date].failures++;
        }
    }
    return Object.entries(byDate)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, counts]) => ({ date, ...counts }));
}
function computeGateBreakdown(events) {
    const gateEvents = events.filter((e) => e.event_type === 'gate_execution');
    const byTier = {};
    for (const evt of gateEvents) {
        const tier = evt.details.tier || 'unknown';
        if (!byTier[tier])
            byTier[tier] = { total: 0, passes: 0, failures: 0 };
        byTier[tier].total++;
        if (evt.status === 'pass')
            byTier[tier].passes++;
        else
            byTier[tier].failures++;
    }
    return Object.entries(byTier)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([tier, data]) => ({
        tier,
        total: data.total,
        passes: data.passes,
        failures: data.failures,
        passRate: data.total > 0 ? data.passes / data.total : 0,
    }));
}
// ── HTML Generation ────────────────────────────────────────────
/**
 * Generate a self-contained HTML report from telemetry events and optional baseline.
 * All CSS is inlined, Chart.js is loaded from CDN. All data values are HTML-escaped.
 *
 * @param events - Array of telemetry events to report on
 * @param baseline - Optional baseline snapshot for comparison section
 * @returns Complete HTML string
 */
export function generateHtmlReport(events, baseline) {
    const stats = computeStats(events);
    const trends = computeDailyTrends(events);
    const gates = computeGateBreakdown(events);
    const generatedAt = new Date().toISOString();
    const trendLabels = JSON.stringify(trends.map((t) => t.date));
    const trendPasses = JSON.stringify(trends.map((t) => t.passes));
    const trendFailures = JSON.stringify(trends.map((t) => t.failures));
    const avgDurationSec = Math.round(stats.avgDurationMs / 1000);
    const passRatePct = (stats.passRate * 100).toFixed(1);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SkillFoundry Quality Report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"><\/script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
    background: #0d1117;
    color: #c9d1d9;
    line-height: 1.6;
    padding: 2rem;
  }
  .container { max-width: 1200px; margin: 0 auto; }
  h1 { color: #58a6ff; font-size: 1.8rem; margin-bottom: 0.5rem; }
  h2 { color: #58a6ff; font-size: 1.3rem; margin: 2rem 0 1rem; border-bottom: 1px solid #21262d; padding-bottom: 0.5rem; }
  .subtitle { color: #8b949e; font-size: 0.9rem; margin-bottom: 2rem; }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }
  .stat-card {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 8px;
    padding: 1.2rem;
  }
  .stat-card .label { color: #8b949e; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat-card .value { color: #f0f6fc; font-size: 1.8rem; font-weight: 700; margin-top: 0.3rem; }
  .stat-card .detail { color: #8b949e; font-size: 0.8rem; margin-top: 0.3rem; }
  .chart-container { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 1.5rem; margin-bottom: 2rem; }
  table { width: 100%; border-collapse: collapse; background: #161b22; border-radius: 8px; overflow: hidden; }
  th { background: #21262d; color: #f0f6fc; text-align: left; padding: 0.75rem 1rem; font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 0.75rem 1rem; border-bottom: 1px solid #21262d; font-size: 0.9rem; }
  tr:last-child td { border-bottom: none; }
  .pass { color: #3fb950; }
  .fail { color: #f85149; }
  .warn { color: #d29922; }
  .na { color: #8b949e; }
  .baseline-section { margin-top: 2rem; }
  .baseline-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
  }
  .baseline-card {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 8px;
    padding: 1rem;
  }
  .baseline-card .metric-name { color: #8b949e; font-size: 0.8rem; }
  .baseline-card .metric-value { color: #f0f6fc; font-size: 1.4rem; font-weight: 700; margin-top: 0.2rem; }
  footer {
    margin-top: 3rem;
    padding-top: 1rem;
    border-top: 1px solid #21262d;
    color: #484f58;
    font-size: 0.8rem;
    text-align: center;
  }
  .empty-state {
    text-align: center;
    padding: 3rem;
    color: #8b949e;
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 8px;
  }
</style>
</head>
<body>
<div class="container">
  <h1>SkillFoundry Quality Report</h1>
  <p class="subtitle">Generated: ${safeValue(generatedAt)}</p>

${stats.totalRuns === 0 ? `
  <div class="empty-state">
    <p>No telemetry data available.</p>
    <p>Run /forge to start collecting quality metrics.</p>
  </div>
` : `
  <h2>Summary</h2>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="label">Total Runs</div>
      <div class="value">${safeValue(stats.totalRuns)}</div>
      <div class="detail">${safeValue(stats.passCount)} passed, ${safeValue(stats.failCount + stats.errorCount)} failed</div>
    </div>
    <div class="stat-card">
      <div class="label">Pass Rate</div>
      <div class="value ${stats.passRate >= 0.8 ? 'pass' : stats.passRate >= 0.5 ? 'warn' : 'fail'}">${safeValue(passRatePct)}%</div>
      <div class="detail">${safeValue(stats.warnCount)} warnings</div>
    </div>
    <div class="stat-card">
      <div class="label">Avg Duration</div>
      <div class="value">${safeValue(avgDurationSec)}s</div>
      <div class="detail">per forge run</div>
    </div>
    <div class="stat-card">
      <div class="label">Date Range</div>
      <div class="value" style="font-size:1rem;">${safeValue(stats.dateRange.from.split('T')[0])}</div>
      <div class="detail">to ${safeValue(stats.dateRange.to.split('T')[0])}</div>
    </div>
  </div>

  ${trends.length > 1 ? `
  <h2>Pass/Fail Trend</h2>
  <div class="chart-container">
    <canvas id="trendChart" height="80"></canvas>
  </div>
  ` : ''}

  ${gates.length > 0 ? `
  <h2>Gate Breakdown</h2>
  <table>
    <thead>
      <tr><th>Gate Tier</th><th>Total</th><th>Passed</th><th>Failed</th><th>Pass Rate</th></tr>
    </thead>
    <tbody>
      ${gates.map((g) => `
      <tr>
        <td>${safeValue(g.tier)}</td>
        <td>${safeValue(g.total)}</td>
        <td class="pass">${safeValue(g.passes)}</td>
        <td class="fail">${safeValue(g.failures)}</td>
        <td class="${g.passRate >= 0.8 ? 'pass' : g.passRate >= 0.5 ? 'warn' : 'fail'}">${safeValue((g.passRate * 100).toFixed(1))}%</td>
      </tr>`).join('')}
    </tbody>
  </table>
  ` : ''}
`}

${baseline ? `
  <h2>Code Quality Baseline</h2>
  <div class="baseline-grid">
    <div class="baseline-card">
      <div class="metric-name">Source Files</div>
      <div class="metric-value">${safeValue(baseline.file_count)}</div>
    </div>
    <div class="baseline-card">
      <div class="metric-name">Lines of Code</div>
      <div class="metric-value">${safeValue(baseline.loc.toLocaleString())}</div>
    </div>
    <div class="baseline-card">
      <div class="metric-name">Test Files</div>
      <div class="metric-value">${safeValue(baseline.test_file_count)}</div>
    </div>
    <div class="baseline-card">
      <div class="metric-name">Primary Language</div>
      <div class="metric-value" style="font-size:1.1rem;">${safeValue(baseline.primary_language)}</div>
    </div>
    <div class="baseline-card">
      <div class="metric-name">Lint Errors</div>
      <div class="metric-value ${baseline.lint_error_count === -1 ? 'na' : baseline.lint_error_count === 0 ? 'pass' : 'fail'}">${baseline.lint_error_count === -1 ? 'N/A' : safeValue(baseline.lint_error_count)}</div>
    </div>
    <div class="baseline-card">
      <div class="metric-name">Type Errors</div>
      <div class="metric-value ${baseline.type_error_count === -1 ? 'na' : baseline.type_error_count === 0 ? 'pass' : 'fail'}">${baseline.type_error_count === -1 ? 'N/A' : safeValue(baseline.type_error_count)}</div>
    </div>
  </div>
  <table style="margin-top: 1rem;">
    <thead>
      <tr><th>Language</th><th>File Count</th></tr>
    </thead>
    <tbody>
      ${Object.entries(baseline.language_breakdown)
        .sort((a, b) => b[1] - a[1])
        .map(([lang, count]) => `
      <tr>
        <td>${safeValue(lang)}</td>
        <td>${safeValue(count)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
` : ''}

  <footer>
    Generated by SkillFoundry Quality Intelligence at ${safeValue(generatedAt)}${stats.totalRuns > 0 ? ` | Data range: ${safeValue(stats.dateRange.from.split('T')[0])} to ${safeValue(stats.dateRange.to.split('T')[0])}` : ''}
  </footer>
</div>

${trends.length > 1 ? `
<script>
document.addEventListener('DOMContentLoaded', function() {
  var ctx = document.getElementById('trendChart');
  if (ctx && typeof Chart !== 'undefined') {
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ${trendLabels},
        datasets: [
          {
            label: 'Passes',
            data: ${trendPasses},
            backgroundColor: 'rgba(63, 185, 80, 0.8)',
            borderColor: 'rgba(63, 185, 80, 1)',
            borderWidth: 1,
          },
          {
            label: 'Failures',
            data: ${trendFailures},
            backgroundColor: 'rgba(248, 81, 73, 0.8)',
            borderColor: 'rgba(248, 81, 73, 1)',
            borderWidth: 1,
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          x: {
            stacked: true,
            grid: { color: 'rgba(110, 118, 129, 0.2)' },
            ticks: { color: '#8b949e' }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: 'rgba(110, 118, 129, 0.2)' },
            ticks: { color: '#8b949e', stepSize: 1 }
          }
        },
        plugins: {
          legend: { labels: { color: '#c9d1d9' } }
        }
      }
    });
  }
});
<\/script>
` : ''}
</body>
</html>`;
}
//# sourceMappingURL=report-html.js.map