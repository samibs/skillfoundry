# STORY-012: LLM-Powered PRD Quality Scorer

## Goal

Implement an LLM-powered scorer that evaluates PRDs on four dimensions (completeness, specificity, consistency, scope), produces per-dimension scores (1-10) with justifications, and achieves >80% accuracy on a 10-PRD benchmark.

## PRD Mapping

- FR-014 (LLM PRD Quality Scorer)
- FR-017 (PRD Scorer Precision)

## Epic

8 — PRD Semantic Validation

## Effort

L (Large) — LLM prompt engineering, structured output parsing, benchmark creation

## Dependencies

- None (foundation story for Epic 8)

## Scope

### Files to Create

- `sf_cli/src/core/prd-scorer.ts` — Scorer implementation
- `sf_cli/src/core/__tests__/prd-scorer.test.ts` — Unit tests
- `sf_cli/src/core/__tests__/benchmarks/prd-precision.bench.ts` — Benchmark harness
- `sf_cli/src/core/__tests__/benchmarks/prd-benchmark-dataset/` — 10 synthetic PRDs (5 good, 5 bad)
- `sf_cli/src/core/__tests__/benchmarks/prd-expected-scores.json` — Expected scores for benchmark

### Files to Modify

- `sf_cli/src/types.ts` — Add PrdScore and related types

## Technical Approach

### Scoring Dimensions

| Dimension | What It Measures | Score 1 (Worst) | Score 10 (Best) |
|-----------|-----------------|-----------------|-----------------|
| **Completeness** | All required sections present and meaningfully filled | Most sections empty or missing | Every section filled with substantive content |
| **Specificity** | Concrete, measurable, unambiguous language | Vague language ("should be fast", "good UX"), no metrics | Exact thresholds, Gherkin acceptance criteria, specific error codes |
| **Consistency** | No contradictions between sections | Requirements contradict each other, glossary mismatches | All sections align, glossary matches code names, data model matches API |
| **Scope** | Clear boundaries with explicit exclusions | No out-of-scope section, unbounded requirements | Explicit exclusion list, clear phase boundaries, no scope creep risk |

### LLM Prompt Strategy

Use the configured LLM provider (same as pipeline) with structured JSON output:

```typescript
const SCORING_PROMPT = `You are a technical PRD reviewer. Score this PRD on four dimensions.

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

OUTPUT FORMAT (strict JSON):
{
  "completeness": { "score": <1-10>, "justification": "<2-3 sentences>" },
  "specificity": { "score": <1-10>, "justification": "<2-3 sentences>" },
  "consistency": { "score": <1-10>, "justification": "<2-3 sentences>" },
  "scope": { "score": <1-10>, "justification": "<2-3 sentences>" },
  "suggestions": ["<actionable improvement 1>", "<actionable improvement 2>", ...]
}

PRD CONTENT:
---
{prd_content}
---

Score this PRD now. Be critical and specific. Do not inflate scores.`;
```

### Scorer Implementation

```typescript
export class PrdScorer {
  constructor(private provider: LlmProvider);

  async score(prdPath: string): Promise<PrdScore> {
    // 1. Read PRD file content
    // 2. Validate it looks like a PRD (has frontmatter, sections)
    // 3. Send to LLM with scoring prompt
    // 4. Parse JSON response with Zod validation
    // 5. If parse fails, retry once with explicit "respond in JSON only" instruction
    // 6. If second attempt fails, throw PrdScoringError
    // 7. Calculate pass/fail (all dimensions >= 6)
    // 8. Return PrdScore
  }

  async scoreMultiple(prdPaths: string[]): Promise<PrdScore[]> {
    // Score sequentially (one LLM call per PRD to avoid context confusion)
  }
}
```

### Response Validation

Use Zod to validate the LLM's JSON response:

```typescript
const PrdScoreResponseSchema = z.object({
  completeness: z.object({
    score: z.number().int().min(1).max(10),
    justification: z.string().min(20),
  }),
  specificity: z.object({
    score: z.number().int().min(1).max(10),
    justification: z.string().min(20),
  }),
  consistency: z.object({
    score: z.number().int().min(1).max(10),
    justification: z.string().min(20),
  }),
  scope: z.object({
    score: z.number().int().min(1).max(10),
    justification: z.string().min(20),
  }),
  suggestions: z.array(z.string()).min(1).max(10),
});
```

### LLM Configuration

- Temperature: 0 (maximum determinism)
- Use structured JSON output mode if provider supports it (Anthropic tool_use, OpenAI json_mode)
- Max tokens: 2000 (sufficient for rubric response)
- Single LLM call per PRD (no multi-turn)
- Timeout: 30s

### Benchmark Dataset

10 synthetic PRDs stored in `prd-benchmark-dataset/`:

**Good PRDs (should score >= 7 on all dimensions):**
1. `good-user-auth.md` — Complete authentication PRD with Gherkin criteria
2. `good-payment-api.md` — Payment integration with specific thresholds
3. `good-notification.md` — Notification service with clear scope
4. `good-search-feature.md` — Search with performance benchmarks
5. `good-dashboard.md` — Dashboard with accessibility requirements

**Bad PRDs (should score <= 5 on at least one dimension):**
1. `bad-vague-requirements.md` — Uses "should be fast", "good UX", no metrics
2. `bad-missing-sections.md` — Missing security, scope, and acceptance criteria sections
3. `bad-contradictions.md` — API section contradicts data model section
4. `bad-no-scope.md` — No out-of-scope, unbounded feature list
5. `bad-todo-markers.md` — Contains TBD/TODO markers throughout

### Expected Scores

```json
{
  "good-user-auth.md": { "min_all_dimensions": 7, "expected_pass": true },
  "good-payment-api.md": { "min_all_dimensions": 7, "expected_pass": true },
  "bad-vague-requirements.md": { "max_specificity": 5, "expected_pass": false },
  "bad-missing-sections.md": { "max_completeness": 5, "expected_pass": false },
  "bad-contradictions.md": { "max_consistency": 5, "expected_pass": false }
}
```

### Benchmark Scoring

```
Accuracy = (correctly classified as pass/fail) / 10
False Positive Rate = (bad PRDs incorrectly classified as pass) / 5

Pass criteria:
- Accuracy > 80% (at least 8/10 correct)
- False Positive Rate < 10% (at most 0/5 bad PRDs pass — effectively 0 false positives)
```

## Acceptance Criteria

```gherkin
Feature: LLM PRD Quality Scorer

  Scenario: Score a well-written PRD
    Given a PRD with all sections filled, Gherkin criteria, and clear scope
    When the scorer runs
    Then all four dimensions score >= 7/10
    And justifications explain why each dimension scored well
    And pass is true

  Scenario: Score a vague PRD
    Given a PRD with vague language ("should be fast", "good UX")
    When the scorer runs
    Then specificity scores <= 5/10
    And the justification calls out specific vague phrases
    And suggestions include "Replace vague language with measurable thresholds"

  Scenario: Score a PRD with missing sections
    Given a PRD missing security, scope, and acceptance criteria sections
    When the scorer runs
    Then completeness scores <= 5/10
    And the justification lists the missing sections

  Scenario: Score a PRD with contradictions
    Given a PRD where the API section says POST but the story says GET
    When the scorer runs
    Then consistency scores <= 5/10
    And the justification identifies the specific contradiction

  Scenario: JSON output validation
    Given any PRD is scored
    When the LLM responds
    Then the response parses as valid JSON matching PrdScoreResponseSchema
    And all scores are integers between 1 and 10
    And all justifications are at least 20 characters

  Scenario: LLM response parse failure with retry
    Given the LLM returns malformed JSON on first attempt
    When the scorer retries with explicit JSON instruction
    Then the second attempt is parsed successfully
    And the score is returned normally

  Scenario: Benchmark passes accuracy threshold
    Given the 10-PRD benchmark dataset
    When all 10 PRDs are scored
    Then accuracy is > 80% (at least 8/10 correctly classified)
    And false positive rate is < 10%

  Scenario: Non-PRD file rejection
    Given a file that is not a PRD (e.g., a source code file)
    When the scorer attempts to score it
    Then an error is returned: "File does not appear to be a PRD (missing frontmatter or required sections)"
```

## Tests

- Unit: Scoring prompt construction with PRD content injection
- Unit: Zod response schema validation (valid and invalid responses)
- Unit: Retry on malformed JSON response
- Unit: Pass/fail calculation (all dimensions >= 6 = pass)
- Unit: Non-PRD file detection and rejection
- Unit: Scoring with mock LLM provider (deterministic responses)
- Benchmark: 10-PRD accuracy test (requires real LLM — mark as integration)
- Benchmark: False positive rate calculation
