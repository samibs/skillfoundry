# TestLoop — Closed-Loop Implementation Validator

**Role:** Autonomous quality enforcement engine that runs tests, parses results, fixes failures, and loops until everything is green.

**Persona:** See `agents/testloop.md` for full agent definition.

---

## Usage

```
/testloop                          Auto-detect scope, run all tests
/testloop unit                     Unit tests only
/testloop e2e                      Playwright E2E tests only
/testloop all                      Unit + integration + E2E
/testloop --max 3                  Override max iterations (default: 5)
/testloop --file path/to/test.ts   Run a specific test file
/testloop --story STORY-001        Run tests tagged to a story
```

## What It Does

1. **Detects** the test framework (Playwright, Jest, Vitest, pytest, dotnet, go)
2. **Runs** the tests and captures structured output
3. **Parses** failures — exact error message, file, line, category
4. **Checks** for oscillation (same failure 3× = structural problem, loop stops)
5. **Dispatches** targeted fix briefs to the coder for each failure
6. **Repeats** until all tests pass or max iterations are hit
7. **Evaluates** the implementation with `/evaluator` on success
8. **Escalates** with a full iteration log if the loop cannot converge

## Loop Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    TESTLOOP CYCLE                        │
│                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐  │
│  │  RUN     │───►│  PARSE   │───►│  ALL PASS?       │  │
│  │  TESTS   │    │  RESULTS │    │  YES → EVALUATE  │  │
│  └──────────┘    └──────────┘    │  NO  → FIX LOOP  │  │
│       ▲                          └──────────────────┘  │
│       │                                   │             │
│  ┌──────────┐    ┌──────────────────┐    │             │
│  │  CODER   │◄───│  FIX DISPATCH   │◄───┘             │
│  │  APPLIES │    │  (targeted briefs│                  │
│  │  FIXES   │    │   per failure)   │                  │
│  └──────────┘    └──────────────────┘                  │
│                                                          │
│  Guard: Oscillation detected (3× same failure) → STOP   │
│  Guard: Max iterations reached → ESCALATE               │
└─────────────────────────────────────────────────────────┘
```

## Behavior

Follow the full execution protocol defined in `agents/testloop.md`:

- **Phase 0:** Pre-flight (framework detection, test file check, dev server check for E2E)
- **Phase 1:** Execute tests with structured JSON output capture
- **Phase 2:** Parse results into unified format, render iteration report
- **Phase 3:** Oscillation detection — track failure signatures, stop patching circular failures
- **Phase 4:** Fix dispatch — generate surgical fix briefs, invoke coder, loop back
- **Phase 5:** On all-pass — run `/evaluator` for final quality verdict
- **Phase 6:** On max iterations or deadlock — produce full iteration log, escalate

## State

Loop state is tracked in `.claude/testloop-state.json` across iterations.
Final evaluator verdict is stored in the state file under `final_verdict`.

## Integration

| Agent | Role in Loop |
|-------|-------------|
| `_test-execution.md` | Framework detection, command construction, result parsing |
| `_bidirectional-iteration.md` | Oscillation detection and convergence rules |
| `ruthless-coder` | Applies surgical fixes per fix brief |
| `merciless-evaluator` | Final quality grade on success |
| `fixer-orchestrator` | Escalation routing when loop halts |

## Playwright Notes

When E2E scope is active:
- Screenshot and video paths are extracted from failures and reported
- Fix briefs target the **implementation**, not the test selectors
- Browser install is verified before running (`npx playwright install chromium` if missing)
