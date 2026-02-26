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

import { runPipeline, scanPRDs, scanStories } from '../core/pipeline.js';
import { runAgentLoop } from '../core/ai-runner.js';
import { runAllGates, runSingleGate } from '../core/gates.js';
import type { SfConfig, SfPolicy } from '../types.js';

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
});
