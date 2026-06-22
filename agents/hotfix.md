# Hotfix Agent

> **EXECUTION TIER**
> Emergency fix pathway. Bypasses full pipeline gates when production is burning.
> Runs smoke test only. Creates mandatory follow-up story. Writes audit entry.
> Referenced by: `.claude/commands/hotfix.md`

---

## When to Use

Production is down or degraded. Time to fix is more valuable than process compliance.
This agent is NOT for:
- Features that aren't critical
- Tech debt cleanups
- Performance improvements that aren't causing incidents
- "I want to skip the pipeline"

A hotfix is a specific exception for a specific incident. It creates debt — the follow-up story pays it.

---

## What Gets Bypassed

| Gate | Status |
|------|--------|
| Shadow tester | ⏭ BYPASSED |
| Anvil quality gates (T1-T6) | ⏭ BYPASSED |
| Merciless evaluator challenge | ⏭ BYPASSED |
| Full TestLoop (max 5 iterations) | ⏭ BYPASSED — smoke test only (max 2 iterations) |
| Documentation generation | ⏭ BYPASSED — follow-up story covers this |

| Gate | Status |
|------|--------|
| Semgrep HARD BLOCK scan | ✅ ACTIVE — hardcoded secrets cannot ship even in hotfixes |
| Manual code read | ✅ ACTIVE — read the changed files before committing |
| Smoke test (max 2 iter) | ✅ ACTIVE — must not crash under basic operation |
| Follow-up story creation | ✅ MANDATORY — no hotfix without a follow-up |
| Audit trail entry | ✅ MANDATORY — hotfix_applied logged to audit-trail.jsonl |

**The hardcoded credential gate is NEVER bypassed.** If a fix requires hardcoded credentials, the fix is wrong.

---

## Execution Protocol

### Step 0: Declare the incident

```
HOTFIX ACTIVATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Description: [user-provided description]
Execution mode: [from _execution-context.md]
Stack: [from stack-profile.json if available]

⚠️  Full pipeline BYPASSED. Smoke test only.
⚠️  Follow-up story REQUIRED before closing.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 1: Semgrep scan (hard blocks only)

Run Semgrep on the files being changed — ERROR severity findings only:

```bash
semgrep --config config/semgrep-rules/bpsbs-critical.yaml \
  --severity ERROR [changed_files] 2>/dev/null
```

If Semgrep finds ERROR findings: **FULL STOP. The fix introduces a critical security issue.**
Fix the security issue first. There is no override for Semgrep ERROR in hotfix mode either.

If Semgrep is not available: skip, continue. Log `"semgrep": "unavailable"` in audit entry.

### Step 2: Implement the fix

Apply the minimal fix. No refactoring, no cleanup, no improvements to adjacent code.
Read the files to be changed before editing them.

### Step 3: Smoke test (max 2 iterations)

Read the stack profile to get the test command:

```bash
# From .claude/shared/stack-profile.json → test_command
# Run only the test file(s) directly covering the changed code
[test_command] [changed_test_files]
```

If no stack profile: ask the developer for the test command.

**Smoke test rules:**
- Only tests directly covering the changed code (not full suite)
- Max 2 iterations to fix failures
- If still failing after 2 iterations: present what failed, ask for decision
  - Options: `--accept-failing` (document why), abort hotfix

### Step 4: Commit

Commit message format:
```
hotfix: [short description]

HOTFIX — bypassed: shadow_tester, anvil, evaluator, full_testloop, docs
Incident: [user-provided description]
Follow-up: genesis/hotfix-followup-[date]-[slug].md

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

### Step 5: Create follow-up story

Write `genesis/hotfix-followup-[date]-[slug].md`:

```markdown
# Hotfix Follow-up: [description]

**Triggered by hotfix on:** [date]
**Incident:** [description]
**Commit:** [hash]

## What was bypassed

- Shadow tester review
- Anvil quality gates
- Merciless evaluator challenge
- Full TestLoop (only smoke test ran)
- Documentation generation

## Required follow-up work

- [ ] Full TestLoop run on changed files
- [ ] Merciless evaluator challenge on the fix
- [ ] Documentation updated for changed behavior
- [ ] Tests added for the failure case that caused the incident
- [ ] Root cause analysis documented in docs/

## Root cause (preliminary)

[agent fills in based on the fix applied]

## Security review needed?

[yes/no with reason — based on what was changed]
```

### Step 6: Write audit entry

Append to `logs/audit-trail.jsonl`:

```json
{
  "ts": "ISO8601",
  "type": "hotfix_applied",
  "description": "[incident description]",
  "commit_hash": "[git hash]",
  "user": "[git config user.name]",
  "followup_story": "genesis/hotfix-followup-[date]-[slug].md",
  "semgrep": "clean | error-found-blocked | unavailable",
  "smoke_test": "passed | accepted-failing",
  "gates_bypassed": ["shadow_tester", "anvil", "evaluator", "full_testloop", "docs"]
}
```

Also append to `logs/hotfixes.md`:
```markdown
## [date] — [slug]
**Incident:** [description]
**Commit:** [hash]
**Follow-up:** [link to genesis story]
```

---

## Final Output

```
HOTFIX COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Commit:         abc1234
Smoke test:     2/2 tests passed [REAL] | [ADVISORY]
Semgrep:        clean
Follow-up:      genesis/hotfix-followup-2026-06-22-checkout.md
Audit:          logs/audit-trail.jsonl ✓ | logs/hotfixes.md ✓

⚠️  FOLLOW-UP REQUIRED before this incident is closed.
    The follow-up story must be implemented via /feature.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

*Hotfix Agent v1.0.0 — SkillFoundry Framework*
*Bypass gates when production is down. Pay the debt in the follow-up story.*
