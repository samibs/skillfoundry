import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock AI runner so pipeline tests don't need real provider
vi.mock('../core/ai-runner.js', () => ({
  runAgentLoop: vi.fn(),
}));

// Mock gates so pipeline tests don't run real builds/tests
vi.mock('../core/gates.js', () => ({
  runAllGates: vi.fn(),
  runSingleGate: vi.fn(),
}));

// Mock micro-gates so pipeline tests don't need real AI
vi.mock('../core/micro-gates.js', () => ({
  runPostStoryGates: vi.fn(),
  runPreTemperGate: vi.fn(),
  formatFindingsForFixer: vi.fn(() => ''),
}));

// Mock finisher so pipeline tests don't run real vitest/git
vi.mock('../core/finisher.js', () => ({
  runFinisher: vi.fn(),
}));

import { runPipeline, scanPRDs, scanStories } from '../core/pipeline.js';
import { runAgentLoop } from '../core/ai-runner.js';
import { runAllGates, runSingleGate } from '../core/gates.js';
import { runPostStoryGates, runPreTemperGate, formatFindingsForFixer } from '../core/micro-gates.js';
import { runFinisher } from '../core/finisher.js';
import type { SfConfig, SfPolicy, FinisherSummary } from '../types.js';

const TEST_DIR = join(tmpdir(), 'sf-pipeline-test-' + Date.now());

const mockConfig: SfConfig = {
  provider: 'test',
  engine: 'test',
  model: 'test-model',
  fallback_provider: '',
  fallback_engine: '',
  monthly_budget_usd: 50,
  run_budget_usd: 5,
  memory_sync_enabled: false,
  memory_sync_remote: '',
  route_local_first: false,
  local_provider: '',
  local_model: '',
  context_window: 0,
};

const mockPolicy: SfPolicy = {
  allow_shell: true,
  allow_network: false,
  allow_paths: [],
  redact: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mkdirSync(TEST_DIR, { recursive: true });

  // Default micro-gate mocks: all pass (overridden in specific tests)
  vi.mocked(runPostStoryGates).mockResolvedValue([
    { gate: 'MG1', agent: 'security', verdict: 'PASS', findings: [], summary: 'Clean', costUsd: 0, turnCount: 1, durationMs: 50 },
    { gate: 'MG2', agent: 'standards', verdict: 'PASS', findings: [], summary: 'Clean', costUsd: 0, turnCount: 1, durationMs: 50 },
  ]);
  vi.mocked(runPreTemperGate).mockResolvedValue({
    gate: 'MG3', agent: 'review', verdict: 'PASS', findings: [], summary: 'Consistent', costUsd: 0, turnCount: 1, durationMs: 50,
  });

  // Default finisher mock: all ok
  vi.mocked(runFinisher).mockResolvedValue({
    checks: [
      { check: 'version', status: 'ok', detail: 'v2.0.14 consistent', fixed: false, durationMs: 5 },
      { check: 'test-count', status: 'ok', detail: '328 tests', fixed: false, durationMs: 5 },
      { check: 'architecture', status: 'ok', detail: '10 modules', fixed: false, durationMs: 5 },
      { check: 'changelog', status: 'ok', detail: '[2.0.14] found', fixed: false, durationMs: 5 },
      { check: 'git-clean', status: 'ok', detail: 'Working tree clean', fixed: false, durationMs: 5 },
    ],
    totalChecks: 5,
    drifted: 0,
    fixed: 0,
    ok: 5,
    errors: 0,
    durationMs: 25,
  });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('scanPRDs', () => {
  it('returns empty array when genesis/ does not exist', () => {
    const result = scanPRDs(TEST_DIR);
    expect(result).toEqual([]);
  });

  it('finds PRDs and excludes TEMPLATE.md', () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-auth.md'), '# Authentication Feature\n\nstatus: APPROVED\n');
    writeFileSync(join(genesisDir, '2026-01-02-payments.md'), '# Payment Integration\n\nstatus: DRAFT\n');
    writeFileSync(join(genesisDir, 'TEMPLATE.md'), '# Template\n');

    const result = scanPRDs(TEST_DIR);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Authentication Feature');
    expect(result[0].status).toBe('APPROVED');
    expect(result[0].slug).toBe('auth');
    expect(result[1].status).toBe('DRAFT');
  });
});

describe('scanStories', () => {
  it('returns empty array when docs/stories/ does not exist', () => {
    const result = scanStories(TEST_DIR);
    expect(result).toEqual([]);
  });

  it('counts completed stories', () => {
    const storyDir = join(TEST_DIR, 'docs', 'stories', 'auth');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-models.md'), '# Story 001\nstatus: DONE\n');
    writeFileSync(join(storyDir, 'STORY-002-api.md'), '# Story 002\nstatus: IN_PROGRESS\n');

    const result = scanStories(TEST_DIR);
    expect(result).toHaveLength(1);
    expect(result[0].prd).toBe('auth');
    expect(result[0].stories).toHaveLength(2);
    expect(result[0].completed).toBe(1);
  });
});

describe('runPipeline', () => {
  it('fails IGNITE when no PRDs exist', async () => {
    const result = await runPipeline({
      config: mockConfig,
      policy: mockPolicy,
      workDir: TEST_DIR,
    });

    expect(result.phases[0].name).toBe('IGNITE');
    expect(result.phases[0].status).toBe('failed');
    expect(result.storiesTotal).toBe(0);
  });

  it('skips story generation when stories already exist', async () => {
    // Create PRD
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-auth.md'), '# Auth Feature\n\nstatus: APPROVED\n');

    // Create existing stories
    const storyDir = join(TEST_DIR, 'docs', 'stories', 'auth');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-models.md'), '# STORY-001: Auth Models\nstatus: PENDING\n\n## Description\nCreate auth models.\n');

    // Mock story execution
    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Implementation complete.',
      turnCount: 5,
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalCostUsd: 0.01,
      aborted: false,
    });

    // Mock T1 gate passing
    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T1',
      name: 'Banned Patterns',
      status: 'pass',
      detail: 'Clean',
      durationMs: 100,
    });

    // Mock full gate run
    vi.mocked(runAllGates).mockResolvedValue({
      gates: [
        { tier: 'T1', name: 'Banned Patterns', status: 'pass', detail: '', durationMs: 50 },
        { tier: 'T4', name: 'Security', status: 'pass', detail: '', durationMs: 50 },
      ],
      passed: 2,
      failed: 0,
      warned: 0,
      skipped: 0,
      totalMs: 100,
      verdict: 'PASS',
    });

    const result = await runPipeline({
      config: mockConfig,
      policy: mockPolicy,
      workDir: TEST_DIR,
    });

    // Should NOT have called runAgentLoop for story generation (tools: [] call)
    // but SHOULD have called it for story execution (tools: ALL_TOOLS call)
    expect(result.phases[0].status).toBe('passed'); // IGNITE
    expect(result.phases[1].status).toBe('passed'); // PLAN (reused existing)
    expect(result.storiesTotal).toBe(1);
    expect(result.storiesCompleted).toBe(1);
    expect(runAgentLoop).toHaveBeenCalledTimes(1); // Only story execution, no generation
  });

  it('generates stories from PRD when none exist', async () => {
    // Create PRD
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-feature.md'), '# New Feature\n\nstatus: APPROVED\n\n## Overview\nBuild a new feature.\n');

    // Mock story generation
    vi.mocked(runAgentLoop)
      .mockResolvedValueOnce({
        // Story generation call (tools: [])
        content: '---STORY---\n# STORY-001: Setup Foundation\nstatus: PENDING\n\n## Description\nSetup the base.\n\n## Acceptance Criteria\n- [ ] Base is ready\n\n## Technical Approach\nCreate files.\n\n## Files Affected\n- src/index.ts\n---STORY---',
        turnCount: 1,
        totalInputTokens: 500,
        totalOutputTokens: 200,
        totalCostUsd: 0.005,
        aborted: false,
      })
      .mockResolvedValueOnce({
        // Story execution call
        content: 'Done implementing.',
        turnCount: 3,
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        totalCostUsd: 0.01,
        aborted: false,
      });

    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T1',
      name: 'Banned Patterns',
      status: 'pass',
      detail: 'Clean',
      durationMs: 50,
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [
        { tier: 'T1', name: 'Banned Patterns', status: 'pass', detail: '', durationMs: 50 },
        { tier: 'T4', name: 'Security', status: 'pass', detail: '', durationMs: 50 },
      ],
      passed: 2,
      failed: 0,
      warned: 0,
      skipped: 0,
      totalMs: 100,
      verdict: 'PASS',
    });

    const result = await runPipeline({
      config: mockConfig,
      policy: mockPolicy,
      workDir: TEST_DIR,
    });

    expect(result.phases[1].status).toBe('passed'); // PLAN
    expect(result.storiesTotal).toBe(1);
    expect(result.storiesCompleted).toBe(1);

    // Verify story file was created
    const storyDir = join(TEST_DIR, 'docs', 'stories', 'feature');
    expect(existsSync(storyDir)).toBe(true);
    const storyFiles = readdirSync(storyDir).filter((f) => f.startsWith('STORY-'));
    expect(storyFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('retries with fixer when T1 gate fails', async () => {
    // Create PRD + story
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-fix.md'), '# Fix Feature\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'fix');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-fix.md'), '# STORY-001: Apply Fix\nstatus: PENDING\n\n## Description\nFix it.\n');

    // Story execution
    vi.mocked(runAgentLoop)
      .mockResolvedValueOnce({
        content: 'Implemented with TODO marker.',
        turnCount: 3,
        totalInputTokens: 500,
        totalOutputTokens: 200,
        totalCostUsd: 0.005,
        aborted: false,
      })
      // Fixer execution
      .mockResolvedValueOnce({
        content: 'Fixed TODO markers.',
        turnCount: 2,
        totalInputTokens: 300,
        totalOutputTokens: 100,
        totalCostUsd: 0.003,
        aborted: false,
      });

    // T1 fails first, passes after fix
    vi.mocked(runSingleGate)
      .mockReturnValueOnce({
        tier: 'T1',
        name: 'Banned Patterns',
        status: 'fail',
        detail: 'Found TODO markers',
        durationMs: 50,
      })
      .mockReturnValueOnce({
        tier: 'T1',
        name: 'Banned Patterns',
        status: 'pass',
        detail: 'Clean',
        durationMs: 50,
      });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [
        { tier: 'T1', name: 'Banned Patterns', status: 'pass', detail: '', durationMs: 50 },
        { tier: 'T4', name: 'Security', status: 'pass', detail: '', durationMs: 50 },
      ],
      passed: 2,
      failed: 0,
      warned: 0,
      skipped: 0,
      totalMs: 100,
      verdict: 'PASS',
    });

    const result = await runPipeline({
      config: mockConfig,
      policy: mockPolicy,
      workDir: TEST_DIR,
    });

    expect(result.storiesCompleted).toBe(1);
    expect(result.storiesFailed).toBe(0);
    expect(runAgentLoop).toHaveBeenCalledTimes(2); // 1 story + 1 fixer
  });

  it('marks story as failed when fixer retries exhausted', async () => {
    // Create PRD + story
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-bad.md'), '# Bad Feature\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'bad');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-bad.md'), '# STORY-001: Bad Code\nstatus: PENDING\n\n## Description\nBad.\n');

    // Story + 2 fixer attempts
    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Done.',
      turnCount: 3,
      totalInputTokens: 500,
      totalOutputTokens: 200,
      totalCostUsd: 0.005,
      aborted: false,
    });

    // T1 always fails
    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T1',
      name: 'Banned Patterns',
      status: 'fail',
      detail: 'Unfixable pattern',
      durationMs: 50,
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [
        { tier: 'T1', name: 'Banned Patterns', status: 'fail', detail: '', durationMs: 50 },
      ],
      passed: 0,
      failed: 1,
      warned: 0,
      skipped: 0,
      totalMs: 50,
      verdict: 'FAIL',
    });

    const result = await runPipeline({
      config: mockConfig,
      policy: mockPolicy,
      workDir: TEST_DIR,
    });

    expect(result.storiesCompleted).toBe(0);
    expect(result.storiesFailed).toBe(1);
    // 1 story + 2 fixer attempts = 3
    expect(runAgentLoop).toHaveBeenCalledTimes(3);
  });

  it('persists run metadata to .skillfoundry/runs/', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-meta.md'), '# Meta Test\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'meta');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-test.md'), '# STORY-001: Test\nstatus: PENDING\n');

    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Done.',
      turnCount: 1,
      totalInputTokens: 100,
      totalOutputTokens: 50,
      totalCostUsd: 0.001,
      aborted: false,
    });

    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T1',
      name: 'Banned Patterns',
      status: 'pass',
      detail: 'Clean',
      durationMs: 50,
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [],
      passed: 0,
      failed: 0,
      warned: 0,
      skipped: 0,
      totalMs: 0,
      verdict: 'PASS',
    });

    const result = await runPipeline({
      config: mockConfig,
      policy: mockPolicy,
      workDir: TEST_DIR,
    });

    // Verify run file exists
    const runsDir = join(TEST_DIR, '.skillfoundry', 'runs');
    expect(existsSync(runsDir)).toBe(true);

    const runFiles = readdirSync(runsDir).filter((f) => f.endsWith('.json'));
    expect(runFiles).toHaveLength(1);

    const runData = JSON.parse(readFileSync(join(runsDir, runFiles[0]), 'utf-8'));
    expect(runData.run_id).toBe(result.runId);
    expect(runData.status).toBe('COMPLETED');
    expect(runData.prd_files).toContain('genesis/2026-01-01-meta.md');
    expect(runData.totalCostUsd).toBeGreaterThan(0);
  });

  it('filters PRDs when prdFilter is provided', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-auth.md'), '# Auth\n\nstatus: APPROVED\n');
    writeFileSync(join(genesisDir, '2026-01-02-payments.md'), '# Payments\n\nstatus: APPROVED\n');

    // No stories — but since we filter to auth, pipeline should only process auth
    const storyDir = join(TEST_DIR, 'docs', 'stories', 'auth');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-login.md'), '# STORY-001: Login\nstatus: PENDING\n');

    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Done.',
      turnCount: 1,
      totalInputTokens: 100,
      totalOutputTokens: 50,
      totalCostUsd: 0.001,
      aborted: false,
    });

    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T1', name: 'Banned Patterns', status: 'pass', detail: '', durationMs: 50,
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [],
      passed: 0, failed: 0, warned: 0, skipped: 0,
      totalMs: 0,
      verdict: 'PASS',
    });

    const result = await runPipeline({
      config: mockConfig,
      policy: mockPolicy,
      workDir: TEST_DIR,
      prdFilter: 'auth',
    });

    expect(result.storiesTotal).toBe(1);
    expect(result.phases[0].detail).toContain('1 PRD');
  });

  it('fires pipeline callbacks during execution', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-cb.md'), '# Callback Test\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'cb');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-test.md'), '# STORY-001: Test\nstatus: PENDING\n');

    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Done.',
      turnCount: 1,
      totalInputTokens: 100,
      totalOutputTokens: 50,
      totalCostUsd: 0.001,
      aborted: false,
    });

    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T1', name: 'Banned Patterns', status: 'pass', detail: '', durationMs: 50,
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [],
      passed: 0, failed: 0, warned: 0, skipped: 0,
      totalMs: 0,
      verdict: 'PASS',
    });

    const onPhaseStart = vi.fn();
    const onPhaseComplete = vi.fn();
    const onStoryStart = vi.fn();
    const onStoryComplete = vi.fn();

    await runPipeline({
      config: mockConfig,
      policy: mockPolicy,
      workDir: TEST_DIR,
      callbacks: {
        onPhaseStart,
        onPhaseComplete,
        onStoryStart,
        onStoryComplete,
      },
    });

    // Should fire for all 6 phases
    expect(onPhaseStart).toHaveBeenCalledWith('IGNITE', expect.any(String));
    expect(onPhaseStart).toHaveBeenCalledWith('FORGE', expect.any(String));
    expect(onPhaseComplete).toHaveBeenCalledWith('DEBRIEF', 'passed');

    // Should fire for story
    expect(onStoryStart).toHaveBeenCalledWith('STORY-001-test.md', 0, 1);
    expect(onStoryComplete).toHaveBeenCalledWith('STORY-001-test.md', true, expect.any(Number));
  });

  // ── Micro-gate integration tests ──────────────────────────

  it('runs post-story micro-gates and pre-temper gate', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-mg.md'), '# MG Test\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'mg');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-test.md'), '# STORY-001: Test\nstatus: PENDING\n');

    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Done.', turnCount: 1,
      totalInputTokens: 100, totalOutputTokens: 50, totalCostUsd: 0.001, aborted: false,
    });

    vi.mocked(runPostStoryGates).mockResolvedValue([
      { gate: 'MG1', agent: 'security', verdict: 'PASS', findings: [], summary: 'Clean', costUsd: 0.005, turnCount: 2, durationMs: 200 },
      { gate: 'MG2', agent: 'standards', verdict: 'PASS', findings: [], summary: 'Clean', costUsd: 0.004, turnCount: 1, durationMs: 150 },
    ]);

    vi.mocked(runPreTemperGate).mockResolvedValue({
      gate: 'MG3', agent: 'review', verdict: 'PASS', findings: [], summary: 'Consistent', costUsd: 0.006, turnCount: 2, durationMs: 300,
    });

    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T1', name: 'Banned Patterns', status: 'pass', detail: 'Clean', durationMs: 50,
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [], passed: 0, failed: 0, warned: 0, skipped: 0, totalMs: 0, verdict: 'PASS',
    });

    const result = await runPipeline({
      config: mockConfig, policy: mockPolicy, workDir: TEST_DIR,
    });

    expect(runPostStoryGates).toHaveBeenCalledTimes(1);
    expect(runPreTemperGate).toHaveBeenCalledTimes(1);
    expect(result.microGateSummary).toBeDefined();
    expect(result.microGateSummary!.totalRun).toBe(3);
    expect(result.microGateSummary!.totalPassed).toBe(3);
    expect(result.totalCostUsd).toBeGreaterThan(0.001);
  });

  it('triggers fixer when micro-gate fails even if T1 passes', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-sec.md'), '# Security Test\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'sec');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-api.md'), '# STORY-001: API\nstatus: PENDING\n');

    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Done.', turnCount: 1,
      totalInputTokens: 100, totalOutputTokens: 50, totalCostUsd: 0.001, aborted: false,
    });

    // MG1 fails on first call (story execution), passes on second (after fixer)
    vi.mocked(runPostStoryGates)
      .mockResolvedValueOnce([
        { gate: 'MG1', agent: 'security', verdict: 'FAIL', findings: [{ severity: 'HIGH', description: 'SQL injection', location: 'src/db.ts:10' }], summary: 'Issue', costUsd: 0.005, turnCount: 2, durationMs: 200 },
        { gate: 'MG2', agent: 'standards', verdict: 'PASS', findings: [], summary: 'OK', costUsd: 0.004, turnCount: 1, durationMs: 150 },
      ]);

    // T1 passes throughout
    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T1', name: 'Banned Patterns', status: 'pass', detail: 'Clean', durationMs: 50,
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [], passed: 0, failed: 0, warned: 0, skipped: 0, totalMs: 0, verdict: 'PASS',
    });

    vi.mocked(formatFindingsForFixer).mockReturnValue('[MG1] security — FAIL\n  - [HIGH] SQL injection (src/db.ts:10)');

    const result = await runPipeline({
      config: mockConfig, policy: mockPolicy, workDir: TEST_DIR,
    });

    // Fixer should have been called (runAgentLoop called twice: 1 story + 1 fixer)
    expect(runAgentLoop).toHaveBeenCalledTimes(2);
    expect(result.storiesCompleted).toBe(1);
  });

  it('fires onMicroGateResult callbacks for all micro-gates', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-cb2.md'), '# CB Test\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'cb2');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-test.md'), '# STORY-001: Test\nstatus: PENDING\n');

    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Done.', turnCount: 1,
      totalInputTokens: 100, totalOutputTokens: 50, totalCostUsd: 0.001, aborted: false,
    });

    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T1', name: 'Banned Patterns', status: 'pass', detail: '', durationMs: 50,
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [], passed: 0, failed: 0, warned: 0, skipped: 0, totalMs: 0, verdict: 'PASS',
    });

    const onMicroGateResult = vi.fn();

    await runPipeline({
      config: mockConfig, policy: mockPolicy, workDir: TEST_DIR,
      callbacks: { onMicroGateResult },
    });

    // MG1 + MG2 per story + MG3 pre-temper = 3 callbacks
    expect(onMicroGateResult).toHaveBeenCalledTimes(3);
    expect(onMicroGateResult).toHaveBeenCalledWith(
      expect.objectContaining({ gate: 'MG1' }),
    );
    expect(onMicroGateResult).toHaveBeenCalledWith(
      expect.objectContaining({ gate: 'MG3' }),
    );
  });

  it('MG3 pre-temper gate is advisory only and does not block pipeline', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-adv.md'), '# Advisory Test\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'adv');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-test.md'), '# STORY-001: Test\nstatus: PENDING\n');

    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Done.', turnCount: 1,
      totalInputTokens: 100, totalOutputTokens: 50, totalCostUsd: 0.001, aborted: false,
    });

    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T1', name: 'Banned Patterns', status: 'pass', detail: '', durationMs: 50,
    });

    // MG3 FAILS but should NOT block the pipeline
    vi.mocked(runPreTemperGate).mockResolvedValue({
      gate: 'MG3', agent: 'review', verdict: 'FAIL',
      findings: [{ severity: 'HIGH', description: 'Cross-story inconsistency' }],
      summary: 'Issues found across stories', costUsd: 0.008, turnCount: 3, durationMs: 500,
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [], passed: 6, failed: 0, warned: 0, skipped: 0, totalMs: 100, verdict: 'PASS',
    });

    const result = await runPipeline({
      config: mockConfig, policy: mockPolicy, workDir: TEST_DIR,
    });

    // Pipeline should STILL pass — MG3 is advisory
    expect(result.storiesCompleted).toBe(1);
    expect(result.gateVerdict).toBe('PASS');
    // But the advisory should be recorded
    expect(result.microGateSummary?.preTemperAdvisory?.verdict).toBe('FAIL');
  });

  // ── Finisher integration tests ─────────────────────────────

  it('runs FINISH phase after DEBRIEF and attaches finisherSummary', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-fin.md'), '# Finisher Test\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'fin');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-test.md'), '# STORY-001: Test\nstatus: PENDING\n');

    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Done.', turnCount: 1,
      totalInputTokens: 100, totalOutputTokens: 50, totalCostUsd: 0.001, aborted: false,
    });

    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T1', name: 'Banned Patterns', status: 'pass', detail: '', durationMs: 50,
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [], passed: 0, failed: 0, warned: 0, skipped: 0, totalMs: 0, verdict: 'PASS',
    });

    vi.mocked(runFinisher).mockResolvedValue({
      checks: [
        { check: 'version', status: 'ok', detail: 'Bumped 2.0.14 → 2.0.15', fixed: true, durationMs: 10 },
        { check: 'test-count', status: 'ok', detail: '328 tests', fixed: false, durationMs: 10 },
        { check: 'architecture', status: 'drift', detail: 'missing from docs: finisher.ts', fixed: false, durationMs: 5 },
        { check: 'changelog', status: 'ok', detail: 'Inserted [2.0.15] placeholder', fixed: true, durationMs: 5 },
        { check: 'git-clean', status: 'drift', detail: '3 modified', fixed: false, durationMs: 5 },
      ],
      totalChecks: 5, drifted: 2, fixed: 2, ok: 3, errors: 0, durationMs: 35,
      newVersion: '2.0.15',
    });

    const result = await runPipeline({
      config: mockConfig, policy: mockPolicy, workDir: TEST_DIR,
    });

    // FINISH phase should exist and be passed
    const finishPhase = result.phases.find((p) => p.name === 'FINISH');
    expect(finishPhase).toBeDefined();
    expect(finishPhase!.status).toBe('passed');

    // finisherSummary should be attached
    expect(result.finisherSummary).toBeDefined();
    expect(result.finisherSummary!.newVersion).toBe('2.0.15');
    expect(result.finisherSummary!.fixed).toBe(2);

    // FINISH should come after DEBRIEF
    const phaseNames = result.phases.map((p) => p.name);
    const debriefIdx = phaseNames.indexOf('DEBRIEF');
    const finishIdx = phaseNames.indexOf('FINISH');
    expect(finishIdx).toBeGreaterThan(debriefIdx);
  });

  it('fires onFinisherCheck callbacks during FINISH phase', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-fcb.md'), '# Finisher CB\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'fcb');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-test.md'), '# STORY-001: Test\nstatus: PENDING\n');

    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Done.', turnCount: 1,
      totalInputTokens: 100, totalOutputTokens: 50, totalCostUsd: 0.001, aborted: false,
    });

    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T1', name: 'Banned Patterns', status: 'pass', detail: '', durationMs: 50,
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [], passed: 0, failed: 0, warned: 0, skipped: 0, totalMs: 0, verdict: 'PASS',
    });

    // Mock finisher to call onCheck for each check
    vi.mocked(runFinisher).mockImplementation(async (options) => {
      const checks = [
        { check: 'version', status: 'ok' as const, detail: 'ok', fixed: false, durationMs: 5 },
        { check: 'test-count', status: 'ok' as const, detail: 'ok', fixed: false, durationMs: 5 },
      ];
      for (const c of checks) {
        options.onCheck?.(c);
      }
      return { checks, totalChecks: 2, drifted: 0, fixed: 0, ok: 2, errors: 0, durationMs: 10 };
    });

    const onFinisherCheck = vi.fn();

    await runPipeline({
      config: mockConfig, policy: mockPolicy, workDir: TEST_DIR,
      callbacks: { onFinisherCheck },
    });

    expect(onFinisherCheck).toHaveBeenCalledTimes(2);
    expect(onFinisherCheck).toHaveBeenCalledWith(expect.objectContaining({ check: 'version' }));
    expect(onFinisherCheck).toHaveBeenCalledWith(expect.objectContaining({ check: 'test-count' }));
  });
});
