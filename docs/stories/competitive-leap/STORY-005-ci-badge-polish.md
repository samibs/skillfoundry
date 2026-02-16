# STORY-005: CI Badge & README Polish

**Phase:** 1 — CI/CD & Cleanup
**PRD:** competitive-leap
**Priority:** SHOULD
**Effort:** S
**Dependencies:** STORY-003, STORY-004
**Affects:** FR-012

---

## Description

Add a CI status badge to the README and perform final Phase 1 polish: verify version bump, update CHANGELOG, and confirm all Phase 1 acceptance criteria are met.

---

## Technical Approach

### CI Badge

Add to the top of `README.md`, below the title:

```markdown
![CI](https://github.com/{owner}/{repo}/actions/workflows/ci.yml/badge.svg)
```

Replace `{owner}` and `{repo}` with actual values.

### Version bump

Update `.version` from `1.9.0.15` → `1.9.0.16` (Phase 0 bugs) or `1.9.0.17` (Phase 1 complete), depending on whether Phase 0 was versioned separately.

### CHANGELOG entry

Add `[1.9.0.17]` entry:
```markdown
## [1.9.0.17] - YYYY-MM-DD

### Added
- GitHub Actions CI pipeline with multi-OS matrix testing
- Platform sync verification in CI
- CI status badge in README

### Removed
- Orphaned Node.js artifacts (package.json, package-lock.json)
- Deprecated convert-to-copilot.sh script

### Fixed
- session-recorder.sh list exit code on empty data
- harvest.sh --status exit code on empty data
- .project-registry-meta.jsonl initialization
```

---

## Acceptance Criteria

```gherkin
Scenario: CI badge displays in README
  Given CI pipeline exists
  When README is viewed on GitHub
  Then a pass/fail badge is visible at the top

Scenario: Version is bumped
  Given Phase 0 and Phase 1 are complete
  When .version is checked
  Then it reflects the new version

Scenario: CHANGELOG is updated
  Given Phase 0 and Phase 1 changes are complete
  When CHANGELOG.md is checked
  Then a new version entry documents all changes
```

---

## Files to Modify

| File | Action |
|------|--------|
| `README.md` | Add CI badge |
| `.version` | Bump version |
| `CHANGELOG.md` | Add version entry |
| `docs/QUICK-REFERENCE.md` | Update version |
| `docs/CLAUDE-SUMMARY.md` | Update version |

---

## Testing

- README renders correctly on GitHub with badge
- `.version` contains correct version
- CHANGELOG has complete Phase 0 + Phase 1 entry
