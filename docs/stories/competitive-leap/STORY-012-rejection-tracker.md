# STORY-012: Gate Rejection Tracker

**Phase:** 4 — Quality & Intelligence
**PRD:** competitive-leap
**Priority:** SHOULD
**Effort:** M
**Dependencies:** STORY-011
**Affects:** FR-042, FR-043

---

## Description

Create a system that tracks patterns in gate-keeper rejections. When the gate-keeper rejects code, the rejection reason is recorded and categorized. Over time, this builds a database of common failure patterns that feeds into the quality primer and analytics.

---

## Technical Approach

### Script: `scripts/rejection-tracker.sh`

```bash
#!/usr/bin/env bash
# Gate rejection pattern tracker
# Tracks, categorizes, and analyzes gate-keeper rejections

# Usage:
#   rejection-tracker.sh record <category> <description> [--agent=X] [--story=X]
#   rejection-tracker.sh list [--category=X] [--since=YYYY-MM-DD]
#   rejection-tracker.sh stats                    → Top rejection categories
#   rejection-tracker.sh trends [--period=week]   → Rejection trends over time
#   rejection-tracker.sh rules                    → Proposed auto-rules from patterns
```

### Data storage: `.claude/rejections.jsonl`

```json
{"timestamp":"2026-02-15T14:30:00Z","category":"missing_validation","description":"Endpoint /api/users POST has no input validation","agent":"coder","story":"STORY-003","severity":"high","auto_fixable":true}
{"timestamp":"2026-02-15T14:35:00Z","category":"banned_pattern","description":"Found TODO comment in src/auth.py:42","agent":"coder","story":"STORY-003","severity":"critical","auto_fixable":true}
```

### Rejection categories

| Category | Description | Auto-fixable |
|----------|-------------|--------------|
| `missing_validation` | No input validation on endpoint | Yes (by fixer) |
| `banned_pattern` | TODO/FIXME/HACK etc found | Yes (by fixer) |
| `missing_tests` | Business logic without tests | Yes (by tester) |
| `security_violation` | Hardcoded secrets, XSS, etc | Depends |
| `missing_docs` | Public method without documentation | Yes (by docs) |
| `missing_error_handling` | Silent failures, no logging | Yes (by fixer) |
| `performance_issue` | N+1 queries, missing indexes | Depends |
| `accessibility_gap` | Missing labels, aria attributes | Yes (by accessibility) |
| `architectural_violation` | Wrong layer, circular dependency | No (escalate) |
| `other` | Uncategorized | No (review) |

### Integration with gate-keeper

The gate-keeper agent is updated to call `rejection-tracker.sh record` whenever it rejects code:

```markdown
## When rejecting code:
After documenting the rejection reason, execute:
scripts/rejection-tracker.sh record "<category>" "<description>" --agent=<agent> --story=<story>
```

### Analytics integration

Extend `/analytics` to show rejection data:
```
/analytics rejections           → Top categories, trends
/analytics rejections --detail  → Full rejection list with context
```

---

## Acceptance Criteria

```gherkin
Scenario: Rejection recorded
  Given gate-keeper rejects code for missing validation
  When "rejection-tracker.sh record missing_validation 'No input validation on POST /users'" runs
  Then a JSONL entry is appended to .claude/rejections.jsonl

Scenario: Statistics displayed
  Given 10+ rejections are recorded
  When "rejection-tracker.sh stats" runs
  Then top categories are shown with counts and percentages

Scenario: Trends displayed
  Given rejections exist across multiple days
  When "rejection-tracker.sh trends" runs
  Then per-day rejection counts are shown

Scenario: Auto-rule proposal
  Given "missing_validation" appears 5 times
  When "rejection-tracker.sh rules" runs
  Then a proposed rule for input validation is output
```

---

## Security Checklist

- [ ] Rejection descriptions don't contain actual code (just summaries)
- [ ] JSONL file has 600 permissions
- [ ] No credentials in rejection data

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `scripts/rejection-tracker.sh` | Create tracker script |
| `.claude/rejections.jsonl` | Created on first `record` call |
| `.claude/commands/gate-keeper.md` | Add rejection recording instruction |
| `tests/run-tests.sh` | Add rejection tracker tests |

---

## Testing

- `rejection-tracker.sh record missing_validation "test"` → JSONL entry created
- `rejection-tracker.sh stats` on sample data → category breakdown
- `rejection-tracker.sh list` → lists all rejections
- `rejection-tracker.sh --help` → usage text, exit 0
