import type { SlashCommand, SessionContext } from '../types.js';
import { generateReport, formatReportMarkdown, formatReportJson } from '../core/report-generator.js';
import { readEvents } from '../core/telemetry.js';
import { generateHtmlReport } from '../core/report-html.js';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { BaselineSnapshot } from '../core/baseline-collector.js';

/**
 * Load the most recent baseline snapshot from telemetry events.
 *
 * @param workDir - Project root directory
 * @returns Most recent BaselineSnapshot or undefined
 */
function loadLatestBaseline(workDir: string): BaselineSnapshot | undefined {
  const { events } = readEvents(workDir);

  // Find the most recent benchmark_run event that has baseline_snapshot flag
  const baselineEvents = events
    .filter((e) => e.event_type === 'benchmark_run' && (e.details as Record<string, unknown>).baseline_snapshot === true)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (baselineEvents.length === 0) return undefined;

  const latest = baselineEvents[0];
  const d = latest.details as Record<string, unknown>;

  return {
    timestamp: latest.timestamp,
    work_dir: String(d.work_dir ?? workDir),
    test_file_count: Number(d.test_file_count ?? 0),
    lint_error_count: Number(d.lint_error_count ?? -1),
    type_error_count: Number(d.type_error_count ?? -1),
    loc: Number(d.loc ?? 0),
    file_count: Number(d.file_count ?? 0),
    primary_language: String(d.primary_language ?? 'Unknown'),
    language_breakdown: (d.language_breakdown as Record<string, number>) ?? {},
  };
}

export const reportCommand: SlashCommand = {
  name: 'report',
  description: 'Generate quality report from telemetry data',
  usage: '/report [--format md|json] [--html] [--window N] [--output path] [--baseline]',
  execute: async (args: string, session: SessionContext): Promise<string> => {
    const parts = args.trim().split(/\s+/);

    let format = 'md';
    let window = 10;
    let outputPath: string | null = null;
    let htmlOutput = false;

    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === '--format' && parts[i + 1]) {
        format = parts[i + 1].toLowerCase();
        i++;
      } else if (parts[i] === '--window' && parts[i + 1]) {
        window = parseInt(parts[i + 1], 10) || 10;
        i++;
      } else if (parts[i] === '--output' && parts[i + 1]) {
        outputPath = parts[i + 1];
        i++;
      } else if (parts[i] === '--html') {
        htmlOutput = true;
      }
    }

    // Handle --html: generate self-contained HTML report
    if (htmlOutput) {
      const { events } = readEvents(session.workDir);
      const baseline = loadLatestBaseline(session.workDir);
      const html = generateHtmlReport(events, baseline);
      const htmlPath = join(session.workDir, '.skillfoundry', 'report.html');

      // Ensure .skillfoundry directory exists
      const sfDir = join(session.workDir, '.skillfoundry');
      if (!existsSync(sfDir)) {
        const { mkdirSync } = require('node:fs');
        mkdirSync(sfDir, { recursive: true });
      }

      writeFileSync(htmlPath, html);
      return `HTML report written to ${htmlPath}`;
    }

    const report = generateReport(session.workDir, window);

    if (report.summary.total_runs === 0) {
      return [
        '**Quality Report**',
        '',
        '  No telemetry data available. Run /forge to start collecting metrics.',
        '  After 5+ forge runs, trend analysis and industry comparison become available.',
      ].join('\n');
    }

    const formatted = format === 'json'
      ? formatReportJson(report)
      : formatReportMarkdown(report);

    if (outputPath) {
      const fullPath = resolve(session.workDir, outputPath);
      if (!fullPath.startsWith(resolve(session.workDir))) {
        return 'Error: output path must be within the project directory.';
      }
      writeFileSync(fullPath, formatted);
      return `Report written to ${fullPath} (${format.toUpperCase()}, ${report.summary.total_runs} runs)`;
    }

    return formatted;
  },
};
