# STORY-004: Remove Dead Code & Deprecated Files

**Phase:** 1 — CI/CD & Cleanup
**PRD:** competitive-leap
**Priority:** MUST
**Effort:** S
**Dependencies:** STORY-002
**Affects:** FR-013, FR-014

---

## Description

Remove orphaned Node.js artifacts and deprecated files that pollute the repository. This is a cleanup story — no new features, just removal of dead weight.

---

## Technical Approach

### Known dead files:

1. **`package.json`** — Orphaned Node.js manifest. No Node.js code exists in the framework.
2. **`package-lock.json`** — Orphaned Node.js lockfile. Same reason.
3. **`scripts/convert-to-copilot.sh`** — Deprecated by `sync-platforms.sh`. Already removed in STORY-001 if applicable (verify).

### Audit process:

1. Run `git ls-files` to get full file inventory
2. Check each script in `scripts/` for references from other files
3. Check for any other orphaned config files (`.npmrc`, `.yarnrc`, etc.)
4. Check for empty or 0-byte files that serve no purpose
5. Verify `.gitignore` doesn't reference removed file types

### Removal process:

For each file identified as dead:
1. `grep -r "filename"` to confirm no references
2. `git rm filename`
3. Update documentation if the file was referenced

---

## Acceptance Criteria

```gherkin
Scenario: Node.js artifacts removed
  Given package.json and package-lock.json exist
  When this story is complete
  Then neither file exists in the repo
  And no script references them

Scenario: No orphaned files remain
  Given a full file audit is performed
  When checking for unreferenced scripts and configs
  Then all files have at least one reference or documented purpose

Scenario: .gitignore is clean
  Given Node.js artifacts are removed
  When .gitignore is reviewed
  Then no node_modules or npm-related entries exist (unless needed for future use)
```

---

## Security Checklist

- [ ] No accidental deletion of active files
- [ ] Verify each file is truly unreferenced before removal
- [ ] Test suite passes after removal

---

## Files to Delete

| File | Reason |
|------|--------|
| `package.json` | Orphaned — no Node.js code |
| `package-lock.json` | Orphaned — no Node.js code |

## Files to Verify (may need deletion)

| File | Check |
|------|-------|
| `scripts/convert-to-copilot.sh` | May already be removed by STORY-001 |
| Any `.npmrc`, `.yarnrc` | Check for existence |
| Any 0-byte files | Check for stale initialization artifacts |

---

## Testing

- `git ls-files | grep -i "package"` → no results
- `grep -r "package.json" .` → no references (except maybe .gitignore)
- Full test suite passes after removal
