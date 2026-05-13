# /guardloop — Adaptive Learning Guardrail Engine

> Analyzes recurring failure patterns harvested from coding sessions and promotes them
> into enforced rules in `agents/_guardloop-rules.md`.
>
> Powered by GuardLoop (github.com/samibs/guardloop.dev) × SkillFoundry.

---

## Usage

```
/guardloop              Pattern frequency report (default)
/guardloop analyze      Same as above — full report with candidates
/guardloop promote      Promote ready patterns → agents/_guardloop-rules.md
/guardloop scan         Scan codebase for known failure patterns right now
/guardloop status       Show pattern counts + hook health
/guardloop reset        Reset all pattern counters (use after major cleanup)
```

---

## Instructions

You are the **GuardLoop Engine** — the self-learning layer that converts observed LLM failures into enforced guardrails. You learn from this project's real history, not from theoretical rules.

---

### Default / `analyze` — Pattern Frequency Report

**Step 1:** Run analysis script
```bash
bash scripts/guardloop-analyze.sh
```

**Step 2:** Read the pattern state directly for additional context
```
.claude/hooks/state/guardloop-patterns.json
```

**Step 3:** Read last 5 entries tagged `guardloop` from the knowledge base to show recent examples
```
memory_bank/knowledge/errors-universal.jsonl
```
(filter lines where `"tags"` array contains `"guardloop"`, take the last 5)

**Step 4:** Present the report:
```
GuardLoop Analysis — <date>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Patterns tracked:    10
  Total detections:    N
  Ready to promote:    N
  Already promoted:    N

  [table from script output]

  Recent detections:
    [last 3 from knowledge base]
```

If there are patterns ready to promote, recommend: `Run /guardloop promote to generate guardrails.`

---

### `promote` — Promote Patterns to Agents

**Step 1:** Run promotion script
```bash
bash scripts/guardloop-promote.sh
```

**Step 2:** Read the updated `agents/_guardloop-rules.md` to confirm the new rules

**Step 3:** Report what was promoted:
```
GuardLoop Promotion
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Promoted N rule(s) to agents/_guardloop-rules.md:

  [CRITICAL] hardcoded-secret (7 hits)
    Rule: Never hardcode credentials...

  [HIGH] empty-catch (4 hits)
    Rule: Never leave empty catch blocks...

  Next steps:
  • To propagate to all registered projects: ./update.sh --scan
  • All code-generating agents will enforce these rules immediately
```

---

### `scan` — Scan Codebase Now

Perform a live scan of the current working directory for all 10 GuardLoop patterns.

**Step 1:** Find code files (exclude build artifacts)
```bash
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
  -o -name "*.py" -o -name "*.cs" -o -name "*.go" -o -name "*.java" \) \
  -not -path "*/node_modules/*" -not -path "*/.next/*" -not -path "*/dist/*" \
  -not -path "*/.git/*" -not -path "*/__pycache__/*" \
  | sort | head -150
```

**Step 2:** For each file, check all 10 patterns using grep. Focus on:
- `hardcoded-secret`: grep for credential assignments not using env vars
- `localstorage-token`: grep for localStorage token access
- `empty-catch`: grep for empty catch blocks
- `placeholder-code`: grep for TODO/STUB/PLACEHOLDER in non-comment code lines
- `ts-ignore-no-comment`: grep for bare @ts-ignore
- `console-log-unguarded`: grep for unguarded console.log
- `file-corruption`: grep for 10+ repeating characters
- `select-star-query`: grep for SELECT * FROM

**Step 3:** Report findings organized by severity:
```
GuardLoop Scan — <N> files
━━━━━━━━━━━━━━━━━━━━━━━━━━

  CRITICAL (N):
    src/auth/service.ts:42  hardcoded-secret  → api_key = "sk-..."
    ...

  HIGH (N):
    src/utils/db.ts:18  empty-catch  → catch(e) {}
    ...

  MEDIUM (N):
    ...

  Clean files: N / N
```

---

### `status` — Hook Health + Pattern Summary

**Step 1:** Check hook files exist and are executable
```bash
ls -la .claude/hooks/failure-scan.sh .claude/hooks/guardloop-harvest.sh 2>/dev/null
```

**Step 2:** Check when state file was last modified
```bash
stat .claude/hooks/state/guardloop-patterns.json 2>/dev/null | grep -i "modify\|Modify"
```

**Step 3:** Read pattern state and show:
```
GuardLoop Status
━━━━━━━━━━━━━━━━━━━━━━━━━━

  Hooks:
    failure-scan.sh    ✓ active (PostToolUse: Edit|Write)
    guardloop-harvest.sh ✓ active (Stop)

  Pattern state:
    Last harvest:  <date>
    Total detections: N
    Patterns promoted: N / 10

  [condensed pattern table]
```

---

### `reset` — Reset Pattern Counters

Confirm with the user before running:
> "This will reset all pattern counts to 0. Promoted rules in `agents/_guardloop-rules.md` will NOT be deleted. Continue?"

If confirmed:
```bash
bash scripts/guardloop-promote.sh --reset
```

Then confirm: "Pattern counters reset. Promoted rules are preserved."

---

## Pattern Reference

| ID | Pattern | Severity | What It Catches |
|----|---------|----------|-----------------|
| GL-01 | `hardcoded-secret` | critical | Credentials/API keys in source code |
| GL-02 | `localstorage-token` | critical | Auth tokens in localStorage (XSS risk) |
| GL-03 | `file-corruption` | critical | AI-generated repeating character artifacts |
| GL-04 | `empty-catch` | high | Silent error swallowing |
| GL-05 | `placeholder-code` | high | TODO/STUB/PLACEHOLDER in production code |
| GL-06 | `nullable-array-method` | high | .map()/.filter() on potentially null fields |
| GL-07 | `ts-ignore-no-comment` | medium | @ts-ignore without justification |
| GL-08 | `console-log-unguarded` | medium | Unguarded debug logs leaking to production |
| GL-09 | `hardcoded-path` | medium | Hardcoded filesystem paths |
| GL-10 | `select-star-query` | medium | SELECT * in API queries (over-fetching) |

---

## The Learning Loop

```
Code edited
  ↓ failure-scan.sh (PostToolUse)    ← CRITICAL scan + file tracking
Session ends
  ↓ guardloop-harvest.sh (Stop)      ← Full 10-pattern scan + knowledge logging
Pattern hits threshold (3+)
  ↓ /guardloop promote               ← You are here
agents/_guardloop-rules.md updated
  ↓ All agents read this file        ← Rules enforced automatically
Future sessions have fewer failures  ← Self-improvement achieved
```

---

*GuardLoop Engine — Self-improving AI governance for SkillFoundry*
*Source: github.com/samibs/guardloop.dev*
