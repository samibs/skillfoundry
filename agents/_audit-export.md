# Audit Export Protocol

> **CORE FRAMEWORK MODULE**
> Writes structured audit entries after each feature commit and gate decision.
> Entries are append-only. Optional webhook exports to external systems.
> Referenced by: `feature-lifecycle` (Stage 5), `forge` (Phase 6), `gate-keeper`, `hotfix`

---

## Purpose

Override logs in `logs/overrides.md` and evaluator verdicts in commit bodies live inside
the git repo and can be destroyed by force-push, branch deletion, or repo migration.
This protocol writes a parallel `logs/audit-trail.jsonl` (newline-delimited JSON, append-only)
and optionally POSTs entries to a webhook for external durability.

---

## Entry Types

### feature_commit

Written by `feature-lifecycle` at Stage 5 completion:

```json
{
  "ts": "ISO8601",
  "type": "feature_commit",
  "story_id": "STORY-001",
  "feature": "JWT login flow",
  "commit_hash": "abc1234",
  "commit_message": "feat(auth): JWT login flow [STORY-001]",
  "execution_mode": "REAL",
  "stages": {
    "implement": "done",
    "testloop": {"status": "done", "iterations": 2, "tests_passed": 89, "tests_failed": 0, "coverage_lines": 91.2},
    "semgrep": {"status": "done", "hard_blocks": 0, "warnings": 1},
    "challenge": {"status": "done", "cycles": 2, "final_verdict": "✅"},
    "document": "done",
    "commit": "done"
  },
  "overrides_used": 0,
  "files_committed": 7,
  "complexity_tier": "MEDIUM"
}
```

### override_decision

Written by any agent when `--override` is used:

```json
{
  "ts": "ISO8601",
  "type": "override_decision",
  "stage": "testloop",
  "reason": "accepting 1 flaky E2E test — tracked in STORY-045",
  "commit_context": "abc1234",
  "user": "git-config-user-name",
  "verdict_at_override": "🔴"
}
```

### gate_blocked

Written by `gate-keeper` when a gate is locked (even if later resolved):

```json
{
  "ts": "ISO8601",
  "type": "gate_blocked",
  "stage": "STORY-001",
  "violations": ["Missing unit tests in auth.service.ts", "Security headers not configured"],
  "resolution": "auto-fixed | manually-fixed | overridden | unresolved",
  "resolved_at": "ISO8601"
}
```

### hotfix_applied

Written by `hotfix` on completion:

```json
{
  "ts": "ISO8601",
  "type": "hotfix_applied",
  "description": "null pointer crash on checkout",
  "commit_hash": "def5678",
  "user": "git-config-user-name",
  "followup_story": "genesis/hotfix-followup-2026-06-22-checkout.md",
  "gates_bypassed": ["shadow_tester", "anvil", "evaluator", "full_testloop", "docs"]
}
```

### forge_complete

Written by `forge` at Phase 6 completion:

```json
{
  "ts": "ISO8601",
  "type": "forge_complete",
  "prds_processed": 2,
  "stories_completed": 8,
  "stories_failed": 0,
  "security_phase": "clean",
  "semgrep_blocks_total": 1,
  "overrides_total": 2,
  "execution_mode": "REAL"
}
```

---

## Write Protocol

### Append to local file

All entries are appended to `logs/audit-trail.jsonl`. Never overwrite, never truncate.

```bash
echo '{"ts":"...","type":"feature_commit",...}' >> logs/audit-trail.jsonl
```

`logs/audit-trail.jsonl` is committed to git. It is additive — old entries accumulate.

### Webhook export (optional)

If `audit_webhook` is configured in `.claude/shared/config.json`:

```json
{ "audit_webhook": "https://your-system/webhook/skillfoundry" }
```

POST the JSON entry to the webhook after writing locally:

```bash
curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$ENTRY_JSON" \
  --max-time 5 \
  --retry 1 \
  >/dev/null 2>&1 || true
```

- Timeout: 5 seconds max
- Retry: 1 attempt on failure
- Non-blocking: failure does not block the pipeline
- Silent: no output on success or failure (audit export is infrastructure, not UX)

If webhook fails, entry is still written locally. The webhook is for external durability, not the primary record.

### Webhook security

The webhook URL may include a token in the path or as a query parameter:
```
https://your-system/webhook/skillfoundry?token=your-secret-here
```

Never log the full webhook URL (it may contain the token). Store it in `.claude/shared/config.json`
which is committed — use environment variable substitution for the token:

```json
{ "audit_webhook": "https://your-system/webhook/${SKILLFOUNDRY_WEBHOOK_TOKEN}" }
```

---

## Querying the Audit Trail

```bash
# All overrides in the last 30 days
grep '"type":"override_decision"' logs/audit-trail.jsonl | tail -20

# All hotfixes
grep '"type":"hotfix_applied"' logs/audit-trail.jsonl

# Feature commits with 🔴 verdicts that still committed
grep '"final_verdict":"🔴"' logs/audit-trail.jsonl

# Count overrides by user
grep '"type":"override_decision"' logs/audit-trail.jsonl | grep -o '"user":"[^"]*"' | sort | uniq -c
```

---

*Audit Export Protocol v1.0.0 — SkillFoundry Framework*
*Append-only. Never rewritten. Optional webhook for external durability.*
