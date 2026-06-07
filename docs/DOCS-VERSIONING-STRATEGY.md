# SkillFoundry Documentation Versioning & Maintenance Strategy

> Defines how documentation tracks the application release cycle, how code changes trigger doc reviews, and what accessibility & navigation baselines documentation must meet.

---

## 1. Versioning Model

Documentation versioning **mirrors** `package.json` `version` (currently `5.17.0` at the time of writing). The conventions:

| Doc artifact | Versioning rule |
|---|---|
| Release notes (`docs/VX.Y.Z-RELEASE-NOTES.md`) | One file per MAJOR.MINOR. Patch releases append a section to the existing file. |
| `docs/DOCUMENTATION-INDEX.md` | Header records current framework version. Updated on every MINOR bump. |
| `docs/CONFIGURATION-REFERENCE.md` / `docs/DEPLOYMENT-GUIDE.md` | Versionless. Must remain accurate against `main` at all times. |
| `CHANGELOG.md` | Follows [Keep a Changelog](https://keepachangelog.com/) format. Updated on every release. |

The framework does **not** maintain parallel versioned doc trees (no `/docs/v1`, `/docs/v2`). `main` is the only doc surface; previous releases are anchored by release-notes files plus git tags.

---

## 2. Release-Triggered Review

Every PR that changes user-visible behaviour MUST update at least one of:

| Code change | Required doc touch |
|---|---|
| New CLI command, flag, or skill | `docs/USER-GUIDE-CLI.md` + `docs/DOCUMENTATION-INDEX.md` |
| Change to `install-unified.sh` / `update.sh` | `docs/DEPLOYMENT-GUIDE.md` |
| Change to `.claude/settings.json` schema or any config surface | `docs/CONFIGURATION-REFERENCE.md` |
| New agent or skill | `docs/AGENTS.md` + `docs/SKILLS-CERTIFIED.md` |
| API endpoint added/changed in `mcp-server/` | `docs/API-REFERENCE.md` |
| Breaking change | `CHANGELOG.md` (Breaking section) + release-notes file |

### 2.1 PR checklist (copy into PR description)

```markdown
## Documentation Review
- [ ] Affected docs identified and updated (see DOCS-VERSIONING-STRATEGY.md §2)
- [ ] CHANGELOG.md updated if user-visible
- [ ] Release notes updated if MAJOR or MINOR bump
- [ ] No broken cross-doc links introduced
- [ ] DOCUMENTATION-INDEX.md still accurate
```

### 2.2 Enforcement hook

The repository's pre-commit / CI surface SHOULD flag PRs that modify any file in this table without an accompanying doc change. (Current state: enforced manually via review. Tracked in `docs/ENHANCEMENT-ROADMAP.md` for automation.)

---

## 3. Accessibility Baseline (WCAG 2.1 AA)

All HTML pages under `/site/` and Docusaurus pages under `/site-docs/` MUST meet WCAG 2.1 Level AA:

| Criterion | Requirement | Verification |
|---|---|---|
| 1.1.1 Non-text content | All images and SVGs have meaningful `alt` text (decorative: `alt=""`) | Manual review on every page change |
| 1.3.1 Info & relationships | Semantic heading order (h1 → h2 → h3, no skips) | Inspect with browser devtools accessibility panel |
| 1.4.3 Contrast (minimum) | Text contrast ≥ 4.5:1; large text ≥ 3:1 | Lighthouse / axe-core |
| 2.1.1 Keyboard | All interactive elements operable by keyboard | Tab through page |
| 2.4.2 Page titled | Each page has a descriptive `<title>` | Grep `<title>` in `/site/pages/` |
| 2.4.4 Link purpose | Link text describes destination without surrounding context | Manual review |
| 3.1.1 Language of page | `<html lang="en">` on every HTML page | Grep `<html lang` in `/site/pages/` |
| 4.1.2 Name, role, value | ARIA labels where native semantics insufficient | Inspect with axe-core |

Existing static pages in `/site/pages/` were spot-checked at the time of this writing; any new page must be checked before merge.

---

## 4. Navigation & Searchability

The repository ships two complementary doc surfaces:

| Surface | Purpose | Navigation/search mechanism |
|---|---|---|
| `/docs/*.md` (this folder) | Developer documentation | `DOCUMENTATION-INDEX.md` as canonical index; GitHub renders + search |
| `/site/` (static HTML) | Public marketing/landing pages + quick-start | Per-page navigation; sitemap.xml for SEO |
| `/site-docs/` (Docusaurus) | User-facing structured docs | Docusaurus sidebar + built-in search (`search.md`) |

### 4.1 Category structure

Documentation under `/site-docs/docs/` is organised by:

- `intro.md` — entry point
- `getting-started.md` — first-run flow
- `architecture.md` — system overview
- `configuration.md` — config surfaces
- `recipes/` — cookbook patterns (azure-devops, monorepo, nextjs, …)
- `search.md` — search guidance

### 4.2 Internal-link discipline

- All `[text](path)` links inside `docs/` MUST resolve within the repo.
- Cross-doc links use relative paths (`./SIBLING.md`, `../other/dir/FILE.md`).
- External links MUST use full `https://` URLs and SHOULD be checked annually.

---

## 5. Brand Voice (Summary)

Per the SkillFoundry CLAUDE.md philosophy:

- **Cold-blooded logic over flattery** — no marketing fluff in technical docs.
- **Concrete over abstract** — every claim cites a file, command, or version.
- **No placeholders** — no `TODO`, `FIXME`, `coming soon`, `lorem ipsum`.
- **Honest about gaps** — docs must say what *does not* exist when relevant (this strategy document is itself an example: it acknowledges the PRD's references to nonexistent `deploy.sh` / `tower.json`).

---

## 6. Maintenance Cadence

| Cadence | Owner | Action |
|---|---|---|
| Per PR | PR author | Apply PR checklist (§2.1) |
| Per MINOR release | Release manager | Update `DOCUMENTATION-INDEX.md` version header; create release-notes file |
| Quarterly | Docs reviewer | Verify external links; run accessibility audit on `/site/` |
| Annually | Tech lead | Review this strategy document for drift |

---

## 7. Related Documents

- Deployment: [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md)
- Configuration: [CONFIGURATION-REFERENCE.md](./CONFIGURATION-REFERENCE.md)
- Full doc map: [DOCUMENTATION-INDEX.md](./DOCUMENTATION-INDEX.md)
- Anti-patterns: [ANTI_PATTERNS_BREADTH.md](./ANTI_PATTERNS_BREADTH.md), [ANTI_PATTERNS_DEPTH.md](./ANTI_PATTERNS_DEPTH.md)
