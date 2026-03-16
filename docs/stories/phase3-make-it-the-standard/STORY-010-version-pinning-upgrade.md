# STORY-010: Version Pinning + sf upgrade

**Phase:** 3 — Distribution
**PRD:** phase3-make-it-the-standard
**Priority:** SHOULD
**Effort:** M
**Status:** READY
**Dependencies:** STORY-008, STORY-001
**Blocks:** None
**Affects:** FR-011

---

## Description

Enable teams to pin skill versions in the team config and provide an `sf upgrade` command to check for and apply updates. The team config's `skills.pin` field specifies a semver version (e.g., `"2.0.51"`). When `sf run` loads skills, it validates the local skill version against the pinned version. `sf upgrade --check` shows available updates without applying them. `sf upgrade` applies the latest version. `sf upgrade --version 2.1.0` pins to a specific version.

---

## Acceptance Contract

**done_when:**
- [ ] `skillfoundry.team.ts` supports a `skills.pin` field with semver format (validated by Zod)
- [ ] When `skills.pin` is set, `sf run` checks each skill's `meta.json` version against the pin
- [ ] If a skill version does not match the pin, `sf run` produces a WARNING: "Skill <name> version <local> does not match pin <pinned>"
- [ ] `sf upgrade --check` prints a table of skills with: name, current version, latest available version, status (up-to-date / update-available / pinned)
- [ ] `sf upgrade` updates all skills in the local `skills/` directory to the latest version from the framework's published registry
- [ ] `sf upgrade --version 2.1.0` updates the `skills.pin` value in `skillfoundry.team.ts` and fetches that specific version
- [ ] Version resolution: latest version is determined from the npm registry `@skillfoundry/skills` package (or from Git tags if npm is unavailable)
- [ ] `sf upgrade` prints a summary: N skills updated from <old> to <new>
- [ ] If no team config exists, `sf upgrade` operates on the local `skills/` directory without version pinning
- [ ] Unit tests in `sf_cli/src/__tests__/upgrade.test.ts` cover: check with updates available, check with all current, upgrade to latest, upgrade to specific version, no team config fallback, invalid semver rejection

**fail_when:**
- A pinned version is silently ignored during `sf run`
- `sf upgrade` modifies skills without printing what changed
- `sf upgrade --version invalid` accepts a non-semver string
- `sf upgrade --check` modifies any files (should be read-only)

---

## Technical Approach

### Version Pin Validation

In `pipeline.ts` startup:

```typescript
const teamConfig = loadTeamConfig();
if (teamConfig?.skills?.pin) {
  const pinnedVersion = teamConfig.skills.pin;
  const skills = loadSkillRegistry(workDir);
  for (const skill of skills) {
    if (skill.meta.version !== pinnedVersion) {
      logger.warn(`Skill ${skill.meta.name} version ${skill.meta.version} does not match pin ${pinnedVersion}`);
    }
  }
}
```

### Upgrade Command

`sf_cli/src/commands/upgrade.ts`:

1. Parse flags: `--check`, `--version <semver>`
2. Load local skills from `skills/` directory
3. Resolve latest version:
   - Primary: `npm view @skillfoundry/skills version` (returns latest published version)
   - Fallback: `git ls-remote --tags origin 'v*'` (parse highest semver tag)
4. If `--check`: print comparison table and exit
5. If `--version <semver>`: validate semver, fetch that version
6. Otherwise: fetch latest version
7. Download updated skill files from the registry (npm pack + extract, or git checkout of the version tag)
8. Overwrite local `skills/` directory with updated files
9. If team config exists and `--version` was specified, update `skills.pin` in the team config
10. Print summary

### npm Registry Integration

```typescript
function getLatestVersion(): string {
  try {
    return execSync('npm view @skillfoundry/skills version', { encoding: 'utf-8' }).trim();
  } catch {
    // Fallback to git tags
    const tags = execSync('git ls-remote --tags origin "v*"', { encoding: 'utf-8' });
    const versions = tags.split('\n')
      .map(line => line.match(/refs\/tags\/v(.+)/)?.[1])
      .filter(Boolean)
      .sort(semverCompare);
    return versions[versions.length - 1] ?? 'unknown';
  }
}
```

### Team Config Update

When `--version` is specified, update the team config file:

```typescript
function updateSkillPin(workDir: string, version: string): void {
  const configPath = join(workDir, 'skillfoundry.team.ts');
  const content = readFileSync(configPath, 'utf-8');
  const updated = content.replace(
    /pin:\s*['"][^'"]+['"]/,
    `pin: '${version}'`
  );
  writeFileSync(configPath, updated);
}
```

---

## Files Affected

| File | Action |
|------|--------|
| `sf_cli/src/commands/upgrade.ts` | CREATE — sf upgrade command |
| `sf_cli/src/__tests__/upgrade.test.ts` | CREATE — Unit tests |
| `sf_cli/src/core/pipeline.ts` | MODIFY — Add version pin check at startup |
| `sf_cli/src/commands/index.ts` | MODIFY — Register upgrade command |
