# GuardLoop Adaptive Rules

> Auto-generated from recurring failure patterns detected across sessions.
> Promoted when a pattern appears **3+ times**. All code-generating agents enforce these rules.
> Source: `.claude/hooks/state/guardloop-patterns.json`
> Last updated: (updated automatically on promotion)

---

## Enforced Guardrails

| Pattern | Severity | Hits | Category | Enforcement Rule |
|---------|----------|------|----------|-----------------|
| *(no patterns promoted yet — rules appear here after 3+ detections)* | | | | |

---

## How This File Is Generated

1. **`failure-scan.sh`** (PostToolUse hook) — scans every edited code file for 3 critical patterns (hardcoded secrets, localStorage tokens, file corruption). Adds file to `guardloop-files.log`.

2. **`guardloop-harvest.sh`** (Stop hook) — at session end, scans all tracked files with the full 10-pattern set. Appends findings to `memory_bank/knowledge/errors-universal.jsonl` and increments counters in `guardloop-patterns.json`.

3. **`/guardloop`** (skill) — analyzes pattern frequencies. Patterns at 3+ occurrences become candidates.

4. **`/guardloop promote`** or `scripts/guardloop-promote.sh` — promotes candidates into this file as enforceable rules.

---

## Pattern Reference

Patterns tracked (from GuardLoop's FailureDetector, adapted for SkillFoundry):

| ID | Pattern | Severity | GuardLoop Source |
|----|---------|----------|------------------|
| GL-01 | `hardcoded-secret` | critical | JWT/Auth + Security |
| GL-02 | `localstorage-token` | critical | Security |
| GL-03 | `file-corruption` | critical | File Overwrite |
| GL-04 | `empty-catch` | high | Error Handling |
| GL-05 | `placeholder-code` | high | Code Quality |
| GL-06 | `nullable-array-method` | high | Data Validation |
| GL-07 | `ts-ignore-no-comment` | medium | Code Quality |
| GL-08 | `console-log-unguarded` | medium | Code Quality |
| GL-09 | `hardcoded-path` | medium | Configuration |
| GL-10 | `select-star-query` | medium | Database |

---

*GuardLoop × SkillFoundry — Self-improving AI governance. github.com/samibs/guardloop.dev*
