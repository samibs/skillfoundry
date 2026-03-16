# STORY-001: GitHub Actions Release Workflow

**Phase:** A — Distribution
**PRD:** phase1-make-it-reachable
**Priority:** MUST
**Effort:** S
**Dependencies:** None
**Affects:** FR-001, FR-004, US-010, US-011

---

## Description

Create a GitHub Actions workflow that triggers on semver tag push (`v*`), publishes the npm package with provenance, creates a GitHub Release with auto-generated release notes, and adds an npm downloads badge to the README.

---

## Scope

### Files to create:
- `.github/workflows/release.yml`

### Files to modify:
- `README.md` — add npm downloads badge

### Files unchanged:
- `.github/workflows/ci.yml` — existing CI remains as-is
- `package.json` — version is already managed externally

---

## Technical Approach

### Workflow: `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write
  id-token: write  # Required for npm provenance

jobs:
  release:
    name: Publish to npm + GitHub Release
    runs-on: ubuntu-24.04

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for release notes

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - name: Validate tag matches package.json version
        run: |
          TAG_VERSION="${GITHUB_REF_NAME#v}"
          PKG_VERSION=$(node -p "require('./package.json').version")
          if [ "$TAG_VERSION" != "$PKG_VERSION" ]; then
            echo "::error::Tag version ($TAG_VERSION) does not match package.json ($PKG_VERSION)"
            exit 1
          fi

      - name: Publish to npm
        run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          draft: false
          prerelease: ${{ contains(github.ref_name, '-') }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Key decisions:

1. **Tag-version validation**: The workflow fails fast if the git tag version does not match `package.json`. This prevents mismatched releases.
2. **npm provenance**: The `--provenance` flag links the published package to the exact commit and workflow, increasing supply-chain trust.
3. **Prerelease detection**: Tags containing a hyphen (e.g., `v2.0.52-beta.1`) are marked as prerelease on GitHub.
4. **`softprops/action-gh-release@v2`**: Well-maintained action; `generate_release_notes: true` uses GitHub's commit-based changelog.
5. **Permissions**: `contents: write` for creating releases, `id-token: write` for npm provenance attestation.

### npm downloads badge in README:

Add after the existing badges:

```markdown
[![npm downloads](https://img.shields.io/npm/dw/skillfoundry)](https://www.npmjs.com/package/skillfoundry)
```

---

## Acceptance Criteria

```gherkin
Scenario: Semver tag triggers npm publish
  Given a developer pushes tag "v2.0.52" to the repository
  And the package.json version is "2.0.52"
  And NPM_TOKEN secret is configured
  When the release workflow triggers
  Then npm publish completes with provenance
  And the package is visible at https://www.npmjs.com/package/skillfoundry

Scenario: Tag-version mismatch fails fast
  Given a developer pushes tag "v2.0.99"
  And the package.json version is "2.0.52"
  When the release workflow triggers
  Then the workflow fails at the validation step
  And no npm publish occurs
  And no GitHub Release is created

Scenario: GitHub Release created with auto notes
  Given a valid semver tag is pushed
  When the release workflow completes
  Then a GitHub Release exists for that tag
  And the release body contains auto-generated notes from commits since the last tag

Scenario: Prerelease tag creates prerelease release
  Given a developer pushes tag "v2.1.0-beta.1"
  When the release workflow completes
  Then the GitHub Release is marked as prerelease

Scenario: npm downloads badge renders
  Given the README is viewed on GitHub
  When badges render
  Then an npm weekly downloads badge is visible with a live count
```

---

## Security Checklist

- [ ] `NPM_TOKEN` stored as GitHub encrypted secret (never in workflow file)
- [ ] Token is not echoed in any workflow step
- [ ] `id-token: write` permission scoped to this workflow only
- [ ] `contents: write` permission scoped to this workflow only (not org-wide)
- [ ] No `--force` flag on npm publish

---

## Testing

- Trigger workflow manually with a test tag on a fork to verify
- Verify `npm pack --dry-run` lists expected files before first real publish
- After first publish, verify `npm info skillfoundry` shows provenance data
