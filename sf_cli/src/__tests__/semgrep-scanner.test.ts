import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  detectSemgrep,
  resetDetectionCache,
  mapSeverity,
  extractOwaspCategory,
  parseSemgrepOutput,
  convertMatch,
  runRegexScan,
  generateSecurityReport,
  formatSecurityReport,
  getSemgrepInstallInstructions,
  type SecurityFinding,
} from '../core/semgrep-scanner.js';

// Mock logger
vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Mock execSync for Semgrep detection
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    execSync: vi.fn((cmd: string, opts?: unknown) => {
      if (typeof cmd === 'string' && cmd.includes('semgrep --version')) {
        throw new Error('not found');
      }
      // Pass through for other commands
      return actual.execSync(cmd, opts as import('node:child_process').ExecSyncOptions);
    }),
  };
});

describe('Semgrep Detection', () => {
  beforeEach(() => {
    resetDetectionCache();
  });

  it('returns null when semgrep is not installed', () => {
    const result = detectSemgrep();
    expect(result).toBeNull();
  });

  it('caches detection result', () => {
    const result1 = detectSemgrep();
    const result2 = detectSemgrep();
    expect(result1).toBe(result2);
  });

  it('resetDetectionCache clears the cache', () => {
    detectSemgrep(); // populate cache
    resetDetectionCache();
    // After reset, should call execSync again
    const result = detectSemgrep();
    expect(result).toBeNull();
  });
});

describe('Severity Mapping', () => {
  it('maps ERROR with HIGH confidence to CRITICAL', () => {
    expect(mapSeverity('ERROR', 'HIGH')).toBe('CRITICAL');
  });

  it('maps ERROR without HIGH confidence to HIGH', () => {
    expect(mapSeverity('ERROR')).toBe('HIGH');
    expect(mapSeverity('ERROR', 'MEDIUM')).toBe('HIGH');
  });

  it('maps WARNING to MEDIUM', () => {
    expect(mapSeverity('WARNING')).toBe('MEDIUM');
  });

  it('maps INFO to LOW', () => {
    expect(mapSeverity('INFO')).toBe('LOW');
  });

  it('maps unknown severity to INFO', () => {
    expect(mapSeverity('UNKNOWN')).toBe('INFO');
    expect(mapSeverity('')).toBe('INFO');
  });

  it('handles case insensitivity', () => {
    expect(mapSeverity('error')).toBe('HIGH');
    expect(mapSeverity('warning')).toBe('MEDIUM');
    expect(mapSeverity('info')).toBe('LOW');
  });
});

describe('OWASP Category Extraction', () => {
  it('extracts from metadata.owasp field', () => {
    const match = createMockMatch({
      metadata: { owasp: ['A03:2021'] },
    });
    const result = extractOwaspCategory(match);
    expect(result).toContain('A03');
  });

  it('extracts from metadata.category field', () => {
    const match = createMockMatch({
      metadata: { category: 'security' },
    });
    const result = extractOwaspCategory(match);
    expect(result).toBe('security');
  });

  it('infers injection from rule ID', () => {
    const match = createMockMatch({}, 'typescript.security.sql-injection.detect');
    expect(extractOwaspCategory(match)).toContain('A03');
  });

  it('infers crypto from rule ID', () => {
    const match = createMockMatch({}, 'generic.secrets.hardcoded-password');
    expect(extractOwaspCategory(match)).toContain('A02');
  });

  it('infers auth from rule ID', () => {
    const match = createMockMatch({}, 'typescript.auth.missing-check');
    expect(extractOwaspCategory(match)).toContain('A07');
  });

  it('infers SSRF from rule ID', () => {
    const match = createMockMatch({}, 'python.security.ssrf-detection');
    expect(extractOwaspCategory(match)).toContain('A10');
  });

  it('returns Security for unknown category', () => {
    const match = createMockMatch({}, 'generic.style.unused-variable');
    expect(extractOwaspCategory(match)).toBe('Security');
  });
});

describe('Parse Semgrep Output', () => {
  it('parses valid JSON with results', () => {
    const json = JSON.stringify({
      results: [{ check_id: 'test-rule', path: '/test.ts', start: { line: 1, col: 1 }, end: { line: 1, col: 10 }, extra: { message: 'Test', severity: 'ERROR' } }],
      errors: [],
      version: '1.100.0',
    });

    const result = parseSemgrepOutput(json);
    expect(result.results).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.version).toBe('1.100.0');
  });

  it('returns empty results for empty string', () => {
    const result = parseSemgrepOutput('');
    expect(result.results).toHaveLength(0);
  });

  it('handles missing fields gracefully', () => {
    const json = JSON.stringify({ other: 'data' });
    const result = parseSemgrepOutput(json);
    expect(result.results).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseSemgrepOutput('not json')).toThrow();
  });
});

describe('Convert Match', () => {
  it('converts a semgrep match to SecurityFinding', () => {
    const match = {
      check_id: 'typescript.security.eval-usage',
      path: '/project/src/utils.ts',
      start: { line: 42, col: 5 },
      end: { line: 42, col: 20 },
      extra: {
        message: 'Avoid eval()',
        severity: 'ERROR',
        metadata: { confidence: 'HIGH', owasp: ['A03:2021'] },
        lines: 'const result = eval(userInput);',
      },
    };

    const finding = convertMatch(match, '/project');

    expect(finding.id).toBe('typescript.security.eval-usage');
    expect(finding.severity).toBe('CRITICAL');
    expect(finding.category).toContain('A03');
    expect(finding.file).toBe('src/utils.ts');
    expect(finding.line).toBe(42);
    expect(finding.column).toBe(5);
    expect(finding.snippet).toContain('eval');
    expect(finding.source).toBe('semgrep');
  });
});

describe('Regex Fallback Scanner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'semgrep-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects hardcoded password', () => {
    writeFileSync(join(tmpDir, 'config.ts'), 'const password = "super-secret-123";\n');
    const findings = runRegexScan(tmpDir);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].id).toBe('hardcoded-password');
    expect(findings[0].severity).toBe('HIGH');
    expect(findings[0].source).toBe('regex');
  });

  it('detects hardcoded API key', () => {
    writeFileSync(join(tmpDir, 'client.ts'), 'const api_key = "sk-12345";\n');
    const findings = runRegexScan(tmpDir);
    expect(findings.some((f) => f.id === 'hardcoded-api-key')).toBe(true);
  });

  it('detects eval usage', () => {
    writeFileSync(join(tmpDir, 'danger.js'), 'const result = eval(userInput);\n');
    const findings = runRegexScan(tmpDir);
    expect(findings.some((f) => f.id === 'eval-usage')).toBe(true);
  });

  it('detects innerHTML assignment', () => {
    writeFileSync(join(tmpDir, 'render.tsx'), 'element.innerHTML = userContent;\n');
    const findings = runRegexScan(tmpDir);
    expect(findings.some((f) => f.id === 'innerHTML-usage')).toBe(true);
  });

  it('skips comments', () => {
    writeFileSync(join(tmpDir, 'clean.ts'), '// password = "not-real"\nconst x = 1;\n');
    const findings = runRegexScan(tmpDir);
    expect(findings.length).toBe(0);
  });

  it('skips test files', () => {
    writeFileSync(join(tmpDir, 'config.test.ts'), 'const password = "test-only";\n');
    const findings = runRegexScan(tmpDir);
    expect(findings.length).toBe(0);
  });

  it('skips node_modules', () => {
    mkdirSync(join(tmpDir, 'node_modules'), { recursive: true });
    writeFileSync(join(tmpDir, 'node_modules', 'bad.js'), 'const secret = "leaked";\n');
    const findings = runRegexScan(tmpDir);
    expect(findings.length).toBe(0);
  });

  it('returns empty array for clean code', () => {
    writeFileSync(join(tmpDir, 'clean.ts'), 'export function add(a: number, b: number) { return a + b; }\n');
    const findings = runRegexScan(tmpDir);
    expect(findings.length).toBe(0);
  });

  it('handles empty directory', () => {
    const findings = runRegexScan(tmpDir);
    expect(findings).toEqual([]);
  });
});

describe('Report Generation', () => {
  const sampleFindings: SecurityFinding[] = [
    {
      id: 'hardcoded-password',
      severity: 'HIGH',
      category: 'A02:2021 Cryptographic Failures',
      rule: 'regex/hardcoded-password',
      message: 'Hardcoded password detected',
      file: 'src/config.ts',
      line: 10,
      column: 0,
      snippet: 'const password = "secret"',
      fix: null,
      source: 'regex',
    },
    {
      id: 'eval-usage',
      severity: 'CRITICAL',
      category: 'A03:2021 Injection',
      rule: 'regex/eval-usage',
      message: 'eval() usage detected',
      file: 'src/utils.ts',
      line: 25,
      column: 0,
      snippet: 'eval(input)',
      fix: null,
      source: 'regex',
    },
    {
      id: 'innerHTML',
      severity: 'MEDIUM',
      category: 'A03:2021 Injection',
      rule: 'regex/innerHTML-usage',
      message: 'innerHTML assignment',
      file: 'src/render.tsx',
      line: 5,
      column: 0,
      snippet: 'el.innerHTML = x',
      fix: null,
      source: 'regex',
    },
  ];

  it('generates report with correct summary counts', () => {
    const report = generateSecurityReport(sampleFindings, '/project', 100, 'regex-fallback');

    expect(report.summary.critical).toBe(1);
    expect(report.summary.high).toBe(1);
    expect(report.summary.medium).toBe(1);
    expect(report.summary.low).toBe(0);
    expect(report.summary.info).toBe(0);
  });

  it('sets verdict to FAIL when CRITICAL findings exist', () => {
    const report = generateSecurityReport(sampleFindings, '/project', 100, 'regex-fallback');
    expect(report.verdict).toBe('FAIL');
  });

  it('sets verdict to PASS for empty findings', () => {
    const report = generateSecurityReport([], '/project', 50, '1.100.0');
    expect(report.verdict).toBe('PASS');
  });

  it('sets verdict to WARN for MEDIUM-only findings', () => {
    const mediumOnly = [sampleFindings[2]]; // innerHTML — MEDIUM
    const report = generateSecurityReport(mediumOnly, '/project', 50, 'regex-fallback');
    expect(report.verdict).toBe('WARN');
  });

  it('sorts findings by severity (CRITICAL first)', () => {
    const report = generateSecurityReport(sampleFindings, '/project', 100, 'regex-fallback');
    expect(report.findings[0].severity).toBe('CRITICAL');
    expect(report.findings[1].severity).toBe('HIGH');
    expect(report.findings[2].severity).toBe('MEDIUM');
  });

  it('reports all 10 OWASP categories when Semgrep is used', () => {
    const report = generateSecurityReport([], '/project', 50, '1.100.0');
    expect(report.owaspCoverage.length).toBe(10);
  });

  it('reports only detected categories for regex fallback', () => {
    const report = generateSecurityReport(sampleFindings, '/project', 100, 'regex-fallback');
    expect(report.owaspCoverage.length).toBeGreaterThan(0);
    expect(report.owaspCoverage.length).toBeLessThanOrEqual(10);
  });

  it('includes scanner version and duration', () => {
    const report = generateSecurityReport([], '/project', 150, '1.100.0');
    expect(report.scannerVersion).toBe('1.100.0');
    expect(report.scanDurationMs).toBe(150);
    expect(report.target).toBe('/project');
  });
});

describe('Report Formatting', () => {
  it('formats a clean report', () => {
    const report = generateSecurityReport([], '/project', 50, '1.100.0');
    const formatted = formatSecurityReport(report);

    expect(formatted).toContain('Security Scan Report');
    expect(formatted).toContain('Scanner: 1.100.0');
    expect(formatted).toContain('CRITICAL: 0');
    expect(formatted).toContain('Verdict: PASS');
    expect(formatted).toContain('No security findings detected');
  });

  it('formats findings with details', () => {
    const findings: SecurityFinding[] = [{
      id: 'test-rule',
      severity: 'HIGH',
      category: 'A03:2021 Injection',
      rule: 'test/rule',
      message: 'Potential injection',
      file: 'src/api.ts',
      line: 42,
      column: 5,
      snippet: 'query(userInput)',
      fix: 'Use parameterized queries',
      source: 'semgrep',
    }];

    const report = generateSecurityReport(findings, '/project', 100, '1.100.0');
    const formatted = formatSecurityReport(report);

    expect(formatted).toContain('[HIGH]');
    expect(formatted).toContain('src/api.ts:42');
    expect(formatted).toContain('Potential injection');
    expect(formatted).toContain('Fix: Use parameterized queries');
    expect(formatted).toContain('Verdict: FAIL');
  });

  it('includes install guide for regex fallback', () => {
    const report = generateSecurityReport([], '/project', 50, 'regex-fallback');
    const formatted = formatSecurityReport(report);

    expect(formatted).toContain('install Semgrep');
    expect(formatted).toContain('pip install semgrep');
  });

  it('does not include install guide when Semgrep is used', () => {
    const report = generateSecurityReport([], '/project', 50, '1.100.0');
    const formatted = formatSecurityReport(report);

    expect(formatted).not.toContain('install Semgrep');
  });
});

describe('Install Instructions', () => {
  it('returns platform-specific instructions', () => {
    const instructions = getSemgrepInstallInstructions();
    expect(instructions).toContain('Semgrep is not installed');
    expect(instructions).toContain('pip install semgrep');
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockMatch(
  extraOverrides: Record<string, unknown> = {},
  checkId = 'test.rule.id',
) {
  return {
    check_id: checkId,
    path: '/test/file.ts',
    start: { line: 1, col: 1 },
    end: { line: 1, col: 10 },
    extra: {
      message: 'Test message',
      severity: 'ERROR',
      ...extraOverrides,
    },
  };
}
