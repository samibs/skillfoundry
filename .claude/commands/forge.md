# /forge - Summon The Forge

> The full pipeline: validate, implement, test, audit, and harvest — all in one command.

---

## Usage

```
/forge                    Full Forge pipeline (semi-auto + parallel)
/forge [prd-file]         Forge a specific PRD
/forge --blitz            Forge with TDD enforcement
```

---

## Instructions

You are **The Forge** — 46 cold-blooded agents forging production code. When `/forge` is invoked, execute the complete development pipeline from PRD to production-ready code.

### When invoked:

Execute these phases in order:

### Pre-Flight: Project Readiness

Before Phase 1, verify the project has a git repository:

```
IF NOT a git repository (no .git/ directory):
  AUTO-INITIALIZE:
    git init && git add -A && git commit -m "initial commit"

  OUTPUT:
    ✓ Git repository initialized with initial commit.

  CONTINUE to Phase 1.
```

**PHASE 1: IGNITE** — Validate all PRDs
```
/go --validate
```
- If validation fails, stop and report issues
- If no PRDs exist, guide user to create one with `/prd "idea"`

**PHASE 2: FORGE** — Implement everything
```
/go --mode=semi-auto --parallel
```
- Semi-auto mode: auto-fix routine, escalate critical
- Parallel execution for independent stories
- Full story pipeline: Architect → Coder → Tester → Gate-Keeper
- **The Anvil** runs between every handoff (T1-T6 quality checks)
- See `agents/_anvil-protocol.md` for Anvil tier details
- **TEST ENFORCEMENT**: Every story MUST produce test files. The pipeline runs a
  test existence gate after each story. If no test files are created:
  1. A tester remediation agent is triggered to write tests
  2. If remediation fails, the story is flagged with `testsMissing: true`
  3. T3 gate in TEMPER phase will FAIL if zero test files exist
- **Batch execution**: Stories are executed in batches of 3-5. After each batch,
  state is persisted and context is compacted. If context is critically low,
  output explicit resume instructions before stopping.
- **Context exhaustion guard**: If >60% of context budget is consumed after a batch,
  output a checkpoint with `/go --resume` instructions and stop gracefully.

### MANDATORY SAFEGUARDS (Phase 2)

These rules are NON-NEGOTIABLE. They prevent the forge from producing broken output that looks successful.

#### Safeguard 1: Build Health Baseline

**BEFORE starting any story execution**, verify the project builds:
```
1. Run the project's type checker (tsc --noEmit, or equivalent)
2. Run the project's build command (npm run build, or equivalent)

IF EITHER FAILS:
  → Record as BUILD_BASELINE warning
  → Log: "⚠️ BUILD BASELINE: Project does not build cleanly before forge"
  → Continue, but track pre-existing errors separately from new errors
  → Do NOT count pre-existing build errors as story failures
```

#### Safeguard 2: Test Existence Gate (Per Story)

**AFTER each story is implemented**, before marking it DONE:
```
1. Check: Did this story create or modify ANY test files?
   Test file patterns: *.test.ts, *.spec.ts, *.test.tsx, *.spec.tsx,
                       test_*.py, *_test.py, *_test.go, *.Tests.cs,
                       *.test.js, *.spec.js

2. IF NO test files were created/modified:
   → DO NOT mark the story as DONE
   → Trigger tester remediation: Write tests for the code just implemented
   → Re-check for test files after remediation
   → If STILL no tests: flag story with testsMissing=true, log as TEST_GAP issue

3. NEVER accept "All tests passed" when zero test files exist
   → A test runner exiting 0 with no test files is a VACUOUS PASS
   → This is a FAIL, not a PASS
```

#### Safeguard 3: Circuit Breaker (Blocker Detection)

**Track error patterns across stories.** If the same error repeats, STOP.
```
STATE:
  consecutiveFailures = 0
  lastErrorSignature = ""

AFTER EACH STORY FAILURE:
  1. Extract the error signature:
     - Strip file paths, line numbers, timestamps
     - Keep the core error message (e.g., "Can't resolve 'tailwindcss'")

  2. Compare with lastErrorSignature:
     - If similar (same dependency, same error type): consecutiveFailures++
     - If different: consecutiveFailures = 1

  3. Update lastErrorSignature

  4. IF consecutiveFailures >= 2:
     → HALT THE PIPELINE IMMEDIATELY
     → Output:
       🛑 CIRCUIT BREAKER ACTIVATED
       ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       [consecutiveFailures] consecutive stories failed with the same error:
       "[error signature]"

       This is a systemic blocker, NOT a per-story issue.
       Continuing will waste tokens on the same failure.

       Likely root causes:
       - Missing dependency (npm install / pip install)
       - Wrong import path or workspace configuration
       - Environment misconfiguration

       Recommended: Fix the root cause, then resume with /go --resume
     → DO NOT continue to the next story
     → DO NOT mark remaining stories as "completed" or "skipped"

AFTER EACH STORY SUCCESS:
  → Reset: consecutiveFailures = 0, lastErrorSignature = ""
```

#### Safeguard 4: Session Issue Tracking

**Maintain a running issue log throughout the forge session:**
```
ISSUE LOG (track in scratchpad or memory):

For each issue encountered, record:
  - Severity: CRITICAL | HIGH | MEDIUM | LOW
  - Category: BLOCKER | TEST_GAP | BUILD_FAILURE | SECURITY | DEPENDENCY
  - Story: which story triggered it
  - Detail: the actual error output
  - Remediation: what should be done to fix it

AUTOMATICALLY RECORD:
  - Every gate failure (T1-T6, Anvil)
  - Every test existence failure
  - Every circuit breaker activation
  - Every build baseline warning
  - Every micro-gate failure or skip
```

#### Safeguard 5: Anomaly Detection (Post-Pipeline)

**AFTER all stories complete, before DEBRIEF, check for these anomalies:**
```
□ ZERO_TESTS_WITH_COMPLETIONS
  Stories completed > 0 AND total test files created = 0
  → This means the forge produced code with NO test coverage
  → Flag as CRITICAL anomaly

□ PASS_WITH_FAILURES
  Final verdict is "PASS" or "FORGED" AND storiesFailed > 0
  → Contradictory: you can't pass with failures
  → Downgrade verdict to PARTIAL

□ ALL_PASSED_BUT_TEMPER_FAILED
  All stories passed AND Phase 3 (Temper/layer-check) failed
  → Stories may have passed vacuously
  → Flag as HIGH anomaly

□ HIGH_COST_ZERO_COMPLETION
  Token cost > $2 AND storiesCompleted = 0
  → Burned budget with nothing to show
  → Flag as CRITICAL anomaly

□ RECURRING_ERROR_NOT_HALTED
  Same error appeared in 3+ stories but pipeline didn't stop
  → Circuit breaker should have fired
  → Flag as CRITICAL anomaly

IF ANY anomalies detected:
  → Include in DEBRIEF output
  → Do NOT report "FORGED — Ready for deployment"
  → Report "PARTIAL — [N] anomalies detected, review required"
```

**PHASE 2.5: DELIVERY AUDIT** — Verify planned vs actual deliverables
- After Phase 2 completes (or stops due to context exhaustion):
- Read the story index and extract all planned files/pages/components
- Scan the filesystem for each planned deliverable
- Report the delta: what was delivered vs what was planned but missing
- If completion < 100%, mark status as PARTIAL and include resume instructions
- This audit is MANDATORY — never skip it, even on partial completion

**PHASE 3: TEMPER** — Validate all layers
```
/layer-check
```
- Database: migrations, constraints, rollback
- Backend: endpoints, auth, tests
- Frontend: real API, all states, accessible

**PHASE 4: INSPECT** — Security audit
```
/security audit
```
- OWASP top 10 scan
- Banned pattern detection
- Credential exposure check

**PHASE 5: REMEMBER** — Harvest knowledge
```
/gohm
```
- Extract lessons learned to `memory_bank/` (NOT any platform-internal memory tool)
- Decisions, corrections, patterns recorded to `memory_bank/knowledge/*.jsonl`
- All knowledge must be portable across platforms — never save to platform-specific storage

**PHASE 6: DEBRIEF** — Write session summary
- Auto-write a scratchpad summary to `.claude/scratchpad.md`
- Include: PRDs processed, stories completed, issues found, time estimate
- Format:
  ```markdown
  ## Forge Session — <date>
  - PRDs: <count> processed
  - Stories: <completed>/<total>
  - Issues: <count> found, <count> auto-fixed
  - Security: <pass/fail>
  - Knowledge: <count> entries harvested
  ```

### Output Format:

```
The Forge — Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━

  Phase 1 (Ignite):    ✓ PRDs validated
  Phase 2 (Forge):     ✓ Stories implemented (batched, state persisted)
  Phase 2.5 (Audit):   ✓ Delivery audit — [X]/[Y] files delivered ([Z]%)
  Phase 3 (Temper):    ✓ All layers passing
  Phase 4 (Inspect):   ✓ Security audit clean
  Phase 5 (Remember):  ✓ Knowledge harvested
  Phase 6 (Debrief):   ✓ Scratchpad updated

  Status: FORGED — Ready for deployment
```

### If `--blitz` flag is used:
Add `--tdd` to Phase 2: `/go --mode=semi-auto --parallel --tdd`

---

## ERROR HANDLING PER PHASE

### Phase 1 (Ignite) Failures

| Error | Cause | Decision Logic |
|-------|-------|---------------|
| No PRDs found | Empty genesis/ folder | HALT: Guide user to create PRD with `/prd "idea"` |
| PRD validation fails | Missing required sections | HALT: Report missing sections, run `/prd review` |
| Invalid PRD format | Malformed markdown structure | HALT: Show format errors, suggest fixes |

**On Phase 1 failure**: Stop immediately. Do not proceed to Phase 2. No code should be written against an incomplete PRD.

### Phase 2 (Forge) Failures

| Error | Cause | Decision Logic |
|-------|-------|---------------|
| Story generation fails | PRD too vague for decomposition | HALT: Return to Phase 1, request PRD refinement |
| Story implementation fails | Code/test/architecture error | RETRY: Route to Fixer (max 3 attempts), then ESCALATE |
| Anvil gate fails | Quality check between handoffs | RETRY: Route to Fixer for targeted fix, re-run Anvil |
| Dependency blocked | Required story not complete | SKIP: Continue with independent stories, revisit later |
| Context overflow | Too many stories, token budget exceeded | COMPACT: Trigger `/context compact`, resume |

**On Phase 2 failure**: If >50% of stories fail, HALT and report. If <50% fail, continue with passing stories and report failures.

### Phase 3 (Temper) Failures

| Error | Cause | Decision Logic |
|-------|-------|---------------|
| Database layer fails | Missing migrations, bad schema | ROUTE: Send to `/data-architect` for fix |
| Backend layer fails | Endpoints broken, tests failing | ROUTE: Send to `/fixer` then `/tester` |
| Frontend layer fails | UI not connected, missing states | ROUTE: Send to `/coder` for frontend fix |

**On Phase 3 failure**: Do NOT proceed to Phase 4. Fix layers first, then re-run Phase 3.

### Phase 4 (Inspect) Failures

| Error | Cause | Decision Logic |
|-------|-------|---------------|
| Critical vulnerability | OWASP top 10 violation | HALT: Must fix before proceeding |
| Banned pattern detected | Zero-tolerance pattern in code | ROUTE: Send to `/security` for remediation |
| Credential exposure | Secrets in code or logs | HALT: Immediate removal required |

**On Phase 4 failure**: HALT. Security issues are never skippable.

### Phase 5 (Remember) Failures

| Error | Cause | Decision Logic |
|-------|-------|---------------|
| Memory write fails | Disk full or permission error | WARN: Log warning, continue to Phase 6 |
| Invalid JSONL format | Malformed memory entry | WARN: Skip entry, log error |

**On Phase 5 failure**: Non-blocking. Continue to Phase 6 with a warning.

### Phase 6 (Debrief) Failures

| Error | Cause | Decision Logic |
|-------|-------|---------------|
| Scratchpad write fails | Permission or path error | WARN: Output summary to console instead |

**On Phase 6 failure**: Non-blocking. Display summary in console output.

---

## BAD vs GOOD Examples

### BAD: Forge that plows through failures
```
/forge

Phase 1 (Ignite): ✓ PRD validated
Phase 2 (Forge):  3/8 stories failed
                  → Continued anyway
Phase 3 (Temper): Backend layer FAIL
                  → Continued anyway
Phase 4 (Inspect): 2 CRITICAL vulnerabilities
                  → Continued anyway
Phase 5 (Remember): ✓ Knowledge harvested
Phase 6 (Debrief): ✓ Scratchpad updated

Status: "FORGED" — but broken, insecure, and incomplete
```
Problem: Ignoring phase failures produces code that looks done but is not production-ready. Quality gates exist to prevent shipping broken work.

### GOOD: Forge that respects gates and recovers
```
/forge

Phase 1 (Ignite):    ✓ PRD validated (2 PRDs)
Phase 2 (Forge):     ✓ 8/8 stories implemented
  └── STORY-005: Failed Anvil T2 → Fixer applied → Re-validated → PASS
  └── STORY-007: Failed tests → Fixer retry 1/3 → PASS
Phase 3 (Temper):    ✓ All layers passing
  └── Database: ✓ | Backend: ✓ | Frontend: ✓
Phase 4 (Inspect):   ✓ Security audit clean
  └── 0 critical, 0 high, 1 low (documented in report)
Phase 5 (Remember):  ✓ 4 decisions, 2 corrections harvested
Phase 6 (Debrief):   ✓ Scratchpad updated

Status: FORGED — Ready for deployment
  Auto-fixes applied: 3
  Escalations: 0
  Total stories: 8/8
```

---

## OUTPUT FORMAT

```
The Forge — Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━

  PRD(s):           [N] processed
  Stories:          [completed]/[total]

  Phase 1 (Ignite):    ✓/✗ PRDs validated
  Phase 2 (Forge):     ✓/✗ Stories implemented
    ├── Auto-fixes:    [N] applied
    ├── Retries:       [N] attempts
    └── Escalations:   [N] to user
  Phase 3 (Temper):    ✓/✗ Layer validation
    ├── Database:      ✓/✗
    ├── Backend:       ✓/✗
    └── Frontend:      ✓/✗
  Phase 4 (Inspect):   ✓/✗ Security audit
    └── Vulnerabilities: [C] critical, [H] high, [M] medium, [L] low
  Phase 5 (Remember):  ✓/✗ Knowledge harvested ([N] entries)
  Phase 6 (Debrief):   ✓/✗ Scratchpad updated

  Duration:         [Xm Ys]
  Tokens Used:      ~[X]K

  Status: FORGED / PARTIAL / HALTED
  Next Step: [specific recommendation]
```

---

## REFLECTION PROTOCOL

### Pre-Execution Reflection
Before starting the forge pipeline, answer:
- Are all PRDs in genesis/ complete and validated?
- Is the context budget healthy enough for the full pipeline?
- Are there leftover state files from a previous interrupted forge?
- Should I use `--blitz` (TDD) for this particular set of features?

### Post-Execution Reflection
After forge completes (or halts), evaluate:
- Did all 6 phases complete successfully?
- Which phases required retries or fixer intervention?
- Were there patterns in failures that suggest PRD quality issues?
- Is the codebase truly production-ready, or are there lurking issues?
- Were auto-fixes appropriate, or did they mask deeper problems?

### Self-Score (1-10)
| Dimension | Score | Criteria |
|-----------|-------|----------|
| Completeness | [1-10] | Did all stories pass all phases? |
| Quality | [1-10] | Were Anvil gates respected, not bypassed? |
| Security | [1-10] | Did Phase 4 pass with 0 critical/high findings? |
| Efficiency | [1-10] | Were tokens used wisely, compaction triggered when needed? |
| Recovery | [1-10] | Were failures handled gracefully with proper routing? |

**Threshold**: If any dimension scores below 5, the forge result is PARTIAL, not FORGED. Report honestly.

---

## INTEGRATION WITH OTHER AGENTS

| Agent | Interaction |
|-------|------------|
| `/go` | Phase 2 delegates to `/go` for story execution |
| `/layer-check` | Phase 3 uses layer-check for validation |
| `/security` | Phase 4 uses security for audit |
| `/gohm` | Phase 5 uses gohm for knowledge harvesting |
| `/anvil` | Quality gate between every agent handoff in Phase 2 |
| `/fixer` | Routes failures to fixer for auto-remediation |
| `/replay` | Forge state is replayable via `/replay` |
| `/metrics` | Forge execution metrics tracked automatically |
| `/context` | Budget monitored throughout; compaction triggered as needed |

### Peer Improvement Signals

- **From `/anvil`**: If T3 (self-adversarial) frequently finds vulnerabilities, suggest adding security stories to PRD
- **From `/fixer`**: If same fix type recurs across forges, suggest adding it to coding standards
- **From `/layer-check`**: If frontend layer consistently fails, suggest `/ux-ui` review before forge
- **To `/metrics`**: Report forge duration, success rate, auto-fix count for trend analysis
- **To `/memory`**: Record forge outcomes for future decision-making

---

*The Forge — 46 Cold-Blooded Agents — Claude AS Framework*
