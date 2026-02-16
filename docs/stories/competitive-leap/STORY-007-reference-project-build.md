# STORY-007: Build Reference Project with /forge

**Phase:** 2 — Reference Project
**PRD:** competitive-leap
**Priority:** MUST
**Effort:** XL
**Dependencies:** STORY-006
**Affects:** FR-021, FR-022, FR-023

---

## Description

Execute `/forge` on the reference project PRD to build it end-to-end using all 46 agents. Document every friction point, bug, and improvement opportunity discovered during the process. This is the most critical validation of the framework.

---

## Technical Approach

### Execution plan

1. **Set up a clean workspace** for the reference project (separate directory or git worktree)
2. **Run `/forge`** against the reference project PRD
3. **Track every issue**:
   - Agent failures or unexpected behavior
   - Missing capabilities or gap in coverage
   - Quality gate false positives/negatives
   - Performance bottlenecks
   - Documentation gaps
4. **Verify all 46 agents were invoked** via `/analytics`
5. **Run `/layer-check`** on the completed project
6. **Document lessons learned** in a retrospective

### Issue tracking during build

Create `docs/reference-project-retrospective.md` during the build:

```markdown
## Friction Points

| # | Phase | Agent | Issue | Severity | Fixed? |
|---|-------|-------|-------|----------|--------|
| 1 | Forge | coder | ... | high | yes |
```

### After build

1. Run full test suite on the reference project
2. Run `/security audit` on the reference project
3. Run `/anvil` on all generated files
4. Update framework README to link to the reference project
5. Harvest lessons to memory bank with `/gohm`

---

## Acceptance Criteria

```gherkin
Scenario: Reference project builds end-to-end
  Given the reference project PRD exists
  When "/forge" is executed
  Then the project builds to completion
  And all tests pass
  And layer-check passes

Scenario: All agent types exercised
  Given the reference project build is complete
  When "/analytics" is checked
  Then all major agent categories were invoked

Scenario: Lessons documented
  Given the build encountered friction
  When the retrospective is written
  Then every friction point is documented with resolution status

Scenario: Framework bugs fixed
  Given friction points were found during build
  When relevant issues are framework bugs
  Then they are fixed in the framework (not just worked around)

Scenario: README links to reference project
  Given the reference project is complete
  When README.md is viewed
  Then it contains a "Built with Claude AS" reference
```

---

## Security Checklist

- [ ] Reference project doesn't contain real secrets
- [ ] Git history doesn't contain sensitive data
- [ ] Security audit passes on reference project

---

## Files to Create/Modify

| File | Action |
|------|--------|
| Reference project directory | Create (entire project) |
| `docs/reference-project-retrospective.md` | Create |
| `README.md` | Add reference project link |
| Various framework files | Fix bugs discovered during dogfooding |

---

## Testing

- Reference project runs and produces expected output
- All tests in reference project pass
- `/layer-check` passes
- `/security audit` passes
- `/anvil` passes on all generated files
