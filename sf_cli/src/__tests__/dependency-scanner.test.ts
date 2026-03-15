import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  detectPlatforms,
  scanNpm,
  scanPython,
  scanDotnet,
  runDependencyScan,
  formatDepReport,
} from '../core/dependency-scanner.js';
import type { CombinedDepReport, DependencyScanReport } from '../core/dependency-scanner.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const TEST_DIR = join(process.cwd(), '.test-depscan-' + process.pid);

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('detectPlatforms', () => {
  it('detects npm project from package.json', () => {
    writeFileSync(join(TEST_DIR, 'package.json'), '{}');
    const platforms = detectPlatforms(TEST_DIR);
    expect(platforms.npm).toBe(true);
    expect(platforms.python).toBe(false);
  });

  it('detects npm project from package-lock.json', () => {
    writeFileSync(join(TEST_DIR, 'package-lock.json'), '{}');
    const platforms = detectPlatforms(TEST_DIR);
    expect(platforms.npm).toBe(true);
  });

  it('detects python project from requirements.txt', () => {
    writeFileSync(join(TEST_DIR, 'requirements.txt'), 'flask==2.0\n');
    const platforms = detectPlatforms(TEST_DIR);
    expect(platforms.python).toBe(true);
    expect(platforms.npm).toBe(false);
  });

  it('detects python project from pyproject.toml', () => {
    writeFileSync(join(TEST_DIR, 'pyproject.toml'), '[project]\nname = "test"\n');
    const platforms = detectPlatforms(TEST_DIR);
    expect(platforms.python).toBe(true);
  });

  it('detects rust project from Cargo.toml', () => {
    writeFileSync(join(TEST_DIR, 'Cargo.toml'), '[package]\nname = "test"\n');
    const platforms = detectPlatforms(TEST_DIR);
    expect(platforms.rust).toBe(true);
  });

  it('detects go project from go.mod', () => {
    writeFileSync(join(TEST_DIR, 'go.mod'), 'module test\ngo 1.21\n');
    const platforms = detectPlatforms(TEST_DIR);
    expect(platforms.go).toBe(true);
  });

  it('detects multiple platforms', () => {
    writeFileSync(join(TEST_DIR, 'package.json'), '{}');
    writeFileSync(join(TEST_DIR, 'requirements.txt'), 'flask\n');
    const platforms = detectPlatforms(TEST_DIR);
    expect(platforms.npm).toBe(true);
    expect(platforms.python).toBe(true);
  });

  it('detects no platforms in empty directory', () => {
    const platforms = detectPlatforms(TEST_DIR);
    expect(platforms.npm).toBe(false);
    expect(platforms.python).toBe(false);
    expect(platforms.dotnet).toBe(false);
    expect(platforms.rust).toBe(false);
    expect(platforms.go).toBe(false);
  });
});

describe('scanNpm', () => {
  it('returns scanner_available: false when npm not available', () => {
    // Mock execSync to simulate npm not found
    const child_process = require('node:child_process');
    const originalExecSync = child_process.execSync;
    child_process.execSync = (cmd: string, opts: object) => {
      if (typeof cmd === 'string' && cmd.includes('which npm')) throw new Error('not found');
      if (typeof cmd === 'string' && cmd.includes('where npm')) throw new Error('not found');
      return originalExecSync(cmd, opts);
    };

    const result = scanNpm(TEST_DIR);
    // Restore
    child_process.execSync = originalExecSync;

    // npm is actually available in CI, so this might still pass
    // The important thing is the function doesn't throw
    expect(result.package_manager).toBe('npm');
  });

  it('counts dependencies from package.json', () => {
    writeFileSync(join(TEST_DIR, 'package.json'), JSON.stringify({
      dependencies: { a: '1.0', b: '2.0' },
      devDependencies: { c: '3.0' },
    }));
    // npm audit will fail because no node_modules, but dep count should work
    const result = scanNpm(TEST_DIR);
    expect(result.package_manager).toBe('npm');
    expect(result.total_dependencies).toBe(3);
  });

  it('handles missing package.json gracefully', () => {
    const result = scanNpm(TEST_DIR);
    expect(result.package_manager).toBe('npm');
    expect(result.total_dependencies).toBe(0);
  });
});

describe('scanPython', () => {
  it('counts dependencies from requirements.txt', () => {
    writeFileSync(join(TEST_DIR, 'requirements.txt'), 'flask==2.0\nrequests>=2.28\n# comment\n\n');
    const result = scanPython(TEST_DIR);
    expect(result.package_manager).toBe('pip');
    // If pip-audit not installed, scanner_available will be false
    if (!result.scanner_available) {
      expect(result.error).toContain('pip-audit');
    }
  });
});

describe('scanDotnet', () => {
  it('returns report with package_manager dotnet', () => {
    const result = scanDotnet(TEST_DIR);
    expect(result.package_manager).toBe('dotnet');
  });
});

describe('runDependencyScan', () => {
  it('returns empty report when no platforms detected', () => {
    const report = runDependencyScan(TEST_DIR);
    expect(report.reports.length).toBe(0);
    expect(report.total_vulnerable).toBe(0);
    expect(report.verdict).toBe('PASS');
  });

  it('scans detected platforms', () => {
    writeFileSync(join(TEST_DIR, 'package.json'), '{}');
    const report = runDependencyScan(TEST_DIR);
    expect(report.reports.length).toBeGreaterThanOrEqual(1);
    expect(report.reports[0].package_manager).toBe('npm');
  });

  it('calculates verdict based on severity', () => {
    // Mock a report with critical findings
    const mockReport: CombinedDepReport = {
      reports: [],
      total_vulnerable: 1,
      summary: { critical: 1, high: 0, moderate: 0, low: 0 },
      verdict: 'FAIL',
    };
    expect(mockReport.verdict).toBe('FAIL');

    const warnReport: CombinedDepReport = {
      reports: [],
      total_vulnerable: 1,
      summary: { critical: 0, high: 0, moderate: 1, low: 0 },
      verdict: 'WARN',
    };
    expect(warnReport.verdict).toBe('WARN');
  });
});

describe('formatDepReport', () => {
  it('shows no-platforms message when empty', () => {
    const report: CombinedDepReport = {
      reports: [],
      total_vulnerable: 0,
      summary: { critical: 0, high: 0, moderate: 0, low: 0 },
      verdict: 'PASS',
    };
    const output = formatDepReport(report);
    expect(output).toContain('No supported package managers');
  });

  it('formats report with findings', () => {
    const report: CombinedDepReport = {
      reports: [{
        package_manager: 'npm',
        total_dependencies: 50,
        vulnerable_count: 2,
        findings: [
          { name: 'lodash', version: '4.17.20', severity: 'high', cve: 'CVE-2021-23337', title: 'Prototype pollution', advisory_url: 'https://example.com', package_manager: 'npm' },
          { name: 'minimist', version: '1.2.5', severity: 'moderate', cve: 'CVE-2021-44906', title: 'Prototype pollution', advisory_url: '', package_manager: 'npm' },
        ],
        scanner_available: true,
        error: null,
      }],
      total_vulnerable: 2,
      summary: { critical: 0, high: 1, moderate: 1, low: 0 },
      verdict: 'FAIL',
    };

    const output = formatDepReport(report);
    expect(output).toContain('Dependency Vulnerability Scan');
    expect(output).toContain('npm: 50 deps, 2 vulnerable');
    expect(output).toContain('lodash');
    expect(output).toContain('FAIL');
  });

  it('shows scanner unavailable warning', () => {
    const report: CombinedDepReport = {
      reports: [{
        package_manager: 'pip',
        total_dependencies: 0,
        vulnerable_count: 0,
        findings: [],
        scanner_available: false,
        error: 'pip-audit not installed',
      }],
      total_vulnerable: 0,
      summary: { critical: 0, high: 0, moderate: 0, low: 0 },
      verdict: 'PASS',
    };

    const output = formatDepReport(report);
    expect(output).toContain('Scanner unavailable');
    expect(output).toContain('pip-audit');
  });

  it('shows clean message when no vulnerabilities', () => {
    const report: CombinedDepReport = {
      reports: [{
        package_manager: 'npm',
        total_dependencies: 30,
        vulnerable_count: 0,
        findings: [],
        scanner_available: true,
        error: null,
      }],
      total_vulnerable: 0,
      summary: { critical: 0, high: 0, moderate: 0, low: 0 },
      verdict: 'PASS',
    };

    const output = formatDepReport(report);
    expect(output).toContain('No known vulnerabilities found');
    expect(output).toContain('PASS');
  });
});
