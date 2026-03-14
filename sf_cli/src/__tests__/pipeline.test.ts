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
  runPreGenerationGate: vi.fn(),
  runTestDocGate: vi.fn(),
  formatFindingsForFixer: vi.fn(() => ''),
}));

// Mock finisher so pipeline tests don't run real vitest/git
vi.mock('../core/finisher.js', () => ({
  runFinisher: vi.fn(),
}));

// Mock memory harvester so pipeline tests don't write to real memory_bank/
vi.mock('../core/memory-harvest.js', () => ({
  harvestRunMemory: vi.fn(() => ({ entriesWritten: 0 })),
}));

import { runPipeline, scanPRDs, scanStories } from '../core/pipeline.js';
import { runAgentLoop } from '../core/ai-runner.js';
import { runAllGates, runSingleGate } from '../core/gates.js';
import { runPostStoryGates, runPreTemperGate, runPreGenerationGate, runTestDocGate, formatFindingsForFixer } from '../core/micro-gates.js';
import { runFinisher } from '../core/finisher.js';
import { harvestRunMemory } from '../core/memory-harvest.js';
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
  log_level: 'error',
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
  vi.mocked(runPreGenerationGate).mockResolvedValue({
    gate: 'MG0', agent: 'ac-validator', verdict: 'PASS', findings: [], summary: 'All criteria verifiable', costUsd: 0, turnCount: 1, durationMs: 50,
  });
  vi.mocked(runTestDocGate).mockResolvedValue({
    gate: 'MG1.5', agent: 'test-docs', verdict: 'PASS', findings: [], summary: 'All tests documented', costUsd: 0, turnCount: 1, durationMs: 50,
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
    // 1 story execution + 1 tester remediation (no test files in temp dir)
    expect(runAgentLoop).toHaveBeenCalledTimes(2);
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

  it('story completes when T2/T5 pass (quality review deferred to POLISH)', async () => {
    // Create PRD + story
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-fix.md'), '# Fix Feature\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'fix');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-fix.md'), '# STORY-001: Apply Fix\nstatus: PENDING\n\n## Description\nFix it.\n');

    // Story execution only — no fixer needed since T2/T5 pass
    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Implemented with TODO marker.',
      turnCount: 3,
      totalInputTokens: 500,
      totalOutputTokens: 200,
      totalCostUsd: 0.005,
      aborted: false,
    });

    // T2/T5 pass — code compiles, no fixer needed during FORGE
    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T2',
      name: 'Type Check',
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

    // T2/T5 pass — story should complete, no fixer triggered during FORGE
    expect(result.storiesCompleted).toBe(1);
    expect(result.storiesFailed).toBe(0);
    // 1 story execution + 1 tester remediation (no test files in temp dir)
    expect(runAgentLoop).toHaveBeenCalledTimes(2);
  });

  it('marks story as failed when T2/T5 fixer retries exhausted', async () => {
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

    // T2/T5 always FAIL — unfixable compilation errors
    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T2',
      name: 'Type Check',
      status: 'fail',
      detail: 'Unfixable type errors',
      durationMs: 50,
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [
        { tier: 'T1', name: 'Banned Patterns', status: 'pass', detail: '', durationMs: 50 },
      ],
      passed: 1,
      failed: 0,
      warned: 0,
      skipped: 0,
      totalMs: 50,
      verdict: 'PASS',
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

    const runFiles = readdirSync(runsDir).filter((f) => f.endsWith('.json') && !f.includes('-issues'));
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

    // Should fire for all 8 phases (IGNITE, PLAN, FORGE, POLISH, TEMPER, INSPECT, DEBRIEF, FINISH)
    expect(onPhaseStart).toHaveBeenCalledWith('IGNITE', expect.any(String));
    expect(onPhaseStart).toHaveBeenCalledWith('FORGE', expect.any(String));
    expect(onPhaseStart).toHaveBeenCalledWith('POLISH', expect.any(String));
    expect(onPhaseComplete).toHaveBeenCalledWith('POLISH', 'passed');
    expect(onPhaseComplete).toHaveBeenCalledWith('DEBRIEF', 'passed');

    // Should fire for story
    expect(onStoryStart).toHaveBeenCalledWith('STORY-001-test.md', 0, 1);
    expect(onStoryComplete).toHaveBeenCalledWith('STORY-001-test.md', true, expect.any(Number));
  });

  it('marks story file as DONE after successful completion', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-mark.md'), '# Mark Test\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'mark');
    mkdirSync(storyDir, { recursive: true });
    const storyPath = join(storyDir, 'STORY-001-test.md');
    writeFileSync(storyPath, '# STORY-001: Test\nstatus: PENDING\n\n## Description\nTest.\n');

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

    await runPipeline({
      config: mockConfig, policy: mockPolicy, workDir: TEST_DIR,
    });

    // Story file should now have status: DONE
    const content = readFileSync(storyPath, 'utf-8');
    expect(content).toMatch(/status:\s*DONE/);
    expect(content).not.toMatch(/status:\s*PENDING/);
  });

  it('skips already-done stories on re-run (pipeline resume)', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-resume.md'), '# Resume Test\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'resume');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-done.md'), '# STORY-001: Done\nstatus: DONE\n');
    writeFileSync(join(storyDir, 'STORY-002-pending.md'), '# STORY-002: Pending\nstatus: PENDING\n');

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

    const onStoryStart = vi.fn();

    const result = await runPipeline({
      config: mockConfig, policy: mockPolicy, workDir: TEST_DIR,
      callbacks: { onStoryStart },
    });

    // Should show 2 total stories but only execute the pending one
    expect(result.storiesTotal).toBe(2);
    expect(result.storiesCompleted).toBe(2); // 1 already done + 1 newly completed
    expect(onStoryStart).toHaveBeenCalledTimes(1); // Only STORY-002
    expect(onStoryStart).toHaveBeenCalledWith('STORY-002-pending.md', 0, 1);
    // 1 story execution + 1 tester remediation (no test files in temp dir)
    expect(runAgentLoop).toHaveBeenCalledTimes(2);
  });

  // ── Micro-gate integration tests ──────────────────────────

  it('POLISH phase runs micro-gates and pre-temper gate runs after', async () => {
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
    expect(result.microGateSummary!.totalRun).toBe(5); // MG0 + MG1 + MG2 + MG1.5 + MG3
    expect(result.microGateSummary!.totalPassed).toBe(5);
    expect(result.totalCostUsd).toBeGreaterThan(0.001);
  });

  it('POLISH phase triggers fixer when micro-gate fails', async () => {
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

    // MG1 fails on first call (POLISH review), passes on second (after fixer re-check)
    vi.mocked(runPostStoryGates)
      .mockResolvedValueOnce([
        { gate: 'MG1', agent: 'security', verdict: 'FAIL', findings: [{ severity: 'HIGH', description: 'SQL injection', location: 'src/db.ts:10' }], summary: 'Issue', costUsd: 0.005, turnCount: 2, durationMs: 200 },
        { gate: 'MG2', agent: 'standards', verdict: 'PASS', findings: [], summary: 'OK', costUsd: 0.004, turnCount: 1, durationMs: 150 },
      ]);

    // T2/T5 pass — story completes, reaches POLISH
    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T2', name: 'Type Check', status: 'pass', detail: 'Clean', durationMs: 50,
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [], passed: 0, failed: 0, warned: 0, skipped: 0, totalMs: 0, verdict: 'PASS',
    });

    vi.mocked(formatFindingsForFixer).mockReturnValue('[MG1] security — FAIL\n  - [HIGH] SQL injection (src/db.ts:10)');

    const result = await runPipeline({
      config: mockConfig, policy: mockPolicy, workDir: TEST_DIR,
    });

    // 1 story execution + 1 tester remediation + 1 POLISH fixer
    expect(runAgentLoop).toHaveBeenCalledTimes(3);
    expect(result.storiesCompleted).toBe(1);
    // Story was NOT failed — POLISH doesn't block stories
    expect(result.storiesFailed).toBe(0);
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

    // MG0 (FORGE) + MG1 + MG2 + MG1.5 (POLISH) + MG3 (pre-temper) = 5 callbacks
    expect(onMicroGateResult).toHaveBeenCalledTimes(5);
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

  // ── POLISH phase tests ──────────────────────────────────────

  it('POLISH phase appears in phases array between FORGE and TEMPER', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-pol.md'), '# Polish Test\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'pol');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-test.md'), '# STORY-001: Test\nstatus: PENDING\n');

    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Done.', turnCount: 1,
      totalInputTokens: 100, totalOutputTokens: 50, totalCostUsd: 0.001, aborted: false,
    });

    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T2', name: 'Type Check', status: 'pass', detail: '', durationMs: 50,
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [], passed: 0, failed: 0, warned: 0, skipped: 0, totalMs: 0, verdict: 'PASS',
    });

    const result = await runPipeline({
      config: mockConfig, policy: mockPolicy, workDir: TEST_DIR,
    });

    const phaseNames = result.phases.map((p) => p.name);
    expect(phaseNames).toEqual(['IGNITE', 'PLAN', 'FORGE', 'POLISH', 'TEMPER', 'INSPECT', 'DEBRIEF', 'FINISH']);
    const polishPhase = result.phases.find((p) => p.name === 'POLISH');
    expect(polishPhase).toBeDefined();
    expect(polishPhase!.status).toBe('passed');
  });

  it('POLISH phase does not block pipeline even with MG failures', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-noblk.md'), '# NoBlock Test\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'noblk');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-test.md'), '# STORY-001: Test\nstatus: PENDING\n');

    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Done.', turnCount: 1,
      totalInputTokens: 100, totalOutputTokens: 50, totalCostUsd: 0.001, aborted: false,
    });

    // T2/T5 pass — story completes
    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T2', name: 'Type Check', status: 'pass', detail: '', durationMs: 50,
    });

    // MG1 always FAILS in POLISH — but POLISH should NOT block pipeline
    vi.mocked(runPostStoryGates).mockResolvedValue([
      { gate: 'MG1', agent: 'security', verdict: 'FAIL', findings: [{ severity: 'HIGH', description: 'Issue' }], summary: 'Bad', costUsd: 0.005, turnCount: 2, durationMs: 200 },
      { gate: 'MG2', agent: 'standards', verdict: 'PASS', findings: [], summary: 'OK', costUsd: 0.004, turnCount: 1, durationMs: 150 },
    ]);

    vi.mocked(formatFindingsForFixer).mockReturnValue('[MG1] security — FAIL\n  - [HIGH] Issue');

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [], passed: 6, failed: 0, warned: 0, skipped: 0, totalMs: 100, verdict: 'PASS',
    });

    const result = await runPipeline({
      config: mockConfig, policy: mockPolicy, workDir: TEST_DIR,
    });

    // Story should be completed (not failed — POLISH doesn't fail stories)
    expect(result.storiesCompleted).toBe(1);
    expect(result.storiesFailed).toBe(0);
    // POLISH phase always passes (TEMPER is the real gate)
    const polishPhase = result.phases.find((p) => p.name === 'POLISH');
    expect(polishPhase!.status).toBe('passed');
    // Pipeline should still pass if TEMPER passes
    expect(result.gateVerdict).toBe('PASS');
  });

  it('stories fail only on T2/T5 compilation failures, not MG failures', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-comp.md'), '# Compile Test\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'comp');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-test.md'), '# STORY-001: Test\nstatus: PENDING\n');

    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Done.', turnCount: 1,
      totalInputTokens: 100, totalOutputTokens: 50, totalCostUsd: 0.001, aborted: false,
    });

    // T2 fails (compilation error) — should fail the story
    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T2', name: 'Type Check', status: 'fail', detail: 'TS2345: type error', durationMs: 50,
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [], passed: 0, failed: 0, warned: 0, skipped: 0, totalMs: 0, verdict: 'PASS',
    });

    const result = await runPipeline({
      config: mockConfig, policy: mockPolicy, workDir: TEST_DIR,
    });

    // Story should fail due to T2/T5 failure (after 2 fixer attempts)
    expect(result.storiesFailed).toBe(1);
    expect(result.storiesCompleted).toBe(0);
  });

  it('T2/T5 smoke test runs per-story during FORGE', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-smoke.md'), '# Smoke Test\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'smoke');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-a.md'), '# STORY-001: A\nstatus: PENDING\n');
    writeFileSync(join(storyDir, 'STORY-002-b.md'), '# STORY-002: B\nstatus: PENDING\n');

    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Done.', turnCount: 1,
      totalInputTokens: 100, totalOutputTokens: 50, totalCostUsd: 0.001, aborted: false,
    });

    vi.mocked(runSingleGate).mockReturnValue({
      tier: 'T2', name: 'Type Check', status: 'pass', detail: '', durationMs: 50,
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [], passed: 0, failed: 0, warned: 0, skipped: 0, totalMs: 0, verdict: 'PASS',
    });

    const onGateResult = vi.fn();

    await runPipeline({
      config: mockConfig, policy: mockPolicy, workDir: TEST_DIR,
      callbacks: { onGateResult },
    });

    // Build baseline (T2+T5) + per-story T2+T5 = 2 + (2 stories × 2 gates) = 6 calls
    expect(runSingleGate).toHaveBeenCalledTimes(6);
    // onGateResult called for each T2 and T5 per story
    expect(onGateResult).toHaveBeenCalledWith('T2', expect.any(String), expect.any(String));
    expect(onGateResult).toHaveBeenCalledWith('T5', expect.any(String), expect.any(String));
  });

  // ── Circuit breaker tests ─────────────────────────────────

  it('halts pipeline when consecutive stories fail with same error pattern', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-cb.md'), '# CB Test\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'cb');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-first.md'), '# STORY-001: First\nstatus: PENDING\n');
    writeFileSync(join(storyDir, 'STORY-002-second.md'), '# STORY-002: Second\nstatus: PENDING\n');
    writeFileSync(join(storyDir, 'STORY-003-third.md'), '# STORY-003: Third\nstatus: PENDING\n');

    // Story execution succeeds but T2/T5 fail with the same error pattern every time
    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Done.', turnCount: 1,
      totalInputTokens: 100, totalOutputTokens: 50, totalCostUsd: 0.001, aborted: false,
    });

    // Build baseline passes, but per-story T2/T5 always fail with same error
    let callCount = 0;
    vi.mocked(runSingleGate).mockImplementation((tier: string) => {
      callCount++;
      // First 2 calls are build baseline (pass)
      if (callCount <= 2) {
        return { tier, name: 'Baseline', status: 'pass' as const, detail: '', durationMs: 10 };
      }
      // All subsequent T2 calls fail with same error pattern
      if (tier === 'T2') {
        return {
          tier: 'T2', name: 'Type Check', status: 'fail' as const,
          detail: "error TS2307: Cannot find module 'tailwindcss' or its corresponding type declarations.\nsrc/app/layout.tsx:3:8",
          durationMs: 50,
        };
      }
      return { tier, name: 'Build', status: 'pass' as const, detail: '', durationMs: 10 };
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [], passed: 0, failed: 1, warned: 0, skipped: 0, totalMs: 0, verdict: 'FAIL',
    });

    const onGateResult = vi.fn();
    const result = await runPipeline({
      config: mockConfig, policy: mockPolicy, workDir: TEST_DIR,
      callbacks: { onGateResult },
    });

    // All 3 stories should fail (2 attempted + fixer retries, 1 skipped by circuit breaker)
    expect(result.storiesFailed).toBe(3);
    // Circuit breaker should have fired
    expect(onGateResult).toHaveBeenCalledWith('CIRCUIT_BREAKER', 'fail', expect.stringContaining('Circuit breaker'));
    // FORGE phase should be failed
    const forgePhase = result.phases.find((p) => p.name === 'FORGE');
    expect(forgePhase?.status).toBe('failed');
  });

  it('fires BUILD_BASELINE warning when project does not build before FORGE', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-bl.md'), '# Baseline Test\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'bl');
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(join(storyDir, 'STORY-001-test.md'), '# STORY-001: Test\nstatus: PENDING\n');

    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'Done.', turnCount: 1,
      totalInputTokens: 100, totalOutputTokens: 50, totalCostUsd: 0.001, aborted: false,
    });

    // Build baseline fails (T2 fail), per-story gates pass
    let callCount = 0;
    vi.mocked(runSingleGate).mockImplementation((tier: string) => {
      callCount++;
      // First call is T2 baseline — fail
      if (callCount === 1 && tier === 'T2') {
        return { tier: 'T2', name: 'Type Check', status: 'fail' as const, detail: 'Pre-existing type errors', durationMs: 10 };
      }
      return { tier, name: 'Gate', status: 'pass' as const, detail: '', durationMs: 10 };
    });

    vi.mocked(runAllGates).mockResolvedValue({
      gates: [], passed: 0, failed: 0, warned: 0, skipped: 0, totalMs: 0, verdict: 'PASS',
    });

    const onGateResult = vi.fn();
    await runPipeline({
      config: mockConfig, policy: mockPolicy, workDir: TEST_DIR,
      callbacks: { onGateResult },
    });

    // Should have fired BUILD_BASELINE warning
    expect(onGateResult).toHaveBeenCalledWith('BUILD_BASELINE', 'warn', expect.stringContaining('does not build cleanly'));
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

  // ── Memory harvest integration tests ─────────────────────────

  it('calls harvestRunMemory once during DEBRIEF phase', async () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(join(genesisDir, '2026-01-01-harv.md'), '# Harvest Test\n\nstatus: APPROVED\n');

    const storyDir = join(TEST_DIR, 'docs', 'stories', 'harv');
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

    await runPipeline({
      config: mockConfig, policy: mockPolicy, workDir: TEST_DIR,
    });

    expect(harvestRunMemory).toHaveBeenCalledTimes(1);
    expect(harvestRunMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: expect.any(String),
        workDir: TEST_DIR,
        storiesCompleted: expect.any(Number),
        storiesFailed: expect.any(Number),
        storiesTotal: expect.any(Number),
        totalCostUsd: expect.any(Number),
        gateVerdict: expect.any(String),
        prdFiles: expect.arrayContaining(['genesis/2026-01-01-harv.md']),
      }),
    );
  });
});
