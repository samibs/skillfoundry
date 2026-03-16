/**
 * @test-suite STORY-009 — Gitleaks Secrets Scanning Integration
 *
 * Tests cover:
 * - Secret redaction (various lengths)
 * - Version parsing and comparison
 * - Binary detection (present and absent)
 * - JSON output parsing into GitleaksFinding[]
 * - .gitleaksignore suppression loading
 * - Scan with findings returns correct structure
 * - Scan with no findings returns empty findings array
 * - Graceful degradation when gitleaks is not installed
 * - T4 gate integration — fail on findings, pass on clean, warn on missing binary
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  redactSecret,
  parseGitleaksVersion,
  isSupportedVersion,
  parseGitleaksOutput,
  loadGitleaksIgnore,
  findGitleaksBinary,
  getGitleaksInstallInstructions,
  GitleaksScanner,
  createGitleaksScanner,
  type GitleaksOptions,
  type GitleaksScanResult,
} from '../core/gitleaks-scanner.js';
import type { GitleaksFinding } from '../types.js';

// ── Mock logger to avoid filesystem side-effects in tests ─────────────────────
vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// ── Mock child_process for binary detection and scan execution ────────────────
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    execFileSync: vi.fn((_bin: string, args: string[]) => {
      // Default: `which gitleaks` — not in PATH
      if (Array.isArray(args) && args[0] === 'gitleaks' && (_bin === 'which' || _bin === 'where')) {
        throw new Error('not found');
      }
      // Default: version check returns supported version
      if (Array.isArray(args) && args[0] === 'version') {
        return 'v8.18.4';
      }
      // Default: detect command — write empty JSON report
      return '';
    }),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Set up the execFileSync mock so that `which gitleaks` returns the given fakeBin path.
 * Subsequent calls (version, detect) are handled by the provided handler or default to returning
 * `v8.18.4` for version and empty string for detect.
 */
async function mockGitleaksBinaryFound(
  fakeBin: string,
  handler?: (_bin: unknown, args: unknown) => string | Buffer,
): Promise<void> {
  const { execFileSync } = await import('node:child_process');
  vi.mocked(execFileSync).mockImplementation((_bin: unknown, args: unknown) => {
    const argArr = args as string[];
    const bin = _bin as string;
    // Handle `which gitleaks` / `where gitleaks`
    if ((bin === 'which' || bin === 'where') && argArr[0] === 'gitleaks') {
      return (fakeBin + '\n') as unknown as Buffer;
    }
    if (handler) {
      return handler(_bin, args) as unknown as Buffer;
    }
    if (argArr[0] === 'version') return 'v8.18.4' as unknown as Buffer;
    return '' as unknown as Buffer;
  });
}

/** Build a minimal raw Gitleaks finding object (PascalCase schema). */
function makeRawFinding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Description: 'AWS Access Key',
    File: '/project/src/config.ts',
    StartLine: 10,
    EndLine: 10,
    StartColumn: 0,
    EndColumn: 40,
    Match: 'AKIAIOSFODNN7EXAMPLE',
    Secret: 'AKIAIOSFODNN7EXAMPLE',
    RuleID: 'aws-access-key-id',
    Entropy: 3.72,
    Fingerprint: 'abc123fingerprint',
    ...overrides,
  };
}

// ── redactSecret ──────────────────────────────────────────────────────────────

describe('redactSecret', () => {
  it('redacts a long secret (>=10 chars) showing first 4 and last 4', () => {
    const result = redactSecret('AKIAIOSFODNN7EXAMPLE');
    expect(result).toBe('AKIA****MPLE');
    expect(result).not.toContain('IOSFODNN7EXA');
  });

  it('redacts a medium secret (4-9 chars) showing first 2 and last 2', () => {
    const result = redactSecret('password');
    expect(result).toBe('pa****rd');
    expect(result).not.toContain('sswo');
  });

  it('redacts a short secret (<4 chars) completely', () => {
    expect(redactSecret('abc')).toBe('****');
    expect(redactSecret('ab')).toBe('****');
    expect(redactSecret('a')).toBe('****');
  });

  it('handles empty string', () => {
    expect(redactSecret('')).toBe('****');
  });

  it('redacts exactly 10 char secret correctly', () => {
    const result = redactSecret('1234567890');
    expect(result).toBe('1234****7890');
  });

  it('redacts exactly 4 char secret using medium format', () => {
    const result = redactSecret('abcd');
    expect(result).toBe('ab****cd');
  });

  it('never contains the middle portion of the original secret', () => {
    const secret = 'ghp_SuperSecretTokenValue1234567890';
    const result = redactSecret(secret);
    expect(result).not.toContain('SuperSecret');
    expect(result).not.toContain('TokenValue');
    expect(result.startsWith('ghp_')).toBe(true);
    expect(result.endsWith('7890')).toBe(true);
  });
});

// ── parseGitleaksVersion ──────────────────────────────────────────────────────

describe('parseGitleaksVersion', () => {
  it('parses standard version string', () => {
    expect(parseGitleaksVersion('v8.18.4')).toEqual([8, 18, 4]);
  });

  it('parses version without v prefix', () => {
    expect(parseGitleaksVersion('8.20.0')).toEqual([8, 20, 0]);
  });

  it('parses version from multi-line output', () => {
    expect(parseGitleaksVersion('gitleaks version v8.21.2\n')).toEqual([8, 21, 2]);
  });

  it('returns [0,0,0] for unparseable string', () => {
    expect(parseGitleaksVersion('not-a-version')).toEqual([0, 0, 0]);
    expect(parseGitleaksVersion('')).toEqual([0, 0, 0]);
  });

  it('parses a future version', () => {
    expect(parseGitleaksVersion('v9.0.0')).toEqual([9, 0, 0]);
  });
});

// ── isSupportedVersion ────────────────────────────────────────────────────────

describe('isSupportedVersion', () => {
  it('accepts version >= 8.18', () => {
    expect(isSupportedVersion([8, 18, 0])).toBe(true);
    expect(isSupportedVersion([8, 19, 0])).toBe(true);
    expect(isSupportedVersion([8, 18, 4])).toBe(true);
    expect(isSupportedVersion([9, 0, 0])).toBe(true);
  });

  it('rejects version < 8.18', () => {
    expect(isSupportedVersion([8, 17, 0])).toBe(false);
    expect(isSupportedVersion([8, 0, 0])).toBe(false);
    expect(isSupportedVersion([7, 99, 99])).toBe(false);
    expect(isSupportedVersion([0, 0, 0])).toBe(false);
  });

  it('accepts major version 8 with minor exactly 18', () => {
    expect(isSupportedVersion([8, 18, 0])).toBe(true);
  });

  it('rejects major version 8 with minor 17', () => {
    expect(isSupportedVersion([8, 17, 99])).toBe(false);
  });
});

// ── parseGitleaksOutput ───────────────────────────────────────────────────────

describe('parseGitleaksOutput', () => {
  const targetPath = '/project';
  const noSuppressed = new Set<string>();

  it('parses a valid PascalCase finding array', () => {
    const raw = JSON.stringify([makeRawFinding()]);
    const findings = parseGitleaksOutput(raw, targetPath, noSuppressed);

    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.description).toBe('AWS Access Key');
    expect(f.rule).toBe('aws-access-key-id');
    expect(f.startLine).toBe(10);
    expect(f.entropy).toBe(3.72);
    expect(f.fingerprint).toBe('abc123fingerprint');
    expect(f.suppressed).toBe(false);
  });

  it('parses camelCase field names (Gitleaks v8+ alternate schema)', () => {
    const raw = JSON.stringify([{
      description: 'GitHub Token',
      file: '/project/src/app.ts',
      startLine: 5,
      endLine: 5,
      startColumn: 0,
      endColumn: 40,
      match: 'ghp_FakeToken1234',
      secret: 'ghp_FakeToken1234',
      ruleID: 'github-pat',
      entropy: 4.1,
      fingerprint: 'fp-camel',
    }]);
    const findings = parseGitleaksOutput(raw, targetPath, noSuppressed);

    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('github-pat');
    expect(findings[0].startLine).toBe(5);
  });

  it('redacts the secret in the match field', () => {
    const raw = JSON.stringify([makeRawFinding({ Secret: 'AKIAIOSFODNN7EXAMPLE', Match: 'AKIAIOSFODNN7EXAMPLE' })]);
    const findings = parseGitleaksOutput(raw, targetPath, noSuppressed);

    expect(findings[0].match).toBe('AKIA****MPLE');
    // The secretHash field contains a SHA-256 hash of the secret — raw value is never stored
    expect(findings[0].secretHash).toHaveLength(64); // SHA-256 hex
    expect(findings[0].secretHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('relativises absolute file paths against targetPath', () => {
    const raw = JSON.stringify([makeRawFinding({ File: '/project/src/config.ts' })]);
    const findings = parseGitleaksOutput(raw, '/project', noSuppressed);
    expect(findings[0].file).toBe('src/config.ts');
  });

  it('marks findings with suppressed fingerprints', () => {
    const fp = 'abc123fingerprint';
    const suppressed = new Set([fp]);
    const raw = JSON.stringify([makeRawFinding({ Fingerprint: fp })]);
    const findings = parseGitleaksOutput(raw, targetPath, suppressed);

    expect(findings[0].suppressed).toBe(true);
  });

  it('does not mark findings whose fingerprints are not suppressed', () => {
    const suppressed = new Set(['other-fingerprint']);
    const raw = JSON.stringify([makeRawFinding()]);
    const findings = parseGitleaksOutput(raw, targetPath, suppressed);
    expect(findings[0].suppressed).toBe(false);
  });

  it('returns empty array for null JSON output', () => {
    expect(parseGitleaksOutput('null', targetPath, noSuppressed)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseGitleaksOutput('', targetPath, noSuppressed)).toEqual([]);
  });

  it('returns empty array for empty JSON array', () => {
    expect(parseGitleaksOutput('[]', targetPath, noSuppressed)).toEqual([]);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseGitleaksOutput('not-json', targetPath, noSuppressed)).toEqual([]);
  });

  it('returns empty array when JSON is not an array', () => {
    expect(parseGitleaksOutput('{"key":"value"}', targetPath, noSuppressed)).toEqual([]);
  });

  it('parses multiple findings', () => {
    const raw = JSON.stringify([
      makeRawFinding({ Fingerprint: 'fp1' }),
      makeRawFinding({ RuleID: 'github-pat', Fingerprint: 'fp2', Description: 'GitHub Token' }),
    ]);
    const findings = parseGitleaksOutput(raw, targetPath, noSuppressed);
    expect(findings).toHaveLength(2);
    expect(findings[1].rule).toBe('github-pat');
  });

  it('handles missing optional fields gracefully', () => {
    const raw = JSON.stringify([{
      Description: 'Minimal finding',
      File: '/project/file.ts',
      StartLine: 1,
    }]);
    const findings = parseGitleaksOutput(raw, targetPath, noSuppressed);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('unknown-rule');
    expect(findings[0].entropy).toBe(0);
    expect(findings[0].fingerprint).toBe('');
    expect(findings[0].suppressed).toBe(false);
  });
});

// ── loadGitleaksIgnore ────────────────────────────────────────────────────────

describe('loadGitleaksIgnore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gitleaks-ignore-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty set when .gitleaksignore does not exist', () => {
    const result = loadGitleaksIgnore(tmpDir);
    expect(result.size).toBe(0);
  });

  it('loads fingerprints from .gitleaksignore', () => {
    writeFileSync(join(tmpDir, '.gitleaksignore'), 'fp1\nfp2\nfp3\n');
    const result = loadGitleaksIgnore(tmpDir);
    expect(result.size).toBe(3);
    expect(result.has('fp1')).toBe(true);
    expect(result.has('fp2')).toBe(true);
    expect(result.has('fp3')).toBe(true);
  });

  it('ignores comment lines starting with #', () => {
    writeFileSync(join(tmpDir, '.gitleaksignore'), '# This is a comment\nfp1\n# another comment\nfp2\n');
    const result = loadGitleaksIgnore(tmpDir);
    expect(result.size).toBe(2);
    expect(result.has('fp1')).toBe(true);
    expect(result.has('fp2')).toBe(true);
  });

  it('ignores blank lines', () => {
    writeFileSync(join(tmpDir, '.gitleaksignore'), '\nfp1\n\nfp2\n\n');
    const result = loadGitleaksIgnore(tmpDir);
    expect(result.size).toBe(2);
  });

  it('handles file with only comments', () => {
    writeFileSync(join(tmpDir, '.gitleaksignore'), '# comment only\n');
    const result = loadGitleaksIgnore(tmpDir);
    expect(result.size).toBe(0);
  });
});

// ── GitleaksScanner.isAvailable() ────────────────────────────────────────────

describe('GitleaksScanner.isAvailable()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gitleaks-avail-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns false when gitleaks binary is not found', async () => {
    // Default mock: which/where throws → findGitleaksBinary returns null
    // Default mock already rejects `which gitleaks` — no additional setup needed

    const scanner = createGitleaksScanner(tmpDir);
    const result = await scanner.isAvailable();
    expect(result).toBe(false);
  });

  it('returns true when binary is found with supported version', async () => {
    const fakeBin = join(tmpDir, 'gitleaks');
    writeFileSync(fakeBin, '#!/bin/sh\necho v8.18.4', { mode: 0o755 });
    await mockGitleaksBinaryFound(fakeBin);

    const scanner = createGitleaksScanner(tmpDir);
    const result = await scanner.isAvailable();
    expect(result).toBe(true);
  });

  it('returns false when binary exists but version is too old', async () => {
    const fakeBin = join(tmpDir, 'gitleaks');
    writeFileSync(fakeBin, '#!/bin/sh', { mode: 0o755 });
    await mockGitleaksBinaryFound(fakeBin, (_bin, args) => {
      const argArr = args as string[];
      if (argArr[0] === 'version') return 'v8.17.0';
      return '';
    });

    const scanner = createGitleaksScanner(tmpDir);
    const result = await scanner.isAvailable();
    expect(result).toBe(false);
  });
});

// ── GitleaksScanner.scan() — graceful degradation ────────────────────────────

describe('GitleaksScanner.scan() — graceful degradation (binary missing)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gitleaks-scan-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns skipped result when gitleaks binary is not found', async () => {
    // Default mock already rejects `which gitleaks` — no additional setup needed

    const scanner = createGitleaksScanner(tmpDir);
    const result = await scanner.scan();

    expect(result.scanner).toBe('gitleaks');
    expect(result.skipped).toBe(true);
    expect(result.available).toBe(false);
    expect(result.success).toBe(false);
    expect(result.findings).toEqual([]);
    expect(result.findingCount).toBe(0);
    expect(result.skipReason).toBeTruthy();
    expect(result.skipReason).toContain('not installed');
  });

  it('skipReason contains install guide URL', async () => {
    // Default mock already rejects `which gitleaks` — no additional setup needed

    const scanner = createGitleaksScanner(tmpDir);
    const result = await scanner.scan();

    expect(result.skipReason).toContain('https://github.com/gitleaks/gitleaks');
  });

  it('returns skipped result when gitleaks version is unsupported', async () => {
    const fakeBin = join(tmpDir, 'gitleaks');
    writeFileSync(fakeBin, '#!/bin/sh', { mode: 0o755 });
    await mockGitleaksBinaryFound(fakeBin, (_bin, args) => {
      const argArr = args as string[];
      if (argArr[0] === 'version') return 'v8.10.0';
      return '';
    });

    const scanner = createGitleaksScanner(tmpDir);
    const result = await scanner.scan();

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain('version');
  });
});

// ── GitleaksScanner.scan() — with findings ───────────────────────────────────

describe('GitleaksScanner.scan() — with findings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gitleaks-findings-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns findings from JSON report when secrets are found', async () => {
    const fakeBin = join(tmpDir, 'gitleaks');
    writeFileSync(fakeBin, '#!/bin/sh', { mode: 0o755 });
    await mockGitleaksBinaryFound(fakeBin, (_bin, args) => {
      const argArr = args as string[];
      if (argArr[0] === 'version') return 'v8.18.4';
      // detect command — write a report with one finding to the report-path argument
      const rpIdx = argArr.indexOf('--report-path');
      if (rpIdx !== -1 && argArr[rpIdx + 1]) {
        const reportPath = argArr[rpIdx + 1];
        const findings = [makeRawFinding({
          File: join(tmpDir, 'src', 'config.ts'),
          Fingerprint: 'test-fp-001',
        })];
        writeFileSync(reportPath, JSON.stringify(findings));
      }
      return '';
    });

    const scanner = createGitleaksScanner(tmpDir);
    const result = await scanner.scan({ targetPath: tmpDir });

    expect(result.scanner).toBe('gitleaks');
    expect(result.available).toBe(true);
    expect(result.success).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findingCount).toBe(1);
    expect(result.findings[0].rule).toBe('aws-access-key-id');
    expect(result.findings[0].description).toBe('AWS Access Key');
    expect(result.findings[0].suppressed).toBe(false);
    // Secret must be redacted in match
    expect(result.findings[0].match).not.toBe('AKIAIOSFODNN7EXAMPLE');
    expect(result.findings[0].match).toContain('****');
  });

  it('returns empty findings for a clean scan', async () => {
    const fakeBin = join(tmpDir, 'gitleaks');
    writeFileSync(fakeBin, '#!/bin/sh', { mode: 0o755 });
    await mockGitleaksBinaryFound(fakeBin, (_bin, args) => {
      const argArr = args as string[];
      if (argArr[0] === 'version') return 'v8.18.4';
      const rpIdx = argArr.indexOf('--report-path');
      if (rpIdx !== -1) writeFileSync(argArr[rpIdx + 1], '[]');
      return '';
    });

    const scanner = createGitleaksScanner(tmpDir);
    const result = await scanner.scan({ targetPath: tmpDir });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.findings).toEqual([]);
    expect(result.findingCount).toBe(0);
  });

  it('marks suppressed findings and excludes them from blocking counts', async () => {
    const fakeBin = join(tmpDir, 'gitleaks');
    writeFileSync(fakeBin, '#!/bin/sh', { mode: 0o755 });

    // Create a .gitleaksignore with the fingerprint
    writeFileSync(join(tmpDir, '.gitleaksignore'), 'suppressed-fp-001\n');

    await mockGitleaksBinaryFound(fakeBin, (_bin, args) => {
      const argArr = args as string[];
      if (argArr[0] === 'version') return 'v8.18.4';
      const rpIdx = argArr.indexOf('--report-path');
      if (rpIdx !== -1) {
        const findings = [makeRawFinding({ Fingerprint: 'suppressed-fp-001' })];
        writeFileSync(argArr[rpIdx + 1], JSON.stringify(findings));
      }
      return '';
    });

    const scanner = createGitleaksScanner(tmpDir);
    const result = await scanner.scan({ targetPath: tmpDir });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].suppressed).toBe(true);
    // findingCount includes suppressed (caller decides what to do with them)
    expect(result.findingCount).toBe(1);
  });

  it('includes duration in scan result', async () => {
    const fakeBin = join(tmpDir, 'gitleaks');
    writeFileSync(fakeBin, '#!/bin/sh', { mode: 0o755 });
    await mockGitleaksBinaryFound(fakeBin, (_bin, args) => {
      const argArr = args as string[];
      if (argArr[0] === 'version') return 'v8.18.4';
      const rpIdx = argArr.indexOf('--report-path');
      if (rpIdx !== -1) writeFileSync(argArr[rpIdx + 1], '[]');
      return '';
    });

    const scanner = createGitleaksScanner(tmpDir);
    const result = await scanner.scan({ targetPath: tmpDir });
    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

// ── GitleaksScanner.scanStaged() ─────────────────────────────────────────────

describe('GitleaksScanner.scanStaged()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gitleaks-staged-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('calls detect with --staged flag', async () => {
    const fakeBin = join(tmpDir, 'gitleaks');
    writeFileSync(fakeBin, '#!/bin/sh', { mode: 0o755 });

    const capturedArgs: string[][] = [];
    const { execFileSync } = await import('node:child_process');
    vi.mocked(execFileSync).mockImplementation((_bin: unknown, args: unknown) => {
      const argArr = args as string[];
      const bin = _bin as string;
      // Handle `which gitleaks`
      if ((bin === 'which' || bin === 'where') && argArr[0] === 'gitleaks') {
        return (fakeBin + '\n') as unknown as Buffer;
      }
      capturedArgs.push([...argArr]);
      if (argArr[0] === 'version') return 'v8.18.4' as unknown as Buffer;
      const rpIdx = argArr.indexOf('--report-path');
      if (rpIdx !== -1) writeFileSync(argArr[rpIdx + 1], '[]');
      return '' as unknown as Buffer;
    });

    const scanner = createGitleaksScanner(tmpDir);
    await scanner.scanStaged();

    // Find the detect invocation
    const detectCall = capturedArgs.find((a) => a[0] === 'detect');
    expect(detectCall).toBeDefined();
    expect(detectCall).toContain('--staged');
    // Should NOT have --no-git when staged
    expect(detectCall).not.toContain('--no-git');
  });
});

// ── createGitleaksScanner factory ─────────────────────────────────────────────

describe('createGitleaksScanner', () => {
  it('returns a GitleaksScanner instance', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'gitleaks-factory-'));
    try {
      const scanner = createGitleaksScanner(tmpDir);
      expect(scanner).toBeInstanceOf(GitleaksScanner);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('throws TypeError for relative paths', () => {
    expect(() => createGitleaksScanner('relative/path')).toThrow(TypeError);
  });

  it('throws TypeError for empty string', () => {
    expect(() => createGitleaksScanner('')).toThrow(TypeError);
  });
});

// ── getGitleaksInstallInstructions ────────────────────────────────────────────

describe('getGitleaksInstallInstructions', () => {
  it('returns instructions containing the GitHub releases URL', () => {
    const instructions = getGitleaksInstallInstructions();
    expect(instructions).toContain('gitleaks');
    expect(instructions).toContain('https://github.com/gitleaks/gitleaks');
  });

  it('returns a non-empty string', () => {
    const instructions = getGitleaksInstallInstructions();
    expect(typeof instructions).toBe('string');
    expect(instructions.length).toBeGreaterThan(10);
  });
});

// ── T4 gate integration scenarios (logic-level, no real binary) ───────────────

describe('T4 gate integration — Gitleaks scenarios', () => {
  /**
   * These tests verify the gate-level logic:
   * - Skipped when binary missing → gate passes with warning
   * - Findings present → gate fails with finding details
   * - Clean scan → gate proceeds to SAST
   *
   * We test via the pure exported functions rather than running the full gate
   * to avoid introducing async into a synchronous gate pipeline.
   */

  it('skipped scan produces skipped=true, 0 findings', async () => {
    // Default mock already rejects `which gitleaks` — no additional setup needed

    const tmpDir = mkdtempSync(join(tmpdir(), 'gate-t4-'));
    try {
      const scanner = createGitleaksScanner(tmpDir);
      const result = await scanner.scan();

      // When Gitleaks is missing, gate should NOT hard-fail
      expect(result.skipped).toBe(true);
      expect(result.findings.filter((f) => !f.suppressed)).toHaveLength(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('active findings should cause gate failure (unsuppressed)', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'gate-t4-findings-'));
    const fakeBin = join(tmpDir, 'gitleaks');
    writeFileSync(fakeBin, '#!/bin/sh', { mode: 0o755 });
    await mockGitleaksBinaryFound(fakeBin, (_bin, args) => {
      const argArr = args as string[];
      if (argArr[0] === 'version') return 'v8.18.4';
      const rpIdx = argArr.indexOf('--report-path');
      if (rpIdx !== -1) {
        writeFileSync(argArr[rpIdx + 1], JSON.stringify([
          makeRawFinding({ Fingerprint: 'fp-gate-1' }),
          makeRawFinding({ Fingerprint: 'fp-gate-2', RuleID: 'github-pat', Description: 'GitHub Token' }),
        ]));
      }
      return '';
    });

    try {
      const scanner = createGitleaksScanner(tmpDir);
      const result = await scanner.scan({ targetPath: tmpDir });

      const activeFindings = result.findings.filter((f) => !f.suppressed);
      // Gate logic: if activeFindings.length > 0 → FAIL
      expect(activeFindings.length).toBeGreaterThan(0);
      expect(result.success).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('all-suppressed findings should NOT cause gate failure', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'gate-t4-suppressed-'));
    const fakeBin = join(tmpDir, 'gitleaks');
    writeFileSync(fakeBin, '#!/bin/sh', { mode: 0o755 });
    writeFileSync(join(tmpDir, '.gitleaksignore'), 'fp-suppressed-1\nfp-suppressed-2\n');

    await mockGitleaksBinaryFound(fakeBin, (_bin, args) => {
      const argArr = args as string[];
      if (argArr[0] === 'version') return 'v8.18.4';
      const rpIdx = argArr.indexOf('--report-path');
      if (rpIdx !== -1) {
        writeFileSync(argArr[rpIdx + 1], JSON.stringify([
          makeRawFinding({ Fingerprint: 'fp-suppressed-1' }),
          makeRawFinding({ Fingerprint: 'fp-suppressed-2' }),
        ]));
      }
      return '';
    });

    try {
      const scanner = createGitleaksScanner(tmpDir);
      const result = await scanner.scan({ targetPath: tmpDir });

      const activeFindings = result.findings.filter((f) => !f.suppressed);
      // Gate logic: all suppressed → no failure
      expect(activeFindings).toHaveLength(0);
      expect(result.findings).toHaveLength(2);
      expect(result.findings.every((f) => f.suppressed)).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('clean scan produces 0 findings and success=true', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'gate-t4-clean-'));
    const fakeBin = join(tmpDir, 'gitleaks');
    writeFileSync(fakeBin, '#!/bin/sh', { mode: 0o755 });
    await mockGitleaksBinaryFound(fakeBin, (_bin, args) => {
      const argArr = args as string[];
      if (argArr[0] === 'version') return 'v8.18.4';
      const rpIdx = argArr.indexOf('--report-path');
      if (rpIdx !== -1) writeFileSync(argArr[rpIdx + 1], '[]');
      return '';
    });

    try {
      const scanner = createGitleaksScanner(tmpDir);
      const result = await scanner.scan({ targetPath: tmpDir });

      expect(result.success).toBe(true);
      expect(result.findings).toHaveLength(0);
      expect(result.skipped).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── GitleaksScanResult shape contract ────────────────────────────────────────

describe('GitleaksScanResult shape contract', () => {
  it('skipped result has all required fields', async () => {
    // Default mock already rejects `which gitleaks` — no additional setup needed

    const tmpDir = mkdtempSync(join(tmpdir(), 'shape-test-'));
    try {
      const scanner = createGitleaksScanner(tmpDir);
      const result = await scanner.scan();

      expect(result).toHaveProperty('scanner', 'gitleaks');
      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('findingCount');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('skipped', true);
      expect(result).toHaveProperty('skipReason');
      expect(Array.isArray(result.findings)).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
