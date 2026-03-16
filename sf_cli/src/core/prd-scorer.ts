/**
 * STORY-012: LLM-Powered PRD Quality Scorer
 *
 * Evaluates PRDs on four dimensions (completeness, specificity, consistency,
 * scope) using structured tool_use output from the configured LLM provider.
 * Scores are integers 1-10 per dimension. pass = true when ALL scores >= 6.
 *
 * Features:
 * - Anthropic tool_use for structured JSON extraction (temperature 0)
 * - Retry once on parse/validation failure with an explicit JSON instruction
 * - In-memory cache with 5-minute TTL to avoid redundant LLM calls
 * - Non-PRD file detection: rejects files missing frontmatter or required sections
 */

import { readFileSync, existsSync } from 'node:fs';
import type { ProviderAdapter, AnthropicMessage, ContentBlock, PrdScore, PrdDimensionScore } from '../types.js';
import { getLogger } from '../utils/logger.js';

// ── Scoring prompt ─────────────────────────────────────────────────────────

const SCORING_SYSTEM_PROMPT =
  'You are a rigorous technical PRD reviewer. You evaluate product requirements documents with cold objectivity — no score inflation, no flattery. Your assessments are used to gate implementation work, so inaccurate scores waste engineering effort.';

/**
 * Build the user-turn scoring prompt by injecting prdContent.
 * @param prdContent - Raw text of the PRD.
 * @returns The full prompt string to send as the user message.
 */
export function buildScoringPrompt(prdContent: string): string {
  return `You are a technical PRD reviewer. Score this PRD on four dimensions.

SCORING RUBRIC:

COMPLETENESS (1-10):
- 1-3: Missing more than 3 required sections or sections are empty
- 4-5: All sections present but some are thin (1-2 sentences where paragraphs needed)
- 6-7: All sections present with adequate content
- 8-9: All sections present with thorough content, examples included
- 10: Exemplary — every section is comprehensive with examples and edge cases

SPECIFICITY (1-10):
- 1-3: Vague language throughout ("should be fast", "good experience", "as needed")
- 4-5: Some metrics but acceptance criteria are not in Gherkin or testable format
- 6-7: Most requirements have specific metrics or Gherkin criteria
- 8-9: All requirements are testable with exact thresholds and scenarios
- 10: Every requirement has Gherkin criteria, performance thresholds, and error scenarios

CONSISTENCY (1-10):
- 1-3: Multiple contradictions between sections (e.g., API says POST but story says GET)
- 4-5: Minor mismatches in terminology or field names
- 6-7: Consistent terminology, no contradictions
- 8-9: Cross-references are accurate, glossary matches code
- 10: Perfect alignment across all sections, data model matches API matches tests

SCOPE (1-10):
- 1-3: No out-of-scope section, requirements are unbounded
- 4-5: Out-of-scope exists but is vague or incomplete
- 6-7: Clear out-of-scope list, phases defined
- 8-9: Explicit exclusions, phase boundaries, and risk mitigations for scope creep
- 10: Scope is airtight — every boundary case is addressed

Use the score_prd tool to return your evaluation. Be critical and specific. Do not inflate scores.

PRD CONTENT:
---
${prdContent}
---`;
}

// ── Tool definition for structured output ──────────────────────────────────

export const SCORE_PRD_TOOL = {
  name: 'score_prd',
  description:
    'Return a structured quality evaluation of the PRD across four dimensions: completeness, specificity, consistency, and scope.',
  input_schema: {
    type: 'object' as const,
    properties: {
      completeness: {
        type: 'object',
        description: 'Completeness score and justification',
        properties: {
          score: { type: 'integer', minimum: 1, maximum: 10, description: 'Integer score 1-10' },
          justification: { type: 'string', minLength: 20, description: '2-3 sentence justification' },
        },
        required: ['score', 'justification'],
      },
      specificity: {
        type: 'object',
        description: 'Specificity score and justification',
        properties: {
          score: { type: 'integer', minimum: 1, maximum: 10, description: 'Integer score 1-10' },
          justification: { type: 'string', minLength: 20, description: '2-3 sentence justification' },
        },
        required: ['score', 'justification'],
      },
      consistency: {
        type: 'object',
        description: 'Consistency score and justification',
        properties: {
          score: { type: 'integer', minimum: 1, maximum: 10, description: 'Integer score 1-10' },
          justification: { type: 'string', minLength: 20, description: '2-3 sentence justification' },
        },
        required: ['score', 'justification'],
      },
      scope: {
        type: 'object',
        description: 'Scope score and justification',
        properties: {
          score: { type: 'integer', minimum: 1, maximum: 10, description: 'Integer score 1-10' },
          justification: { type: 'string', minLength: 20, description: '2-3 sentence justification' },
        },
        required: ['score', 'justification'],
      },
      suggestions: {
        type: 'array',
        description: 'Actionable improvement suggestions (1-10 items)',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 10,
      },
    },
    required: ['completeness', 'specificity', 'consistency', 'scope', 'suggestions'],
  },
};

// ── Validated response shape (output of validateScoringResponse) ──────────

interface ValidatedScoringResponse {
  completeness: PrdDimensionScore;
  specificity: PrdDimensionScore;
  consistency: PrdDimensionScore;
  scope: PrdDimensionScore;
  suggestions: string[];
}

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate that a single dimension object from the LLM is well-formed.
 * @param dim - The raw dimension object.
 * @param name - Dimension name (for error messages).
 * @returns Validated PrdDimensionScore.
 * @throws Error when any field is missing, out of range, or too short.
 */
function validateDimension(dim: unknown, name: string): PrdDimensionScore {
  if (!dim || typeof dim !== 'object') {
    throw new Error(`PRD scorer: dimension "${name}" is missing or not an object`);
  }
  const d = dim as Record<string, unknown>;

  const score = d['score'];
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 10) {
    throw new Error(
      `PRD scorer: dimension "${name}.score" must be an integer between 1 and 10, got ${JSON.stringify(score)}`,
    );
  }

  const justification = d['justification'];
  if (typeof justification !== 'string' || justification.length < 20) {
    throw new Error(
      `PRD scorer: dimension "${name}.justification" must be a string of at least 20 characters`,
    );
  }

  return { score, justification };
}

/**
 * Validate and parse the raw tool_use input from the LLM into a ValidatedScoringResponse.
 * Throws a descriptive error on any validation failure — callers catch and retry.
 * @param raw - Arbitrary object from the LLM tool_use input.
 * @returns Validated scoring dimensions and suggestions.
 */
export function validateScoringResponse(raw: unknown): ValidatedScoringResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error('PRD scorer: LLM tool input is not an object');
  }
  const obj = raw as Record<string, unknown>;

  const completeness = validateDimension(obj['completeness'], 'completeness');
  const specificity = validateDimension(obj['specificity'], 'specificity');
  const consistency = validateDimension(obj['consistency'], 'consistency');
  const scope = validateDimension(obj['scope'], 'scope');

  const rawSuggestions = obj['suggestions'];
  if (!Array.isArray(rawSuggestions) || rawSuggestions.length < 1 || rawSuggestions.length > 10) {
    throw new Error(
      `PRD scorer: "suggestions" must be an array with 1-10 items, got ${JSON.stringify(rawSuggestions)}`,
    );
  }
  const suggestions: string[] = rawSuggestions.map((s: unknown, i: number) => {
    if (typeof s !== 'string') {
      throw new Error(`PRD scorer: suggestions[${i}] must be a string`);
    }
    return s;
  });

  return { completeness, specificity, consistency, scope, suggestions };
}

// ── PRD file validation ────────────────────────────────────────────────────

/**
 * Detect whether the file content looks like a PRD.
 * A PRD must have at least a markdown heading AND contain at least one of
 * the canonical section markers used across the SkillFoundry PRD template.
 * @param content - Raw file content.
 * @returns true when the file appears to be a PRD.
 */
export function isPrdContent(content: string): boolean {
  // Must have at least one markdown heading
  if (!/^#+ .+/m.test(content)) return false;

  // Must contain at least two of the canonical PRD section indicators
  const sectionSignals = [
    /^##+ .*(goal|objective|overview|summary)/im,
    /^##+ .*(user stor|acceptance criteria|scenario)/im,
    /^##+ .*(scope|out.of.scope|in.scope)/im,
    /^##+ .*(requirement|functional|non.functional)/im,
    /^##+ .*(security|auth|permission)/im,
    /^##+ .*(technical|approach|architect|design)/im,
    /^##+ .*(risk|assumption|constraint)/im,
  ];

  const matchCount = sectionSignals.filter((re) => re.test(content)).length;
  return matchCount >= 2;
}

// ── In-memory cache ────────────────────────────────────────────────────────

interface CacheEntry {
  score: PrdScore;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const scoreCache = new Map<string, CacheEntry>();

/**
 * Return a cached PrdScore if one exists and has not expired, else undefined.
 * @param cacheKey - Cache key (typically the PRD file path + content hash).
 * @returns Cached PrdScore with cached=true, or undefined.
 */
function getCached(cacheKey: string): PrdScore | undefined {
  const entry = scoreCache.get(cacheKey);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    scoreCache.delete(cacheKey);
    return undefined;
  }
  return { ...entry.score, cached: true };
}

/**
 * Store a PrdScore in the in-memory cache with a 5-minute TTL.
 * @param cacheKey - Cache key.
 * @param score - The score to cache.
 */
function setCache(cacheKey: string, score: PrdScore): void {
  scoreCache.set(cacheKey, { score, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Clear all entries from the score cache. Useful in tests.
 */
export function clearScoreCache(): void {
  scoreCache.clear();
}

// ── Custom errors ──────────────────────────────────────────────────────────

/**
 * Thrown when the file does not appear to be a PRD.
 */
export class PrdNotDetectedError extends Error {
  constructor(prdPath: string) {
    super(
      `File does not appear to be a PRD (missing frontmatter or required sections): ${prdPath}`,
    );
    this.name = 'PrdNotDetectedError';
  }
}

/**
 * Thrown when the LLM response cannot be parsed/validated after the retry attempt.
 */
export class PrdScoringError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'PrdScoringError';
  }
}

// ── Core scorer ────────────────────────────────────────────────────────────

/**
 * Parse and validate the tool_use block from LLM content blocks.
 * Returns the validated response or throws on failure.
 * @param contentBlocks - Content blocks returned by streamWithTools.
 * @returns Validated raw scoring response.
 */
function extractToolInput(contentBlocks: ContentBlock[]): ValidatedScoringResponse {
  const toolUse = contentBlocks.find((b) => b.type === 'tool_use' && b.name === 'score_prd');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('PRD scorer: LLM did not call the score_prd tool');
  }
  return validateScoringResponse(toolUse.input);
}

/**
 * Call the LLM provider with a single-turn scoring request using tool_use.
 * @param provider - Provider adapter (must support streamWithTools).
 * @param model - Model identifier from config.
 * @param messages - The conversation messages to send.
 * @returns Raw validated scoring response.
 */
async function callScoringLlm(
  provider: ProviderAdapter,
  model: string,
  messages: AnthropicMessage[],
): Promise<ValidatedScoringResponse> {
  const result = await provider.streamWithTools(
    messages,
    {
      model,
      maxTokens: 2000,
      systemPrompt: SCORING_SYSTEM_PROMPT,
      tools: [SCORE_PRD_TOOL],
    },
    () => {
      // No streaming output needed for scoring — structured tool call only
    },
  );
  return extractToolInput(result.content);
}

/**
 * Score a single PRD file using the configured LLM provider.
 *
 * Reads the file, validates it looks like a PRD, calls the LLM with a
 * structured tool_use prompt, validates the response, and returns a PrdScore.
 * Results are cached for 5 minutes by file path. Retries once on parse failure.
 *
 * @param prdContent - Raw text content of the PRD (caller responsible for reading).
 * @param prdPath - Absolute path to the PRD file (used for cache key and result).
 * @param provider - ProviderAdapter instance (must implement streamWithTools).
 * @param model - Model identifier string from SfConfig.model.
 * @returns Fully populated PrdScore.
 * @throws PrdNotDetectedError when the file content does not look like a PRD.
 * @throws PrdScoringError when LLM scoring fails after one retry.
 */
export async function scorePrd(
  prdContent: string,
  prdPath: string,
  provider: ProviderAdapter,
  model: string,
): Promise<PrdScore> {
  const logger = getLogger();

  // PRD detection
  if (!isPrdContent(prdContent)) {
    throw new PrdNotDetectedError(prdPath);
  }

  // Cache lookup
  const cacheKey = `${prdPath}::${prdContent.length}`;
  const cached = getCached(cacheKey);
  if (cached) {
    logger.debug('prd-scorer', 'cache_hit', { prdPath });
    return cached;
  }

  logger.info('prd-scorer', 'scoring_start', { prdPath, model });

  const userMessage: AnthropicMessage = {
    role: 'user',
    content: buildScoringPrompt(prdContent),
  };

  // First attempt
  let validated: ValidatedScoringResponse;
  try {
    validated = await callScoringLlm(provider, model, [userMessage]);
    logger.debug('prd-scorer', 'first_attempt_ok', { prdPath });
  } catch (firstErr) {
    // Retry once with an explicit JSON-only instruction appended
    logger.warn('prd-scorer', 'first_attempt_failed_retrying', {
      prdPath,
      error: firstErr instanceof Error ? firstErr.message : String(firstErr),
    });

    const retryMessage: AnthropicMessage = {
      role: 'user',
      content:
        buildScoringPrompt(prdContent) +
        '\n\nIMPORTANT: You MUST call the score_prd tool with valid JSON. Do not respond with plain text.',
    };

    try {
      validated = await callScoringLlm(provider, model, [retryMessage]);
      logger.debug('prd-scorer', 'retry_attempt_ok', { prdPath });
    } catch (retryErr) {
      logger.error('prd-scorer', 'scoring_failed', {
        prdPath,
        firstError: firstErr instanceof Error ? firstErr.message : String(firstErr),
        retryError: retryErr instanceof Error ? retryErr.message : String(retryErr),
      });
      throw new PrdScoringError(
        `PRD scoring failed after retry for "${prdPath}": ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
        retryErr,
      );
    }
  }

  // Build PrdScore
  const allScores = [
    validated.completeness.score,
    validated.specificity.score,
    validated.consistency.score,
    validated.scope.score,
  ];
  const pass = allScores.every((s) => s >= 6);

  const score: PrdScore = {
    prdPath,
    completeness: validated.completeness,
    specificity: validated.specificity,
    consistency: validated.consistency,
    scope: validated.scope,
    suggestions: validated.suggestions,
    pass,
    scoredAt: new Date().toISOString(),
    cached: false,
  };

  setCache(cacheKey, score);

  logger.info('prd-scorer', 'scoring_complete', {
    prdPath,
    pass,
    completeness: score.completeness.score,
    specificity: score.specificity.score,
    consistency: score.consistency.score,
    scope: score.scope.score,
  });

  return score;
}

/**
 * Score a PRD by reading its content from disk.
 *
 * Convenience wrapper around scorePrd() that handles file reading and
 * existence checks. Preferred entry point for pipeline integration.
 *
 * @param prdPath - Absolute path to the PRD file.
 * @param provider - ProviderAdapter instance.
 * @param model - Model identifier string.
 * @returns Fully populated PrdScore.
 * @throws Error when the file does not exist.
 * @throws PrdNotDetectedError when the file content does not look like a PRD.
 * @throws PrdScoringError when LLM scoring fails after one retry.
 */
export async function scorePrdFile(
  prdPath: string,
  provider: ProviderAdapter,
  model: string,
): Promise<PrdScore> {
  if (!existsSync(prdPath)) {
    throw new Error(`PRD scorer: file not found: ${prdPath}`);
  }
  const content = readFileSync(prdPath, 'utf-8');
  return scorePrd(content, prdPath, provider, model);
}

/**
 * Score multiple PRD files sequentially.
 * One LLM call per PRD to avoid context confusion and ensure independent evaluations.
 *
 * @param prdPaths - Array of absolute paths to PRD files.
 * @param provider - ProviderAdapter instance.
 * @param model - Model identifier string.
 * @returns Array of PrdScore results in the same order as prdPaths.
 * @throws Aggregates per-file errors into a PrdScoringError after all files are attempted.
 */
export async function scoreMultiplePrds(
  prdPaths: string[],
  provider: ProviderAdapter,
  model: string,
): Promise<PrdScore[]> {
  const logger = getLogger();
  const results: PrdScore[] = [];
  const errors: string[] = [];

  for (const prdPath of prdPaths) {
    try {
      const score = await scorePrdFile(prdPath, provider, model);
      results.push(score);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('prd-scorer', 'batch_item_failed', { prdPath, error: msg });
      errors.push(`${prdPath}: ${msg}`);
    }
  }

  if (errors.length > 0) {
    throw new PrdScoringError(
      `PRD batch scoring completed with ${errors.length} failure(s):\n${errors.join('\n')}`,
    );
  }

  return results;
}

// ── PrdScorer class (story interface compatibility) ────────────────────────

/**
 * Class wrapper around the functional scorer API.
 * Provided for callers that prefer an object-oriented interface.
 *
 * @example
 * const scorer = new PrdScorer(provider, config.model);
 * const result = await scorer.score('/path/to/my-feature.md');
 */
export class PrdScorer {
  constructor(
    private readonly provider: ProviderAdapter,
    private readonly model: string,
  ) {}

  /**
   * Score a single PRD file.
   * @param prdPath - Absolute path to the PRD file.
   * @returns PrdScore result.
   */
  async score(prdPath: string): Promise<PrdScore> {
    return scorePrdFile(prdPath, this.provider, this.model);
  }

  /**
   * Score multiple PRD files sequentially.
   * @param prdPaths - Array of absolute paths to PRD files.
   * @returns Array of PrdScore results in input order.
   */
  async scoreMultiple(prdPaths: string[]): Promise<PrdScore[]> {
    return scoreMultiplePrds(prdPaths, this.provider, this.model);
  }
}
