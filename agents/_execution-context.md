# Execution Context Protocol

> **CORE FRAMEWORK MODULE**
> Run this BEFORE any agent that claims to execute shell commands, run tests, or read live process output.
> Referenced by: `testloop`, `feature-lifecycle`, `build-stability`, `sre`, `performance`

---

## Purpose

Distinguish between **REAL** execution (Claude Code with Bash tool access, actual shell) and **ADVISORY** execution (web UI, restricted environment, no shell access). Agents must not claim test results, build success, or coverage numbers they cannot actually verify.

A false "tests passed" is worse than no test run at all — it creates false confidence and masks real failures.

---

## Detection Algorithm

Run these checks in order. Stop at the first conclusive result.

### Check 1: Bash tool availability

Attempt a minimal shell probe:
```bash
echo "EXEC_PROBE_OK" && pwd
```

- If output contains `EXEC_PROBE_OK` → shell is live
- If tool call fails or is denied → shell unavailable

### Check 2: Project root reachable

```bash
ls package.json go.mod requirements.txt pyproject.toml *.csproj Cargo.toml 2>/dev/null | head -1
```

- If any file found → project root confirmed
- If empty → wrong directory or no project

### Check 3: Test command dry-run

Read from `.claude/shared/stack-profile.json` if it exists:
```bash
cat .claude/stack-profile.json 2>/dev/null
```

If stack-profile exists, use `test_command` from it. Otherwise detect:
```bash
# Node
[ -f package.json ] && node -e "const p=require('./package.json'); console.log(p.scripts?.test || 'NO_TEST_SCRIPT')"
# Python
[ -f pytest.ini ] || [ -f pyproject.toml ] && echo "pytest"
# .NET
ls *.sln *.csproj 2>/dev/null | head -1 && echo "dotnet_test"
# Go
[ -f go.mod ] && echo "go_test"
```

---

## Output: EXECUTION_MODE

Based on the checks, set the session execution mode:

### REAL Mode

**Conditions:** Bash tool available + project root confirmed + test command detected

```
EXECUTION_MODE: REAL
Shell: available
Project root: /path/to/project
Test command: npm test
E2E: npx playwright test (playwright.config.ts found)
Stack: node/typescript
```

Agents in REAL mode:
- Run actual commands and report actual output
- Claim test results only from parsed command output
- Report coverage from actual coverage data
- Use "tests passed" / "tests failed" language

### ADVISORY Mode

**Conditions:** Bash tool unavailable OR project root not found

```
EXECUTION_MODE: ADVISORY
Reason: [Bash tool not available | Project root not found | Test command failed]

⚠️  Advisory mode active. This session cannot execute shell commands.
    All "test results" are simulated based on code analysis only.
    Verify all claims manually before treating them as evidence.
```

Agents in ADVISORY mode:
- Replace "tests passed" with "code appears correct based on static analysis"
- Replace "coverage: 87%" with "coverage not measurable — no shell access"
- Replace "Playwright: 12 scenarios passed" with "E2E scenarios: not executed"
- All HALT conditions that require test evidence become WARN conditions
- Commit messages include `[ADVISORY MODE — manual test verification required]`

### DEGRADED Mode

**Conditions:** Bash tool available but test command fails or times out

```
EXECUTION_MODE: DEGRADED
Shell: available
Test command: FAILED (exit code [N] / timeout)
Error: [first line of error output]

⚠️  Degraded mode active. Shell is available but the test suite could not run.
    Check: dependencies installed? Database running? Port available?
    Agents will attempt fixes but cannot confirm results until tests run clean.
```

Agents in DEGRADED mode:
- Report the actual failure reason
- Attempt one fix (install deps, start required service) then re-probe
- If still degraded after one fix attempt → ADVISORY for that stage

---

## State Persistence

Write the detected mode to `.claude/local/execution-context.json`:

```json
{
  "mode": "REAL | ADVISORY | DEGRADED",
  "detected_at": "ISO8601",
  "shell_available": true,
  "project_root": "/path/to/project",
  "stack": "node | python | dotnet | go | rust | unknown",
  "test_command": "npm test",
  "e2e_command": "npx playwright test",
  "e2e_available": true,
  "degraded_reason": null
}
```

All agents read from this file rather than re-detecting each time.

---

## Agent Behavior Rules by Mode

| Claim | REAL | ADVISORY | DEGRADED |
|-------|------|----------|---------|
| "X tests passed" | ✅ Allowed | ❌ Replace with "X tests appear valid (static)" | ❌ Replace with "X tests could not run" |
| "Coverage: N%" | ✅ Allowed | ❌ Replace with "Coverage: not measurable" | ❌ Replace with "Coverage: not measurable" |
| "Playwright: N scenarios" | ✅ Allowed | ❌ Replace with "E2E: not executed" | ❌ Replace with "E2E: not executed" |
| Evaluator ✅ verdict | ✅ Based on real tests | 🟡 Based on static analysis only | 🟡 Based on partial evidence |
| Git commit | ✅ Normal | ⚠️ Append `[ADVISORY]` to body | ⚠️ Append `[DEGRADED]` to body |

---

## Override

If the user knows the environment and wants to force a mode:

```
/feature --exec-mode real       Force REAL (user accepts responsibility for accuracy)
/feature --exec-mode advisory   Force ADVISORY (e.g., planning session without live project)
```

Forced mode is noted in `.claude/local/execution-context.json` as `"forced": true`.

---

*Execution Context Protocol v1.0.0 — SkillFoundry Framework*
*Prevents false test-pass claims in restricted environments*
