// Tests for UnifiedSecurityReportGenerator (STORY-011)
// Covers: finding normalisation, severity mapping, summary statistics,
//         skipped/failed sections, JSON schema, HTML rendering,
//         suppressed findings separation, and integration scenarios.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  UnifiedSecurityReportGenerator,
  normaliseSemgrepFindings,
  normaliseGitleaksFindings,
  normaliseCheckovFindings,
  normaliseDependencyFindings,
  normaliseLicenseFindings,
  normaliseSeverity,
  computeVerdict,
  renderSecurityReportHtml,
  getDefaultReportPaths,
  type UnifiedSecurityReport,
  type ScannerResults,
} from '../core/unified-security-report.js';

import type { SecurityReport as SemgrepReport } from '../core/semgrep-scanner.js';
import type { GitleaksScanResult } from '../core/gitleaks-scanner.js';
import type { CheckovScanResult } from '../types.js';
import type { LicenseCheckResult } from '../types.js';
import type { CombinedDepReport } from '../core/dependency-scanner.js';

// ── Mock logger (no filesystem side effects in tests) ────────────────────────

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeSemgrepReport(overrides: Partial<SemgrepReport> = {}): SemgrepReport {
  return {
    scannerVersion: 'semgrep-1.0',
    scanDurationMs: 500,
    target: '/tmp/project',
    findings: [
      {
        id: 'rule-1',
        severity: 'HIGH',
        category: 'A03:2021 Injection',
        rule: 'python.django.sql.injection',
        message: 'SQL injection detected in query builder',
        file: 'src/db.py',
        line: 42,
        column: 10,
        snippet: 'execute(f"SELECT * FROM {table}")',
        fix: 'Use parameterised queries',
        source: 'semgrep',
      },
      {
        id: 'rule-2',
        severity: 'MEDIUM',
        category: 'A07:2021 Auth Failures',
        rule: 'js.insecure-jwt',
        message: 'Insecure JWT signing',
        file: 'src/auth.js',
        line: 15,
        column: 0,
        snippet: 'jwt.sign(payload, "secret")',
        fix: null,
        source: 'semgrep',
      },
    ],
    summary: { critical: 0, high: 1, medium: 1, low: 0, info: 0 },
    owaspCoverage: ['A03:2021 Injection', 'A07:2021 Auth Failures'],
    verdict: 'FAIL',
    ...overrides,
  };
}

function makeGitleaksResult(overrides: Partial<GitleaksScanResult> = {}): GitleaksScanResult {
  return {
    scanner: 'gitleaks',
    available: true,
    success: true,
    findings: [
      {
        description: 'AWS Access Key',
        file: 'config/aws.yml',
        startLine: 10,
        endLine: 10,
        startColumn: 0,
        endColumn: 0,
        match: 'AKIA****1234',
        secret: 'AKIAIOSFODNN7EXAMPLE',
        rule: 'aws-access-key-id',
        entropy: 3.8,
        fingerprint: 'abc123',
        suppressed: false,
      },
      {
        description: 'Suppressed token',
        file: '.env.test',
        startLine: 1,
        endLine: 1,
        startColumn: 0,
        endColumn: 0,
        match: 'ghp_****abcd',
        secret: 'ghp_abcd1234',
        rule: 'github-pat',
        entropy: 4.1,
        fingerprint: 'suppressed-fp',
        suppressed: true,
      },
    ],
    findingCount: 2,
    duration: 300,
    skipped: false,
    ...overrides,
  };
}

function makeCheckovResult(overrides: Partial<CheckovScanResult> = {}): CheckovScanResult {
  return {
    scanner: 'checkov',
    available: true,
    success: true,
    findings: [
      {
        checkId: 'CKV_DOCKER_2',
        checkName: 'Ensure that HEALTHCHECK instructions have been added',
        severity: 'medium',
        file: 'Dockerfile',
        line: 1,
        framework: 'dockerfile',
        guideline: 'https://docs.bridgecrew.io/docs/ckv_docker_2',
        status: 'failed',
      },
      {
        checkId: 'CKV_AWS_18',
        checkName: 'Ensure S3 bucket has access logging enabled',
        severity: 'high',
        file: 'infra/main.tf',
        line: 30,
        framework: 'terraform',
        guideline: 'https://docs.bridgecrew.io/docs/ckv_aws_18',
        status: 'failed',
      },
    ],
    findingCount: 2,
    passedCount: 10,
    scannedFiles: 3,
    frameworks: ['dockerfile', 'terraform'],
    duration: 800,
    skipped: false,
    ...overrides,
  };
}

function makeDependencyReport(overrides: Partial<CombinedDepReport> = {}): CombinedDepReport {
  return {
    reports: [
      {
        package_manager: 'npm',
        total_dependencies: 50,
        vulnerable_count: 1,
        findings: [
          {
            name: 'lodash',
            version: '4.17.15',
            severity: 'high',
            cve: 'CVE-2021-23337',
            title: 'Prototype pollution in lodash',
            advisory_url: 'https://nvd.nist.gov/vuln/detail/CVE-2021-23337',
            package_manager: 'npm',
          },
        ],
        scanner_available: true,
        error: null,
      },
    ],
    total_vulnerable: 1,
    summary: { critical: 0, high: 1, moderate: 0, low: 0 },
    verdict: 'FAIL',
    ...overrides,
  };
}

function makeLicenseResult(overrides: Partial<LicenseCheckResult> = {}): LicenseCheckResult {
  return {
    scanner: 'license',
    findings: [
      {
        package: 'some-gpl-lib',
        version: '1.0.0',
        license: 'GPL-3.0',
        source: '/project/package.json',
        severity: 'high',
        reason: 'GPL-3.0 is incompatible with commercial use',
      },
    ],
    findingCount: 1,
    checkedPackages: 40,
    manifests: ['/project/package.json'],
    projectType: 'commercial',
    duration: 120,
    ...overrides,
  };
}

// ── normaliseSeverity ─────────────────────────────────────────────────────────

describe('normaliseSeverity', () => {
  it('maps CRITICAL → critical', () => {
    expect(normaliseSeverity('CRITICAL')).toBe('critical');
  });
  it('maps HIGH → high', () => {
    expect(normaliseSeverity('HIGH')).toBe('high');
  });
  it('maps MEDIUM → medium', () => {
    expect(normaliseSeverity('MEDIUM')).toBe('medium');
  });
  it('maps MODERATE → medium', () => {
    expect(normaliseSeverity('MODERATE')).toBe('medium');
  });
  it('maps LOW → low', () => {
    expect(normaliseSeverity('LOW')).toBe('low');
  });
  it('maps unknown → info', () => {
    expect(normaliseSeverity('NONE')).toBe('info');
    expect(normaliseSeverity('')).toBe('info');
  });
  it('is case-insensitive', () => {
    expect(normaliseSeverity('high')).toBe('high');
    expect(normaliseSeverity('Critical')).toBe('critical');
  });
});

// ── computeVerdict ────────────────────────────────────────────────────────────

describe('computeVerdict', () => {
  it('returns FAIL when critical > 0', () => {
    expect(computeVerdict({ critical: 1, high: 0, medium: 0, low: 0, info: 0 })).toBe('FAIL');
  });
  it('returns FAIL when high > 0', () => {
    expect(computeVerdict({ critical: 0, high: 3, medium: 2, low: 1, info: 0 })).toBe('FAIL');
  });
  it('returns WARN when only medium findings', () => {
    expect(computeVerdict({ critical: 0, high: 0, medium: 2, low: 1, info: 0 })).toBe('WARN');
  });
  it('returns PASS when only low/info findings', () => {
    expect(computeVerdict({ critical: 0, high: 0, medium: 0, low: 5, info: 2 })).toBe('PASS');
  });
  it('returns PASS when all counts are 0', () => {
    expect(computeVerdict({ critical: 0, high: 0, medium: 0, low: 0, info: 0 })).toBe('PASS');
  });
});

// ── normaliseSemgrepFindings ──────────────────────────────────────────────────

describe('normaliseSemgrepFindings', () => {
  it('converts all findings with correct shape', () => {
    const report = makeSemgrepReport();
    const results = normaliseSemgrepFindings(report);
    expect(results).toHaveLength(2);
    for (const f of results) {
      expect(f.id).toBeTruthy();
      expect(f.scanner).toBe('semgrep');
      expect(f.category).toBe('owasp');
      expect(f.suppressed).toBe(false);
      expect(typeof f.severity).toBe('string');
    }
  });

  it('maps HIGH severity correctly', () => {
    const results = normaliseSemgrepFindings(makeSemgrepReport());
    expect(results[0].severity).toBe('high');
  });

  it('maps MEDIUM severity correctly', () => {
    const results = normaliseSemgrepFindings(makeSemgrepReport());
    expect(results[1].severity).toBe('medium');
  });

  it('carries file and line information', () => {
    const results = normaliseSemgrepFindings(makeSemgrepReport());
    expect(results[0].file).toBe('src/db.py');
    expect(results[0].line).toBe(42);
  });

  it('sets remediation from fix field when present', () => {
    const results = normaliseSemgrepFindings(makeSemgrepReport());
    expect(results[0].remediation).toBe('Use parameterised queries');
  });

  it('handles empty findings array', () => {
    const report = makeSemgrepReport({ findings: [] });
    expect(normaliseSemgrepFindings(report)).toHaveLength(0);
  });
});

// ── normaliseGitleaksFindings ─────────────────────────────────────────────────

describe('normaliseGitleaksFindings', () => {
  it('converts findings to high severity for API keys', () => {
    const result = makeGitleaksResult();
    const findings = normaliseGitleaksFindings(result);
    const activeFindings = findings.filter((f) => !f.suppressed);
    expect(activeFindings[0].severity).toBe('high');
  });

  it('marks suppressed findings correctly', () => {
    const result = makeGitleaksResult();
    const findings = normaliseGitleaksFindings(result);
    const suppressed = findings.filter((f) => f.suppressed);
    expect(suppressed).toHaveLength(1);
    expect(suppressed[0].rule).toBe('github-pat');
  });

  it('uses critical severity for private key rules', () => {
    const result = makeGitleaksResult({
      findings: [
        {
          description: 'RSA Private Key',
          file: 'keys/server.pem',
          startLine: 1,
          endLine: 10,
          startColumn: 0,
          endColumn: 0,
          match: 'BEGI****TKEY',
          secret: 'BEGIN RSA PRIVATE KEY...',
          rule: 'rsa-private-key',
          entropy: 5.9,
          fingerprint: 'rsa-fp',
          suppressed: false,
        },
      ],
      findingCount: 1,
    });
    const findings = normaliseGitleaksFindings(result);
    expect(findings[0].severity).toBe('critical');
  });

  it('sets category to secrets', () => {
    const findings = normaliseGitleaksFindings(makeGitleaksResult());
    for (const f of findings) {
      expect(f.category).toBe('secrets');
    }
  });

  it('handles empty findings', () => {
    const result = makeGitleaksResult({ findings: [], findingCount: 0 });
    expect(normaliseGitleaksFindings(result)).toHaveLength(0);
  });
});

// ── normaliseCheckovFindings ──────────────────────────────────────────────────

describe('normaliseCheckovFindings', () => {
  it('converts findings with correct shape', () => {
    const result = makeCheckovResult();
    const findings = normaliseCheckovFindings(result);
    expect(findings).toHaveLength(2);
    for (const f of findings) {
      expect(f.scanner).toBe('checkov');
      expect(f.category).toBe('iac');
      expect(f.suppressed).toBe(false);
    }
  });

  it('preserves Checkov severity levels', () => {
    const result = makeCheckovResult();
    const findings = normaliseCheckovFindings(result);
    expect(findings[0].severity).toBe('medium');
    expect(findings[1].severity).toBe('high');
  });

  it('includes guideline in references', () => {
    const findings = normaliseCheckovFindings(makeCheckovResult());
    expect(findings[0].references).toContain('https://docs.bridgecrew.io/docs/ckv_docker_2');
  });

  it('sets rule to checkId', () => {
    const findings = normaliseCheckovFindings(makeCheckovResult());
    expect(findings[0].rule).toBe('CKV_DOCKER_2');
    expect(findings[1].rule).toBe('CKV_AWS_18');
  });

  it('handles empty findings', () => {
    const result = makeCheckovResult({ findings: [], findingCount: 0 });
    expect(normaliseCheckovFindings(result)).toHaveLength(0);
  });
});

// ── normaliseDependencyFindings ───────────────────────────────────────────────

describe('normaliseDependencyFindings', () => {
  it('converts findings to CVE category', () => {
    const findings = normaliseDependencyFindings(makeDependencyReport());
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('cve');
    expect(findings[0].scanner).toBe('dependency-scanner');
  });

  it('maps high severity correctly', () => {
    const findings = normaliseDependencyFindings(makeDependencyReport());
    expect(findings[0].severity).toBe('high');
  });

  it('maps moderate to medium', () => {
    const report = makeDependencyReport({
      reports: [
        {
          package_manager: 'npm',
          total_dependencies: 10,
          vulnerable_count: 1,
          findings: [{
            name: 'express',
            version: '4.0.0',
            severity: 'moderate',
            cve: 'CVE-2024-00001',
            title: 'Open redirect',
            advisory_url: '',
            package_manager: 'npm',
          }],
          scanner_available: true,
          error: null,
        },
      ],
      total_vulnerable: 1,
      summary: { critical: 0, high: 0, moderate: 1, low: 0 },
      verdict: 'WARN',
    });
    const findings = normaliseDependencyFindings(report);
    expect(findings[0].severity).toBe('medium');
  });

  it('flattens findings across multiple package managers', () => {
    const report = makeDependencyReport({
      reports: [
        {
          package_manager: 'npm',
          total_dependencies: 10,
          vulnerable_count: 1,
          findings: [{ name: 'a', version: '1.0', severity: 'high', cve: '', title: 'A issue', advisory_url: '', package_manager: 'npm' }],
          scanner_available: true,
          error: null,
        },
        {
          package_manager: 'pip',
          total_dependencies: 5,
          vulnerable_count: 1,
          findings: [{ name: 'b', version: '2.0', severity: 'critical', cve: 'CVE-X', title: 'B issue', advisory_url: '', package_manager: 'pip' }],
          scanner_available: true,
          error: null,
        },
      ],
      total_vulnerable: 2,
      summary: { critical: 1, high: 1, moderate: 0, low: 0 },
      verdict: 'FAIL',
    });
    const findings = normaliseDependencyFindings(report);
    expect(findings).toHaveLength(2);
  });

  it('handles empty reports array', () => {
    const report = makeDependencyReport({
      reports: [],
      total_vulnerable: 0,
      summary: { critical: 0, high: 0, moderate: 0, low: 0 },
      verdict: 'PASS',
    });
    expect(normaliseDependencyFindings(report)).toHaveLength(0);
  });
});

// ── normaliseLicenseFindings ──────────────────────────────────────────────────

describe('normaliseLicenseFindings', () => {
  it('converts findings to license category', () => {
    const findings = normaliseLicenseFindings(makeLicenseResult());
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('license');
    expect(findings[0].scanner).toBe('license-checker');
  });

  it('preserves high severity for GPL in commercial', () => {
    const findings = normaliseLicenseFindings(makeLicenseResult());
    expect(findings[0].severity).toBe('high');
  });

  it('preserves medium severity for unknown licenses', () => {
    const result = makeLicenseResult({
      findings: [{
        package: 'mystery-lib',
        version: '0.1',
        license: 'UNKNOWN',
        source: '/project/package.json',
        severity: 'medium',
        reason: 'Unknown license',
      }],
    });
    const findings = normaliseLicenseFindings(result);
    expect(findings[0].severity).toBe('medium');
  });

  it('handles empty findings', () => {
    const result = makeLicenseResult({ findings: [], findingCount: 0 });
    expect(normaliseLicenseFindings(result)).toHaveLength(0);
  });
});

// ── Scanner sections: skipped and failed ──────────────────────────────────────

describe('UnifiedSecurityReportGenerator — scanner isolation', () => {
  let gen: UnifiedSecurityReportGenerator;

  beforeEach(() => {
    gen = new UnifiedSecurityReportGenerator('/tmp/test-project');
  });

  it('marks gitleaks section as skipped when scanner was skipped', () => {
    const results: ScannerResults = {
      gitleaks: {
        scanner: 'gitleaks',
        available: false,
        success: false,
        findings: [],
        findingCount: 0,
        duration: 0,
        skipped: true,
        skipReason: 'Gitleaks not installed',
      },
    };
    const report = gen.generate(results);
    expect(report.scanners.gitleaks.status).toBe('skipped');
    expect(report.scanners.gitleaks.statusReason).toBe('Gitleaks not installed');
    expect(report.scanners.gitleaks.findingCount).toBe(0);
  });

  it('marks checkov section as skipped when not provided', () => {
    const report = gen.generate({});
    expect(report.scanners.checkov.status).toBe('skipped');
  });

  it('marks all sections as skipped when no results provided', () => {
    const report = gen.generate({});
    expect(report.scanners.semgrep.status).toBe('skipped');
    expect(report.scanners.gitleaks.status).toBe('skipped');
    expect(report.scanners.checkov.status).toBe('skipped');
    expect(report.scanners.dependencies.status).toBe('skipped');
    expect(report.scanners.licenses.status).toBe('skipped');
  });

  it('counts skipped scanners in scannersSkipped', () => {
    const report = gen.generate({});
    expect(report.summary.scannersSkipped).toBe(5);
    expect(report.summary.scannersRun).toBe(0);
  });

  it('counts running scanners correctly when all provided', () => {
    const report = gen.generate({
      semgrep: makeSemgrepReport({ findings: [] }),
      gitleaks: makeGitleaksResult({ findings: [], findingCount: 0 }),
      checkov: makeCheckovResult({ findings: [], findingCount: 0 }),
      dependencies: makeDependencyReport({ reports: [], total_vulnerable: 0, summary: { critical: 0, high: 0, moderate: 0, low: 0 }, verdict: 'PASS' }),
      licenses: makeLicenseResult({ findings: [], findingCount: 0 }),
    });
    expect(report.summary.scannersRun).toBe(5);
    expect(report.summary.scannersSkipped).toBe(0);
  });
});

// ── Summary statistics ────────────────────────────────────────────────────────

describe('UnifiedSecurityReportGenerator — summary statistics', () => {
  let gen: UnifiedSecurityReportGenerator;

  beforeEach(() => {
    gen = new UnifiedSecurityReportGenerator('/tmp/test-project');
  });

  it('aggregates 8 total findings across all 5 scanners', () => {
    // Semgrep: 2, Gitleaks: 2 (1 suppressed), Checkov: 2, Dep: 1, License: 1 = 8 total
    const report = gen.generate({
      semgrep: makeSemgrepReport(),
      gitleaks: makeGitleaksResult(),
      checkov: makeCheckovResult(),
      dependencies: makeDependencyReport(),
      licenses: makeLicenseResult(),
    });
    expect(report.summary.totalFindings).toBe(8);
    expect(report.scanners.semgrep.findingCount).toBe(2);
    expect(report.scanners.gitleaks.findingCount).toBe(2);
    expect(report.scanners.checkov.findingCount).toBe(2);
    expect(report.scanners.dependencies.findingCount).toBe(1);
    expect(report.scanners.licenses.findingCount).toBe(1);
  });

  it('excludes suppressed findings from severity counts', () => {
    // Gitleaks has 1 active + 1 suppressed
    const report = gen.generate({
      gitleaks: makeGitleaksResult(),
    });
    // Active findings: 1 AWS key (high severity)
    expect(report.summary.high).toBeGreaterThanOrEqual(1);
    // Suppressed finding does not inflate counts
    // total includes all (suppressed included in findingCount)
    expect(report.scanners.gitleaks.findingCount).toBe(2);
  });

  it('returns FAIL verdict when critical/high findings exist', () => {
    const report = gen.generate({
      semgrep: makeSemgrepReport(), // has HIGH
    });
    expect(report.verdict).toBe('FAIL');
  });

  it('returns WARN verdict when only medium findings', () => {
    const report = gen.generate({
      semgrep: makeSemgrepReport({
        findings: [
          {
            id: 'r1',
            severity: 'MEDIUM',
            category: 'A05',
            rule: 'test-rule',
            message: 'medium issue',
            file: 'test.py',
            line: 1,
            column: 0,
            snippet: '',
            fix: null,
            source: 'semgrep',
          },
        ],
        summary: { critical: 0, high: 0, medium: 1, low: 0, info: 0 },
        verdict: 'WARN',
      }),
    });
    expect(report.verdict).toBe('WARN');
  });

  it('returns PASS verdict when no findings exist', () => {
    const report = gen.generate({
      semgrep: makeSemgrepReport({ findings: [], summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, verdict: 'PASS' }),
    });
    expect(report.verdict).toBe('PASS');
  });

  it('totalFindings is 0 when all scanners are clean', () => {
    const report = gen.generate({
      semgrep: makeSemgrepReport({ findings: [], summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, verdict: 'PASS' }),
      gitleaks: makeGitleaksResult({ findings: [], findingCount: 0 }),
      checkov: makeCheckovResult({ findings: [], findingCount: 0 }),
      dependencies: makeDependencyReport({ reports: [], total_vulnerable: 0, summary: { critical: 0, high: 0, moderate: 0, low: 0 }, verdict: 'PASS' }),
      licenses: makeLicenseResult({ findings: [], findingCount: 0 }),
    });
    expect(report.summary.totalFindings).toBe(0);
    expect(report.verdict).toBe('PASS');
  });
});

// ── JSON schema validation ────────────────────────────────────────────────────

describe('UnifiedSecurityReportGenerator — JSON schema', () => {
  it('produces a report matching the UnifiedSecurityReport schema', () => {
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const report = gen.generate({ semgrep: makeSemgrepReport() });

    expect(report.version).toBe('1.0');
    expect(typeof report.generatedAt).toBe('string');
    expect(new Date(report.generatedAt).getTime()).toBeGreaterThan(0);
    expect(typeof report.projectPath).toBe('string');
    expect(typeof report.projectName).toBe('string');
    expect(['PASS', 'WARN', 'FAIL']).toContain(report.verdict);

    // Summary fields
    const s = report.summary;
    expect(typeof s.totalFindings).toBe('number');
    expect(typeof s.critical).toBe('number');
    expect(typeof s.high).toBe('number');
    expect(typeof s.medium).toBe('number');
    expect(typeof s.low).toBe('number');
    expect(typeof s.info).toBe('number');
    expect(typeof s.scannersRun).toBe('number');
    expect(typeof s.scannersSkipped).toBe('number');
    expect(typeof s.scanDuration).toBe('number');

    // Scanners object has all five keys
    expect(report.scanners).toHaveProperty('semgrep');
    expect(report.scanners).toHaveProperty('gitleaks');
    expect(report.scanners).toHaveProperty('checkov');
    expect(report.scanners).toHaveProperty('dependencies');
    expect(report.scanners).toHaveProperty('licenses');
  });

  it('serialises to valid JSON that can be parsed back', () => {
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const report = gen.generate({ semgrep: makeSemgrepReport() });
    const json = JSON.stringify(report, null, 2);
    const parsed = JSON.parse(json) as UnifiedSecurityReport;
    expect(parsed.version).toBe('1.0');
    expect(parsed.scanners.semgrep.status).toBe('completed');
  });

  it('each finding in a section has required UnifiedFinding fields', () => {
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const report = gen.generate({ semgrep: makeSemgrepReport() });
    for (const finding of report.scanners.semgrep.findings) {
      expect(typeof finding.id).toBe('string');
      expect(finding.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(typeof finding.scanner).toBe('string');
      expect(['critical', 'high', 'medium', 'low', 'info']).toContain(finding.severity);
      expect(typeof finding.category).toBe('string');
      expect(typeof finding.title).toBe('string');
      expect(typeof finding.description).toBe('string');
      expect(typeof finding.rule).toBe('string');
      expect(typeof finding.suppressed).toBe('boolean');
    }
  });
});

// ── writeJson / writeHtml ────────────────────────────────────────────────────

describe('UnifiedSecurityReportGenerator — file output', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sf-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes valid JSON to disk', async () => {
    const { readFileSync } = await import('node:fs');
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const report = gen.generate({ semgrep: makeSemgrepReport() });
    const outputPath = join(tmpDir, 'report.json');
    gen.writeJson(report, outputPath);

    const content = readFileSync(outputPath, 'utf-8');
    const parsed = JSON.parse(content) as UnifiedSecurityReport;
    expect(parsed.version).toBe('1.0');
    expect(parsed.verdict).toBe('FAIL');
  });

  it('writes HTML file to disk', async () => {
    const { readFileSync } = await import('node:fs');
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const report = gen.generate({ semgrep: makeSemgrepReport() });
    const outputPath = join(tmpDir, 'report.html');
    gen.writeHtml(report, outputPath);

    const content = readFileSync(outputPath, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('SkillFoundry Security Report');
  });

  it('creates parent directories automatically', async () => {
    const { existsSync, readFileSync } = await import('node:fs');
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const report = gen.generate({});
    const outputPath = join(tmpDir, 'nested', 'deep', 'report.json');
    gen.writeJson(report, outputPath);
    expect(existsSync(outputPath)).toBe(true);
    const content = readFileSync(outputPath, 'utf-8');
    expect(JSON.parse(content)).toHaveProperty('version', '1.0');
  });
});

// ── HTML rendering ────────────────────────────────────────────────────────────

describe('renderSecurityReportHtml', () => {
  it('renders a valid HTML document', () => {
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const report = gen.generate({ semgrep: makeSemgrepReport() });
    const html = renderSecurityReportHtml(report);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en"');
    expect(html).toContain('</html>');
  });

  it('shows FAIL verdict in the HTML', () => {
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const report = gen.generate({ semgrep: makeSemgrepReport() });
    const html = renderSecurityReportHtml(report);
    expect(html).toContain('verdict-fail');
    expect(html).toContain('FAIL');
  });

  it('shows all-clear banner when no findings', () => {
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const report = gen.generate({
      semgrep: makeSemgrepReport({ findings: [], summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, verdict: 'PASS' }),
    });
    const html = renderSecurityReportHtml(report);
    expect(html).toContain('all-clear');
    expect(html).toContain('All clear');
  });

  it('contains collapsible scanner sections', () => {
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const report = gen.generate({ semgrep: makeSemgrepReport() });
    const html = renderSecurityReportHtml(report);
    expect(html).toContain('<details');
    expect(html).toContain('scanner-section');
    expect(html).toContain('Semgrep');
  });

  it('includes severity color coding CSS classes', () => {
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const report = gen.generate({ semgrep: makeSemgrepReport() });
    const html = renderSecurityReportHtml(report);
    expect(html).toContain('sev-high');
    expect(html).toContain('sev-medium');
    expect(html).toContain('sev-critical');
  });

  it('includes severity filter checkboxes', () => {
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const report = gen.generate({});
    const html = renderSecurityReportHtml(report);
    expect(html).toContain('filterFindings');
    expect(html).toContain('data-sev="critical"');
    expect(html).toContain('data-sev="high"');
  });

  it('shows suppressed findings in a separate collapsed section', () => {
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const report = gen.generate({ gitleaks: makeGitleaksResult() });
    const html = renderSecurityReportHtml(report);
    expect(html).toContain('suppressed-block');
    expect(html).toContain('suppressed finding');
  });

  it('includes light/dark theme toggle', () => {
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const report = gen.generate({});
    const html = renderSecurityReportHtml(report);
    expect(html).toContain('toggleTheme');
    expect(html).toContain('Toggle Light/Dark');
  });

  it('escapes HTML characters in finding data to prevent XSS', () => {
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const xssReport = makeSemgrepReport({
      findings: [{
        id: 'xss-test',
        severity: 'HIGH',
        category: 'test',
        rule: '<script>alert(1)</script>',
        message: '<img src=x onerror=alert(1)>',
        file: 'file.ts',
        line: 1,
        column: 0,
        snippet: '',
        fix: null,
        source: 'semgrep',
      }],
    });
    const report = gen.generate({ semgrep: xssReport });
    const html = renderSecurityReportHtml(report);
    // Raw script tag must not appear unescaped
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('is self-contained with no external CDN dependencies', () => {
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const report = gen.generate({});
    const html = renderSecurityReportHtml(report);
    // Should not reference external CSS/JS files
    expect(html).not.toContain('cdn.jsdelivr.net');
    expect(html).not.toContain('rel="stylesheet"');
  });
});

// ── getDefaultReportPaths ─────────────────────────────────────────────────────

describe('getDefaultReportPaths', () => {
  it('returns paths under .sf/reports/security/', () => {
    const { dir, jsonPath, htmlPath } = getDefaultReportPaths('/tmp/project');
    expect(dir).toContain('.sf/reports/security');
    expect(jsonPath).toContain('.sf/reports/security');
    expect(htmlPath).toContain('.sf/reports/security');
  });

  it('includes timestamp in filenames', () => {
    const { jsonPath, htmlPath } = getDefaultReportPaths('/tmp/project', '2026-03-16T10:30:00.000Z');
    expect(jsonPath).toContain('security-report-');
    expect(htmlPath).toContain('security-report-');
    expect(jsonPath.endsWith('.json')).toBe(true);
    expect(htmlPath.endsWith('.html')).toBe(true);
  });

  it('generates unique filenames for different timestamps', () => {
    const a = getDefaultReportPaths('/tmp/project', '2026-03-16T10:00:00.000Z');
    const b = getDefaultReportPaths('/tmp/project', '2026-03-16T11:00:00.000Z');
    expect(a.jsonPath).not.toBe(b.jsonPath);
  });
});

// ── Integration: full report with all 5 scanners ─────────────────────────────

describe('UnifiedSecurityReportGenerator — integration', () => {
  it('generates a complete report from all 5 scanners with correct aggregation', () => {
    const gen = new UnifiedSecurityReportGenerator('/tmp/my-app');
    const report = gen.generate({
      semgrep: makeSemgrepReport(),        // 2 findings: 1 HIGH, 1 MEDIUM
      gitleaks: makeGitleaksResult(),       // 2 findings: 1 active (HIGH), 1 suppressed
      checkov: makeCheckovResult(),         // 2 findings: 1 MEDIUM, 1 HIGH
      dependencies: makeDependencyReport(), // 1 finding: HIGH
      licenses: makeLicenseResult(),        // 1 finding: HIGH
    });

    // Total findings: 8 (suppressed count in total, but not in severity breakdown)
    expect(report.summary.totalFindings).toBe(8);

    // Active severity counts (exclude the 1 suppressed gitleaks finding)
    // semgrep: HIGH=1, MEDIUM=1
    // gitleaks: HIGH=1 (active), suppressed not counted
    // checkov: MEDIUM=1, HIGH=1
    // dep: HIGH=1
    // license: HIGH=1
    // Active: HIGH=5 (semgrep:1 + gitleaks:1 + checkov:1 + dep:1 + license:1), MEDIUM=2 (semgrep:1 + checkov:1)
    expect(report.summary.high).toBe(5);
    expect(report.summary.medium).toBe(2);
    expect(report.summary.critical).toBe(0);

    // Verdict must be FAIL due to high findings
    expect(report.verdict).toBe('FAIL');

    // Schema
    expect(report.version).toBe('1.0');
    expect(report.projectName).toBe('my-app');
    expect(report.scanners.semgrep.status).toBe('completed');
    expect(report.scanners.gitleaks.status).toBe('completed');
    expect(report.scanners.checkov.status).toBe('completed');
    expect(report.scanners.dependencies.status).toBe('completed');
    expect(report.scanners.licenses.status).toBe('completed');
  });

  it('gracefully handles a mix of skipped and completed scanners', () => {
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const report = gen.generate({
      semgrep: makeSemgrepReport(),
      // gitleaks, checkov, dependencies, licenses all absent → skipped
    });

    expect(report.scanners.semgrep.status).toBe('completed');
    expect(report.scanners.gitleaks.status).toBe('skipped');
    expect(report.scanners.checkov.status).toBe('skipped');
    expect(report.scanners.dependencies.status).toBe('skipped');
    expect(report.scanners.licenses.status).toBe('skipped');
    expect(report.summary.scannersRun).toBe(1);
    expect(report.summary.scannersSkipped).toBe(4);
  });

  it('produces HTML that contains all scanner names', () => {
    const gen = new UnifiedSecurityReportGenerator('/tmp/project');
    const report = gen.generate({
      semgrep: makeSemgrepReport(),
      gitleaks: makeGitleaksResult(),
      checkov: makeCheckovResult(),
      dependencies: makeDependencyReport(),
      licenses: makeLicenseResult(),
    });
    const html = renderSecurityReportHtml(report);
    expect(html).toContain('Semgrep');
    expect(html).toContain('Gitleaks');
    expect(html).toContain('Checkov');
    expect(html).toContain('Dependency Scanner');
    expect(html).toContain('License Checker');
  });
});
