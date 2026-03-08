import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock AI runner
vi.mock('../core/ai-runner.js', () => ({
  runAgentLoop: vi.fn(),
}));

// Mock agent registry
vi.mock('../core/agent-registry.js', () => ({
  getAgentSystemPrompt: vi.fn(() => 'You are a test reviewer.'),
  TOOL_SETS: {
    REVIEW: [
      { name: 'read', description: 'Read a file', input_schema: { type: 'object', properties: {}, required: [] } },
      { name: 'glob', description: 'Find files', input_schema: { type: 'object', properties: {}, required: [] } },
      { name: 'grep', description: 'Search content', input_schema: { type: 'object', properties: {}, required: [] } },
    ],
  },
}));

import {
  parseMicroGateResponse,
  runPostStoryGates,
  runPreTemperGate,
  runPreGenerationGate,
  runTestDocGate,
  formatFindingsForFixer,
} from '../core/micro-gates.js';
import { runAgentLoop } from '../core/ai-runner.js';
import type { SfConfig, SfPolicy } from '../types.js';

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
});

// ── Parser tests ──────────────────────────────────────────────

describe('parseMicroGateResponse', () => {
  it('parses a clean PASS response', () => {
    const content = `VERDICT: PASS
FINDINGS:
SUMMARY: No issues found`;

    const result = parseMicroGateResponse(content);
    expect(result.verdict).toBe('PASS');
    expect(result.findings).toHaveLength(0);
    expect(result.summary).toBe('No issues found');
  });

  it('parses a FAIL response with findings', () => {
    const content = `VERDICT: FAIL
FINDINGS:
- [HIGH] Missing input validation on user ID parameter (src/api/users.ts:42)
- [MEDIUM] No rate limiting on auth endpoint (src/api/auth.ts:15)
SUMMARY: Two security issues found`;

    const result = parseMicroGateResponse(content);
    expect(result.verdict).toBe('FAIL');
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0].severity).toBe('HIGH');
    expect(result.findings[0].description).toContain('Missing input validation');
    expect(result.findings[0].location).toBe('src/api/users.ts:42');
    expect(result.findings[1].severity).toBe('MEDIUM');
    expect(result.summary).toBe('Two security issues found');
  });

  it('parses a WARN response', () => {
    const content = `VERDICT: WARN
FINDINGS:
- [LOW] Magic number 42 used without comment (src/config.ts:10)
SUMMARY: Minor style issue`;

    const result = parseMicroGateResponse(content);
    expect(result.verdict).toBe('WARN');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('LOW');
  });

  it('defaults to WARN when response format is unrecognizable', () => {
    const content = 'I checked the code and it looks mostly fine but there might be an issue.';
    const result = parseMicroGateResponse(content);
    expect(result.verdict).toBe('WARN');
    expect(result.findings).toHaveLength(0);
  });

  it('overrides PASS to FAIL when CRITICAL findings exist', () => {
    const content = `VERDICT: PASS
FINDINGS:
- [CRITICAL] SQL injection vulnerability in query builder (src/db.ts:88)
SUMMARY: Looks good overall`;

    const result = parseMicroGateResponse(content);
    expect(result.verdict).toBe('FAIL');
    expect(result.findings).toHaveLength(1);
  });

  it('overrides PASS to FAIL when HIGH findings exist', () => {
    const content = `VERDICT: PASS
FINDINGS:
- [HIGH] Hardcoded API key found (src/config.ts:5)
SUMMARY: Minor issue`;

    const result = parseMicroGateResponse(content);
    expect(result.verdict).toBe('FAIL');
  });

  it('handles findings without location', () => {
    const content = `VERDICT: WARN
FINDINGS:
- [INFO] Could improve error messages across the module
SUMMARY: Suggestions only`;

    const result = parseMicroGateResponse(content);
    expect(result.findings[0].location).toBeUndefined();
    expect(result.findings[0].severity).toBe('INFO');
  });

  it('handles malformed finding lines as MEDIUM severity', () => {
    const content = `VERDICT: FAIL
FINDINGS:
- Some issue without proper severity tagging
SUMMARY: Issues found`;

    const result = parseMicroGateResponse(content);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('MEDIUM');
    expect(result.findings[0].description).toContain('Some issue');
  });
});

// ── Runner tests ──────────────────────────────────────────────

describe('runPostStoryGates', () => {
  it('runs MG1 and MG2 in sequence and returns both results', async () => {
    vi.mocked(runAgentLoop)
      .mockResolvedValueOnce({
        content: 'VERDICT: PASS\nFINDINGS:\nSUMMARY: Secure',
        turnCount: 2,
        totalInputTokens: 500,
        totalOutputTokens: 200,
        totalCostUsd: 0.005,
        aborted: false,
      })
      .mockResolvedValueOnce({
        content: 'VERDICT: PASS\nFINDINGS:\nSUMMARY: Standards met',
        turnCount: 1,
        totalInputTokens: 400,
        totalOutputTokens: 150,
        totalCostUsd: 0.004,
        aborted: false,
      });

    const results = await runPostStoryGates(
      'STORY-001-auth.md',
      '# STORY-001: Auth\n## Description\nAuth flow.',
      { config: mockConfig, policy: mockPolicy, workDir: '/tmp/test' },
    );

    expect(results).toHaveLength(2);
    expect(results[0].gate).toBe('MG1');
    expect(results[0].agent).toBe('security');
    expect(results[0].verdict).toBe('PASS');
    expect(results[1].gate).toBe('MG2');
    expect(results[1].agent).toBe('standards');
    expect(results[1].verdict).toBe('PASS');
    expect(runAgentLoop).toHaveBeenCalledTimes(2);
  });

  it('returns FAIL when security gate finds issues', async () => {
    vi.mocked(runAgentLoop)
      .mockResolvedValueOnce({
        content: 'VERDICT: FAIL\nFINDINGS:\n- [HIGH] SQL injection (src/db.ts:10)\nSUMMARY: Critical issue',
        turnCount: 3,
        totalInputTokens: 600,
        totalOutputTokens: 250,
        totalCostUsd: 0.006,
        aborted: false,
      })
      .mockResolvedValueOnce({
        content: 'VERDICT: PASS\nFINDINGS:\nSUMMARY: Clean',
        turnCount: 1,
        totalInputTokens: 400,
        totalOutputTokens: 150,
        totalCostUsd: 0.004,
        aborted: false,
      });

    const results = await runPostStoryGates(
      'STORY-001-db.md',
      '# DB Story',
      { config: mockConfig, policy: mockPolicy, workDir: '/tmp/test' },
    );

    expect(results[0].verdict).toBe('FAIL');
    expect(results[0].findings).toHaveLength(1);
    expect(results[1].verdict).toBe('PASS');
  });

  it('tracks cost accurately across both gates', async () => {
    vi.mocked(runAgentLoop)
      .mockResolvedValueOnce({
        content: 'VERDICT: PASS\nFINDINGS:\nSUMMARY: OK',
        turnCount: 2,
        totalInputTokens: 500,
        totalOutputTokens: 200,
        totalCostUsd: 0.007,
        aborted: false,
      })
      .mockResolvedValueOnce({
        content: 'VERDICT: PASS\nFINDINGS:\nSUMMARY: OK',
        turnCount: 1,
        totalInputTokens: 300,
        totalOutputTokens: 100,
        totalCostUsd: 0.003,
        aborted: false,
      });

    const results = await runPostStoryGates('test.md', 'content', {
      config: mockConfig, policy: mockPolicy, workDir: '/tmp/test',
    });

    expect(results[0].costUsd).toBe(0.007);
    expect(results[1].costUsd).toBe(0.003);
  });
});

describe('runPreTemperGate', () => {
  it('runs MG3 review gate with completed story list', async () => {
    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'VERDICT: WARN\nFINDINGS:\n- [LOW] Inconsistent naming between auth and user modules\nSUMMARY: Minor style inconsistency',
      turnCount: 3,
      totalInputTokens: 800,
      totalOutputTokens: 300,
      totalCostUsd: 0.008,
      aborted: false,
    });

    const result = await runPreTemperGate(
      ['STORY-001-auth.md', 'STORY-002-users.md'],
      { config: mockConfig, policy: mockPolicy, workDir: '/tmp/test' },
    );

    expect(result.gate).toBe('MG3');
    expect(result.agent).toBe('review');
    expect(result.verdict).toBe('WARN');
    expect(result.findings).toHaveLength(1);
  });

  it('uses REVIEW tools (read-only) with maxTurns 3', async () => {
    vi.mocked(runAgentLoop).mockResolvedValue({
      content: 'VERDICT: PASS\nFINDINGS:\nSUMMARY: All consistent',
      turnCount: 2,
      totalInputTokens: 500,
      totalOutputTokens: 200,
      totalCostUsd: 0.005,
      aborted: false,
    });

    await runPreTemperGate(['STORY-001.md'], {
      config: mockConfig, policy: mockPolicy, workDir: '/tmp/test',
    });

    expect(runAgentLoop).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'read' }),
          expect.objectContaining({ name: 'glob' }),
          expect.objectContaining({ name: 'grep' }),
        ]),
        maxTurns: 3,
      }),
    );
  });
});

// ── Formatter tests ───────────────────────────────────────────

describe('formatFindingsForFixer', () => {
  it('returns empty string when all gates pass', () => {
    const results = [
      { gate: 'MG1', agent: 'security', verdict: 'PASS' as const, findings: [], summary: 'Clean', costUsd: 0, turnCount: 1, durationMs: 100 },
      { gate: 'MG2', agent: 'standards', verdict: 'PASS' as const, findings: [], summary: 'Clean', costUsd: 0, turnCount: 1, durationMs: 100 },
    ];
    expect(formatFindingsForFixer(results)).toBe('');
  });

  it('formats FAIL findings with severity and location', () => {
    const results = [
      {
        gate: 'MG1', agent: 'security', verdict: 'FAIL' as const,
        findings: [
          { severity: 'HIGH' as const, description: 'SQL injection', location: 'src/db.ts:10' },
        ],
        summary: 'Critical', costUsd: 0.005, turnCount: 2, durationMs: 200,
      },
    ];
    const output = formatFindingsForFixer(results);
    expect(output).toContain('[MG1] security');
    expect(output).toContain('FAIL');
    expect(output).toContain('[HIGH] SQL injection (src/db.ts:10)');
  });

  it('includes WARN findings but excludes PASS gates', () => {
    const results = [
      { gate: 'MG1', agent: 'security', verdict: 'PASS' as const, findings: [], summary: 'OK', costUsd: 0, turnCount: 1, durationMs: 100 },
      {
        gate: 'MG2', agent: 'standards', verdict: 'WARN' as const,
        findings: [{ severity: 'LOW' as const, description: 'Missing jsdoc' }],
        summary: 'Style', costUsd: 0.003, turnCount: 1, durationMs: 150,
      },
    ];
    const output = formatFindingsForFixer(results);
    expect(output).not.toContain('MG1');
    expect(output).toContain('[MG2] standards');
    expect(output).toContain('[LOW] Missing jsdoc');
  });
});

// ── MG0 tests (runPreGenerationGate) ─────────────────────────

describe('runPreGenerationGate', () => {
  it('returns WARN for stories without done_when/acceptance criteria section (legacy compat)', async () => {
    const storyContent = '# STORY-001: Legacy Feature\n## Description\nSome old story without AC.';

    const result = await runPreGenerationGate(
      'STORY-001-legacy.md',
      storyContent,
      { config: mockConfig, policy: mockPolicy, workDir: '/tmp/test' },
    );

    expect(result.gate).toBe('MG0');
    expect(result.agent).toBe('ac-validator');
    expect(result.verdict).toBe('WARN');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('MEDIUM');
    expect(result.findings[0].description).toContain('legacy');
    expect(result.costUsd).toBe(0);
    expect(result.turnCount).toBe(0);
    expect(runAgentLoop).not.toHaveBeenCalled();
  });

  it('calls runSingleMicroGate when story has done_when section', async () => {
    vi.mocked(runAgentLoop).mockResolvedValueOnce({
      content: 'VERDICT: PASS\nFINDINGS:\nSUMMARY: All criteria are measurable',
      turnCount: 1,
      totalInputTokens: 300,
      totalOutputTokens: 100,
      totalCostUsd: 0.003,
      aborted: false,
    });

    const storyContent = '# STORY-002: New Feature\n## done_when\n- API returns 200 on valid input\n- Error returns 400 with message';

    const result = await runPreGenerationGate(
      'STORY-002-feature.md',
      storyContent,
      { config: mockConfig, policy: mockPolicy, workDir: '/tmp/test' },
    );

    expect(result.gate).toBe('MG0');
    expect(result.agent).toBe('ac-validator');
    expect(result.verdict).toBe('PASS');
    expect(runAgentLoop).toHaveBeenCalledTimes(1);
  });
});

// ── MG1.5 tests (runTestDocGate) ─────────────────────────────

describe('runTestDocGate', () => {
  it('calls runSingleMicroGate with correct gate and agent', async () => {
    vi.mocked(runAgentLoop).mockResolvedValueOnce({
      content: 'VERDICT: FAIL\nFINDINGS:\n- [HIGH] Missing @test-suite header in test file (src/__tests__/auth.test.ts:1)\nSUMMARY: Test docs incomplete',
      turnCount: 2,
      totalInputTokens: 500,
      totalOutputTokens: 200,
      totalCostUsd: 0.005,
      aborted: false,
    });

    const result = await runTestDocGate(
      'STORY-003-auth.md',
      '# STORY-003: Auth\n## done_when\n- Login works',
      { config: mockConfig, policy: mockPolicy, workDir: '/tmp/test' },
    );

    expect(result.gate).toBe('MG1.5');
    expect(result.agent).toBe('test-docs');
    expect(result.verdict).toBe('FAIL');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('HIGH');
    expect(runAgentLoop).toHaveBeenCalledTimes(1);
  });
});

// ── Additional parseMicroGateResponse tests ──────────────────

describe('parseMicroGateResponse — MG0 and safety overrides', () => {
  it('parses response with MG0 verdict format (no-AC finding)', () => {
    const content = `VERDICT: FAIL
FINDINGS:
- [HIGH] No acceptance criteria found — story cannot be implemented without a verifiable contract.
SUMMARY: Story missing acceptance criteria`;

    const result = parseMicroGateResponse(content);
    expect(result.verdict).toBe('FAIL');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('HIGH');
    expect(result.findings[0].description).toContain('acceptance criteria');
    expect(result.summary).toBe('Story missing acceptance criteria');
  });

  it('safety override: PASS with CRITICAL findings becomes FAIL', () => {
    const content = `VERDICT: PASS
FINDINGS:
- [CRITICAL] Acceptance criterion uses subjective language: "works correctly" (story.md:15)
SUMMARY: One criterion is vague`;

    const result = parseMicroGateResponse(content);
    expect(result.verdict).toBe('FAIL');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('CRITICAL');
    expect(result.findings[0].location).toBe('story.md:15');
  });
});
