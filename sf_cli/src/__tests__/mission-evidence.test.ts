import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  writeEvidence, readEvidence, runValidatedCommand, isCleanValidation,
  classifyProcessState, classifyFailure, failureSignature, failureSignatureOf,
  adjudicatePreExisting, RetryTracker, isEvidenceKind, EVIDENCE_KINDS,
  type CommandEvidence,
} from '../core/mission-evidence.js';
import { initLedger, upsertMission } from '../core/mission-ledger.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

let repo: string;
const POSIX = process.platform !== 'win32';

function g(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'sf-mission-evidence-'));
  g(repo, 'init', '-b', 'main');
  g(repo, 'config', 'user.email', 'test@example.com');
  g(repo, 'config', 'user.name', 'Test');
  writeFileSync(join(repo, 'README.md'), '# demo\n', 'utf-8');
  g(repo, 'add', '.');
  g(repo, 'commit', '-m', 'initial');
  initLedger(repo, 'demo', 'main');
  upsertMission(repo, 'STORY-001', 'Demo');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('evidence kinds', () => {
  it('recognises the declared vocabulary only', () => {
    for (const k of EVIDENCE_KINDS) expect(isEvidenceKind(k)).toBe(true);
    expect(isEvidenceKind('vibes')).toBe(false);
  });
});

describe('writeEvidence', () => {
  it('stamps the envelope with source SHA, environment and payload hash', () => {
    const rel = writeEvidence(repo, 'STORY-001', 'acceptance', { ok: true });
    const record = readEvidence<{ ok: boolean }>(repo, 'STORY-001', 'acceptance')!;

    expect(rel).toBe(join('.ai', 'evidence', 'STORY-001', 'acceptance.json'));
    expect(record.mission_id).toBe('STORY-001');
    expect(record.source_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(record.payload_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.environment.length).toBeGreaterThan(0);
    expect(record.payload.ok).toBe(true);
  });

  it('redacts secrets before they reach the repository (§11)', () => {
    writeEvidence(repo, 'STORY-001', 'security', {
      note: 'auth used sk-ant-abcdefghijklmnopqrstuvwxyz012345 as the key',
    });
    const raw = readFileSync(join(repo, '.ai', 'evidence', 'STORY-001', 'security.json'), 'utf-8');
    expect(raw).not.toContain('sk-ant-abcdefghijklmnopqrstuvwxyz012345');
    expect(raw).toContain('[REDACTED]');
  });

  it('refuses an over-sized payload rather than inlining a log (§15)', () => {
    const huge = { body: 'x'.repeat(300 * 1024) };
    expect(() => writeEvidence(repo, 'STORY-001', 'tests', huge))
      .toThrow(/must reference large artifacts by path/);
  });

  it('rejects an unknown evidence kind', () => {
    expect(() => writeEvidence(repo, 'STORY-001', 'guesswork' as never, {}))
      .toThrow(/Unknown evidence kind/);
  });

  it('returns null when reading evidence that was never written', () => {
    expect(readEvidence(repo, 'STORY-001', 'closeout')).toBeNull();
  });
});

describe('runValidatedCommand — normal termination (§17)', () => {
  it('records a clean run for a command that exits on its own', async () => {
    const evidence = await runValidatedCommand({
      command: 'node', args: ['-e', 'console.log("hello")'], cwd: repo, label: 'hello',
    });

    expect(evidence.exit_code).toBe(0);
    expect(evidence.normal_termination).toBe(true);
    expect(evidence.timed_out).toBe(false);
    expect(evidence.output_tail).toContain('hello');
    expect(isCleanValidation(evidence).clean).toBe(true);
  });

  it('writes the raw log outside .ai/ and references it by path (§15)', async () => {
    const evidence = await runValidatedCommand({
      command: 'node', args: ['-e', 'console.log("x".repeat(100))'], cwd: repo, label: 'big',
    });

    expect(evidence.raw_artifact.startsWith(join('.skillfoundry', 'mission-logs'))).toBe(true);
    expect(existsSync(join(repo, evidence.raw_artifact))).toBe(true);
    expect(evidence.raw_artifact).not.toContain('.ai/');
  });

  it('bounds the retained tail while the full log stays on disk', async () => {
    const evidence = await runValidatedCommand({
      command: 'node',
      args: ['-e', 'for (let i = 0; i < 500; i++) console.log("line " + i)'],
      cwd: repo, label: 'many', tailLines: 10,
    });

    expect(evidence.output_tail.split('\n').length).toBeLessThanOrEqual(10);
    expect(readFileSync(join(repo, evidence.raw_artifact), 'utf-8')).toContain('line 0');
  });

  it('marks a non-zero exit as not clean', async () => {
    const evidence = await runValidatedCommand({
      command: 'node', args: ['-e', 'process.exit(3)'], cwd: repo, label: 'fail',
    });

    expect(evidence.exit_code).toBe(3);
    expect(evidence.normal_termination).toBe(true);
    const clean = isCleanValidation(evidence);
    expect(clean.clean).toBe(false);
    expect(clean.reasons.join(' ')).toMatch(/Exit code 3/);
  });

  it('reports a timed-out run as NOT normal termination even if nothing failed', async () => {
    const evidence = await runValidatedCommand({
      command: 'node', args: ['-e', 'setTimeout(() => {}, 30000)'], cwd: repo,
      timeoutMs: 700, label: 'hang',
    });

    expect(evidence.timed_out).toBe(true);
    expect(evidence.normal_termination).toBe(false);
    const clean = isCleanValidation(evidence);
    expect(clean.clean).toBe(false);
    expect(clean.reasons.join(' ')).toMatch(/Timed out/);
  });

  it('records a spawn failure without throwing', async () => {
    const evidence = await runValidatedCommand({
      command: 'sf-definitely-not-a-real-binary', args: [], cwd: repo, label: 'missing',
    });

    expect(evidence.normal_termination).toBe(false);
    expect(classifyFailure(evidence.output_tail, evidence.exit_code).classification)
      .toBe('ENVIRONMENT_DEFECT');
  });

  it.runIf(POSIX)('detects processes that outlive the command (§17)', async () => {
    const evidence = await runValidatedCommand({
      command: 'sh', args: ['-c', 'sleep 5 & echo started'], cwd: repo, label: 'orphan',
    });

    expect(evidence.exit_code).toBe(0);
    expect(evidence.normal_termination).toBe(true);
    expect(evidence.orphan_check).toBe('ORPHANS_DETECTED');

    // Assertions passing does not make this a clean validation.
    const clean = isCleanValidation(evidence);
    expect(clean.clean).toBe(false);
    expect(clean.reasons.join(' ')).toMatch(/survived|live members/);
  });

  it.runIf(POSIX)('reports CLEAN when nothing survives the run', async () => {
    const evidence = await runValidatedCommand({
      command: 'sh', args: ['-c', 'echo done'], cwd: repo, label: 'clean',
    });
    expect(evidence.orphan_check).toBe('CLEAN');
  });
});

describe('test count parsing', () => {
  it('parses a vitest-style summary', async () => {
    const evidence = await runValidatedCommand({
      command: 'node',
      args: ['-e', 'console.log(" Tests  12 passed | 1 failed | 2 skipped")'],
      cwd: repo, label: 'counts',
    });
    expect(evidence.passed).toBe(12);
    expect(evidence.failed).toBe(1);
    expect(evidence.skipped).toBe(2);
  });

  it('reports the test count, not the file count, from vitest output', async () => {
    const evidence = await runValidatedCommand({
      command: 'node',
      args: ['-e', 'console.log(" Test Files  8 passed (8)\\n      Tests  296 passed (296)")'],
      cwd: repo, label: 'vitest-files',
    });
    expect(evidence.passed).toBe(296);
  });

  it('parses a dotnet-style summary', async () => {
    const evidence = await runValidatedCommand({
      command: 'node',
      args: ['-e', 'console.log("Passed! - Failed: 0, Passed: 42, Skipped: 1, Total: 43")'],
      cwd: repo, label: 'dotnet',
    });
    expect(evidence.passed).toBe(42);
    expect(evidence.failed).toBe(0);
  });

  it('flags failing tests as not clean', async () => {
    const evidence = await runValidatedCommand({
      command: 'node',
      args: ['-e', 'console.log("5 passed, 2 failed"); process.exit(0)'],
      cwd: repo, label: 'failing',
    });
    expect(isCleanValidation(evidence).reasons.join(' ')).toMatch(/2 failing test/);
  });
});

describe('false-green guard for test runs', () => {
  it('refuses a zero exit with no detectable test results', async () => {
    const evidence = await runValidatedCommand({
      command: 'node', args: ['-e', 'console.log("nothing ran")'], cwd: repo, label: 'empty',
    });

    // Without the expectation, this is a perfectly clean command run.
    expect(isCleanValidation(evidence).clean).toBe(true);

    // As a test run, a zero exit that reports nothing proves nothing.
    const verdict = isCleanValidation(evidence, { expectTests: true });
    expect(verdict.clean).toBe(false);
    expect(verdict.reasons.join(' ')).toMatch(/No test results were detected/);
  });

  it('refuses a runner that executed zero tests', async () => {
    const evidence = await runValidatedCommand({
      command: 'node', args: ['-e', 'console.log(" Tests  0 passed")'], cwd: repo, label: 'zero',
    });
    const verdict = isCleanValidation(evidence, { expectTests: true });
    expect(verdict.clean).toBe(false);
    expect(verdict.reasons.join(' ')).toMatch(/zero tests executed/);
  });

  it('accepts a run that genuinely executed tests', async () => {
    const evidence = await runValidatedCommand({
      command: 'node', args: ['-e', 'console.log(" Tests  12 passed")'], cwd: repo, label: 'real',
    });
    expect(isCleanValidation(evidence, { expectTests: true }).clean).toBe(true);
  });
});

describe('classifyProcessState (§18 — RUNNING_QUIET is not STALLED)', () => {
  const base = { alive: true, msSinceOutput: 0, elapsedMs: 1_000, timeoutMs: 600_000 };

  it('reports RUNNING while output is flowing', () => {
    expect(classifyProcessState(base)).toBe('RUNNING');
  });

  it('reports RUNNING_QUIET for a silent process still inside its envelope', () => {
    expect(classifyProcessState({
      ...base, msSinceOutput: 120_000, elapsedMs: 130_000, historicalDurationMs: 300_000,
    })).toBe('RUNNING_QUIET');
  });

  it('does not kill an expensive suite merely because stdout is quiet', () => {
    const state = classifyProcessState({
      ...base, msSinceOutput: 400_000, elapsedMs: 450_000, historicalDurationMs: 600_000,
    });
    expect(state).not.toBe('STALLED');
  });

  it('reports STALLED once it exceeds twice its historical duration', () => {
    expect(classifyProcessState({
      ...base, msSinceOutput: 200_000, elapsedMs: 700_000, historicalDurationMs: 300_000,
    })).toBe('STALLED');
  });

  it('reports STALLED at the hard timeout', () => {
    expect(classifyProcessState({ ...base, elapsedMs: 600_000 })).toBe('STALLED');
  });

  it('distinguishes COMPLETED from FAILED once the process exits', () => {
    expect(classifyProcessState({ ...base, alive: false, exitCode: 0 })).toBe('COMPLETED');
    expect(classifyProcessState({ ...base, alive: false, exitCode: 1 })).toBe('FAILED');
  });
});

describe('classifyFailure (§41 — environment is not product)', () => {
  it('classifies a missing binary as an environment defect', () => {
    const r = classifyFailure('sh: 1: dotnet: command not found', 127);
    expect(r.classification).toBe('ENVIRONMENT_DEFECT');
    expect(r.confidence).toBe('HIGH');
    expect(r.guidance).toMatch(/do not modify product code/i);
  });

  it('classifies a missing project file as an incomplete snapshot', () => {
    const r = classifyFailure('MSBUILD : error MSB1009: No such file or directory Api.csproj', 1);
    expect(r.classification).toBe('REPOSITORY_SNAPSHOT_INCOMPLETE');
  });

  it('classifies a broken worktree', () => {
    const r = classifyFailure('fatal: not a git repository (or any of the parent directories)', 128);
    expect(r.classification).toBe('WORKTREE_DEFECT');
  });

  it('classifies a network failure as an external dependency', () => {
    const r = classifyFailure('Error: connect ECONNREFUSED 127.0.0.1:5432', 1);
    expect(r.classification).toBe('EXTERNAL_DEPENDENCY');
  });

  it('classifies a 403 as an authorization failure and forbids weakening auth', () => {
    const r = classifyFailure('Request failed with 403 Forbidden', 1);
    expect(r.classification).toBe('AUTHORIZATION_FAILURE');
    expect(r.guidance).toMatch(/Do not weaken/);
  });

  it('classifies an assertion as a product defect, but only at MEDIUM confidence', () => {
    const r = classifyFailure('AssertionError: expected 3 to equal 4', 1);
    expect(r.classification).toBe('PRODUCT_DEFECT');
    expect(r.confidence).toBe('MEDIUM');
    expect(r.guidance).toMatch(/TEST_DEFECT/);
  });

  it('returns UNCLASSIFIED rather than guessing', () => {
    const r = classifyFailure('something inscrutable happened', 1);
    expect(r.classification).toBe('UNCLASSIFIED');
    expect(r.guidance).toMatch(/do not default to PRODUCT_DEFECT/i);
  });
});

describe('failure signatures', () => {
  it('is stable across differing paths, line numbers and timings', () => {
    const a = failureSignature('Error: boom at /home/alice/src/x.ts:12:4 in 34ms', 1);
    const b = failureSignature('Error: boom at /var/ci/build/src/x.ts:99:1 in 210ms', 1);
    expect(a).toBe(b);
  });

  it('differs for genuinely different failures', () => {
    expect(failureSignature('Error: boom', 1)).not.toBe(failureSignature('Error: different', 1));
  });

  it('differs when only the exit code changes', () => {
    expect(failureSignature('Error: boom', 1)).not.toBe(failureSignature('Error: boom', 2));
  });
});

describe('adjudicatePreExisting (§42)', () => {
  const evidence = (tail: string, sha: string): CommandEvidence => ({
    command: 'npm', args: ['test'], cwd: repo, exit_code: 1, signal: null,
    normal_termination: true, timed_out: false, duration_seconds: 1,
    orphan_check: 'CLEAN', raw_artifact: 'log.txt', output_tail: tail,
    source_sha: sha, environment: 'test',
  });

  it('refuses an unsupported "probably pre-existing" claim', () => {
    const v = adjudicatePreExisting(null, failureSignature('Error: boom', 1));
    expect(v.substantiated).toBe(false);
    expect(v.reason).toMatch(/No baseline run was recorded/);
    expect(v.reason).toMatch(/caused by this mission/);
  });

  it('substantiates the claim when the baseline reproduces the same failure', () => {
    const baseline = evidence('Error: boom', 'b'.repeat(40));
    const v = adjudicatePreExisting(baseline, failureSignatureOf(baseline));
    expect(v.substantiated).toBe(true);
    expect(v.baseline_sha).toBe('b'.repeat(40));
  });

  it('rejects the claim when the baseline failed differently', () => {
    const baseline = evidence('Error: a totally different failure', 'b'.repeat(40));
    const v = adjudicatePreExisting(baseline, failureSignature('Error: boom', 1));
    expect(v.substantiated).toBe(false);
    expect(v.reason).toMatch(/different failure signature/);
  });
});

describe('RetryTracker (§19)', () => {
  it('rejects a nonsensical budget', () => {
    expect(() => new RetryTracker(0)).toThrow(/at least 1/);
  });

  it('allows the first attempt', () => {
    expect(new RetryTracker(3).shouldRetry().allowed).toBe(true);
  });

  it('stops on NO_PROGRESS when identical evidence repeats with no state change', () => {
    const t = new RetryTracker(5);
    t.record('sig-a', false, 'first attempt');
    expect(t.shouldRetry().allowed).toBe(true);
    t.record('sig-a', false, 'retrying');

    const decision = t.shouldRetry();
    expect(decision.allowed).toBe(false);
    expect(decision.no_progress).toBe(true);
    expect(decision.reason).toMatch(/NO_PROGRESS/);
  });

  it('allows a retry when state actually changed', () => {
    const t = new RetryTracker(5);
    t.record('sig-a', false, 'first');
    t.record('sig-a', true, 'installed the missing dependency');
    expect(t.shouldRetry().allowed).toBe(true);
  });

  it('allows a retry when the failure changed', () => {
    const t = new RetryTracker(5);
    t.record('sig-a', false, 'first');
    t.record('sig-b', false, 'different failure now');
    expect(t.shouldRetry().allowed).toBe(true);
  });

  it('exhausts the budget rather than looping forever', () => {
    const t = new RetryTracker(2);
    t.record('sig-a', true, 'first');
    t.record('sig-b', true, 'second');
    const d = t.shouldRetry();
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/budget exhausted/);
    expect(d.no_progress).toBe(false);
  });

  it('keeps the full attempt history for evidence', () => {
    const t = new RetryTracker(3);
    t.record('sig-a', false, 'first');
    t.record('sig-b', true, 'second');
    const h = t.history();
    expect(h.map((a) => a.attempt)).toEqual([1, 2]);
    expect(h[1].justification).toBe('second');
  });
});
