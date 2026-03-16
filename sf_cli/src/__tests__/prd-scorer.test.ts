/**
 * @test-suite STORY-012 — LLM-Powered PRD Quality Scorer
 *
 * Tests cover:
 * - buildScoringPrompt: injects PRD content correctly
 * - isPrdContent: detects PRD vs. non-PRD files
 * - validateScoringResponse: accepts valid and rejects invalid structures
 * - scorePrd: pass/fail calculation, cache behaviour, retry on parse failure
 * - scorePrd: non-PRD file detection (PrdNotDetectedError)
 * - PrdScorer class: delegates correctly to functional API
 * - scoreMultiplePrds: sequential execution, partial failure aggregation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProviderAdapter, AnthropicMessage, ContentBlock, SfConfig } from '../types.js';

// Mock logger to avoid filesystem side-effects
vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Mock node:fs so scorePrdFile can be tested without real files
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => GOOD_PRD_CONTENT),
  };
});

import {
  buildScoringPrompt,
  isPrdContent,
  validateScoringResponse,
  scorePrd,
  scorePrdFile,
  scoreMultiplePrds,
  clearScoreCache,
  PrdScorer,
  PrdNotDetectedError,
  PrdScoringError,
} from '../core/prd-scorer.js';
import { existsSync, readFileSync } from 'node:fs';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** A minimal but structurally valid PRD for testing. */
const GOOD_PRD_CONTENT = `# User Authentication Feature

## Goal

Allow users to sign in with email and password. The system must support
session management, rate limiting on failed attempts, and CSRF protection.

## User Stories

Given a registered user
When they submit valid credentials
Then they receive an access token and are redirected to the dashboard

## Scope

**In scope**: login, logout, session refresh
**Out of scope**: OAuth providers, biometric authentication, SSO

## Security Requirements

- Passwords hashed with bcrypt (cost factor >= 12)
- Rate limit: max 5 failed attempts per IP per 15 minutes
- All tokens stored in HttpOnly, Secure, SameSite=Strict cookies
`;

/** A file that does NOT look like a PRD (no headings, no sections). */
const NON_PRD_CONTENT = `import { something } from 'somewhere';
export function doThing() { return 42; }
`;

/** A file with a heading but insufficient section coverage. */
const THIN_CONTENT = `# My Document

Some text here with no recognisable PRD sections.
`;

/** Build a valid raw tool_use input block for the score_prd tool. */
function makeValidToolInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    completeness: { score: 8, justification: 'All required sections are present with thorough content and examples.' },
    specificity: { score: 7, justification: 'Most requirements have specific metrics and Gherkin criteria provided.' },
    consistency: { score: 9, justification: 'All sections align perfectly with no contradictions or terminology mismatches.' },
    scope: { score: 7, justification: 'Clear out-of-scope list exists and phase boundaries are well defined.' },
    suggestions: ['Add explicit performance thresholds for login endpoint latency.', 'Include error code table for all failure scenarios.'],
    ...overrides,
  };
}

/** Build a ContentBlock array that simulates a successful tool_use response. */
function makeToolUseBlocks(input: Record<string, unknown> = makeValidToolInput()): ContentBlock[] {
  return [
    {
      type: 'tool_use',
      id: 'toolu_test_01',
      name: 'score_prd',
      input,
    },
  ];
}

/** Build a mock ProviderAdapter. */
function makeProvider(
  toolUseBlocks: ContentBlock[] = makeToolUseBlocks(),
): ProviderAdapter {
  return {
    name: 'mock',
    stream: vi.fn(),
    streamWithTools: vi.fn().mockResolvedValue({
      content: toolUseBlocks,
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.001,
      stopReason: 'tool_use',
    }),
  };
}

const MOCK_MODEL = 'claude-test-model';

// ── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearScoreCache();
  vi.clearAllMocks();
  // Reset fs mocks to defaults
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readFileSync).mockReturnValue(GOOD_PRD_CONTENT as unknown as Buffer);
});

// ── buildScoringPrompt ────────────────────────────────────────────────────────

describe('buildScoringPrompt', () => {
  it('injects the PRD content between the delimiters', () => {
    const prompt = buildScoringPrompt('MY PRD CONTENT');
    expect(prompt).toContain('MY PRD CONTENT');
    expect(prompt).toContain('---\nMY PRD CONTENT\n---');
  });

  it('includes all four dimension names in the rubric', () => {
    const prompt = buildScoringPrompt('content');
    expect(prompt).toContain('COMPLETENESS');
    expect(prompt).toContain('SPECIFICITY');
    expect(prompt).toContain('CONSISTENCY');
    expect(prompt).toContain('SCOPE');
  });

  it('instructs the LLM to use the score_prd tool', () => {
    const prompt = buildScoringPrompt('content');
    expect(prompt).toContain('score_prd');
  });
});

// ── isPrdContent ──────────────────────────────────────────────────────────────

describe('isPrdContent', () => {
  it('returns true for a well-structured PRD', () => {
    expect(isPrdContent(GOOD_PRD_CONTENT)).toBe(true);
  });

  it('returns false for source code without headings or sections', () => {
    expect(isPrdContent(NON_PRD_CONTENT)).toBe(false);
  });

  it('returns false for a file with a heading but fewer than 2 section signals', () => {
    expect(isPrdContent(THIN_CONTENT)).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isPrdContent('')).toBe(false);
  });

  it('returns true when goal and scope sections are present', () => {
    const content = `# Feature X\n\n## Goal\n\nSome goal text here.\n\n## Scope\n\nIn scope: X\nOut of scope: Y`;
    expect(isPrdContent(content)).toBe(true);
  });
});

// ── validateScoringResponse ───────────────────────────────────────────────────

describe('validateScoringResponse', () => {
  it('accepts a fully valid response', () => {
    const input = makeValidToolInput();
    const result = validateScoringResponse(input);
    expect(result.completeness.score).toBe(8);
    expect(result.specificity.score).toBe(7);
    expect(result.consistency.score).toBe(9);
    expect(result.scope.score).toBe(7);
    expect(result.suggestions).toHaveLength(2);
  });

  it('throws when the input is not an object', () => {
    expect(() => validateScoringResponse(null)).toThrow('not an object');
    expect(() => validateScoringResponse('string')).toThrow('not an object');
  });

  it('throws when a dimension score is out of range', () => {
    const input = makeValidToolInput({ completeness: { score: 11, justification: 'This justification is long enough to pass the minimum check.' } });
    expect(() => validateScoringResponse(input)).toThrow('completeness.score');
  });

  it('throws when a dimension score is 0', () => {
    const input = makeValidToolInput({ completeness: { score: 0, justification: 'This justification is long enough to pass the minimum check.' } });
    expect(() => validateScoringResponse(input)).toThrow('completeness.score');
  });

  it('throws when a dimension score is not an integer', () => {
    const input = makeValidToolInput({ specificity: { score: 7.5, justification: 'This justification is long enough to pass the minimum check.' } });
    expect(() => validateScoringResponse(input)).toThrow('specificity.score');
  });

  it('throws when a justification is shorter than 20 characters', () => {
    const input = makeValidToolInput({ scope: { score: 5, justification: 'Too short.' } });
    expect(() => validateScoringResponse(input)).toThrow('scope.justification');
  });

  it('throws when suggestions is empty', () => {
    const input = makeValidToolInput({ suggestions: [] });
    expect(() => validateScoringResponse(input)).toThrow('suggestions');
  });

  it('throws when suggestions has more than 10 items', () => {
    const input = makeValidToolInput({ suggestions: Array(11).fill('suggestion text') });
    expect(() => validateScoringResponse(input)).toThrow('suggestions');
  });

  it('throws when a suggestion is not a string', () => {
    const input = makeValidToolInput({ suggestions: [42] });
    expect(() => validateScoringResponse(input)).toThrow('suggestions[0]');
  });

  it('throws when a dimension is missing entirely', () => {
    const input = makeValidToolInput();
    delete (input as Record<string, unknown>)['consistency'];
    expect(() => validateScoringResponse(input)).toThrow('consistency');
  });
});

// ── scorePrd — pass/fail calculation ─────────────────────────────────────────

describe('scorePrd pass/fail calculation', () => {
  it('returns pass=true when all scores are exactly 6', async () => {
    const allSixInput = makeValidToolInput({
      completeness: { score: 6, justification: 'Minimum passing score for completeness across all sections present.' },
      specificity: { score: 6, justification: 'Minimum passing score for specificity with adequate Gherkin criteria.' },
      consistency: { score: 6, justification: 'Minimum passing score for consistency with no contradictions found.' },
      scope: { score: 6, justification: 'Minimum passing score for scope with an out-of-scope section present.' },
    });
    const provider = makeProvider(makeToolUseBlocks(allSixInput));
    const result = await scorePrd(GOOD_PRD_CONTENT, '/test/prd.md', provider, MOCK_MODEL);
    expect(result.pass).toBe(true);
  });

  it('returns pass=false when any dimension scores 5', async () => {
    const input = makeValidToolInput({
      specificity: { score: 5, justification: 'Vague language throughout — no measurable thresholds or Gherkin criteria.' },
    });
    const provider = makeProvider(makeToolUseBlocks(input));
    const result = await scorePrd(GOOD_PRD_CONTENT, '/test/prd.md', provider, MOCK_MODEL);
    expect(result.pass).toBe(false);
  });

  it('returns pass=false when all dimensions score 1', async () => {
    const input = makeValidToolInput({
      completeness: { score: 1, justification: 'Almost all required sections are missing or completely empty throughout.' },
      specificity: { score: 1, justification: 'Entirely vague language with no measurable criteria anywhere in the document.' },
      consistency: { score: 1, justification: 'Multiple direct contradictions found between sections of this document.' },
      scope: { score: 1, justification: 'No out-of-scope section and requirements are completely unbounded here.' },
    });
    const provider = makeProvider(makeToolUseBlocks(input));
    const result = await scorePrd(GOOD_PRD_CONTENT, '/test/prd.md', provider, MOCK_MODEL);
    expect(result.pass).toBe(false);
  });

  it('returns pass=true when all dimensions score 10', async () => {
    const input = makeValidToolInput({
      completeness: { score: 10, justification: 'Every section is comprehensive with detailed examples and edge cases covered.' },
      specificity: { score: 10, justification: 'Every requirement has Gherkin criteria, performance thresholds, and error scenarios.' },
      consistency: { score: 10, justification: 'Perfect alignment across all sections with data model matching API and tests.' },
      scope: { score: 10, justification: 'Scope is completely airtight with every boundary case explicitly addressed here.' },
    });
    const provider = makeProvider(makeToolUseBlocks(input));
    const result = await scorePrd(GOOD_PRD_CONTENT, '/test/prd.md', provider, MOCK_MODEL);
    expect(result.pass).toBe(true);
  });
});

// ── scorePrd — non-PRD file rejection ────────────────────────────────────────

describe('scorePrd non-PRD detection', () => {
  it('throws PrdNotDetectedError for source code content', async () => {
    const provider = makeProvider();
    await expect(scorePrd(NON_PRD_CONTENT, '/src/index.ts', provider, MOCK_MODEL)).rejects.toThrow(
      PrdNotDetectedError,
    );
  });

  it('includes the file path in the PrdNotDetectedError message', async () => {
    const provider = makeProvider();
    await expect(scorePrd(NON_PRD_CONTENT, '/src/index.ts', provider, MOCK_MODEL)).rejects.toThrow(
      '/src/index.ts',
    );
  });

  it('includes the standard error phrase in the message', async () => {
    const provider = makeProvider();
    await expect(
      scorePrd(NON_PRD_CONTENT, '/src/index.ts', provider, MOCK_MODEL),
    ).rejects.toThrow('File does not appear to be a PRD');
  });

  it('does not call the LLM provider when the file is not a PRD', async () => {
    const provider = makeProvider();
    await expect(scorePrd(NON_PRD_CONTENT, '/src/index.ts', provider, MOCK_MODEL)).rejects.toThrow(
      PrdNotDetectedError,
    );
    expect(provider.streamWithTools).not.toHaveBeenCalled();
  });
});

// ── scorePrd — result structure ───────────────────────────────────────────────

describe('scorePrd result structure', () => {
  it('returns a PrdScore with all required fields', async () => {
    const provider = makeProvider();
    const result = await scorePrd(GOOD_PRD_CONTENT, '/test/prd.md', provider, MOCK_MODEL);
    expect(result).toMatchObject({
      prdPath: '/test/prd.md',
      pass: expect.any(Boolean),
      scoredAt: expect.any(String),
      cached: false,
      suggestions: expect.any(Array),
    });
    expect(result.completeness).toMatchObject({ score: expect.any(Number), justification: expect.any(String) });
    expect(result.specificity).toMatchObject({ score: expect.any(Number), justification: expect.any(String) });
    expect(result.consistency).toMatchObject({ score: expect.any(Number), justification: expect.any(String) });
    expect(result.scope).toMatchObject({ score: expect.any(Number), justification: expect.any(String) });
  });

  it('sets scoredAt to a valid ISO timestamp', async () => {
    const before = Date.now();
    const provider = makeProvider();
    const result = await scorePrd(GOOD_PRD_CONTENT, '/test/prd.md', provider, MOCK_MODEL);
    const ts = new Date(result.scoredAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(Date.now());
  });
});

// ── scorePrd — cache behaviour ────────────────────────────────────────────────

describe('scorePrd cache', () => {
  it('returns a cached result on the second call without calling the LLM again', async () => {
    const provider = makeProvider();
    const first = await scorePrd(GOOD_PRD_CONTENT, '/test/prd.md', provider, MOCK_MODEL);
    expect(first.cached).toBe(false);

    const second = await scorePrd(GOOD_PRD_CONTENT, '/test/prd.md', provider, MOCK_MODEL);
    expect(second.cached).toBe(true);

    // LLM was only called once
    expect(provider.streamWithTools).toHaveBeenCalledTimes(1);
  });

  it('calls the LLM again after clearScoreCache()', async () => {
    const provider = makeProvider();
    await scorePrd(GOOD_PRD_CONTENT, '/test/prd.md', provider, MOCK_MODEL);
    clearScoreCache();
    await scorePrd(GOOD_PRD_CONTENT, '/test/prd.md', provider, MOCK_MODEL);
    expect(provider.streamWithTools).toHaveBeenCalledTimes(2);
  });

  it('uses separate cache keys for different PRD paths', async () => {
    const provider = makeProvider();
    await scorePrd(GOOD_PRD_CONTENT, '/test/prd-a.md', provider, MOCK_MODEL);
    await scorePrd(GOOD_PRD_CONTENT, '/test/prd-b.md', provider, MOCK_MODEL);
    // Two different paths — both should have made LLM calls
    expect(provider.streamWithTools).toHaveBeenCalledTimes(2);
  });
});

// ── scorePrd — retry on parse failure ────────────────────────────────────────

describe('scorePrd retry behaviour', () => {
  it('retries once when the first LLM call throws, and succeeds on retry', async () => {
    const validBlocks = makeToolUseBlocks();
    let callCount = 0;
    const provider: ProviderAdapter = {
      name: 'mock',
      stream: vi.fn(),
      streamWithTools: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Simulated first-attempt parse failure');
        }
        return {
          content: validBlocks,
          inputTokens: 100,
          outputTokens: 200,
          costUsd: 0.001,
          stopReason: 'tool_use',
        };
      }),
    };

    const result = await scorePrd(GOOD_PRD_CONTENT, '/test/retry.md', provider, MOCK_MODEL);
    expect(result.pass).toBe(true);
    expect(provider.streamWithTools).toHaveBeenCalledTimes(2);
  });

  it('throws PrdScoringError when both attempts fail', async () => {
    const provider: ProviderAdapter = {
      name: 'mock',
      stream: vi.fn(),
      streamWithTools: vi.fn().mockRejectedValue(new Error('LLM error every time')),
    };

    await expect(
      scorePrd(GOOD_PRD_CONTENT, '/test/fail.md', provider, MOCK_MODEL),
    ).rejects.toThrow(PrdScoringError);
    expect(provider.streamWithTools).toHaveBeenCalledTimes(2);
  });

  it('throws PrdScoringError when the LLM returns no tool_use block', async () => {
    const provider = makeProvider([
      { type: 'text', text: 'Sorry, I cannot evaluate this PRD.' },
    ]);

    await expect(
      scorePrd(GOOD_PRD_CONTENT, '/test/no-tool.md', provider, MOCK_MODEL),
    ).rejects.toThrow(PrdScoringError);
  });

  it('throws PrdScoringError when the tool_use block has an invalid score on both attempts', async () => {
    // Return a tool_use block with score=0 (out of range) on every call
    const badBlocks = makeToolUseBlocks(
      makeValidToolInput({
        completeness: { score: 0, justification: 'This justification is long enough to pass the minimum check.' },
      }),
    );
    const provider = makeProvider(badBlocks);

    await expect(
      scorePrd(GOOD_PRD_CONTENT, '/test/bad-score.md', provider, MOCK_MODEL),
    ).rejects.toThrow(PrdScoringError);
    expect(provider.streamWithTools).toHaveBeenCalledTimes(2);
  });
});

// ── scorePrdFile ──────────────────────────────────────────────────────────────

describe('scorePrdFile', () => {
  it('throws when the file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const provider = makeProvider();
    await expect(scorePrdFile('/nonexistent/prd.md', provider, MOCK_MODEL)).rejects.toThrow(
      'file not found',
    );
  });

  it('reads the file and delegates to scorePrd', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(GOOD_PRD_CONTENT as unknown as Buffer);
    const provider = makeProvider();
    const result = await scorePrdFile('/test/prd.md', provider, MOCK_MODEL);
    expect(result.prdPath).toBe('/test/prd.md');
    expect(result.pass).toBe(true);
    expect(provider.streamWithTools).toHaveBeenCalledTimes(1);
  });
});

// ── scoreMultiplePrds ─────────────────────────────────────────────────────────

describe('scoreMultiplePrds', () => {
  it('scores an array of PRDs sequentially', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(GOOD_PRD_CONTENT as unknown as Buffer);
    const provider = makeProvider();
    const results = await scoreMultiplePrds(
      ['/test/prd-a.md', '/test/prd-b.md'],
      provider,
      MOCK_MODEL,
    );
    expect(results).toHaveLength(2);
    expect(provider.streamWithTools).toHaveBeenCalledTimes(2);
  });

  it('throws PrdScoringError listing all failures when any file fails', async () => {
    vi.mocked(existsSync).mockReturnValue(false); // all files "missing"
    const provider = makeProvider();
    await expect(
      scoreMultiplePrds(['/test/a.md', '/test/b.md'], provider, MOCK_MODEL),
    ).rejects.toThrow(PrdScoringError);
  });
});

// ── PrdScorer class ───────────────────────────────────────────────────────────

describe('PrdScorer class', () => {
  it('score() delegates to scorePrdFile', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(GOOD_PRD_CONTENT as unknown as Buffer);
    const provider = makeProvider();
    const scorer = new PrdScorer(provider, MOCK_MODEL);
    const result = await scorer.score('/test/prd.md');
    expect(result.prdPath).toBe('/test/prd.md');
    expect(provider.streamWithTools).toHaveBeenCalledTimes(1);
  });

  it('scoreMultiple() delegates to scoreMultiplePrds', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(GOOD_PRD_CONTENT as unknown as Buffer);
    const provider = makeProvider();
    const scorer = new PrdScorer(provider, MOCK_MODEL);
    const results = await scorer.scoreMultiple(['/test/prd-a.md', '/test/prd-b.md']);
    expect(results).toHaveLength(2);
    expect(provider.streamWithTools).toHaveBeenCalledTimes(2);
  });
});
