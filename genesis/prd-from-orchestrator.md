# PRD: Documentation & Release Polish — patch bump

---
prd_id: skillfoundry-docs-polish
title: Documentation & Release Polish
version: 1.0
status: READY
priority: low
layers: []
---

## 1. Overview

### 1.1 Problem Statement

The SkillFoundry framework documentation and release artifacts have drifted from the current shipping behavior. README, CHANGELOG, in-app help text, and the version markers are not aligned. This is a low-risk maintenance
release: docs-only changes plus a patch version bump, no behavior changes.

### 1.2 Proposed Solution

Run a documentation-and-release pass that:

1. Bumps the patch version in every authoritative version marker
    (`package.json`, any version constant in source, any docs that quote
    the version).
2. Refreshes `README.md` so the quick-start and feature list match what the
    CLI actually does today.
3. Adds an `[Unreleased] → [<new version>]` entry to `CHANGELOG.md`
    summarizing recent commits since the previous tag, in
    [Keep a Changelog](https://keepachangelog.com/) format.
4. Writes a short release note (`docs/release-notes/<new-version>.md` or
    the project's existing release-notes location) suitable for Slack /
    email announcement.
5. Updates the project landing site copy (`site/`, `docs/`, or whatever
    the project uses) and any in-app help / `--help` text to reference the
    new version.
6. Commits everything in a single tidy commit and pushes the branch.

This is intentionally a no-op for *runtime* — only artifact metadata changes.

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | maintainer | run a single docs/release pass | I don't have to
chase 6 different files manually for each patch | MUST |
| US-002 | new user | read an accurate README | the quick-start matches
what `sf` actually does today | MUST |
| US-003 | existing user | see what changed in the new version | I know
whether to upgrade | MUST |
| US-004 | downstream integrator | see a consistent version across
`package.json`, CLI, docs | I can pin reliably | MUST |

## 3. Functional Requirements

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-001 | Patch-bump version | All authoritative version locations are 
updated to the same new patch number (e.g., `X.Y.Z` → `X.Y.(Z+1)`). `npm 
pkg get version` returns the new value. |
| FR-002 | Refresh README | `README.md` quick-start commands run 
successfully when copy-pasted. Feature list matches what is actually 
implemented. No broken anchors. |
| FR-003 | CHANGELOG entry | A new `## [<new-version>] - <today's date>` 
section exists with `Added` / `Changed` / `Fixed` / `Removed` 
subsections summarizing commits since the previous tag. The previous 
`[Unreleased]` block is moved into the new version section. |
| FR-004 | Release note | A release note for the new version exists at 
the project's release-notes location, written in user-facing prose (no 
internal jargon), with at most ~10 bullet points. |
| FR-005 | Site / in-app help refresh | Any version string shown in 
landing-site copy, `sf --version` output text, or in-app help banners is 
updated. Help text reflects the current command surface (no commands 
that no longer exist; no missing recently-added commands). |
| FR-006 | Single tidy commit | All of the above land in **one** commit 
titled `chore: docs + release polish for <new-version>`, pushed to the 
branch the orchestrator created. |

## 4. Non-Functional Requirements

### 4.1 Security

| Aspect | Requirement |
|--------|-------------|
| No secrets | No API keys, tokens, or credentials may appear in any 
committed file. |
| No URL leaks | Internal URLs, staging hostnames, or developer email 
addresses must not appear in user-facing docs. |
| Read-only on prod | This change must not modify any deployment script, 
CI workflow, environment file, or production config. |

### 4.2 Reliability

| Aspect | Requirement |
|--------|-------------|
| No code changes | Files under `src/`, `lib/`, `bin/`, or any compiled 
output directory must not be modified except for a single `version` 
constant if the framework keeps one in source. |
| Build must still pass | After the change, `npm run build` (or the 
project's standard build command) must succeed unchanged. |
| Tests must still pass | The existing test suite must continue to pass 
without modification. |

## 5. Technical Specifications

### 5.1 Architecture

This PRD does not change architecture. Output is a markdown / JSON / config
diff only.

### 5.2 File-touch budget

| Allowed to change | Not allowed to change |
|---|---|
| `package.json` (version field only) | any `src/**` file other than a 
single version constant |
| `README.md` | `package-lock.json` (unless version bump cascades there 
automatically) |
| `CHANGELOG.md` | `tsconfig*.json`, `.eslintrc*`, `next.config.*`, 
`tailwind.config.*` |
| `docs/**/*.md` | `Dockerfile*`, `docker-compose*.yml` |
| `site/**` content / copy files | `.github/workflows/**` |
| In-app help text files / `--help` strings | any `.env*` file |
| Version constants in source IF the project keeps one | any cert / key 
/ secret file |

If the agent is unsure whether a file is in scope, **prefer not to change
it** and document the skipped item in the release note instead.

## 6. Constraints & Assumptions

### 6.1 Constraints

- **Single commit, single PR.** The orchestrator will open the PR; the
   branch is `sf-forge-<jobId>` and is created off the repo's default
   branch. Do not force-push or rebase across the orchestrator's branch.
- **Patch bump only.** Do not bump minor or major even if changes seem
   larger — that's a human call.
- **English only** for prose changes, matching the existing repo style.

### 6.2 Assumptions

- The repo follows roughly conventional layout: `package.json` in root,
   `README.md` in root, `CHANGELOG.md` in root or `docs/`.
- A previous tag exists; if not, "since the beginning of the repo" is
   acceptable scope for the changelog summary.
- The repo uses git tags or git log to derive recent change summaries.

### 6.3 Out of Scope

- Source-level refactoring or feature additions.
- Dependency upgrades.
- Migration guides (only relevant for breaking changes).
- Translations / i18n.
- Re-recording demo GIFs or screenshots.
- Anything requiring a deploy.

## 7. Acceptance Criteria (Definition of Done)

- [ ] All authoritative version markers reflect the new patch version, 
identical across files.
- [ ] `README.md` quick-start commands have been mentally walked through 
and match current behavior.
- [ ] `CHANGELOG.md` has a new dated section for the new version with at 
least one bullet under at least one of Added / Changed / Fixed.
- [ ] A release note for the new version exists in the project's 
release-notes location.
- [ ] Landing-site copy and any in-app `--help` / banner text reflect 
the new version where it appears.
- [ ] The build still passes (`npm run build` or project equivalent).
- [ ] The test suite still passes.
- [ ] Exactly **one** commit titled `chore: docs + release polish for 
<new-version>` has been pushed to the branch.
- [ ] No file outside the allowed list (§5.2) has been modified.
- [ ] No secrets, internal URLs, or stack traces appear in any committed 
file.
