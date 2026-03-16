# STORY-004: Policy as Code (Git-Versioned Gate Configs in CI)

**Phase:** 1 — Team Foundation
**PRD:** phase3-make-it-the-standard
**Priority:** MUST
**Effort:** M
**Status:** READY
**Dependencies:** STORY-001
**Blocks:** None
**Affects:** FR-004

---

## Description

Enable gate configurations to be versioned in Git, reviewed via pull request, and enforced in CI. Add a `sf gates --policy-check` command that compares the project's runtime gate configuration against the team config policy. If the project config violates team policy (e.g., lower thresholds, missing banned patterns, unapproved models), the check fails with a detailed report. This command is designed to run as a CI step so that policy changes go through PR review before enforcement.

---

## Acceptance Contract

**done_when:**
- [ ] `sf_cli/src/commands/gates.ts` accepts a `--policy-check` flag
- [ ] `sf gates --policy-check` loads `skillfoundry.team.ts` and compares it against the project's effective gate configuration
- [ ] Policy violations are categorized: `ERROR` (blocks CI), `WARNING` (logs but does not block)
- [ ] ERROR violations: test coverage threshold below team minimum, missing required banned patterns, unapproved AI models configured
- [ ] WARNING violations: optional thresholds not set (e.g., no scope validation configured when team recommends it)
- [ ] Output format: one line per violation with category, gate tier, field, expected value, actual value
- [ ] Exit code 0 on pass, exit code 1 on any ERROR violation, exit code 0 on WARNING-only
- [ ] `sf gates --policy-check --strict` treats WARNINGs as ERRORs (exit code 1)
- [ ] If no team config exists, `--policy-check` prints "No team config found. Policy check skipped." and exits with code 0
- [ ] A reusable GitHub Actions step example is provided in `docs/ci-policy-check.md`
- [ ] Unit tests in `sf_cli/src/__tests__/policy-check.test.ts` cover: no violations, single ERROR, multiple ERRORs, WARNING-only, strict mode, no team config

**fail_when:**
- Policy check passes when the project configures an unapproved AI model
- Policy check passes when test coverage threshold is below the team minimum
- Policy check fails when no team config exists (should skip gracefully)
- WARNING violations cause CI failure in non-strict mode

---

## Technical Approach

### Policy Check Logic

`sf_cli/src/core/policy-check.ts`:

1. Load team config via `loadTeamConfig()`. If null, return `{ pass: true, violations: [], message: "No team config" }`.
2. Load effective project config (resolved gate thresholds from team config + defaults).
3. Run policy validators:

**Threshold Validators:**
```typescript
function checkCoverageThreshold(team: TeamConfig, effective: GateThresholds): Violation[] {
  if (effective.T3.minTestCoverage < team.gates.thresholds.T3.minTestCoverage) {
    return [{ category: 'ERROR', gate: 'T3', field: 'minTestCoverage',
              expected: team.gates.thresholds.T3.minTestCoverage,
              actual: effective.T3.minTestCoverage }];
  }
  return [];
}
```

**Banned Pattern Validators:**
- Check that all team-required banned patterns appear in the effective banned pattern list.
- Missing patterns produce an ERROR violation.

**Model Validators:**
- Check that the configured AI model is in the `approvedModels` list.
- Unapproved models produce an ERROR violation.

4. Collect all violations, format as a report, return pass/fail.

### CLI Integration

In `sf_cli/src/commands/gates.ts`, add `--policy-check` flag parsing:

```typescript
if (args.includes('--policy-check')) {
  const strict = args.includes('--strict');
  const result = await runPolicyCheck(session, strict);
  return formatPolicyReport(result);
}
```

### CI Integration Example

```yaml
# .github/workflows/policy-check.yml
- name: SkillFoundry Policy Check
  run: npx sf gates --policy-check --strict
  env:
    SF_ACTOR: github-actions
```

---

## Files Affected

| File | Action |
|------|--------|
| `sf_cli/src/core/policy-check.ts` | CREATE — Policy validation logic, violation types |
| `sf_cli/src/__tests__/policy-check.test.ts` | CREATE — Unit tests |
| `sf_cli/src/commands/gates.ts` | MODIFY — Add `--policy-check` and `--strict` flag handling |
| `docs/ci-policy-check.md` | CREATE — GitHub Actions integration example |
