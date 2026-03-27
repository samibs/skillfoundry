# PRD: Framework Hardening — From Wild Beast to Trained Beast

**Date**: 2026-03-27
**Author**: n00b73 + Claude
**Status**: READY
**Priority**: CRITICAL
**Estimated Effort**: Very Large (7 phases, multi-session)

---

## Problem Statement

SkillFoundry v2.0.77 has 68 agents, 171 deviation patterns, 2,200+ tests, and a certification pipeline. But it has 7 structural weaknesses that prevent it from being a truly reliable, self-proving platform:

1. **Context overload** — The framework eats 30-50K tokens before the user says anything, reducing quality
2. **Deviation catalog is write-only** — 171 patterns documented but only ~30 enforced by code
3. **No integration tests** — Pipeline works manually but CI can't prove it
4. **Domain packs go stale** — No alerting when rules need re-verification
5. **Smart router has zero training data** — Falls back to keywords 100% of the time
6. **No external validation** — Works for our projects, unproven for anyone else
7. **Forge pipeline is a prompt, not a program** — No deterministic orchestration

**Impact**: The framework's own weight reduces the quality of the work it produces. Rules exist but aren't enforced. The learning system can't learn. The pipeline is only as reliable as the LLM's instruction-following.

---

## Phases

### Phase 1: Context-Aware Loading (P0)

**Problem**: CLAUDE.md + agent files + deviation catalog = 30-50K tokens loaded on every session. Leaves less room for actual code context.

**Solution**:
- Create `CLAUDE-LITE.md` (~500 tokens) — loaded by default for everyday work
- Full `CLAUDE.md` loaded only when `/forge`, `/certify`, `/go` are invoked
- Agent files loaded on-demand, not pre-loaded
- Deviation catalog referenced but not bulk-loaded — agents load only their category

**User Stories**:

#### Story 1.1: Create CLAUDE-LITE.md
**As a** developer using SkillFoundry for everyday coding,
**I want** a lightweight context file loaded by default,
**So that** more context window is available for my actual code.

**Acceptance Criteria**:
- [ ] `CLAUDE-LITE.md` exists with <500 tokens covering: philosophy, security essentials, three-layer rule, contract mismatch rule, array safety, DB naming
- [ ] `CLAUDE.md` references `CLAUDE-LITE.md` as the default active context
- [ ] Full `CLAUDE.md` can be loaded on demand via `@CLAUDE.md` or when `/forge` is invoked

#### Story 1.2: Deviation catalog per-category loading
**As an** agent processing code,
**I want** only my relevant deviation categories loaded,
**So that** context is not wasted on patterns I don't check.

**Acceptance Criteria**:
- [ ] Split `_known-deviations.md` into per-category files: `_deviations-frontend.md`, `_deviations-backend.md`, etc.
- [ ] Each agent references only its categories (e.g., coder references frontend + backend + typescript + contract)
- [ ] Full catalog still available as `_known-deviations.md` for `/certify` and `/gate-keeper`

---

### Phase 2: Executable Deviation Checks (P0)

**Problem**: 171 deviation patterns are documented in markdown. Only ~30 are checked by `/certify`. The rest are guidance that agents may or may not follow.

**Solution**: Convert the top 50 most impactful patterns into executable checks in the certification engine. Each pattern becomes a function that scans actual code.

**User Stories**:

#### Story 2.1: Contract mismatch detector
**As a** developer running `/certify`,
**I want** the engine to detect frontend-backend contract mismatches automatically,
**So that** I catch data shape mismatches before runtime.

**Acceptance Criteria**:
- [ ] New certification category: `contracts` (weight: 10%)
- [ ] Scans frontend fetch/axios calls, extracts endpoint paths
- [ ] Compares against actual backend route definitions
- [ ] Reports: missing endpoints, type mismatches (where detectable via TypeScript types)
- [ ] At least 5 CONTRACT-* patterns checked automatically

#### Story 2.2: Authorization pattern detector
**As a** developer running `/certify`,
**I want** the engine to detect missing authorization checks,
**So that** BOLA/IDOR vulnerabilities are caught before deployment.

**Acceptance Criteria**:
- [ ] Scans API route handlers for authorization checks
- [ ] Flags endpoints that return user-scoped data without `user_id` filtering
- [ ] Flags admin routes without role checks
- [ ] At least 3 AUTH-* patterns checked automatically

#### Story 2.3: Error handling gap detector
**As a** developer running `/certify`,
**I want** the engine to detect missing error handling,
**So that** swallowed exceptions and unhandled promises are caught.

**Acceptance Criteria**:
- [ ] Detects empty catch blocks `catch (e) {}`
- [ ] Detects fetch/axios calls without try/catch
- [ ] Detects missing global error handler (Express, Next.js)
- [ ] At least 4 ERR-* patterns checked automatically

#### Story 2.4: Supply chain safety detector
**As a** developer running `/certify`,
**I want** the engine to verify dependencies exist and are safe,
**So that** hallucinated packages and known CVEs are caught.

**Acceptance Criteria**:
- [ ] Reads package.json dependencies
- [ ] Checks for wildcard `"*"` versions
- [ ] Checks for very old publish dates (>2 years = warning)
- [ ] Verifies lockfile exists and is committed
- [ ] At least 3 SUPPLY-* patterns checked automatically

---

### Phase 3: Integration Test Suite (P1)

**Problem**: 2,200+ unit tests but no end-to-end test proving the pipeline works.

**Solution**: Create a sample project with intentional violations. CI runs `/certify` → asserts failures → runs remediation → asserts fixes.

**User Stories**:

#### Story 3.1: Sample project with intentional violations
**As a** framework developer,
**I want** a test project with known issues,
**So that** I can verify `/certify` catches them all.

**Acceptance Criteria**:
- [ ] `examples/test-project/` created with: hardcoded secrets, missing tests, no README, wildcard deps, missing viewport, PII in logs
- [ ] At least 1 violation per certification category
- [ ] Expected grade: D or F

#### Story 3.2: Certification round-trip test
**As a** framework developer,
**I want** an integration test that runs certify → remediate → re-certify,
**So that** CI proves the pipeline works end-to-end.

**Acceptance Criteria**:
- [ ] Test script: runs `runCertification()` on test project, asserts grade < A
- [ ] Applies known fixes programmatically
- [ ] Re-runs certification, asserts grade >= B
- [ ] Runs in CI (vitest or shell script)

---

### Phase 4: Domain Pack Staleness Alerting (P1)

**Problem**: 64 domain rules with `last_verified` dates. No alerting when rules go stale.

**Solution**: Add staleness detection to `/domain` and a verification script.

**User Stories**:

#### Story 4.1: Staleness warning in /domain output
**As a** developer querying domain knowledge,
**I want** to see a warning when a rule hasn't been verified recently,
**So that** I know to double-check against current legislation.

**Acceptance Criteria**:
- [ ] Rules with `last_verified` > 6 months ago show `⚠ STALE` warning
- [ ] Rules with `last_verified` > 12 months ago show `🔴 OUTDATED` warning
- [ ] `/domain list` shows staleness summary per pack

#### Story 4.2: Pack verification script
**As a** framework maintainer,
**I want** a script that lists rules needing re-verification,
**So that** I can plan quarterly pack updates.

**Acceptance Criteria**:
- [ ] `scripts/verify-packs.sh` lists all rules by `last_verified` date
- [ ] Groups: current (<6mo), stale (6-12mo), outdated (>12mo)
- [ ] Outputs markdown table suitable for review

---

### Phase 5: Smart Router Instrumentation (P1)

**Problem**: The smart router falls back to keyword classification because no forge runs have recorded outcomes.

**Solution**: Instrument `/forge` and `/go` to automatically record routing decisions and outcomes.

**User Stories**:

#### Story 5.1: Auto-record routing decisions during forge
**As a** framework user running `/forge`,
**I want** routing decisions automatically recorded,
**So that** the smart router learns from real outcomes.

**Acceptance Criteria**:
- [ ] When forge dispatches to an agent (coder, tester, architect), record the decision
- [ ] After story completes, record outcome (success/failure/partial) and score
- [ ] Data written to `routing_decisions` and `agent_performance` tables
- [ ] After 10+ forge runs, router makes data-driven recommendations

---

### Phase 6: External Validation via RegForge Beta (P2)

**Problem**: SkillFoundry works for our projects but is unproven for others.

**Solution**: Offer free certification for 10 indie projects via regforge.eu. Their experience validates the framework.

**User Stories**:

#### Story 6.1: RegForge beta onboarding flow
**As an** indie developer,
**I want to** submit my project for free certification,
**So that** I get a grade and remediation roadmap.

**Acceptance Criteria**:
- [ ] regforge.eu landing page with "Get Certified (Beta)" CTA
- [ ] Submission form: GitHub URL, project type, email
- [ ] Automated clone → `/certify` → generate HTML report → email to developer
- [ ] Collect feedback: "Was this useful? What's missing?"

---

### Phase 7: Forge Pipeline as Code (P2)

**Problem**: `/forge` is a 1,500-line markdown prompt. If Claude misunderstands one instruction, the run fails.

**Solution**: Convert the forge pipeline from a prompt into a TypeScript orchestrator that manages state deterministically.

**User Stories**:

#### Story 7.1: Forge runner core
**As a** framework developer,
**I want** the forge pipeline orchestrated by code, not by prompt,
**So that** execution is deterministic, resumable, and debuggable.

**Acceptance Criteria**:
- [ ] `sf_cli/src/core/forge-runner.ts` — TypeScript orchestrator
- [ ] State machine: IDLE → VALIDATE → GENERATE_STORIES → EXECUTE → AUDIT → COMPLETE
- [ ] State persisted to SQLite (not .claude/state.json)
- [ ] Each phase calls the LLM for code generation only, not for pipeline logic
- [ ] Resume from any state on crash/context exhaustion
- [ ] Deterministic story ordering (dependency graph computed in code)

#### Story 7.2: Agent dispatch as subprocess
**As a** forge runner,
**I want** agents dispatched as isolated subprocess calls,
**So that** one agent failure doesn't crash the entire pipeline.

**Acceptance Criteria**:
- [ ] Each agent invocation is a separate API call with scoped context
- [ ] Agent gets: story file + relevant source files + deviation rules for its category
- [ ] Agent returns: files changed, outcome, issues found
- [ ] Runner aggregates results, manages retries, records to smart router

---

## Out of Scope

- Rewriting all 68 agent prompt files (they work, just need context-aware loading)
- Building a full regforge.eu web application (Phase 6 is landing page + automated script)
- Replacing the LLM entirely (Phase 7 still uses LLM for code generation, just not for orchestration)

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| CLAUDE-LITE.md too small to be useful | Agents miss critical rules | Include the top 10 most-violated rules, not just philosophy |
| Executable checks produce false positives | Developers ignore `/certify` | Same approach as security scanner: context-aware exclusions |
| Integration tests are slow | CI takes too long | Run integration tests nightly, not on every push |
| Forge-as-code is a major rewrite | Breaks existing workflow | Keep prompt-based `/forge` as fallback. New runner is opt-in via `--runner=code` |
| No beta testers sign up | No external validation | Start with your own 16 registered projects as test subjects |

## Success Criteria

- [ ] CLAUDE-LITE.md loaded by default, <500 tokens, no quality regression
- [ ] `/certify` checks 50+ patterns automatically (up from ~30)
- [ ] Integration test proves certify → remediate → re-certify pipeline
- [ ] `/domain` warns on stale rules (>6 months)
- [ ] Smart router makes 1+ data-driven recommendation after 10 forge runs
- [ ] 3+ external projects certified via regforge.eu beta
- [ ] Forge runner executes 1 PRD end-to-end deterministically

## Implementation Order

```
Phase 1 (Context)  ← Do first, immediate quality improvement
Phase 2 (Checks)   ← Do second, biggest enforcement gap
Phase 5 (Router)   ← Small effort, enables learning
Phase 3 (Tests)    ← Proves everything works
Phase 4 (Stale)    ← Quick win for domain packs
Phase 6 (Beta)     ← Business milestone for regforge.eu
Phase 7 (Forge)    ← Largest effort, do last
```
