# Custom Agent Instructions

**Agent Type**: task
**Model**: claude-sonnet-4.5 (or user choice via model parameter)

## Agent Description

## Instructions

---
name: hotfix
description: Emergency fix mode. Bypasses full pipeline. Smoke test only. Creates mandatory follow-up story.
color: red
---

# /hotfix — Emergency Fix Pipeline

> **USE ONLY FOR PRODUCTION INCIDENTS**
> This skill bypasses gates. Every bypass is logged. Every hotfix creates follow-up debt.
> The follow-up story must be completed via `/feature` before the incident is closed.

---

## Activation

```bash
/hotfix "null pointer crash on checkout when cart is empty"
/hotfix "login endpoint returning 500 on all OAuth callbacks"
/hotfix "memory leak causing OOM kills in the worker pool"
```

---

## What This Does

```
/hotfix [description]

  Step 0: Declare incident + load execution context
  Step 1: Semgrep HARD BLOCK scan (secrets/SQL injection — always active)
  Step 2: Implement the minimal fix
  Step 3: Smoke test — max 2 iterations (changed files only)
  Step 4: Commit with hotfix: prefix + bypass disclosure
  Step 5: Create genesis/hotfix-followup-*.md (mandatory)
  Step 6: Write audit entry to logs/audit-trail.jsonl
```

---

## Pipeline Diagram

```
/hotfix "description"
     │
     ▼
[Step 0] DECLARE INCIDENT ──────── Print bypass list
     │
     ▼
[Step 1] SEMGREP HARD BLOCK ──── ERROR severity only
     │                           (never bypassed, even in hotfix)
  CLEAN                      BLOCKED
     │                           │
     ▼                           └── HALT: fix security issue first
[Step 2] IMPLEMENT FIX ─────────── Minimal, no cleanup, read files first
     │
     ▼
[Step 3] SMOKE TEST ─────────────── Max 2 iterations, changed files only
     │
 PASSING                       FAILING after 2
     │                             │
     ▼                             └── Ask: --accept-failing or abort?
[Step 4] COMMIT ─────────────────── hotfix: prefix, bypass disclosure
     │
     ▼
[Step 5] FOLLOW-UP STORY ───────── genesis/hotfix-followup-*.md (MANDATORY)
     │
     ▼
[Step 6] AUDIT TRAIL ────────────── logs/audit-trail.jsonl + logs/hotfixes.md
     │
     ▼
  HOTFIX COMPLETE
```

---

## Bypassed Gates

| Gate | Status |
|------|--------|
| Shadow tester review | ⏭ BYPASSED |
| Anvil quality gates | ⏭ BYPASSED |
| Evaluator | ⏭ BYPASSED |
| Full TestLoop (5 iter) | ⏭ BYPASSED — smoke test only |
| Documentation codifier | ⏭ BYPASSED — follow-up covers this |
| **Semgrep HARD BLOCK** | **✅ ALWAYS ACTIVE** |
| **Audit trail** | **✅ ALWAYS ACTIVE** |

---

## What Is NOT a Hotfix

Do not use `/hotfix` for:
- Features you want to ship faster
- Tech debt you want to skip reviews for
- Performance work without an active incident
- "The evaluator keeps blocking me"

Use `/feature --override "reason"` for legitimate pipeline overrides on non-production-down work.

---

## After the Hotfix

The follow-up story in `genesis/` must be completed:

```bash
# Implement the follow-up properly
/feature hotfix-followup-2026-06-22-checkout
```

The follow-up runs the full pipeline (TestLoop, evaluator, docs, commit) that the hotfix skipped.
Until the follow-up is complete, the code is in a debt state — acknowledged by the audit trail.

---

## Execution Context Note

In ADVISORY mode, the smoke test cannot verify actual test results. The commit body
will include `[ADVISORY MODE — test results unverified]` in addition to the bypass disclosure.

---

*SkillFoundry /hotfix — Production incident pathway. Use sparingly. Pay the debt.*

---

## Usage in GitHub Copilot CLI

To use this agent, invoke it via the task tool:

```
task(
  agent_type="task",
  description="Brief task description",
  prompt="<task details and context>"
)
```
