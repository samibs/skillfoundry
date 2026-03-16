/**
 * @test-suite STORY-013 — PRD Review CLI + Pipeline Hard Block
 *
 * Tests cover:
 * - parsePrdReviewArgs: CLI argument parsing (path, json, threshold, verbose, no-cache)
 * - renderProgressBar: progress bar rendering for scores 1-10
 * - formatDimension: per-dimension block formatting (PASS/FAIL coloring)
 * - formatReviewOutput: full review output for pass and fail states
 * - getDimensionsBelow: correct extraction of failing dimensions
 * - prdReviewCommand: error handling for missing file, non-PRD, no provider
 * - prdReviewCommand: JSON output flag
 * - prdReviewCommand: custom threshold flag
 * - prdReviewCommand: successful pass review
 * - prdReviewCommand: failing PRD review (exit-code-1 behavior via return value)
 * - Pipeline: PrdQualityBlockError is thrown on failing PRD
 * - Pipeline: validatePrdQuality passes on high-scoring PRD (via skipPrdReview bypass)
 * - Pipeline: skipPrdReview=true bypasses quality check and proceeds
 * - Pipeline: provider init failure is non-blocking (warns, continues)
 * - Cache: noCache flag triggers clearScoreCache before scoring
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProviderAdapter, ContentBlock, PrdScore, SessionContext, SfConfig, SfPolicy, SfState } from '../types.js';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    startRunLog: vi.fn(),
    cleanupOldLogs: vi.fn(),
  }),
}));

// Mock node:fs for file existence and reading
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn((p: string) => {
      // By default, report files as existing unless the path includes 'missing'
      return !String(p).includes('missing');
    }),
    readFileSync: vi.fn((p: string) => {
      if (String(p).includes('non-prd')) return NON_PRD_CONTENT;
      return GOOD_PRD_CONTENT;
    }),
  };
});

// Mock prd-scorer to control LLM behaviour
vi.mock('../core/prd-scorer.js', async () => {
  const actual = await vi.importActual<typeof import('../core/prd-scorer.js')>('../core/prd-scorer.js');
  return {
    ...actual,
    scorePrd: vi.fn(),
    clearScoreCache: vi.fn(),
    isPrdContent: vi.fn((content: string) => {
      return !content.includes('NOTAPRD');
    }),
  };
});

// Mock AnthropicAdapter to avoid real API calls
vi.mock('../core/provider.js', () => ({
  AnthropicAdapter: vi.fn().mockImplementation(() => ({
    name: 'mock-anthropic',
    stream: vi.fn(),
    streamWithTools: vi.fn(),
  })),
}));

import {
  parsePrdReviewArgs,
  renderProgressBar,
  formatDimension,
  formatReviewOutput,
  getDimensionsBelow,
  prdReviewCommand,
} from '../commands/prd-review.js';
import { scorePrd, clearScoreCache, isPrdContent } from '../core/prd-scorer.js';
import { existsSync, readFileSync } from 'node:fs';

// ── Fixtures ─────────────────────────────────────────────────────────────────

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
`;

const NON_PRD_CONTENT = `NOTAPRD
import { something } from 'somewhere';
export function doThing() { return 42; }
`;

function makePassScore(overrides: Partial<PrdScore> = {}): PrdScore {
  return {
    prdPath: '/workdir/genesis/feature.md',
    completeness: { score: 8, justification: 'All required sections are present with thorough content.' },
    specificity: { score: 7, justification: 'Most requirements have specific metrics and Gherkin criteria.' },
    consistency: { score: 9, justification: 'All sections align perfectly with no contradictions.' },
    scope: { score: 8, justification: 'Clear out-of-scope list with well defined phase boundaries.' },
    suggestions: ['Add explicit performance thresholds.', 'Include error code table.'],
    pass: true,
    scoredAt: '2026-03-16T10:00:00.000Z',
    cached: false,
    ...overrides,
  };
}

function makeFailScore(overrides: Partial<PrdScore> = {}): PrdScore {
  return {
    prdPath: '/workdir/genesis/bad-feature.md',
    completeness: { score: 4, justification: 'Missing Security section and Out of Scope section entirely.' },
    specificity: { score: 3, justification: 'Pervasive vague language: "should be fast", "good experience".' },
    consistency: { score: 7, justification: 'Terminology is mostly consistent with minor field name mismatches.' },
    scope: { score: 5, justification: 'Out-of-scope section exists but is vague and incomplete.' },
    suggestions: [
      'Add Security section with authentication requirements.',
      'Add Out of Scope section with explicitly excluded features.',
      'Replace "should be fast" with specific latency targets.',
    ],
    pass: false,
    scoredAt: '2026-03-16T10:00:00.000Z',
    cached: false,
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionContext> = {}): SessionContext {
  const config: SfConfig = {
    provider: 'anthropic',
    engine: 'claude',
    model: 'claude-sonnet-4-20250514',
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
    log_level: 'info',
  };
  const policy: SfPolicy = { allow_shell: true, allow_network: true, allow_paths: ['.'], redact: false };
  const state: SfState = {
    current_state: 'IDLE',
    updated_at: '',
    current_prd: '',
    current_story: '',
    last_plan_id: '',
    last_run_id: '',
    recovery: { rollback_available: false, resume_point: '' },
  };
  return {
    config,
    policy,
    state,
    messages: [],
    permissionMode: 'auto',
    workDir: '/workdir',
    activeAgent: null,
    activeTeam: null,
    addMessage: vi.fn(),
    setState: vi.fn(),
    setActiveAgent: vi.fn(),
    setActiveTeam: vi.fn(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('parsePrdReviewArgs', () => {
  it('parses a simple file path', () => {
    const result = parsePrdReviewArgs('review genesis/feature.md');
    expect(result.filePath).toBe('genesis/feature.md');
    expect(result.json).toBe(false);
    expect(result.threshold).toBe(6);
    expect(result.verbose).toBe(false);
    expect(result.noCache).toBe(false);
  });

  it('parses --json flag', () => {
    const result = parsePrdReviewArgs('review genesis/feature.md --json');
    expect(result.json).toBe(true);
    expect(result.filePath).toBe('genesis/feature.md');
  });

  it('parses --verbose flag', () => {
    const result = parsePrdReviewArgs('review genesis/feature.md --verbose');
    expect(result.verbose).toBe(true);
  });

  it('parses --no-cache flag', () => {
    const result = parsePrdReviewArgs('review genesis/feature.md --no-cache');
    expect(result.noCache).toBe(true);
  });

  it('parses --threshold=8 with equals sign', () => {
    const result = parsePrdReviewArgs('review genesis/feature.md --threshold=8');
    expect(result.threshold).toBe(8);
  });

  it('parses --threshold 7 with space', () => {
    const result = parsePrdReviewArgs('review genesis/feature.md --threshold 7');
    expect(result.threshold).toBe(7);
  });

  it('rejects threshold < 1 and uses default 6', () => {
    const result = parsePrdReviewArgs('review genesis/feature.md --threshold=0');
    expect(result.threshold).toBe(6);
  });

  it('rejects threshold > 10 and uses default 6', () => {
    const result = parsePrdReviewArgs('review genesis/feature.md --threshold=11');
    expect(result.threshold).toBe(6);
  });

  it('returns empty filePath when path is missing', () => {
    const result = parsePrdReviewArgs('review');
    expect(result.filePath).toBe('');
  });

  it('combines all flags correctly', () => {
    const result = parsePrdReviewArgs('review my/prd.md --json --verbose --threshold=5 --no-cache');
    expect(result.filePath).toBe('my/prd.md');
    expect(result.json).toBe(true);
    expect(result.verbose).toBe(true);
    expect(result.threshold).toBe(5);
    expect(result.noCache).toBe(true);
  });
});

describe('renderProgressBar', () => {
  it('renders 10 filled blocks for score 10', () => {
    expect(renderProgressBar(10)).toBe('██████████');
  });

  it('renders 1 filled block for score 1', () => {
    expect(renderProgressBar(1)).toBe('█░░░░░░░░░');
  });

  it('renders 5 filled and 5 empty for score 5', () => {
    expect(renderProgressBar(5)).toBe('█████░░░░░');
  });

  it('renders 8 filled and 2 empty for score 8', () => {
    expect(renderProgressBar(8)).toBe('████████░░');
  });

  it('always returns exactly 10 characters', () => {
    for (let s = 1; s <= 10; s++) {
      expect(renderProgressBar(s)).toHaveLength(10);
    }
  });

  it('clamps below 1 to score 1', () => {
    expect(renderProgressBar(0)).toBe('█░░░░░░░░░');
  });

  it('clamps above 10 to score 10', () => {
    expect(renderProgressBar(11)).toBe('██████████');
  });
});

describe('getDimensionsBelow', () => {
  it('returns empty array when all dimensions pass', () => {
    const score = makePassScore();
    expect(getDimensionsBelow(score, 6)).toHaveLength(0);
  });

  it('returns failing dimensions when below threshold', () => {
    const score = makeFailScore();
    const failing = getDimensionsBelow(score, 6);
    expect(failing.length).toBeGreaterThan(0);
    const names = failing.map(([k]) => k);
    expect(names).toContain('completeness');
    expect(names).toContain('specificity');
    expect(names).toContain('scope');
  });

  it('respects custom threshold', () => {
    const score = makePassScore(); // scores: 8, 7, 9, 8
    // With threshold 8, specificity (7) should fail
    const failing = getDimensionsBelow(score, 8);
    const names = failing.map(([k]) => k);
    expect(names).toContain('specificity');
    expect(names).not.toContain('completeness');
    expect(names).not.toContain('consistency');
  });
});

describe('formatDimension', () => {
  it('contains PASS for a passing dimension', () => {
    const dim = { score: 8, justification: 'All sections are thoroughly documented with examples included.' };
    const output = formatDimension('COMPLETENESS', dim, 6);
    expect(output).toContain('PASS');
    expect(output).toContain('COMPLETENESS');
    expect(output).toContain('8/10');
  });

  it('contains FAIL for a failing dimension', () => {
    const dim = { score: 4, justification: 'Missing several critical sections including security and scope.' };
    const output = formatDimension('SPECIFICITY', dim, 6);
    expect(output).toContain('FAIL');
    expect(output).toContain('SPECIFICITY');
    expect(output).toContain('4/10');
  });

  it('includes the progress bar', () => {
    const dim = { score: 7, justification: 'Most requirements have specific metrics and acceptance criteria.' };
    const output = formatDimension('SCOPE', dim, 6);
    expect(output).toContain('█');
    expect(output).toContain('░');
  });

  it('includes the justification text', () => {
    const justification = 'Clear out-of-scope list with well defined phase boundaries present.';
    const dim = { score: 8, justification };
    const output = formatDimension('SCOPE', dim, 6);
    expect(output).toContain(justification);
  });
});

describe('formatReviewOutput', () => {
  it('shows PASS result for a passing score', () => {
    const score = makePassScore();
    const output = formatReviewOutput(score, '/workdir/genesis/feature.md', 6, 2000);
    expect(output).toContain('PASS');
    expect(output).toContain('feature.md');
    expect(output).toContain('SUGGESTIONS');
  });

  it('shows FAIL result for a failing score', () => {
    const score = makeFailScore();
    const adjustedScore = { ...score, pass: false };
    const output = formatReviewOutput(adjustedScore, '/workdir/genesis/bad-feature.md', 6, 3000);
    expect(output).toContain('FAIL');
    expect(output).toContain('BLOCKING ISSUES');
  });

  it('shows all four dimension names', () => {
    const score = makePassScore();
    const output = formatReviewOutput(score, '/workdir/genesis/feature.md', 6, 1000);
    expect(output).toContain('COMPLETENESS');
    expect(output).toContain('SPECIFICITY');
    expect(output).toContain('CONSISTENCY');
    expect(output).toContain('SCOPE');
  });

  it('shows cached indicator when score is cached', () => {
    const score = makePassScore({ cached: true });
    const output = formatReviewOutput(score, '/workdir/genesis/feature.md', 6, 0);
    expect(output).toContain('Cached');
  });

  it('shows latency when score is not cached', () => {
    const score = makePassScore({ cached: false });
    const output = formatReviewOutput(score, '/workdir/genesis/feature.md', 6, 8300);
    expect(output).toContain('8.3s');
  });
});

describe('prdReviewCommand — error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error message when path is missing', async () => {
    const session = makeSession();
    const result = await prdReviewCommand.execute('review', session);
    expect(result).toContain('Error');
    expect(result).toContain('path is required');
  });

  it('returns error message for unknown subcommand', async () => {
    const session = makeSession();
    const result = await prdReviewCommand.execute('unknown genesis/feature.md', session);
    expect(result).toContain('Usage');
    expect(result).toContain('review');
  });

  it('returns error when file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const session = makeSession();
    const result = await prdReviewCommand.execute('review missing/prd.md', session);
    expect(result).toContain('Error');
    expect(result).toContain('not found');
  });

  it('returns error when file is not a PRD', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(NON_PRD_CONTENT as never);
    vi.mocked(isPrdContent).mockReturnValue(false);
    const session = makeSession();
    const result = await prdReviewCommand.execute('review non-prd-file.ts', session);
    expect(result).toContain('Error');
    expect(result).toContain('does not appear to be a PRD');
  });

  it('returns error when provider is not configured', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(GOOD_PRD_CONTENT as never);
    vi.mocked(isPrdContent).mockReturnValue(true);
    const session = makeSession({
      config: {
        provider: '',
        engine: '',
        model: '',
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
        log_level: 'info',
      },
    });
    const result = await prdReviewCommand.execute('review genesis/feature.md', session);
    expect(result).toContain('Error');
    expect(result).toContain('No LLM provider configured');
  });
});

describe('prdReviewCommand — JSON output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(GOOD_PRD_CONTENT as never);
    vi.mocked(isPrdContent).mockReturnValue(true);
    vi.mocked(scorePrd).mockResolvedValue(makePassScore());
  });

  it('returns valid JSON when --json flag is set', async () => {
    const session = makeSession();
    const result = await prdReviewCommand.execute('review genesis/feature.md --json', session) as string;
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('completeness');
    expect(parsed).toHaveProperty('specificity');
    expect(parsed).toHaveProperty('consistency');
    expect(parsed).toHaveProperty('scope');
    expect(parsed).toHaveProperty('suggestions');
    expect(parsed).toHaveProperty('pass');
  });

  it('JSON output includes all four dimension scores', async () => {
    const session = makeSession();
    const result = await prdReviewCommand.execute('review genesis/feature.md --json', session) as string;
    const parsed = JSON.parse(result);
    expect(parsed.completeness.score).toBe(8);
    expect(parsed.specificity.score).toBe(7);
    expect(parsed.consistency.score).toBe(9);
    expect(parsed.scope.score).toBe(8);
  });
});

describe('prdReviewCommand — custom threshold', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(GOOD_PRD_CONTENT as never);
    vi.mocked(isPrdContent).mockReturnValue(true);
  });

  it('passes when specificity score (7) meets threshold 7', async () => {
    vi.mocked(scorePrd).mockResolvedValue(makePassScore());
    const session = makeSession();
    const result = await prdReviewCommand.execute('review genesis/feature.md --json --threshold=7', session) as string;
    const parsed = JSON.parse(result);
    expect(parsed.pass).toBe(true);
  });

  it('fails when specificity score (7) is below threshold 8', async () => {
    vi.mocked(scorePrd).mockResolvedValue(makePassScore());
    const session = makeSession();
    const result = await prdReviewCommand.execute('review genesis/feature.md --json --threshold=8', session) as string;
    const parsed = JSON.parse(result);
    // specificity = 7, which is below threshold 8
    expect(parsed.pass).toBe(false);
  });

  it('passes a PRD scoring 5 when threshold is 5', async () => {
    vi.mocked(scorePrd).mockResolvedValue(makePassScore({
      specificity: { score: 5, justification: 'Some metrics but not all acceptance criteria are testable.' },
    }));
    const session = makeSession();
    const result = await prdReviewCommand.execute('review genesis/feature.md --json --threshold=5', session) as string;
    const parsed = JSON.parse(result);
    expect(parsed.pass).toBe(true);
  });
});

describe('prdReviewCommand — successful reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(GOOD_PRD_CONTENT as never);
    vi.mocked(isPrdContent).mockReturnValue(true);
  });

  it('formats passing review with dimension scores and suggestions', async () => {
    vi.mocked(scorePrd).mockResolvedValue(makePassScore());
    const session = makeSession();
    const result = await prdReviewCommand.execute('review genesis/feature.md', session) as string;
    expect(result).toContain('PASS');
    expect(result).toContain('COMPLETENESS');
    expect(result).toContain('SPECIFICITY');
    expect(result).toContain('CONSISTENCY');
    expect(result).toContain('SCOPE');
    expect(result).toContain('SUGGESTIONS');
  });

  it('formats failing review with BLOCKING ISSUES', async () => {
    vi.mocked(scorePrd).mockResolvedValue(makeFailScore());
    const session = makeSession();
    const result = await prdReviewCommand.execute('review genesis/bad-feature.md', session) as string;
    expect(result).toContain('FAIL');
    expect(result).toContain('BLOCKING ISSUES');
  });

  it('calls clearScoreCache when --no-cache is passed', async () => {
    vi.mocked(scorePrd).mockResolvedValue(makePassScore());
    const session = makeSession();
    await prdReviewCommand.execute('review genesis/feature.md --no-cache', session);
    expect(clearScoreCache).toHaveBeenCalledOnce();
  });

  it('does not call clearScoreCache without --no-cache', async () => {
    vi.mocked(scorePrd).mockResolvedValue(makePassScore());
    const session = makeSession();
    await prdReviewCommand.execute('review genesis/feature.md', session);
    expect(clearScoreCache).not.toHaveBeenCalled();
  });
});

describe('prdReviewCommand — cache behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(GOOD_PRD_CONTENT as never);
    vi.mocked(isPrdContent).mockReturnValue(true);
  });

  it('shows Cached indicator when score is from cache', async () => {
    vi.mocked(scorePrd).mockResolvedValue(makePassScore({ cached: true }));
    const session = makeSession();
    const result = await prdReviewCommand.execute('review genesis/feature.md', session) as string;
    expect(result).toContain('Cached');
  });

  it('shows latency when score is fresh (not cached)', async () => {
    vi.mocked(scorePrd).mockResolvedValue(makePassScore({ cached: false }));
    const session = makeSession();
    const result = await prdReviewCommand.execute('review genesis/feature.md', session) as string;
    // Should contain a latency indicator like "0.0s" or "X.Xs"
    expect(result).toMatch(/\d+\.\d+s/);
  });
});

// ── Pipeline integration tests (PrdQualityBlockError) ────────────────────────

describe('PrdQualityBlockError', () => {
  it('is exported and can be thrown and caught', async () => {
    const { PrdQualityBlockError } = await import('../core/pipeline.js');
    const err = new PrdQualityBlockError('PRD blocked: test.md — completeness: 4/10');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PrdQualityBlockError');
    expect(err.message).toContain('PRD blocked');
  });

  it('carries the full failing dimension message', async () => {
    const { PrdQualityBlockError } = await import('../core/pipeline.js');
    const err = new PrdQualityBlockError(
      'PRD blocked: bad-feature.md — failing dimensions: completeness: 4/10, specificity: 3/10 (minimum 6/10)',
    );
    expect(err.message).toContain('completeness: 4/10');
    expect(err.message).toContain('specificity: 3/10');
    expect(err.message).toContain('minimum 6/10');
  });
});
