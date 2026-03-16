# STORY-013: PRD Review CLI + Pipeline Hard Block

## Goal

Implement the `sf prd review <path>` CLI command for interactive PRD quality feedback, and integrate the scorer into the `/go` pipeline as a hard block that prevents PRDs scoring below 6/10 on any dimension from entering implementation.

## PRD Mapping

- FR-015 (Pipeline Hard Block)
- FR-016 (PRD Review CLI)

## Epic

8 — PRD Semantic Validation

## Effort

M (Medium) — CLI command + pipeline integration with gate logic

## Dependencies

- STORY-012 (LLM PRD Quality Scorer) — Provides the scoring engine

## Scope

### Files to Create

- `sf_cli/src/commands/prd-review.ts` — CLI command handler

### Files to Modify

- `sf_cli/src/commands/index.ts` — Register `prd review` command
- `sf_cli/src/core/pipeline.ts` — Add PRD semantic validation step before story generation
- `sf_cli/src/core/gates.ts` — Add PRD quality gate (pre-pipeline, before T0)

## Technical Approach

### CLI Command: `sf prd review <path>`

```
sf prd review <path> [--json] [--threshold N] [--verbose]
```

| Flag | Default | Description |
|------|---------|-------------|
| `<path>` | required | Path to PRD file (relative or absolute) |
| `--json` | false | Output raw JSON instead of formatted text |
| `--threshold` | 6 | Minimum score per dimension for pass (1-10) |
| `--verbose` | false | Include full scoring prompt and raw LLM response |

### Output Format

```
$ sf prd review genesis/2026-03-16-phase2-make-it-excellent.md

  PRD Quality Review
  ══════════════════════════════════════════════════════════
  File: genesis/2026-03-16-phase2-make-it-excellent.md
  Model: claude-sonnet-4-20250514 │ Latency: 8.3s
  ──────────────────────────────────────────────────────────

  COMPLETENESS    ████████░░  8/10  PASS
  All required sections are present and filled with substantive
  content. Success metrics include baselines and targets. Data
  model is fully specified with types and constraints.

  SPECIFICITY     ███████░░░  7/10  PASS
  Most requirements have Gherkin acceptance criteria with specific
  thresholds. Performance requirements include exact latency targets.
  Minor gap: some API integration points lack request/response examples.

  CONSISTENCY     █████████░  9/10  PASS
  Terminology is consistent throughout. Glossary matches code names.
  Data model aligns with the API section. No contradictions detected.

  SCOPE           ████████░░  8/10  PASS
  Out of scope is explicit and comprehensive. Phase boundaries are
  clear with prerequisites. Risk of scope creep is addressed in
  the risks section.

  ──────────────────────────────────────────────────────────
  RESULT: PASS (all dimensions >= 6/10)
  ──────────────────────────────────────────────────────────

  SUGGESTIONS:
  1. Add request/response examples for ChromaDB and embedding service
     integration points in section 5.4
  2. Consider adding a rollback plan for ChromaDB dimension mismatch
     recovery in the reliability section
```

**Failing PRD output:**

```
$ sf prd review genesis/bad-vague-feature.md

  ...

  COMPLETENESS    ████░░░░░░  4/10  FAIL
  Missing sections: Security (4.2), Scalability (4.3), Out of Scope (7.3).
  User stories lack acceptance criteria. Data model is absent.

  SPECIFICITY     ███░░░░░░░  3/10  FAIL
  Pervasive vague language: "should be performant" (line 42), "good user
  experience" (line 67), "handle errors appropriately" (line 89).
  No measurable thresholds or Gherkin scenarios.

  ...

  ──────────────────────────────────────────────────────────
  RESULT: FAIL (completeness: 4, specificity: 3 — below threshold 6)
  ──────────────────────────────────────────────────────────

  BLOCKING ISSUES:
  1. Add Security section with authentication, authorization, and
     input validation requirements
  2. Add Out of Scope section listing explicitly excluded features
  3. Replace "should be performant" with specific latency targets
     (e.g., "< 200ms p95 response time")
  4. Add Gherkin acceptance criteria to all user stories
  5. Define the data model with entity fields, types, and constraints
```

### Pipeline Integration

In `pipeline.ts`, add PRD semantic validation as the first step, before story generation:

```typescript
// In the pipeline execution flow, after PRD discovery and structural validation:

async function validatePrdQuality(prdPaths: string[]): Promise<void> {
  const scorer = new PrdScorer(provider);

  for (const prdPath of prdPaths) {
    const score = await scorer.score(prdPath);

    if (!score.pass) {
      const failingDimensions = Object.entries(score)
        .filter(([key, val]) => typeof val === 'number' && val < 6)
        .map(([key, val]) => `${key}: ${val}/10`);

      throw new PrdQualityBlockError(
        `PRD blocked: ${path.basename(prdPath)} — ` +
        `failing dimensions: ${failingDimensions.join(', ')} (minimum 6/10)\n` +
        `Run 'sf prd review ${prdPath}' for detailed feedback and suggestions.`
      );
    }

    logger.info(`PRD quality check passed: ${path.basename(prdPath)} ` +
      `(completeness: ${score.completeness}, specificity: ${score.specificity}, ` +
      `consistency: ${score.consistency}, scope: ${score.scope})`);
  }
}
```

### Gate Integration

Add a new "pre-pipeline" quality gate (logically before T0):

```typescript
// In gates.ts:
export async function prdQualityGate(prdPath: string): Promise<GateResult> {
  const scorer = new PrdScorer(getProvider());
  const score = await scorer.score(prdPath);

  if (!score.pass) {
    return {
      gate: 'prd-quality',
      passed: false,
      reason: `PRD quality below threshold`,
      details: {
        scores: {
          completeness: score.completeness,
          specificity: score.specificity,
          consistency: score.consistency,
          scope: score.scope,
        },
        threshold: 6,
        failingDimensions: /* dimensions below 6 */,
        suggestions: score.suggestions,
      },
    };
  }

  return { gate: 'prd-quality', passed: true };
}
```

### Caching

- PRD scores are cached in `.sf/cache/prd-scores.json` keyed by file path + content SHA-256
- Cache TTL: 24 hours (PRDs change infrequently)
- Cache is invalidated when the PRD file content changes
- `sf prd review --no-cache` forces a fresh scoring

### Error Handling

| Condition | Behavior |
|-----------|----------|
| File not found | Print error and exit 1 |
| File is not a PRD | Print "File does not appear to be a PRD" and exit 1 |
| LLM provider not configured | Print "No LLM provider configured. Run `sf setup` first." and exit 1 |
| LLM call fails (network, rate limit) | Print error with retry suggestion, exit 1 |
| LLM returns unparseable response after retry | Print "Scoring failed — LLM response could not be parsed" with raw response (if --verbose) |

### Pipeline Bypass

For exceptional cases (e.g., emergency fix), the pipeline hard block can be bypassed with:
```
sf go --skip-prd-review
```
This logs a warning: "PRD quality check skipped — manual override" and continues. The skip is recorded in the pipeline audit log.

## Acceptance Criteria

```gherkin
Feature: PRD Review CLI

  Scenario: Review a passing PRD
    Given a well-written PRD file exists
    When `sf prd review genesis/my-feature.md` is run
    Then output shows four dimension scores with progress bars
    And all dimensions show PASS
    And result line shows "PASS (all dimensions >= 6/10)"
    And 1-5 suggestions are listed for further improvement

  Scenario: Review a failing PRD
    Given a PRD with vague language and missing sections
    When `sf prd review genesis/bad-feature.md` is run
    Then output shows failing dimensions marked FAIL
    And result line shows "FAIL" with the failing dimensions and scores
    And blocking issues are listed with specific fixes
    And exit code is 1

  Scenario: JSON output
    Given any PRD file
    When `sf prd review <path> --json` is run
    Then output is valid JSON matching the PrdScore schema
    And includes all four dimension scores, justifications, and suggestions

  Scenario: Custom threshold
    Given a PRD scoring 5/10 on specificity
    When `sf prd review <path> --threshold 5` is run
    Then the PRD passes (5 >= 5)
    When `sf prd review <path> --threshold 6` is run
    Then the PRD fails (5 < 6)

Feature: Pipeline Hard Block

  Scenario: Pipeline blocks on low-quality PRD
    Given a PRD scores 4/10 on completeness
    When `/go` is invoked with that PRD
    Then the pipeline halts before story generation
    And the error message includes "PRD blocked" with the failing dimension and score
    And the error suggests running `sf prd review <path>`

  Scenario: Pipeline passes on quality PRD
    Given a PRD scores >= 6 on all dimensions
    When `/go` is invoked with that PRD
    Then the pipeline proceeds to story generation
    And a log entry confirms PRD quality check passed with scores

  Scenario: Pipeline bypass
    Given a PRD would be blocked
    When `/go --skip-prd-review` is invoked
    Then the pipeline proceeds with a warning
    And the audit log records the skip

  Scenario: Cached score reuse
    Given a PRD was scored 2 hours ago and content has not changed
    When `sf prd review <path>` is run
    Then the cached score is returned immediately (no LLM call)
    And output indicates "Cached result (scored 2h ago)"

  Scenario: Cache invalidation on content change
    Given a PRD was scored and cached
    And the PRD content is then modified
    When `sf prd review <path>` is run
    Then a fresh LLM scoring is performed
    And the cache is updated with the new score
```

## Tests

- Unit: CLI argument parsing (path, json, threshold, verbose)
- Unit: Output formatting for pass and fail states
- Unit: Progress bar rendering for scores 1-10
- Unit: Pipeline integration — block on failing score
- Unit: Pipeline integration — pass on good score
- Unit: Pipeline bypass with --skip-prd-review
- Unit: Cache hit returns stored score
- Unit: Cache miss triggers LLM call
- Unit: Cache invalidation on content change
- Unit: Error handling for missing file, non-PRD file, no provider
- Integration: End-to-end review with mock LLM provider
- Integration: Pipeline run with PRD quality gate (mock LLM)
