# STORY-009: GitHub Actions Release Workflow

**Phase:** 3 — Distribution
**PRD:** phase3-make-it-the-standard
**Priority:** MUST
**Effort:** M
**Status:** READY
**Dependencies:** STORY-008
**Blocks:** None
**Affects:** FR-010

---

## Description

Create a GitHub Actions workflow that triggers on `v*` tag push and automatically publishes to npm, syncs all 5 platform directories, and creates a GitHub Release with auto-generated release notes from the CHANGELOG. Each step is independent and idempotent so that partial failures can be retried without side effects. The workflow replaces the current manual release process.

---

## Acceptance Contract

**done_when:**
- [ ] `.github/workflows/release.yml` triggers on `push: tags: ['v*']`
- [ ] Step 1: `npm publish` publishes the `sf_cli` package to npm using `NPM_TOKEN` from GitHub Actions secrets
- [ ] Step 2: `sf publish --all` syncs skills to all 5 platform directories (Claude, Cursor, Copilot, Codex, Gemini)
- [ ] Step 3: `gh release create` creates a GitHub Release with the tag name, attaching the platform-synced files as release assets
- [ ] Release notes are extracted from `CHANGELOG.md` for the matching version section
- [ ] Each step runs independently: npm publish failure does not block GitHub Release creation
- [ ] The workflow uses `continue-on-error: false` per step but each step runs regardless of previous step failure (using `if: always()` on non-dependent steps)
- [ ] The workflow validates the version in `package.json` matches the Git tag before publishing
- [ ] The workflow runs on `ubuntu-latest` with Node.js 20
- [ ] The workflow includes a `verify` job that runs `npm test` and `sf gates` before publishing (publish is gated on verify passing)
- [ ] Secrets required: `NPM_TOKEN` (for npm publish), `GITHUB_TOKEN` (auto-provided, for gh release)
- [ ] A dry-run can be triggered manually via `workflow_dispatch` with a `dry-run` input that skips npm publish and gh release but runs all other steps
- [ ] The workflow is documented in `docs/release-workflow.md` with setup instructions for the `NPM_TOKEN` secret

**fail_when:**
- The workflow triggers on non-version tags (e.g., `feature-*`)
- npm publish runs without first verifying tests pass
- A version mismatch between `package.json` and the Git tag is not caught
- The GitHub Release is missing CHANGELOG content for the released version
- The workflow requires manual intervention for a normal release

---

## Technical Approach

### Workflow Structure

```yaml
name: Release
on:
  push:
    tags: ['v*']
  workflow_dispatch:
    inputs:
      dry-run:
        description: 'Dry run (skip publish and release)'
        type: boolean
        default: false

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm test
      - run: npx sf gates

  publish-npm:
    needs: verify
    runs-on: ubuntu-latest
    if: ${{ !inputs.dry-run }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, registry-url: 'https://registry.npmjs.org' }
      - run: npm ci
      - name: Verify version matches tag
        run: |
          PKG_VERSION="v$(node -p "require('./sf_cli/package.json').version")"
          TAG_VERSION="${GITHUB_REF_NAME}"
          if [ "$PKG_VERSION" != "$TAG_VERSION" ]; then
            echo "Version mismatch: package.json=$PKG_VERSION tag=$TAG_VERSION"
            exit 1
          fi
      - run: npm publish --workspace=sf_cli
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  publish-platforms:
    needs: verify
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx sf publish --all
      - uses: actions/upload-artifact@v4
        with:
          name: platform-files
          path: |
            .claude/commands/
            .cursor/rules/
            .copilot/custom-agents/
            .agents/skills/
            .gemini/skills/

  create-release:
    needs: [publish-npm, publish-platforms]
    if: ${{ always() && !inputs.dry-run && needs.verify.result == 'success' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with: { name: platform-files }
      - name: Extract changelog for version
        id: changelog
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          NOTES=$(sed -n "/^## \[${VERSION}\]/,/^## \[/p" CHANGELOG.md | head -n -1)
          echo "notes<<EOF" >> $GITHUB_OUTPUT
          echo "$NOTES" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT
      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release create "$GITHUB_REF_NAME" \
            --title "$GITHUB_REF_NAME" \
            --notes "${{ steps.changelog.outputs.notes }}" \
            --verify-tag
```

### Version Extraction from CHANGELOG

The CHANGELOG follows Keep a Changelog format. Version sections are delimited by `## [X.Y.Z]` headers. The sed command extracts everything between the current version header and the next version header.

### Idempotency

- `npm publish` is idempotent for the same version (npm returns 403 if already published; the step handles this gracefully).
- `gh release create` with `--verify-tag` ensures the release matches the tag.
- Platform sync overwrites existing files (idempotent by design).

---

## Files Affected

| File | Action |
|------|--------|
| `.github/workflows/release.yml` | CREATE — Full release workflow |
| `docs/release-workflow.md` | CREATE — Setup documentation for secrets and workflow |
