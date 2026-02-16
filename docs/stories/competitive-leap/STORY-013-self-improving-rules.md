# STORY-013: Self-Improving Quality Rules

**Phase:** 4 — Quality & Intelligence
**PRD:** competitive-leap
**Priority:** COULD
**Effort:** L
**Dependencies:** STORY-012
**Affects:** FR-044

---

## Description

When the same rejection type occurs 3+ times, automatically propose a new quality rule for the primer. The rule requires human approval before activation. This creates a self-improving quality loop: gate catches issue → tracker records pattern → rule prevents future occurrence.

---

## Technical Approach

### Auto-rule generation flow

```
Gate rejection → rejection-tracker.sh record
                        │
                        ▼
                 Check count for category
                        │
                        ├── count < 3 → no action
                        │
                        └── count >= 3 → generate rule proposal
                                │
                                ▼
                         Append to .claude/learned-rules.jsonl
                                │
                                ▼
                         Notify user: "New rule proposed: [description]"
```

### Learned rules storage: `.claude/learned-rules.jsonl`

```json
{"id":"LR-001","created":"2026-02-15","category":"missing_validation","rule":"Always validate request body on POST/PUT/PATCH endpoints","source_rejections":5,"status":"proposed","approved_by":null}
{"id":"LR-002","created":"2026-02-16","category":"missing_error_handling","rule":"Every catch block must log the error with context","source_rejections":3,"status":"approved","approved_by":"SBS"}
```

### Rule lifecycle

```
[PROPOSED] → [APPROVED] → [ACTIVE] (injected into primer)
     ↓
[REJECTED] (user decides rule is not useful)
```

### Commands

Extend `rejection-tracker.sh`:

```bash
# Rule management
rejection-tracker.sh rules                    → List proposed rules
rejection-tracker.sh rules approve <id>       → Approve a proposed rule
rejection-tracker.sh rules reject <id>        → Reject a proposed rule
rejection-tracker.sh rules active             → List active rules
rejection-tracker.sh rules inject             → Update _quality-primer.md with active rules
```

### Primer injection

When `rejection-tracker.sh rules inject` runs, it:
1. Reads all ACTIVE rules from `.claude/learned-rules.jsonl`
2. Generates markdown list
3. Updates the "Learned Rules" section in `agents/_quality-primer.md`
4. Runs `sync-platforms.sh sync` to propagate changes

### Automatic proposal trigger

In `rejection-tracker.sh record`, after appending the entry:

```bash
# Check if this category has reached threshold
local count
count=$(grep -c "\"category\":\"$category\"" "$REJECTIONS_FILE")
if [ "$count" -ge 3 ]; then
    local existing_rule
    existing_rule=$(grep "\"category\":\"$category\"" "$RULES_FILE" 2>/dev/null)
    if [ -z "$existing_rule" ]; then
        propose_rule "$category" "$description"
    fi
fi
```

---

## Acceptance Criteria

```gherkin
Scenario: Rule proposed after 3 rejections
  Given "missing_validation" has been recorded 2 times
  When a 3rd "missing_validation" rejection is recorded
  Then a new rule is proposed in .claude/learned-rules.jsonl
  And user is notified

Scenario: Rule approved by user
  Given a proposed rule "LR-001" exists
  When "rejection-tracker.sh rules approve LR-001" runs
  Then the rule status changes to "approved"

Scenario: Active rules injected into primer
  Given approved rules exist
  When "rejection-tracker.sh rules inject" runs
  Then agents/_quality-primer.md "Learned Rules" section is updated

Scenario: Duplicate rule not proposed
  Given a rule for "missing_validation" already exists
  When another "missing_validation" rejection is recorded
  Then no duplicate rule is proposed

Scenario: Rejected rule stays rejected
  Given a rule was rejected
  When the same category hits threshold again
  Then no new rule is proposed (already addressed)
```

---

## Security Checklist

- [ ] Rules don't contain actual code snippets (just descriptions)
- [ ] Human approval required before rule activation
- [ ] Primer injection doesn't break agent command files
- [ ] Rules can be easily disabled if they cause false positives

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `scripts/rejection-tracker.sh` | Add rule management commands |
| `.claude/learned-rules.jsonl` | Created on first rule proposal |
| `agents/_quality-primer.md` | Learned Rules section updated by injection |
| `tests/run-tests.sh` | Add self-improving rules tests |

---

## Testing

- Record 3 rejections of same category → rule proposed
- `rules approve LR-001` → status changes
- `rules inject` → primer updated
- Record 4th rejection of same category → no duplicate rule
- `rules reject LR-002` → status changes to rejected
