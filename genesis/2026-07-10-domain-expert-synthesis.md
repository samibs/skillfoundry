---
prd_id: domain-expert-synthesis
title: Domain Expert Synthesis
version: 1.4
status: COMPLETED
created: 2026-07-10
author: samibs
last_updated: 2026-07-11

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []
  recommends: []
  blocks: []
  shared_with: []

tags: [framework, skills, knowledge, domain, self-improving]
priority: high
layers: [backend]        # framework tooling only (shell + skill files); no DB/UI
---

# PRD: Domain Expert Synthesis

---

## 1. Overview

### 1.1 Problem Statement

When SkillFoundry is used to build software for a specialized **non-IT domain** (law,
finance, accounting, real estate, medical, insurance), the generic model produces output
that is *technically correct but professionally wrong* — grammatically valid French that no
jurist would sign, an accounting entry that balances but uses the wrong terminology for the
local chart of accounts, a contract clause with the wrong legal register. The framework
already ships **passive** domain knowledge (`packs/` + `/domain`) and **IT-rule** promotion
(`/evolve`), but nothing detects that the *current* project needs a **domain review lens**
over its output. Today the only path is to hand-author a skill (as was done for
`lu-payroll-expert`), which requires the user to (a) notice the gap themselves and (b) know
how to write the skill. The gap is silent and easy to miss — the output *looks* fine.

### 1.2 Proposed Solution

Add **Domain Expert Synthesis**: a framework capability where an agent working on
specialized non-IT content **self-flags a domain-expertise gap**, and — after a check
against the existing skill registry (so IT/covered domains are never re-created) and explicit
user confirmation — **synthesizes a project-scoped domain reviewer skill** paired with an
**auto-scaffolded knowledge pack** (`packs/<domain>/`).

**The synthesized skill is a REVIEWER, not an advisor.** It runs as a *review pass* over
content the framework already produced (the same way `/review` reviews code) and checks
**vocabulary, terminology, professional register, and way-of-working** against how a
qualified practitioner in that field expresses and does things. It flags and rewrites for
*how things are said and done* — it never makes substantive legal/financial/medical
**determinations** or gives **advice**. Its pack holds the correct terminology, standard
phrasings, and conventions to check against, so every flag cites a source or is marked
unverified. Reviewers start project-local; a domain seen across 3+ projects graduates into
the shared framework via the existing `/evolve` promotion loop.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Specialized-domain output professionally acceptable on first pass | ~baseline (anecdotal: NIS2 French contracts needed rewrites) | ≥ 80% accepted without domain rewrite once expert is active | User acceptance log / correction count before vs. after expert synthesis |
| Domain gaps surfaced vs. silently shipped | 0 (no detection) | Gap proposed within the session the specialized work starts | Count of gap-flag events vs. specialized-domain sessions |
| Duplicate/IT experts wrongly synthesized | n/a | 0 | Registry-collision check false-negative count |
| Uncited review findings in reviewer output | unmeasured | 0 uncited findings | Cite-or-flag audit on reviewer responses |

---

## 2. User Stories

### Primary User: SkillFoundry Developer (building a domain app)

| ID | As a... | I want to... | So that... | Priority | FR-IDs |
|----|---------|--------------|------------|----------|--------|
| US-001 | developer | be told when Claude is producing specialized non-IT output it isn't qualified for | I don't unknowingly ship "correct but wrong" legal/financial text | MUST | FR-001, FR-002, FR-010 |
| US-002 | developer | approve or decline creation of a project-scoped domain expert before it's created | the framework never silently pollutes my project with skills | MUST | FR-003 |
| US-003 | developer | have the synthesized expert grounded in a citable knowledge pack | its output is verifiable, not confidently hallucinated | MUST | FR-004, FR-005 |
| US-004 | developer | have IT/already-covered domains skipped automatically | I don't get a redundant "backend expert" I already have | MUST | FR-006 |
| US-005 | developer | have a recurring domain (3+ projects) promoted into the framework | every future project benefits from experts earned on past ones | SHOULD | FR-007 |
| US-006 | developer | manually request an expert for a domain I already know I need | I can pre-empt the gap instead of waiting for detection | COULD | FR-008 |

### Secondary User: Framework Maintainer

| ID | As a... | I want to... | So that... | Priority | FR-IDs |
|----|---------|--------------|------------|----------|--------|
| US-010 | maintainer | see all synthesized experts and their provenance | I can review, edit, or promote them deliberately | SHOULD | FR-007, FR-009 |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Gap self-flag hook | A shared agent module instructs every agent to raise a `domain-expertise-gap` signal when it detects it is generating specialized **non-IT** output: a target natural language ≠ English in a professional register, OR legal/financial/medical/accounting/real-estate terminology, OR editing contracts/filings/regulated documents. | Given an agent is asked to rewrite a French legal clause, When it produces output, Then it emits a gap signal naming the candidate domain + language before or alongside the output. |
| FR-002 | Domain classification | From the flagged context, classify the candidate domain into a **canonical domain slug** `<domain>[-<jurisdiction/language>]` (e.g., `legal-fr`, `accounting-lu`, `real-estate`). The slug is the identity key for idempotency (FR-004/4.3) and cross-project counting (FR-007). | Given a gap signal, When classification runs, Then a `{domain_slug, jurisdiction, language, confidence}` record is produced; if confidence < **0.7 (default, configurable)** the user is asked to confirm or correct the slug before any synthesis. |
| FR-003 | Propose-then-create gate | Never create silently. Present the detected gap and a one-line rationale; create the skill only on explicit `y`. In **non-interactive mode** (`--yes`/CI), never auto-create — log the gap and continue (skills are never synthesized unattended). | Given a classified gap, When surfaced interactively, Then the user sees "Detected need for <reviewer>; create project-scoped skill? (y/N)" and nothing is written on `N` or a 60s timeout; When in non-interactive mode, Then the gap is logged and no skill is written. |
| FR-004 | Reviewer synthesis | Generate a project-local **reviewer** skill file from a template: role (review-only), jurisdiction/language scope, the review checklist (terminology, register, standard phrasings, way-of-working conventions), output format (flag + suggested rewrite + citation), activation as a review pass, and inherited `/domain` guardrails (cite-or-flag, no advice, no fabrication, `last_verified` freshness). | Given confirmation, When synthesis runs, Then a valid skill file is written to `.claude/commands/<domain>-expert.md` (+ mirrored to other installed platforms), appears in the skill registry, and its instructions review existing content rather than authoring new substantive content. |
| FR-005 | Pack auto-scaffold | Alongside the reviewer, scaffold `packs/<domain>/` with `pack.json`, an empty `rules.jsonl` (correct terminology, standard phrasings, conventions), `SOURCES.md`, and `matrices/`. The reviewer is bound to this pack and every flag cites a pack entry or is marked unverified. | Given confirmation, When synthesis runs, Then `packs/<domain>/` exists with valid `pack.json`, and the reviewer references it; a flag with no matching pack entry is emitted as "⚠ unverified — no cited source". |
| FR-010 | Review output, not authored content | The reviewer's output is a list of findings over supplied content — `{span, issue, suggested_rewrite, citation}` — never a substantive determination, recommendation, or answer to a domain question. | Given the reviewer is asked "is this contract legally valid?", When it responds, Then it declines to determine validity and instead reviews terminology/register, deferring the determination to a qualified human. |
| FR-006 | Registry collision guard | Before synthesizing, decide coverage: a domain is **"IT/covered"** if its slug matches (or fuzzy-matches) an existing skill/agent in `agent-index`, OR appears on an **IT-domain denylist** (software, api, database, backend, frontend, devops, security, testing, performance, infra, ci-cd, etc.). If IT/covered, do not synthesize — name the existing skill instead. | Given a gap classified as an IT concern (e.g., "api-design"), When the guard runs, Then no reviewer is synthesized and the existing skill is named; Given a non-IT slug absent from the registry (e.g., "legal-fr"), Then synthesis is allowed. |
| FR-011 | Reviewer activation (review pass) | Once synthesized, the reviewer activates as a **review pass** over content: (a) **automatically** on subsequent same-domain output in the session that raised the gap, and (b) on demand via `/<domain>-expert review <file|selection>`. It never rewrites in place — it returns findings the caller applies. Integration into `/verify` as an optional domain lens is Phase 2. | Given a synthesized `legal-fr` reviewer and new French legal output in the same session, When the output is produced, Then the reviewer runs and returns findings; Given `/legal-fr-expert review clause.md`, When invoked, Then it returns findings for that file without modifying it. |
| FR-007 ✅ | Cross-project promotion (Phase 3, DONE) | `scripts/promote-experts.sh` aggregates each registered project's `experts.jsonl`, counts distinct provenance projects per domain, and (via `/evolve` Step 3.5) promotes any reviewer synthesized in 3+ distinct projects from project-local to framework-shared (`agents/<slug>-expert.md` scope=framework + framework pack). Idempotent. | Given a domain synthesized in 3 projects, When `promote-experts.sh scan` runs, Then it lists the domain as a candidate; on `promote`, a generalized framework reviewer is written to `agents/` and the domain is no longer a candidate. |
| FR-008 | Manual invocation | `/domain expert <description>` lets the user request synthesis directly, bypassing detection but running the same gate, guard, synthesis, and pack scaffold. | Given `/domain expert "Belgian notarial deeds"`, When invoked, Then the same propose→synthesize→scaffold flow runs. |
| FR-009 | Provenance + listing | Every synthesized reviewer records `{domain_slug, jurisdiction, source_signal, created_at, provenance_project, scope}` in its frontmatter and in a project manifest, listable via `/domain list`. | Given synthesized reviewers exist, When `/domain list` runs, Then each shows scope (project/framework) and provenance. |
| FR-012 | Behavioral trigger (Phase 2) | Agents record a domain-correction each time they revise their own specialized non-IT output (`domain-gap-scan.sh record`). A scan reports domains reaching a threshold (default 3) that pass the guard and lack a reviewer, as synthesis candidates. | Given 3 recorded corrections for `accounting-lu` and 2 for `legal-fr`, When `scan` runs, Then `accounting-lu` is surfaced as a candidate and `legal-fr` is not; an IT domain never surfaces. |
| FR-013 | Declared trigger (Phase 2) | A PRD may declare `domains: [..]` in front matter; `domain-gap-scan.sh from-prd` reports each declared non-IT, uncovered domain as a synthesis candidate. Supports inline `[a, b]` and block-list YAML. | Given a PRD with `domains: [legal-fr, api-design]`, When `from-prd` runs, Then `legal-fr` is a candidate and the IT `api-design` is skipped. |

### 3.2 User Interface Requirements

CLI-only (no web UI). Key interaction is the gap-proposal prompt:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DOMAIN EXPERTISE GAP DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Domain:      Legal — contract drafting
  Language:    French   Jurisdiction: FR/EU (NIS2)
  Signal:      agent self-flag (editing regulated contract text)
  Registry:    no existing skill covers this (not an IT domain)

  Generic output here is grammatically correct but not
  professionally correct. A domain REVIEWER (review-only, no advice)
  will check terminology, register, and way-of-working against a
  citable pack — and flag, not decide.

  Create project-scoped reviewer  ./.claude/commands/legal-fr-expert.md
  + knowledge pack                ./packs/legal-fr/               (y/N)
```

### 3.3 API Requirements

Not applicable — this is framework CLI/skill tooling. See §6 skip note.

---

## 4. Non-Functional Requirements

> This feature ships shell scripts + Markdown skill/pack files inside the framework. Web-app
> NFR tables (performance SLAs, scalability, multi-tenant isolation, CORS) do not apply and are
> marked N/A below. The relevant NFRs are safety, correctness, and idempotency.

### 4.2 Security & Safety

| Aspect | Requirement |
|--------|-------------|
| Review-only mandate | The synthesized skill reviews **vocabulary, terminology, register, and way-of-working** over supplied content. It MUST NOT give advice, make determinations, recommend a course of action, or author substantive domain content. Enforced in the persona template and FR-010. |
| No fabrication | Synthesized reviewers MUST inherit the `/domain` hard rule: never invent rules; every flag cites the pack or is marked unverified. |
| Mandatory disclaimer | Every reviewer response includes: "Terminology/register review only — not legal/tax/financial/medical advice. Substantive determinations are for a qualified professional." |
| Human-in-the-loop | The reviewer improves how content is expressed and structured and defers every substantive determination to a qualified human. It never presents itself as the professional authority or the final word. |
| Freshness | Regulated packs carry `last_verified`; the persona warns when cited rules are older than 1 year. |
| No secret leakage | Synthesized files and pack scaffolds contain no project data, paths, credentials, or client names (same privacy bar as `bootstrap.jsonl`). |
| Input validation | Domain/jurisdiction strings are slugified and validated before use in file paths (no `../`, no shell metacharacters). |
| Write-scope | Synthesis writes only under the project's skill dirs and `packs/`; never outside the project root without explicit confirmation. |

### 4.2.1 Multi-Tenant Isolation

Not applicable — no multi-user runtime; operates on the local filesystem for a single developer.

### 4.3–4.4 Scalability / Reliability

Not applicable (scalability). Reliability requirement: **idempotent** — re-running synthesis for an existing expert updates in place and never duplicates the skill or pack.

### 4.5 Observability

| Aspect | Requirement |
|--------|-------------|
| Logging | Each gap-flag, decision (create/decline), and synthesis writes a structured line to the framework log and to dev-memory (for the 3+ promotion count). |
| Auditability | Every synthesized asset is traceable to the signal and session that produced it (FR-009 provenance). |

---

## 5. Technical Specifications

### 5.0 Technology Maturity Assessment

All dependencies are framework-internal and **Stable**: bash (existing tooling), Markdown skill
files, JSONL knowledge, and the existing `/domain`, `/evolve`, and harvest scripts. No new
external runtime dependency. Verification level: build/lint + shell smoke tests + a golden
end-to-end synthesis test.

### 5.1 Architecture

```mermaid
graph TD
    A[Agent doing specialized work] -->|self-flag: domain-expertise-gap| B[Domain Classifier]
    B --> C{Registry guard: IT or already covered?}
    C -->|yes| X[Reuse existing skill - no synthesis]
    C -->|no| D[Propose to user y/N]
    D -->|N| Z[Log decline, continue]
    D -->|y| E[Synthesize persona skill  .claude/commands/]
    E --> F[Scaffold pack  packs/domain/]
    F --> G[Register + record provenance to dev-memory]
    G -->|domain seen in 3+ projects| H[/evolve promotes to agents/ - framework-wide]
```

### 5.2 Data Model (files, not DB)

**Synthesized persona skill** — `.claude/commands/<domain>-expert.md` (mirrored per installed platform)
| Field (frontmatter) | Type | Description |
|-------|------|-------------|
| name | string | `<domain>-expert` |
| domain | string | slug, e.g. `legal-fr` |
| jurisdiction | string | e.g. `FR`, `LU`, `EU` |
| language | string | e.g. `fr` |
| scope | enum | `project` \| `framework` |
| bound_pack | string | path to `packs/<domain>/` |
| source_signal | enum | `self-flag` \| `manual` \| `promotion` |
| created_at | date | ISO date (string; not runtime-generated in scripts) |
| provenance_project | string | project slug |

**Pack scaffold** — `packs/<domain>/pack.json` reuses the existing pack schema (name, version, jurisdiction, description, last_verified) + `rules.jsonl` (empty), `SOURCES.md`, `matrices/`.

**Provenance record** — appended to dev-memory `experts.jsonl`: `{domain_slug, jurisdiction, language, provenance_project, created_at}` — the count of **distinct `provenance_project` per `domain_slug`** drives promotion (FR-007); `domain_slug` is the canonical identity key (FR-002) that also enforces idempotency (§4.3).

### 5.3 Dependencies

| Dependency | Version | Verified | Purpose | Risk if Unavailable |
|------------|---------|----------|---------|---------------------|
| bash | system | [x] | synthesis + scaffold scripts | none (already required by framework) |
| existing `/domain` engine | in-repo | [x] | pack schema + guardrails to inherit | none |
| existing `/evolve` + dev-memory | in-repo | [x] | cross-project promotion loop | promotion (FR-007) degrades to manual |
| `agent-index` registry | in-repo | [x] | collision guard (FR-006) | guard degrades to name-match heuristic |

### 5.5 Directory Structure (new/affected)

```
agents/
├── _domain-gap-protocol.md          # NEW: the self-flag hook (shared module, included by all agents)
└── _known-deviations.md             # reference: "correct but not right" failure class
scripts/
├── synth-expert.sh                  # NEW: classify → guard → synthesize persona → scaffold pack
└── evolve.sh                        # MODIFIED: add expert-promotion candidates (FR-007)
templates/
├── expert-persona.md.tmpl           # NEW: persona skill template
└── pack.scaffold/                   # NEW: pack.json + rules.jsonl + SOURCES.md skeleton
.claude/commands/domain.md           # MODIFIED: add `/domain expert <desc>` subcommand (FR-008), listing (FR-009)
packs/<domain>/                      # GENERATED per project
```

### 5.7 Environment Variables

None required. Optional: `DEV_MEMORY_DIR` (already used by `/evolve`) for provenance/promotion.

---

## 6. Contract Specification

**Skipped — reason:** This PRD has no REST API. It is framework CLI tooling (shell scripts +
Markdown/JSONL asset generation). No endpoints, no request/response shapes, no frontend.

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- **Technical:** Must reuse the existing `packs/` schema, `/domain` guardrails, and `/evolve`
  promotion loop — no parallel/duplicate systems. Bash-only tooling (framework portability rule).
- **Safety:** Non-IT reviewers must never present substantive legal/financial/medical
  determinations as authoritative; review-only, cite-or-flag + disclaimer are non-negotiable.
- **Scope:** Synthesized experts are project-local by default; framework promotion requires the
  3-project threshold and explicit confirmation.

### 7.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| Agents can reliably self-detect "specialized non-IT output" | Missed gaps (false negatives) | Add the behavioral 3+-correction signal and PRD `domains:` tag as later triggers (roadmap §10) |
| The `agent-index` registry is complete enough to prevent IT re-creation | Redundant experts | Maintain an explicit IT-domain denylist as a backstop |
| Users want a prompt, not silent automation | Friction | The gate is one keystroke; `/domain expert` offers the manual fast-path |

### 7.3 Out of Scope

- **Any advisory capability.** The reviewer does NOT give domain advice, answer domain
  questions, make legal/financial/medical determinations, recommend actions, or author
  substantive domain content. It reviews vocabulary, terminology, register, and
  way-of-working over content that already exists — nothing more.
- ~~Behavioral detection via 3+ corrections~~ — **delivered (Phase 2, FR-012)**.
- ~~Declared detection via PRD `domains:` field / `/onboard` question~~ — **delivered (Phase 2, FR-013)**.
- Auto-populating pack `rules.jsonl` with real legislation (packs are scaffolded empty; content
  authoring is a separate effort, human-reviewed).
- Any web UI or dashboard.
- Real-time regulatory feeds / auto-updating `last_verified`.

---

## 8. Regression Surface

| Feature at Risk | Affected Layers | Current Test Coverage | Regression Test Required |
|-----------------|-----------------|-----------------------|--------------------------|
| `/domain` command (adding `expert` subcommand + listing) | Framework CLI | Unknown | Yes — add subcommand tests before implementing |
| `/evolve` + `evolve.sh` (adding expert promotion) | Framework CLI | Partial | Yes — verify existing rule-evolution path unchanged |
| Agent behavior (new `_domain-gap-protocol.md` include) | All agents | n/a | Yes — verify no false-positive gap flags on plain IT tasks |
| `install.sh` (shipping new templates/ + scripts/) | Installer | Manual | Yes — fresh-clone install smoke test (see recent bootstrap.jsonl install bug) |

---

## 9. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | Reviewer emits an incorrect or unverified terminology/register finding presented as authoritative | M | M | Review-only scope (no advice/determinations), cite-or-flag (findings without a pack source are marked unverified), mandatory disclaimer, human sign-off, empty-pack default (no invented rules) |
| R-002 | False-positive gap flags on ordinary IT work create noise | M | M | Registry guard + IT denylist + confidence threshold; flag only clearly non-IT specialized output |
| R-003 | Redundant experts pollute project/framework | M | M | Idempotent synthesis + registry collision guard + 3-project promotion threshold |
| R-004 | Path injection via crafted domain/jurisdiction string | L | H | Slugify + validate before any filesystem write; confine writes to project skill dirs + packs/ |
| R-005 | Synthesized files leak project/client data | L | H | Same privacy bar as bootstrap: no paths/names/secrets; generated from template only |

---

## 10. Implementation Plan

### 10.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | MVP: self-flag → propose → synthesize + pack + review pass | FR-001–006, FR-008, FR-009, FR-010, FR-011; `_domain-gap-protocol.md`, `synth-expert.sh`, `expert-persona.md.tmpl`, pack scaffold, `/domain expert` manual path | None |
| 2 ✅ | Additional triggers (DONE) | Behavioral 3+-correction detection (FR-012); PRD `domains:` tag + `/onboard` question (FR-013) — `scripts/domain-gap-scan.sh` + 11 tests | Phase 1 |
| 3 ✅ | Cross-project promotion (DONE) | FR-007 via `scripts/promote-experts.sh` (scan/promote) + `/evolve` Step 3.5; promote at 3 distinct projects — 13 tests | Phases 1–2 |

### 10.2 Effort Estimate

| Phase | Effort | Complexity | Risk | Estimated Story Count |
|-------|--------|------------|------|-----------------------|
| 1 | M | Med | Med | 5–7 stories |
| 2 | M | Med | Low | 3–4 stories |
| 3 | S | Low | Low | 2–3 stories |

---

## 11. Acceptance Criteria

### 11.1 Definition of Done (Phase 1 MVP)

- [ ] `_domain-gap-protocol.md` exists and is included by agents; a plain IT task produces **no** gap flag, a French-legal-edit task **does**.
- [ ] `synth-expert.sh` runs classify → registry guard → propose → synthesize → scaffold, end to end, on a golden example (`legal-fr`).
- [ ] Registry guard blocks synthesis for an IT domain (e.g., "api-design") and names the existing skill instead.
- [ ] Synthesized skill is a **reviewer**, not an advisor: asked to make a determination ("is this valid?"), it declines and reviews terminology/register instead (FR-010). Includes disclaimer + cite-or-flag, mirrored to every installed platform dir.
- [ ] `packs/<domain>/` scaffolds with valid `pack.json`, empty `rules.jsonl`, `SOURCES.md`; a substantive claim with no cited rule renders as "⚠ unverified".
- [ ] Re-running synthesis for an existing expert is idempotent (no duplicate skill/pack).
- [ ] Domain/jurisdiction strings are slugified + validated; a `../`-injection attempt is rejected.
- [ ] `/domain list` shows synthesized experts with scope + provenance.
- [ ] `/domain expert "<desc>"` manual path works and runs the same gate.
- [ ] Fresh-clone `install.sh` ships the new templates/scripts and completes without error.
- [ ] Shell tests pass; no new CRITICAL GuardLoop patterns (`/guardloop scan` clean).
- [ ] Docs updated: `/domain` help, CHANGELOG entry, and a short "Domain Experts" section.

### 11.2 Sign-off Required

| Role | Name | Status | Date |
|------|------|--------|------|
| Framework Owner | samibs | Pending | |
| Safety Review (review-only mandate / disclaimer / cite-or-flag) | samibs | Pending | |

---

## 12. Appendix

### 12.1 Glossary

| Term | Definition | Code Name |
|------|------------|-----------|
| Domain-expertise gap | A detected situation where the model is producing specialized non-IT output whose vocabulary/register it can't be trusted to get professionally right | `domain-expertise-gap` |
| Domain reviewer | A synthesized skill that reviews vocabulary, terminology, register, and way-of-working for a domain — review-only, never advisory | `<domain>-expert` |
| Review pass | The reviewer's mode of operation: it inspects existing content and returns findings, like `/review` for code | `review_pass` |
| Knowledge pack | The existing passive, cited store (terminology, standard phrasings, conventions) bound to a reviewer | `packs/<domain>` |
| Cite-or-flag | Rule that every review finding is cited from the pack or explicitly marked unverified | `cite_or_flag` |
| Promotion | Graduating a project-local expert to framework-shared after 3+ projects | `expert_promotion` |

### 12.2 References

- Existing: `/domain` (Industry Knowledge Engine), `packs/{gdpr,eu-vat,aml-kyc}`
- Existing: `/evolve` + `scripts/evolve.sh` (cross-project promotion loop)
- Existing precedent: `lu-payroll-expert` (hand-built domain persona)
- Reference: `agents/_known-deviations.md` ("correct but not right" failure class)

### 12.3 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-10 | samibs | Initial draft — MVP = agent self-flag trigger + persona-with-pack grounding |
| 1.1 | 2026-07-11 | samibs | Scoped to REVIEW-ONLY: reviews vocabulary/terminology/register/way-of-working, never gives advice or makes determinations (added FR-010, review-only mandate, cite-or-flag) |
| 1.2 | 2026-07-11 | samibs | prd-lint semantic pass fixes: added FR-011 (reviewer activation/review pass), canonical `domain_slug` identity key (idempotency + promotion counting), IT-domain determination (FR-006), confidence threshold 0.7 + non-interactive gate (FR-002/003); resolved cite-or-abstain→cite-or-flag drift, `project`→`provenance_project`, stale R-001 wording; FR-010/011 added to Phase 1 |
| 1.3 | 2026-07-11 | samibs | Phase 2 built: FR-012 (behavioral 3+-correction trigger) + FR-013 (declared PRD `domains:` trigger) via `scripts/domain-gap-scan.sh` (record/scan/from-prd) + `domains:` template field + `/onboard` question; 11 tests. Moved from out-of-scope to delivered. |
| 1.4 | 2026-07-11 | samibs | Phase 3 built: FR-007 cross-project promotion via `scripts/promote-experts.sh` (scan/promote) + `/evolve` Step 3.5; promote reviewer to framework `agents/` at 3 distinct projects; 13 tests. All three phases now delivered. |
