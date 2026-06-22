# Convention Discovery Protocol

> **CORE FRAMEWORK MODULE**
> Reads existing project conventions before onboarding so SkillFoundry adapts to the project,
> not the other way around. Runs once during /onboard. Outputs .claude/shared/conventions.json.
> Referenced by: `feature-lifecycle` (Stage 5 commit), `documentation-codifier`, `onboard`

---

## Purpose

SkillFoundry must not override conventions that already exist in a project. A repo with
`CHANGES.rst`, Angular commit format, and `test_*.py` naming has earned those conventions.
Overriding them breaks CI, contributor workflows, and PR linting. This protocol detects what
exists and writes it as the authoritative source for all downstream agents.

---

## Detection Algorithm

### 1. Changelog Format

```bash
# Check for known changelog files in priority order
ls CHANGELOG.md CHANGELOG CHANGES CHANGES.rst HISTORY.md HISTORY RELEASE-NOTES.md 2>/dev/null | head -1

# Detect format from first 20 lines
head -20 [changelog_file] 2>/dev/null
```

| Signal | Detected Format |
|--------|----------------|
| `## [Unreleased]` header | `keepachangelog` |
| `CHANGES\n=======` RST underline | `rst` |
| `v1.2.3 (2026-...)` pattern | `version-date` |
| `Release X.Y.Z` pattern | `release-header` |
| No file found | `none` (SkillFoundry default: keepachangelog) |

### 2. Commit Message Format

Read last 20 commits and detect the dominant pattern:

```bash
git log --oneline -20 --no-merges 2>/dev/null | head -20
```

| Signal | Detected Format |
|--------|----------------|
| `feat(scope):` or `fix:` prefix | `conventional` |
| `[TICKET-123]` in subject | `ticket-prefix` |
| `JIRA-123:` or `ABC-123:` prefix | `jira` |
| Imperative sentence, no prefix | `imperative` |
| Inconsistent / mixed | `none` |

Also detect:
- Whether scope is used: `feat(auth):` vs `feat:`
- Ticket pattern regex from last 20 subjects

### 3. Test File Naming

```bash
# Find existing test files, detect pattern
find . -name "*.test.ts" -o -name "*.spec.ts" -o -name "test_*.py" \
       -o -name "*_test.py" -o -name "*_test.go" -o -name "*.Tests.cs" \
       --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null | head -20
```

| Signal | Pattern |
|--------|---------|
| `*.test.ts` / `*.test.js` | `jest-colocated` |
| `*.spec.ts` / `*.spec.js` | `jest-spec` |
| `test_*.py` | `pytest-prefix` |
| `*_test.py` | `pytest-suffix` |
| `*_test.go` | `go-test` |
| `*.Tests.cs` | `dotnet-tests` |

Also detect test location:
- Colocated with source (same directory)
- `tests/` or `__tests__/` subdirectory
- `test/` at project root

### 4. Documentation Style

```bash
# Check for existing API docs
ls docs/api_reference.md docs/API.md openapi.yaml openapi.json swagger.yaml swagger.json 2>/dev/null | head -3

# Check for JSDoc / docstring usage in existing files
grep -rn "@param\|@returns\|@throws" src/ --include="*.ts" --include="*.js" 2>/dev/null | wc -l
grep -rn '"""' src/ --include="*.py" 2>/dev/null | wc -l
grep -rn "/// <summary>" src/ --include="*.cs" 2>/dev/null | wc -l
```

### 5. PR / Branch conventions

```bash
# Check for PR template
ls .github/PULL_REQUEST_TEMPLATE.md .github/pull_request_template.md 2>/dev/null | head -1

# Check branch naming from recent branches
git branch -a --sort=-committerdate 2>/dev/null | head -10
```

---

## Output: conventions.json

Write to `.claude/shared/conventions.json`:

```json
{
  "detected_at": "ISO8601",
  "changelog": {
    "format": "keepachangelog | rst | version-date | release-header | none",
    "file": "CHANGELOG.md",
    "detected_from": "existing file header pattern"
  },
  "commits": {
    "format": "conventional | ticket-prefix | jira | imperative | none",
    "scope_used": true,
    "ticket_pattern": "STORY-\\d+",
    "example": "feat(auth): add JWT login [STORY-001]",
    "detected_from": "last 20 git log entries"
  },
  "tests": {
    "naming_pattern": "*.test.ts | test_*.py | *_test.go",
    "location": "colocated | tests/ | __tests__/",
    "detected_from": "existing test files"
  },
  "docs": {
    "api_file": "docs/api_reference.md | openapi.yaml | none",
    "docstring_style": "jsdoc | python-docstring | xml-doc | none",
    "usage_count": 47
  },
  "pr_template": ".github/PULL_REQUEST_TEMPLATE.md | none",
  "overrides": {}
}
```

`overrides` is a user-editable map that takes precedence over detected values. Example:
```json
{ "overrides": { "commits.format": "conventional" } }
```

---

## Agent Usage

All agents that produce commits, docs, or test files read `conventions.json`:

```
# In feature-lifecycle Stage 5 (Commit):
Read conventions.commits.format → use matching commit message format
Read conventions.commits.ticket_pattern → append ticket in correct position
Read conventions.changelog.file → update the correct changelog file
Read conventions.changelog.format → write entries in detected format

# In documentation-codifier:
Read conventions.docs.api_file → update the correct API doc file
Read conventions.docs.docstring_style → write docstrings in detected style

# In tester (when generating test files):
Read conventions.tests.naming_pattern → name new test files correctly
Read conventions.tests.location → place test files in correct directory
```

If `conventions.json` does not exist, agents fall back to SkillFoundry defaults (keepachangelog, conventional commits, *.test.ts colocated).

---

## Refresh

Re-run convention discovery when:
- Significant new commits appear (pattern may have shifted)
- A new test framework is added
- `/onboard` is run with `--reset`
- User runs `/onboard --detect-conventions`

---

## Manual Override

To force a convention regardless of detection:
```bash
# Edit .claude/shared/conventions.json overrides section
{
  "overrides": {
    "commits.format": "imperative",
    "changelog.file": "CHANGES.rst",
    "changelog.format": "rst"
  }
}
```

---

*Convention Discovery Protocol v1.0.0 — SkillFoundry Framework*
*Adapts to the project. Never overrides what already exists.*
