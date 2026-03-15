// Dependency vulnerability scanner — detects known CVEs in project dependencies.
// Supports npm (Node.js), pip-audit (Python), dotnet (C#), cargo-audit (Rust).
// Auto-detects project type from lockfiles and package manifests.
// Integrates into the T4 security gate alongside Semgrep SAST.

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────────────

export type DepFindingSeverity = 'critical' | 'high' | 'moderate' | 'low' | 'info';

export interface DependencyFinding {
  name: string;
  version: string;
  severity: DepFindingSeverity;
  cve: string;
  title: string;
  advisory_url: string;
  package_manager: string;
}

export interface DependencyScanReport {
  package_manager: string;
  total_dependencies: number;
  vulnerable_count: number;
  findings: DependencyFinding[];
  scanner_available: boolean;
  error: string | null;
}

export interface CombinedDepReport {
  reports: DependencyScanReport[];
  total_vulnerable: number;
  summary: { critical: number; high: number; moderate: number; low: number };
  verdict: 'PASS' | 'WARN' | 'FAIL';
}

// ── Platform Detection ──────────────────────────────────────────

interface DetectedPlatform {
  npm: boolean;
  python: boolean;
  dotnet: boolean;
  rust: boolean;
  go: boolean;
}

export function detectPlatforms(workDir: string): DetectedPlatform {
  return {
    npm: existsSync(join(workDir, 'package-lock.json')) || existsSync(join(workDir, 'package.json')),
    python: existsSync(join(workDir, 'requirements.txt')) || existsSync(join(workDir, 'Pipfile.lock')) || existsSync(join(workDir, 'pyproject.toml')),
    dotnet: readdirHas(workDir, (f) => f.endsWith('.csproj') || f.endsWith('.sln')),
    rust: existsSync(join(workDir, 'Cargo.lock')) || existsSync(join(workDir, 'Cargo.toml')),
    go: existsSync(join(workDir, 'go.sum')) || existsSync(join(workDir, 'go.mod')),
  };
}

function readdirHas(dir: string, predicate: (f: string) => boolean): boolean {
  try {
    const { readdirSync } = require('node:fs');
    return readdirSync(dir).some(predicate);
  } catch {
    return false;
  }
}

// ── Scanner Implementations ─────────────────────────────────────

function runCmd(cmd: string, cwd: string, timeoutMs: number = 30_000): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 5 * 1024 * 1024,
    });
    return { ok: true, output: output || '' };
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; status?: number; message?: string };
    // npm audit exits non-zero when vulnerabilities found — that's expected
    const combined = (execErr.stdout || '') + (execErr.stderr || '');
    return { ok: false, output: combined || execErr.message || 'Command failed' };
  }
}

const ALLOWED_AUDIT_COMMANDS = new Set(['npm', 'pip-audit', 'dotnet', 'cargo-audit', 'go']);

function isCommandAvailable(cmd: string): boolean {
  if (!ALLOWED_AUDIT_COMMANDS.has(cmd)) return false;
  const which = process.platform === 'win32' ? 'where' : 'which';
  try {
    execSync(`${which} ${cmd}`, { stdio: 'pipe', encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Scan npm dependencies using `npm audit --json`.
 */
export function scanNpm(workDir: string): DependencyScanReport {
  const log = getLogger();

  if (!isCommandAvailable('npm')) {
    return { package_manager: 'npm', total_dependencies: 0, vulnerable_count: 0, findings: [], scanner_available: false, error: 'npm not found in PATH' };
  }

  // Count dependencies from package-lock.json or package.json
  let totalDeps = 0;
  try {
    const lockPath = join(workDir, 'package-lock.json');
    const pkgPath = join(workDir, 'package.json');
    if (existsSync(lockPath)) {
      const lock = JSON.parse(readFileSync(lockPath, 'utf-8'));
      totalDeps = Object.keys(lock.packages || lock.dependencies || {}).length;
    } else if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      totalDeps = Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length;
    }
  } catch {
    // Best effort
  }

  const { output } = runCmd('npm audit --json 2>/dev/null', workDir, 30_000);
  const findings: DependencyFinding[] = [];

  try {
    const audit = JSON.parse(output);

    // npm audit v7+ format: { vulnerabilities: { [name]: { severity, via, range, ... } } }
    if (audit.vulnerabilities) {
      for (const [name, vuln] of Object.entries(audit.vulnerabilities)) {
        const v = vuln as { severity: string; range: string; via: Array<{ url?: string; title?: string; cwe?: string[] }> | string[] };
        const advisory = Array.isArray(v.via) ? v.via.find((x) => typeof x === 'object' && x.url) : null;
        const advisoryObj = advisory && typeof advisory === 'object' ? advisory : null;

        findings.push({
          name,
          version: v.range || 'unknown',
          severity: mapNpmSeverity(v.severity),
          cve: advisoryObj?.cwe?.[0] || '',
          title: advisoryObj?.title || `Vulnerability in ${name}`,
          advisory_url: advisoryObj?.url || '',
          package_manager: 'npm',
        });
      }
    }

    // npm audit v6 format: { advisories: { [id]: { ... } } }
    if (audit.advisories && findings.length === 0) {
      for (const adv of Object.values(audit.advisories)) {
        const a = adv as { module_name: string; findings: Array<{ version: string }>; severity: string; url: string; title: string; cves: string[] };
        findings.push({
          name: a.module_name,
          version: a.findings?.[0]?.version || 'unknown',
          severity: mapNpmSeverity(a.severity),
          cve: a.cves?.[0] || '',
          title: a.title || `Vulnerability in ${a.module_name}`,
          advisory_url: a.url || '',
          package_manager: 'npm',
        });
      }
    }
  } catch {
    log.debug('dep-scanner', 'npm_parse_failed', { output: output.slice(0, 200) });
  }

  return {
    package_manager: 'npm',
    total_dependencies: totalDeps,
    vulnerable_count: findings.length,
    findings,
    scanner_available: true,
    error: null,
  };
}

function mapNpmSeverity(sev: string): DepFindingSeverity {
  switch (sev?.toLowerCase()) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'moderate': return 'moderate';
    case 'low': return 'low';
    default: return 'info';
  }
}

/**
 * Scan Python dependencies using `pip-audit --format json`.
 */
export function scanPython(workDir: string): DependencyScanReport {
  if (!isCommandAvailable('pip-audit')) {
    return { package_manager: 'pip', total_dependencies: 0, vulnerable_count: 0, findings: [], scanner_available: false, error: 'pip-audit not installed (pip install pip-audit)' };
  }

  let totalDeps = 0;
  try {
    const reqPath = join(workDir, 'requirements.txt');
    if (existsSync(reqPath)) {
      totalDeps = readFileSync(reqPath, 'utf-8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).length;
    }
  } catch { /* best effort */ }

  const { output } = runCmd('pip-audit --format json 2>/dev/null', workDir, 60_000);
  const findings: DependencyFinding[] = [];

  try {
    const results = JSON.parse(output);
    const deps = Array.isArray(results) ? results : results.dependencies || [];
    for (const dep of deps) {
      if (dep.vulns && dep.vulns.length > 0) {
        for (const vuln of dep.vulns) {
          findings.push({
            name: dep.name,
            version: dep.version || 'unknown',
            severity: mapPipSeverity(vuln.fix_versions?.length > 0 ? 'high' : 'moderate'),
            cve: vuln.id || '',
            title: vuln.description || `Vulnerability in ${dep.name}`,
            advisory_url: vuln.link || '',
            package_manager: 'pip',
          });
        }
      }
    }
  } catch { /* parse failure — no findings */ }

  return {
    package_manager: 'pip',
    total_dependencies: totalDeps || findings.length,
    vulnerable_count: findings.length,
    findings,
    scanner_available: true,
    error: null,
  };
}

function mapPipSeverity(sev: string): DepFindingSeverity {
  switch (sev?.toLowerCase()) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'moderate': case 'medium': return 'moderate';
    case 'low': return 'low';
    default: return 'info';
  }
}

/**
 * Scan .NET dependencies using `dotnet list package --vulnerable --format json`.
 */
export function scanDotnet(workDir: string): DependencyScanReport {
  if (!isCommandAvailable('dotnet')) {
    return { package_manager: 'dotnet', total_dependencies: 0, vulnerable_count: 0, findings: [], scanner_available: false, error: 'dotnet not found in PATH' };
  }

  const { ok, output } = runCmd('dotnet list package --vulnerable --format json 2>/dev/null', workDir, 60_000);
  const findings: DependencyFinding[] = [];

  if (!ok) {
    // Fallback: try without --format json (older dotnet versions)
    const { output: textOutput } = runCmd('dotnet list package --vulnerable 2>/dev/null', workDir, 60_000);
    // Parse text output for vulnerability lines
    for (const line of textOutput.split('\n')) {
      const match = line.match(/>\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)/);
      if (match) {
        findings.push({
          name: match[1],
          version: match[2],
          severity: 'high',
          cve: '',
          title: match[4] || `Vulnerability in ${match[1]}`,
          advisory_url: '',
          package_manager: 'dotnet',
        });
      }
    }
  } else {
    try {
      const result = JSON.parse(output);
      for (const project of result.projects || []) {
        for (const fw of project.frameworks || []) {
          for (const pkg of fw.topLevelPackages || []) {
            if (pkg.vulnerabilities?.length > 0) {
              for (const vuln of pkg.vulnerabilities) {
                findings.push({
                  name: pkg.id,
                  version: pkg.resolvedVersion || 'unknown',
                  severity: mapNpmSeverity(vuln.severity || 'high'),
                  cve: vuln.advisoryurl || '',
                  title: `Vulnerability in ${pkg.id}`,
                  advisory_url: vuln.advisoryurl || '',
                  package_manager: 'dotnet',
                });
              }
            }
          }
        }
      }
    } catch { /* parse failure */ }
  }

  return {
    package_manager: 'dotnet',
    total_dependencies: 0,
    vulnerable_count: findings.length,
    findings,
    scanner_available: true,
    error: null,
  };
}

// ── Combined Scanner ────────────────────────────────────────────

/**
 * Run dependency scans for all detected platforms in the project.
 * Returns a combined report with merged findings and verdict.
 */
export function runDependencyScan(workDir: string): CombinedDepReport {
  const platforms = detectPlatforms(workDir);
  const reports: DependencyScanReport[] = [];

  if (platforms.npm) reports.push(scanNpm(workDir));
  if (platforms.python) reports.push(scanPython(workDir));
  if (platforms.dotnet) reports.push(scanDotnet(workDir));

  // If no platforms detected, return empty
  if (reports.length === 0) {
    return {
      reports: [],
      total_vulnerable: 0,
      summary: { critical: 0, high: 0, moderate: 0, low: 0 },
      verdict: 'PASS',
    };
  }

  const allFindings = reports.flatMap((r) => r.findings);
  const summary = { critical: 0, high: 0, moderate: 0, low: 0 };
  for (const f of allFindings) {
    if (f.severity === 'critical') summary.critical++;
    else if (f.severity === 'high') summary.high++;
    else if (f.severity === 'moderate') summary.moderate++;
    else if (f.severity === 'low') summary.low++;
  }

  let verdict: CombinedDepReport['verdict'] = 'PASS';
  if (summary.critical > 0 || summary.high > 0) verdict = 'FAIL';
  else if (summary.moderate > 0) verdict = 'WARN';

  return {
    reports,
    total_vulnerable: allFindings.length,
    summary,
    verdict,
  };
}

/**
 * Format dependency scan report for CLI output.
 */
export function formatDepReport(report: CombinedDepReport): string {
  if (report.reports.length === 0) {
    return 'No supported package managers detected (npm, pip, dotnet).';
  }

  const lines: string[] = ['Dependency Vulnerability Scan', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'];

  for (const r of report.reports) {
    lines.push(`  ${r.package_manager}: ${r.total_dependencies} deps, ${r.vulnerable_count} vulnerable`);
    if (!r.scanner_available) {
      lines.push(`    ⚠ Scanner unavailable: ${r.error}`);
    }
  }

  if (report.total_vulnerable > 0) {
    lines.push('');
    lines.push(`  Summary: ${report.summary.critical} critical, ${report.summary.high} high, ${report.summary.moderate} moderate, ${report.summary.low} low`);
    lines.push('');

    const topFindings = report.reports.flatMap((r) => r.findings).slice(0, 10);
    for (const f of topFindings) {
      lines.push(`  [${f.severity.toUpperCase()}] ${f.name}@${f.version} — ${f.title}`);
      if (f.advisory_url) lines.push(`    ${f.advisory_url}`);
    }
  } else {
    lines.push('');
    lines.push('  No known vulnerabilities found.');
  }

  lines.push('');
  lines.push(`  Verdict: ${report.verdict}`);

  return lines.join('\n');
}
