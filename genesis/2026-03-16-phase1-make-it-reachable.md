# PRD: Phase 1 — Make It Reachable

---
prd_id: phase1-make-it-reachable
title: "Phase 1: Make It Reachable"
version: 1.0
status: DRAFT
created: 2026-03-16
author: SBS
last_updated: 2026-03-16

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []
  recommends: []
  blocks: [phase2-make-it-sticky, phase3-make-it-defensible]
  shared_with: [skillfoundry-cli-platform, vscode-extension]

tags: [distribution, documentation, telemetry, vscode, devrel]
priority: high
layers: [backend, frontend]
---

---

## 1. Overview

### 1.1 Problem Statement

SkillFoundry v2.0.51 is a working AI engineering framework with an npm package, CLI, VS Code extension, and telemetry engine. However, the distribution surface is incomplete: there is no automated release pipeline, no Homebrew formula, no Docusaurus documentation site, no baseline metrics command, no HTML report generation, no telemetry consent mechanism, and the VS Code extension is not on the Marketplace. These gaps mean developers cannot discover, install, or evaluate SkillFoundry through the channels they expect.

### 1.2 Proposed Solution

Close every remaining gap in Epics 1-4 of the master roadmap: automate npm publishing and GitHub Releases via CI, add Homebrew and curl-pipe-bash installers, migrate the site/ static HTML to Docusaurus with structured guides and Algolia search, ship `sf metrics baseline` with HTML report output, add opt-in telemetry consent, and publish the VS Code extension to the Marketplace at v1.0.0.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| npm install paths | 1 (manual `npm i`) | 4 (npm, brew, curl, npx) | Count working install methods |
| Time to first pipeline run | ~30 min (read source) | < 10 min (guided) | Follow Getting Started guide end-to-end |
| Documentation pages indexed | 0 (static HTML, no search) | All pages searchable | Algolia DocSearch hit count |
| Telemetry baseline available | No | Yes (`sf metrics baseline` works) | CLI command exits 0 with output |
| VS Code Marketplace listing | Not published | Listed and installable | Search "SkillFoundry" in Marketplace |

---

## 2. User Stories

### Primary User: Developer adopting SkillFoundry

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | install via `brew install skillfoundry` on macOS | I use my preferred package manager | MUST |
| US-002 | developer | install via `curl \| bash` on Linux | I can onboard in one command | MUST |
| US-003 | developer | follow a Getting Started guide | I run my first pipeline in under 10 minutes | MUST |
| US-004 | developer | search documentation with Algolia | I find answers without reading every page | SHOULD |
| US-005 | developer | run `sf metrics baseline` | I capture raw AI quality before SkillFoundry | MUST |
| US-006 | developer | view an HTML quality report in my browser | I see improvement trends visually | MUST |
| US-007 | developer | install the VS Code extension from Marketplace | I integrate without manual VSIX sideloading | MUST |
| US-008 | developer | open the last quality report from VS Code | I stay in my editor workflow | SHOULD |

### Secondary User: SkillFoundry maintainer

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-010 | maintainer | push a semver tag to trigger npm publish + GitHub Release | releases are automated and repeatable | MUST |
| US-011 | maintainer | see npm download badges in README | I track adoption at a glance | SHOULD |
| US-012 | maintainer | know telemetry is opt-in with a privacy policy | the project is GDPR-compliant from day one | MUST |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | npm auto-publish on tag | GitHub Actions workflow triggers `npm publish` when a semver tag (e.g., `v2.0.52`) is pushed | Given a `v*` tag is pushed, When the workflow runs, Then the package is published to npm and a GitHub Release is created with auto-generated notes |
| FR-002 | Homebrew formula | A Homebrew tap formula that installs the `skillfoundry` CLI globally | Given macOS with Homebrew, When `brew install samibs/tap/skillfoundry` is run, Then `skillfoundry --version` prints the current version |
| FR-003 | curl-pipe-bash installer | A hosted script at `install.skillfoundry.dev` (or raw GitHub URL) that detects OS and installs | Given a Linux/macOS machine with curl and Node.js 20+, When the one-liner is executed, Then `skillfoundry --version` succeeds |
| FR-004 | npm downloads badge | README displays live npm weekly download count | Given the README is viewed on GitHub, When the badge renders, Then it shows current weekly npm downloads |
| FR-005 | Docusaurus site | site/ migrated from static HTML to Docusaurus 3 with sidebar nav, versioning support, and dark mode | Given a contributor runs `cd site && npm start`, When the dev server starts, Then all existing pages are accessible plus new guide pages |
| FR-006 | Getting Started guide | Step-by-step guide: install, init, first pipeline, first gate pass | Given a new user reads the guide, When they follow each step, Then they complete a full pipeline run in under 10 minutes |
| FR-007 | Architecture deep-dive | Page explaining the framework's components: agents, gates, forge, telemetry, memory | Given a developer reads the page, When they finish, Then they understand the data flow from PRD to production code |
| FR-008 | Configuration reference | Auto-generated or manually curated table of every `skillfoundry.config.ts` and `config.toml` option with type, default, and description | Given a developer needs to customize behavior, When they visit the config reference, Then every option is documented |
| FR-009 | Recipe pages | Three recipes: "Add to Next.js project", "TypeScript monorepo", "Azure DevOps pipeline" | Given a developer has a specific stack, When they follow the recipe, Then SkillFoundry is integrated into that stack |
| FR-010 | Algolia DocSearch | Algolia search bar in the Docusaurus site header | Given a user types a query in the search bar, When results appear, Then they link to the correct section of documentation |
| FR-011 | `sf metrics baseline` | CLI command that captures a snapshot of current code quality (test count, lint errors, type errors, LOC) as a baseline JSONL entry | Given a project with code, When `sf metrics baseline` runs, Then a `baseline` event is appended to `.skillfoundry/telemetry.jsonl` |
| FR-012 | HTML report generation | `sf report --html` generates a self-contained HTML file with charts showing quality trends | Given telemetry data exists, When `sf report --html` is run, Then `report.html` opens in the default browser showing pass/fail trends, gate history, and baseline comparison |
| FR-013 | Telemetry consent | First run of any telemetry-reporting command prompts the user with opt-in consent; stores preference in `.skillfoundry/config.toml` | Given a fresh install, When a telemetry command runs for the first time, Then the user is prompted to opt in or out, and the choice is persisted |
| FR-014 | Privacy policy | `docs/PRIVACY.md` and a page on the Docusaurus site explaining exactly what data is collected, how it is stored, and how to opt out | Given a user wants to understand data collection, When they read the privacy policy, Then every collected field is listed with its purpose and retention period |
| FR-015 | VS Code Marketplace publish | Extension published as `skillfoundry.skillfoundry` on the VS Code Marketplace | Given a developer searches "SkillFoundry" in VS Code Extensions, When results load, Then the extension appears and can be installed |
| FR-016 | "Open Last Report" command | VS Code command palette entry that opens the most recent HTML report | Given a report exists at `.skillfoundry/report.html`, When the user runs "SkillFoundry: Open Last Report", Then the file opens in the default browser |
| FR-017 | Extension v1.0.0 | Version bumped from 0.1.0 to 1.0.0 with updated CHANGELOG | Given the extension is ready for Marketplace, When the version is checked, Then it reads 1.0.0 |

### 3.2 User Interface Requirements

**Screen: Docusaurus site**
- Purpose: Primary documentation hub for SkillFoundry
- Key elements: Sidebar navigation, search bar (Algolia), dark/light mode toggle, version dropdown
- User flow: Landing page -> Getting Started -> Architecture or Config Reference -> Recipes

**Screen: HTML report**
- Purpose: Browser-viewable quality dashboard generated from telemetry JSONL
- Key elements: Summary stats (total runs, pass rate, avg duration), trend charts (pass/fail over time), gate breakdown table, baseline comparison section
- User flow: Run `sf report --html` -> browser opens -> user reviews trends

### 3.3 API Requirements (if applicable)

No server APIs. All features are CLI commands, static site pages, or CI workflows.

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| `sf metrics baseline` execution | < 5s for a 50k-LOC project |
| HTML report generation | < 3s for 1000 telemetry events |
| Docusaurus build time | < 60s |
| Homebrew install time | < 30s (excluding download) |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| curl-pipe-bash script | Must verify Node.js version, validate checksums if available, use HTTPS only |
| npm publish | Uses `NPM_TOKEN` GitHub secret, never exposed in logs |
| Telemetry consent | No data leaves the machine unless user explicitly opts in |
| Privacy policy | Lists every field collected with its purpose; no PII collected |
| GitHub Release token | Uses `GITHUB_TOKEN` (automatic), scoped to repo contents and packages |

### 4.3 Scalability

Not applicable for Phase 1. All features are local CLI tools, static sites, and CI pipelines.

### 4.4 Reliability

| Metric | Target |
|--------|--------|
| npm publish workflow | Succeeds on every valid semver tag push (idempotent: re-run safe) |
| Homebrew formula | Passes `brew audit --strict` and `brew test` |
| curl installer | Exits non-zero with clear message on unsupported OS or missing Node.js |
| HTML report | Renders correctly in Chrome, Firefox, Safari, Edge |

### 4.5 Observability

| Aspect | Requirement |
|--------|-------------|
| CI workflow | GitHub Actions logs visible per step; failure annotations on PR |
| Homebrew | Formula includes `test do` block that verifies `skillfoundry --version` |
| Telemetry | All telemetry events include `schema_version` for forward compatibility |
| HTML report | Includes generation timestamp and data range in footer |

---

## 5. Technical Specifications

### 5.1 Architecture

```
Developer Machine                    GitHub
┌────────────────┐                  ┌──────────────────────────┐
│ sf CLI (Node)  │                  │ .github/workflows/       │
│  ├─ metrics    │                  │  ├─ ci.yml (existing)    │
│  ├─ baseline   │                  │  └─ release.yml (NEW)    │
│  ├─ report     │                  │                          │
│  └─ consent    │                  │ Triggers:                │
│                │                  │  push tag v* → npm pub   │
│ .skillfoundry/ │                  │            → GH Release  │
│  ├─ telemetry  │                  └──────────────────────────┘
│  ├─ config     │
│  └─ report.html│                  npm Registry
│                │                  ┌──────────────────────────┐
│ VS Code ext    │                  │ skillfoundry@2.x.x       │
│  (Marketplace) │                  └──────────────────────────┘
└────────────────┘
                                    Homebrew
site/ (Docusaurus)                  ┌──────────────────────────┐
┌────────────────┐                  │ homebrew-tap/skillfoundry │
│ docs/          │                  └──────────────────────────┘
│ src/pages/     │
│ docusaurus.yml │                  VS Code Marketplace
│ algolia config │                  ┌──────────────────────────┐
└────────────────┘                  │ skillfoundry.skillfoundry │
                                    └──────────────────────────┘
```

### 5.2 Data Model

**Entity: BaselineEvent** (extends TelemetryEvent)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | string (UUID) | PK, auto-generated | Unique event identifier |
| schema_version | number | Required, current=1 | Forward-compat version |
| event_type | string | "baseline" | Discriminator |
| timestamp | string (ISO 8601) | Required | When baseline was captured |
| session_id | string (UUID) | Required | Groups events in a session |
| duration_ms | number | >= 0 | Time to collect baseline |
| status | "pass" | Always "pass" for baseline | Event status |
| details.test_count | number | >= 0 | Number of test files found |
| details.lint_error_count | number | >= 0 | Lint errors detected |
| details.type_error_count | number | >= 0 | TypeScript/type errors |
| details.loc | number | >= 0 | Lines of code |
| details.file_count | number | >= 0 | Total source files |
| details.language | string | Detected | Primary language |

**Entity: ConsentConfig** (in `.skillfoundry/config.toml`)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| telemetry.consent | "opted_in" \| "opted_out" \| "pending" | Required | User's consent choice |
| telemetry.consent_date | string (ISO 8601) | Set on choice | When user made the choice |
| telemetry.consent_version | number | Current=1 | Consent policy version |

### 5.3 Dependencies

| Dependency | Version | Purpose | Risk if Unavailable |
|------------|---------|---------|---------------------|
| @docusaurus/core | ^3.7.0 | Documentation site framework | No searchable docs site |
| @docusaurus/preset-classic | ^3.7.0 | Default Docusaurus theme + plugins | No site functionality |
| @easyops-cn/docusaurus-search-local | ^0.45.0 | Offline search fallback (before Algolia approval) | No search until Algolia approved |
| chart.js | ^4.4.0 | Charts in HTML report (embedded via CDN) | No visual trends in report |
| @vscode/vsce | ^3.0.0 | VS Code extension packaging/publishing | Cannot publish to Marketplace |
| Node.js | >= 20.0.0 | Runtime for CLI and build | Nothing works |

### 5.4 Integration Points

| System | Integration Type | Purpose | Owner |
|--------|------------------|---------|-------|
| npm Registry | API (npm publish) | Package distribution | npm Inc |
| GitHub Actions | CI/CD | Automated release | GitHub |
| GitHub Releases | API (gh release create) | Binary/changelog distribution | GitHub |
| VS Code Marketplace | API (vsce publish) | Extension distribution | Microsoft |
| Algolia DocSearch | API (crawler) | Documentation search | Algolia |
| Homebrew | Git tap | macOS package distribution | Community |

---

## 6. Contract Specification

Not applicable. Phase 1 has no server APIs. All features are CLI tools, CI workflows, and static sites.

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- **Technical:** Must work with existing Node.js 20+ requirement. No additional runtime dependencies.
- **Business:** Telemetry must be opt-in only. No data collection without explicit consent.
- **Resource:** Single maintainer. All automation must be zero-maintenance after setup.
- **Infrastructure:** No paid hosting. Docusaurus deploys to GitHub Pages. Algolia DocSearch is free for OSS.

### 7.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| Algolia DocSearch approves OSS application within 2 weeks | No search on site | Ship with `docusaurus-search-local` as offline fallback; swap to Algolia when approved |
| VS Code Marketplace publisher account exists (`skillfoundry`) | Cannot publish extension | Create publisher account before STORY-009 |
| `NPM_TOKEN` secret is configured in GitHub repo settings | npm publish fails silently | Workflow validates token presence before publish step |
| Homebrew tap repo `samibs/homebrew-tap` exists | `brew install` fails | Create the tap repo as part of STORY-002 |

### 7.3 Out of Scope

- Chocolatey/Scoop/WinGet packages for Windows (Phase 2)
- Paid Algolia plan or custom search infrastructure
- Telemetry backend server or dashboard SaaS
- npm package size optimization / tree-shaking
- Extension auto-update mechanism (Marketplace handles this)
- Docusaurus i18n / multi-language support
- API versioning docs (no APIs to version)

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | npm token leaks in CI logs | L | H | Use `--provenance` flag; token stored as GitHub encrypted secret; never echo in workflow |
| R-002 | Homebrew formula breaks on macOS updates | M | M | Pin formula to stable Node.js; include `test do` block in formula; test on CI |
| R-003 | curl-pipe-bash installer runs in hostile environment | M | H | Script checks for root, validates Node version, uses HTTPS, prints every command before executing with `--verbose` flag |
| R-004 | Algolia DocSearch application rejected | M | L | Ship with local search plugin first; Algolia is an enhancement, not a blocker |
| R-005 | VS Code Marketplace review rejects extension | L | M | Follow all Marketplace guidelines; ensure icon, README, CHANGELOG, LICENSE present; no malicious permissions |
| R-006 | HTML report XSS via telemetry data injection | L | M | All data values are HTML-escaped before rendering; report is generated locally, not served |
| R-007 | Baseline metrics inaccurate for monorepos | M | L | Document that baseline scans from project root; allow `--path` override |

---

## 9. Implementation Plan

### 9.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| A | Distribution | GitHub Actions release workflow, Homebrew formula, curl installer, npm badge | npm package already published |
| B | Documentation | Docusaurus migration, Getting Started, Architecture, Config Reference, Recipes, Algolia | Existing site/ content |
| C | Telemetry | Baseline command, HTML report, consent mechanism, privacy policy | Existing telemetry engine |
| D | VS Code | Marketplace publish, Open Last Report command, version 1.0.0 | Existing extension with 28 tests |

### 9.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| A (Distribution) | M | Low | Low |
| B (Documentation) | L | Medium | Low |
| C (Telemetry) | M | Medium | Low |
| D (VS Code) | S | Low | Low |

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

- [ ] All MUST-priority user stories implemented and verified
- [ ] `v*` tag push triggers successful npm publish + GitHub Release with auto-notes
- [ ] `brew install samibs/tap/skillfoundry` installs a working CLI
- [ ] curl one-liner installs a working CLI on Ubuntu 22.04+
- [ ] Docusaurus site builds, deploys, and all 5+ guide pages render
- [ ] `sf metrics baseline` captures snapshot and appends to telemetry.jsonl
- [ ] `sf report --html` generates a viewable HTML dashboard
- [ ] Telemetry consent prompt appears on first run, choice is persisted
- [ ] Privacy policy published on site and in repo
- [ ] VS Code extension listed on Marketplace and installable
- [ ] "Open Last Report" command works in VS Code
- [ ] npm downloads badge renders in README
- [ ] No regressions in existing CI (all tests still pass)

### 10.2 Sign-off Required

| Role | Name | Status | Date |
|------|------|--------|------|
| Technical Lead | SBS | Pending | |
| Product Owner | SBS | Pending | |

---

## 11. Appendix

### 11.1 Glossary

| Term | Definition | Code Name |
|------|------------|-----------|
| Baseline | A snapshot of code quality metrics captured before SkillFoundry is actively used | `baseline` |
| Consent | User's explicit opt-in or opt-out choice for anonymous telemetry reporting | `telemetry.consent` |
| Gate | A quality check that code must pass (lint, type, test, security) | `gate` |
| Forge | The multi-phase pipeline that implements stories from PRDs | `forge` |
| Telemetry | Local-first event logging of forge runs, gate results, and benchmarks | `telemetry` |
| Tap | A Homebrew third-party repository for formulae | `homebrew-tap` |

### 11.2 References

- [npm provenance docs](https://docs.npmjs.com/generating-provenance-statements)
- [Docusaurus 3 docs](https://docusaurus.io/docs)
- [Algolia DocSearch application](https://docsearch.algolia.com/apply/)
- [VS Code extension publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Homebrew formula cookbook](https://docs.brew.sh/Formula-Cookbook)

### 11.3 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-16 | SBS | Initial draft — gaps only, excludes completed work |
