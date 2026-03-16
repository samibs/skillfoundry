import type { SlashCommand, SessionContext } from '../types.js';
import { generateReport, formatReportMarkdown, formatReportJson } from '../core/report-generator.js';
import { readEvents } from '../core/telemetry.js';
import { generateHtmlReport } from '../core/report-html.js';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { BaselineSnapshot } from '../core/baseline-collector.js';
import {
  UnifiedSecurityReportGenerator,
  getDefaultReportPaths,
} from '../core/unified-security-report.js';
import { runSecurityScan } from '../core/semgrep-scanner.js';
import { GitleaksScanner } from '../core/gitleaks-scanner.js';
import { CheckovScanner } from '../core/checkov-scanner.js';
import { LicenseChecker } from '../core/license-checker.js';
import { runDependencyScan } from '../core/dependency-scanner.js';

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

// ---------------------------------------------------------------------------
// Security report sub-handler
// ---------------------------------------------------------------------------

/**
 * Handle `sf report security` — run all scanners and produce a unified report.
 *
 * Flags:
 *   --format json|html|both   Output format (default: both)
 *   --output <dir>            Output directory (default: .sf/reports/security/)
 *   --scan                    Force re-run of all scanners (default: true when no cache)
 *
 * @param args - Parsed argument array (sliced past 'security').
 * @param session - Current session context.
 * @returns Human-readable result message with output file paths.
 */
async function handleSecurityReport(args: string[], session: SessionContext): Promise<string> {
  let format = 'both';
  let outputDir: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--format' && args[i + 1]) {
      format = args[i + 1].toLowerCase();
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputDir = args[i + 1];
      i++;
    }
  }

  const validFormats = new Set(['json', 'html', 'both']);
  if (!validFormats.has(format)) {
    return `Error: --format must be one of: json, html, both. Got: "${format}"`;
  }

  const workDir = session.workDir;
  const lines: string[] = ['Running security scan across all scanners...', ''];

  // ── Run all scanners (each isolated — failures don't block others) ──────────

  let semgrepResult: ReturnType<typeof runSecurityScan> | undefined;
  try {
    lines.push('  [1/5] Semgrep (OWASP SAST)...');
    semgrepResult = runSecurityScan(workDir, 60_000);
    lines.push(`         ${semgrepResult.findings.length} findings (${semgrepResult.verdict})`);
  } catch (err: unknown) {
    lines.push(`         Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  let gitleaksResult: Awaited<ReturnType<InstanceType<typeof GitleaksScanner>['scan']>> | undefined;
  try {
    lines.push('  [2/5] Gitleaks (secrets)...');
    const gitleaksScanner = new GitleaksScanner(workDir);
    gitleaksResult = await gitleaksScanner.scan();
    const status = gitleaksResult.skipped ? 'skipped' : `${gitleaksResult.findingCount} findings`;
    lines.push(`         ${status}`);
  } catch (err: unknown) {
    lines.push(`         Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  let checkovResult: Awaited<ReturnType<InstanceType<typeof CheckovScanner>['scan']>> | undefined;
  try {
    lines.push('  [3/5] Checkov (IaC)...');
    const checkovScanner = new CheckovScanner(workDir);
    checkovResult = await checkovScanner.scan();
    const status = checkovResult.skipped ? 'skipped' : `${checkovResult.findingCount} findings`;
    lines.push(`         ${status}`);
  } catch (err: unknown) {
    lines.push(`         Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  let dependenciesResult: ReturnType<typeof runDependencyScan> | undefined;
  try {
    lines.push('  [4/5] Dependency scanner (CVE)...');
    dependenciesResult = runDependencyScan(workDir);
    lines.push(`         ${dependenciesResult.total_vulnerable} vulnerable packages (${dependenciesResult.verdict})`);
  } catch (err: unknown) {
    lines.push(`         Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  let licensesResult: Awaited<ReturnType<InstanceType<typeof LicenseChecker>['check']>> | undefined;
  try {
    lines.push('  [5/5] License checker...');
    const licenseChecker = new LicenseChecker(workDir);
    licensesResult = await licenseChecker.check();
    lines.push(`         ${licensesResult.findingCount} compliance issues`);
  } catch (err: unknown) {
    lines.push(`         Failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  lines.push('');

  // ── Assemble unified report ─────────────────────────────────────────────────
  const generator = new UnifiedSecurityReportGenerator(workDir);
  const report = generator.generate({
    semgrep: semgrepResult,
    gitleaks: gitleaksResult,
    checkov: checkovResult,
    dependencies: dependenciesResult,
    licenses: licensesResult,
  });

  // ── Determine output paths ──────────────────────────────────────────────────
  const { dir, jsonPath, htmlPath } = outputDir
    ? {
        dir: resolve(workDir, outputDir),
        jsonPath: resolve(workDir, outputDir, `security-report-${Date.now()}.json`),
        htmlPath: resolve(workDir, outputDir, `security-report-${Date.now()}.html`),
      }
    : getDefaultReportPaths(workDir);

  // Validate output path is within the project
  const resolvedDir = resolve(workDir, dir);
  if (!resolvedDir.startsWith(resolve(workDir))) {
    return 'Error: output path must be within the project directory.';
  }

  if (!existsSync(resolvedDir)) {
    mkdirSync(resolvedDir, { recursive: true });
  }

  // ── Write outputs ───────────────────────────────────────────────────────────
  const writtenPaths: string[] = [];

  if (format === 'json' || format === 'both') {
    generator.writeJson(report, jsonPath);
    writtenPaths.push(jsonPath);
  }

  if (format === 'html' || format === 'both') {
    generator.writeHtml(report, htmlPath);
    writtenPaths.push(htmlPath);
  }

  // ── Summary output ──────────────────────────────────────────────────────────
  lines.push(`Verdict: ${report.verdict}`);
  lines.push(`Total findings: ${report.summary.totalFindings} (critical: ${report.summary.critical}, high: ${report.summary.high}, medium: ${report.summary.medium}, low: ${report.summary.low})`);
  lines.push(`Scanners run: ${report.summary.scannersRun} / 5`);
  lines.push('');
  lines.push('Output:');
  for (const p of writtenPaths) {
    lines.push(`  ${p}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main report command
// ---------------------------------------------------------------------------

export const reportCommand: SlashCommand = {
  name: 'report',
  description: 'Generate quality report from telemetry data. Use "security" subcommand for unified security report.',
  usage: '/report [security [--format json|html|both] [--output <dir>]] [--format md|json] [--html] [--window N] [--output path]',
  execute: async (args: string, session: SessionContext): Promise<string> => {
    const parts = args.trim().split(/\s+/);

    // Subcommand: security report
    if (parts[0] === 'security') {
      return handleSecurityReport(parts.slice(1), session);
    }

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
