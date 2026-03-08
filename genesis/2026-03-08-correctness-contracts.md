# PRD: Correctness Contracts — Pre-Generation AC Gates & Test Intent Enforcement

---
prd_id: correctness-contracts
title: Correctness Contracts — Pre-Generation AC Gates & Test Intent Enforcement
version: 1.0
status: DRAFT
created: 2026-03-08
author: n00b73
last_updated: 2026-03-08

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []
  recommends: []
  blocks: []
  shared_with: []

tags: [quality, gates, testing, pipeline, correctness]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

LLMs don't write correct code — they write plausible code. They optimize for what looks right, not what is right. SkillFoundry currently catches failures **after** code is written (Anvil T1-T6, Micro-gates MG1-MG3), but the highest leverage is **before** generation: an LLM writes plausible code toward a vague goal, but correct code toward a verifiable contract.

Two specific problems compound this:

1. **No pre-generation contract validation** — Stories can enter the FORGE phase with weak, missing, or unmeasurable acceptance criteria. The coder generates code that "looks right" without a testable definition of "right."

2. **Test correction loop tax** — The tester agent writes tests, they fail or get revised, and because no agent can answer "what contract is this test enforcing and why was it written this way?", the fixer guesses. It fixes the test surface, not the test cause. The `ruthless-tester.md` agent already requires test documentation (Phase 3), but there is no enforcement gate — undocumented tests pass through the pipeline unchallenged.

**Source**: [Matthias Georgi — "LLMs don't write correct code"](https://www.linkedin.com/posts/matthias-georgi-38061b57_llms-dont-write-correct-code-they-write-share-7436321700872343552-9VHX)

### 1.2 Proposed Solution

Add two enforcement layers:

1. **Pre-generation correctness contracts** — Require `done_when` / `fail_when` blocks in every story. Add MG0 (pre-generation AC validation gate) and T0 (post-implementation contract completeness check). Add a new `/ac` skill for AC validation and generation.

2. **Test intent enforcement** — Add MG1.5 (test documentation gate) between MG1 and MG2 that validates test files have intent headers and GWT+WHY comments. When MG1.5 fails, re-trigger the tester (not the fixer) because the problem is documentation, not code. Add a `/doc-tests` skill for retroactive remediation of undocumented tests.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Fixer retries on test files | ~30% of fixer loops touch test files | <10% | Count fixer invocations on `*.test.*` / `*.spec.*` files per forge run |
| Stories with measurable ACs | Not tracked | 100% | MG0 pass rate (every story has done_when with measurable items) |
| Test files with intent headers | Not tracked | 100% of new test files | MG1.5 pass rate |
| Correction loop iterations | ~2-3 per failing story | <1.5 | Average fixer retries per story in forge runs |
| Plausible-but-wrong code rate | Not tracked | Measurable via T0 | Stories where implementation passes T2/T5 but fails T0 contract check |

---

## 2. User Stories

### Primary User: Framework Developer (using /forge)

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | have my stories validated for measurable ACs before code generation starts | the coder works toward a verifiable contract, not a vague goal | MUST |
| US-002 | developer | have a T0 gate that checks if each done_when item has a corresponding test | I catch missing test coverage at zero cost before the full Anvil runs | MUST |
| US-003 | developer | have a gate that validates test documentation quality | undocumented tests don't pass through the pipeline unchallenged | MUST |
| US-004 | developer | have the tester re-triggered (not the fixer) when test documentation is poor | documentation problems get fixed by the author, not by a guesser | MUST |
| US-005 | developer | use `/ac validate` to check my stories for weak ACs | I can fix ACs before starting a forge run | SHOULD |
| US-006 | developer | use `/ac generate` to propose testable ACs from story descriptions | I get a starting point for acceptance criteria when writing stories | SHOULD |
| US-007 | developer | use `/doc-tests scan` to find undocumented test files | I can identify technical debt in existing test suites | SHOULD |
| US-008 | developer | have `done_when` / `fail_when` blocks in my story template | the structure is standardized and machine-parseable | MUST |
| US-009 | developer | have test correction patterns captured in memory_bank | the tester stops repeating the same misunderstanding per module | COULD |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Story template `done_when` / `fail_when` blocks | Add structured correctness contract blocks to the story template used by `/go` story generation | Given a story is generated, When it is written to docs/stories/, Then it contains a `done_when` section with at least 2 measurable items and a `fail_when` section with at least 1 item |
| FR-002 | MG0 — Pre-Generation AC Gate | New micro-gate that runs before the coder agent fires, validating that acceptance criteria exist and are objectively verifiable | Given a story enters the FORGE phase, When MG0 runs, Then it BLOCKS if done_when is missing, empty, or contains only subjective criteria (e.g., "looks good", "works correctly") |
| FR-003 | T0 — Correctness Contract Check | New zero-cost Anvil tier that checks if each done_when item has a corresponding test assertion | Given the coder and tester have completed a story, When T0 runs, Then it FAILS if any done_when item has no test file referencing it via @done_when tag |
| FR-004 | MG1.5 — Test Documentation Gate | New micro-gate between MG1 (security) and MG2 (standards) that validates test intent documentation | Given test files are written, When MG1.5 runs, Then it FAILS if any test lacks a @test-suite header, @rationale tag, or GWT+WHY comments in the test body |
| FR-005 | MG1.5 re-triggers tester, not fixer | When MG1.5 fails, route back to tester agent for documentation remediation | Given MG1.5 returns FAIL, When the pipeline handles the failure, Then it invokes the tester agent (not the fixer) with the failing test files and the specific documentation gaps |
| FR-006 | `/ac` skill — AC validation & generation | New skill with subcommands: `validate` (check stories for weak ACs), `generate` (propose ACs from description), `enforce` (block forge if ACs missing) | Given `/ac validate` is invoked, When stories in docs/stories/ have weak or missing done_when blocks, Then each gap is reported with the story file and suggested improvement |
| FR-007 | `/doc-tests` skill — Test documentation remediation | New skill with subcommands: `scan` (list undocumented tests), `fix` (AI pass to add intent blocks), `report` (coverage %) | Given `/doc-tests scan` is invoked, When test files exist without @test-suite headers or GWT comments, Then each file is listed with the specific missing documentation elements |
| FR-008 | Performance assertion harness in T3 | If `tests/perf/*.bench.*` files exist, T3 runs them and fails if any benchmark exceeds its threshold | Given a story touches DB queries or loops, When perf test files exist, Then T3 runs `npm run test:perf` (or equivalent) and FAILS if any benchmark exceeds its defined threshold |
| FR-009 | Test correction pattern capture | When the fixer touches a test file, harvest a `test_correction` entry to memory_bank with the module, correction reason, and lesson | Given the fixer modifies a test file, When the forge run completes, Then a test_correction entry is written to errors.jsonl with the file, reason, and lesson learned |
| FR-010 | Agent `done_when` / `fail_when` contracts | Add correctness contracts to key agent definitions (coder, tester, architect) | Given an agent contract is loaded, When the agent completes its work, Then the output can be validated against the agent's done_when/fail_when criteria |
| FR-011 | Tester escalation on underspecified features | When the tester cannot write a WHY comment for a test, it stops and flags the story for AC refinement | Given the tester agent encounters a feature where it cannot explain WHY a test exists, When it recognizes the underspecification, Then it STOPS test generation and escalates to the user with a request for AC refinement |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| MG0 execution time | < 5 seconds (single AI turn with focused prompt) |
| T0 execution time | < 2 seconds (grep/regex only, zero AI cost) |
| MG1.5 execution time | < 10 seconds (single AI turn reviewing test diffs) |
| Pipeline overhead from new gates | < 20% increase in total forge run time |

### 4.2 Compatibility

| Aspect | Requirement |
|--------|-------------|
| Story format | Backward-compatible — existing stories without done_when still work (MG0 warns but doesn't block on legacy stories) |
| Anvil integration | T0 is additive — existing T1-T6 unchanged |
| Micro-gate ordering | MG0 → MG1 → MG1.5 → MG2 → MG3 — existing gate logic preserved |
| Platform support | Skills work across all 5 platforms (Claude Code, Copilot, Cursor, Codex, Gemini) |

---

## 5. Technical Specifications

### 5.1 Architecture

```
Story enters FORGE phase
       │
  ┌────▼────┐
  │   MG0   │  Pre-Generation AC Gate (NEW)
  │         │  "Are ACs measurable and complete?"
  └────┬────┘
       │ PASS
  ┌────▼────┐
  │  Coder  │  Implements story
  └────┬────┘
       │
  ┌────▼────┐
  │ Tester  │  Writes tests (with intent docs)
  └────┬────┘
       │
  ┌────▼────┐
  │   T0    │  Correctness Contract Check (NEW)
  │         │  "Does each done_when have a test?"
  └────┬────┘
       │
  ┌────▼────┐
  │   T1    │  Banned Patterns (existing)
  └────┬────┘
       │
  ┌────▼────┐
  │   MG1   │  Security Review (existing)
  └────┬────┘
       │
  ┌────▼────┐
  │  MG1.5  │  Test Documentation Gate (NEW)
  │         │  "Does each test explain WHY?"
  │         │  On FAIL → re-trigger tester
  └────┬────┘
       │
  ┌────▼────┐
  │   MG2   │  Standards Review (existing)
  └────┬────┘
       │
  ... T2-T6, MG3 continue as before
```

### 5.2 Story Template — `done_when` / `fail_when` Blocks

```markdown
## Acceptance Contract

**done_when:**
  - [ ] All unit tests pass with >90% branch coverage on new code
  - [ ] Query returns in <50ms under 10k row dataset
  - [ ] No TypeScript errors, no `any` casts
  - [ ] Audit log entry created on every state change

**fail_when:**
  - Any integration test fails after story implementation
  - Response time exceeds 200ms at p99
  - A secret/credential appears in output or logs
```

### 5.3 MG0 Prompt Template

```
You are reviewing the acceptance criteria for a story before code generation begins.

The story has the following done_when items:
{done_when_items}

The story has the following fail_when items:
{fail_when_items}

For each item, answer:
1. Is this criterion objectively verifiable WITHOUT human judgment?
2. Can an automated test check this criterion?
3. Is the criterion specific enough that two developers would agree on pass/fail?

VERDICT: PASS if ALL criteria are objectively verifiable, FAIL if ANY criterion
requires human judgment to evaluate (e.g., "looks good", "works correctly",
"is well-structured", "handles edge cases properly").

Output format:
VERDICT: PASS|FAIL
FINDINGS:
  [PASS|FAIL] [criterion text] — [reason]
SUMMARY: [one sentence]
```

### 5.4 T0 — Contract Check Logic (Shell/Script)

T0 is a zero-cost static check (no AI call):

```bash
# For each story's done_when item:
# 1. Extract done_when items from story markdown
# 2. Search test files for @done_when tags referencing that item
# 3. FAIL if any done_when item has no corresponding @done_when tag in tests
```

### 5.5 MG1.5 Prompt Template

```
You are reviewing test files for documentation quality.

For each test in this diff, check:
1. Does the test file have a @test-suite header with @story, @done_when, @rationale?
2. Does each test body have GWT comments (GIVEN / WHEN / THEN)?
3. Does each test have a WHY comment explaining what contract it enforces?
4. Could a new developer understand this test WITHOUT reading the source code?

VERDICT: PASS if ALL tests are self-documenting, FAIL if ANY test lacks
intent documentation.

Output format:
VERDICT: PASS|FAIL
FINDINGS:
  [PASS|FAIL] [test name] in [file] — [what's missing]
SUMMARY: [one sentence]
```

### 5.6 Test Intent Header Format

```typescript
/**
 * @test-suite  UserAuthService
 * @story       docs/stories/auth/STORY-002-login-api.md
 * @done_when   User receives 401 on invalid token (AC#3)
 * @rationale   JWT expiry is the most common prod failure in this domain
 * @risk        HIGH — touches session invalidation
 * @author      tester-agent
 */
```

### 5.7 GWT + WHY Test Body Format

```typescript
it('should return 401 when token is expired', () => {
  // GIVEN: A valid user exists with an expired JWT
  // WHY:   AC#3 — session tokens must be invalidated after 1h (STORY-002)
  const token = generateExpiredToken({ userId: 'usr-001' });

  // WHEN: They call a protected endpoint
  const result = authService.validate(token);

  // THEN: Access is denied with the correct error code
  expect(result.statusCode).toBe(401);
  expect(result.errorCode).toBe('TOKEN_EXPIRED'); // not just 401 — specific contract
});
```

### 5.8 Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `sf_cli/src/core/micro-gates.ts` | MODIFY | Add MG0 and MG1.5 gate definitions and prompts |
| `sf_cli/src/core/pipeline.ts` | MODIFY | Wire MG0 before coder, MG1.5 after MG1, MG1.5 failure re-triggers tester |
| `scripts/anvil.sh` | MODIFY | Add T0 correctness contract check before T1 |
| `agents/ruthless-tester.md` | MODIFY | Add escalation rule: stop if WHY is unwritable |
| `agents/ruthless-coder.md` (or coder) | MODIFY | Add done_when/fail_when contract to agent definition |
| `agents/_story-dependency-graph.md` | MODIFY | Update story template to include done_when/fail_when |
| `.claude/commands/ac.md` | CREATE | `/ac` skill definition |
| `.claude/commands/doc-tests.md` | CREATE | `/doc-tests` skill definition |
| `sf_cli/src/core/memory-harvest.ts` | MODIFY | Add test_correction entry type for fixer-touches-test tracking |
| Platform copies (5 platforms) | CREATE/MODIFY | Sync `/ac` and `/doc-tests` skills across platforms |

---

## 6. Constraints & Assumptions

### 6.1 Constraints

- **Technical:** MG0 and MG1.5 are AI gates (cost ~15% pipeline increase each). T0 is zero-cost shell.
- **Backward compatibility:** Existing stories without done_when must not break the pipeline. MG0 should WARN on legacy stories, not BLOCK.
- **No new dependencies:** Implementation uses existing micro-gate infrastructure, existing Anvil shell framework.

### 6.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| LLMs can reliably judge if an AC is "objectively verifiable" | MG0 becomes unreliable gatekeeper | Include examples of PASS/FAIL ACs in the prompt; tune with real story data |
| Tester agent can produce GWT+WHY documentation consistently | MG1.5 becomes a bottleneck | Start with WARN-only mode, escalate to BLOCK after 2 forge runs prove stability |
| Test correction tracking reduces repeat failures | Logging without learning | Promote corrections to tester preferences after 2+ identical corrections |

### 6.3 Out of Scope

- [ ] Automated performance benchmark generation (only harness for existing perf tests)
- [ ] Retroactive addition of done_when to all 50+ existing stories (use `/ac` manually)
- [ ] LLM-based AC generation without human review (AI proposes, human approves)
- [ ] Changes to T1-T6 behavior (additive only)
- [ ] MG3 modifications (cross-story review unchanged)

---

## 7. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | MG0 false positives — blocks stories with valid but non-obvious ACs | M | H | Include 10+ examples of valid/invalid ACs in prompt. Allow `/forge --skip-mg0` override for edge cases. |
| R-002 | MG1.5 increases pipeline time significantly | M | M | Single-turn AI review, <10s. Monitor cost per forge run. |
| R-003 | T0 regex matching is too brittle for @done_when tags | M | M | Use fuzzy content matching (substring), not exact string match. Fall back to story-file reference if no @done_when tag. |
| R-004 | Tester re-trigger loop (MG1.5 fails → tester → MG1.5 fails again) | L | H | Max 2 MG1.5 retries. After 2 failures, WARN and continue (don't block). |
| R-005 | Developers resist done_when/fail_when overhead in story writing | M | M | `/ac generate` automates AC proposal. Show reduction in fixer loops as ROI. |

---

## 8. Implementation Plan

### 8.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | Core Gates | Story template update, MG0, T0, `/ac` skill | None |
| 2 | Test Documentation | MG1.5, tester escalation, `/doc-tests` skill | Phase 1 |
| 3 | Learning Loop | Test correction capture, perf assertion harness, agent contracts | Phase 2 |

### 8.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 | M | Medium | Medium |
| 2 | M | Medium | Low |
| 3 | S | Low | Low |

---

## 9. Acceptance Criteria

### 9.1 Definition of Done

- [ ] Story template includes done_when/fail_when blocks
- [ ] MG0 blocks stories with missing or unmeasurable ACs
- [ ] T0 checks done_when-to-test mapping at zero AI cost
- [ ] MG1.5 validates test documentation quality
- [ ] MG1.5 failures re-trigger tester, not fixer (max 2 retries)
- [ ] `/ac validate` reports weak ACs across all stories
- [ ] `/ac generate` proposes testable ACs from story descriptions
- [ ] `/doc-tests scan` lists undocumented test files
- [ ] Running MG0 on a story with vague ACs (e.g., "works correctly") returns FAIL
- [ ] Running MG0 on a story with measurable ACs (e.g., "returns 401 on expired token") returns PASS
- [ ] Running T0 after implementation with untested done_when items returns FAIL
- [ ] Test files with @test-suite headers and GWT+WHY comments pass MG1.5
- [ ] Test files without intent documentation fail MG1.5
- [ ] Pipeline overhead from all new gates < 25% of total forge run time
- [ ] Existing stories without done_when trigger MG0 WARN (not BLOCK)
- [ ] Unit tests cover MG0, T0, MG1.5 gate logic
- [ ] All 5 platform copies updated with `/ac` and `/doc-tests` skills

---

## 10. Appendix

### 10.1 Glossary

| Term | Definition | Code Name |
|------|------------|-----------|
| Acceptance Criteria | Objectively verifiable conditions that define "done" | `done_when` / `fail_when` |
| Correctness Contract | The combination of done_when + fail_when that defines the verifiable goal | `correctness_contract` |
| Pre-Generation Gate | A gate that runs before the coder agent fires | `MG0` |
| Test Intent Block | Structured header at the top of every test file | `@test-suite` header |
| GWT | Given/When/Then test structure | `GWT` |
| Test Documentation Gate | AI gate validating test intent documentation | `MG1.5` |
| Plausible Code | Code that looks correct but isn't verifiably correct | — |

### 10.2 References

- [Matthias Georgi — "LLMs don't write correct code, they write plausible code"](https://www.linkedin.com/posts/matthias-georgi-38061b57_llms-dont-write-correct-code-they-write-share-7436321700872343552-9VHX)
- Existing Anvil protocol: `agents/_anvil-protocol.md`
- Existing micro-gates: `sf_cli/src/core/micro-gates.ts`
- Existing tester contract: `agents/ruthless-tester.md` (Phase 3: Test Documentation)
- Existing story template: `agents/_story-dependency-graph.md`

### 10.3 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-08 | n00b73 | Initial draft |

---
