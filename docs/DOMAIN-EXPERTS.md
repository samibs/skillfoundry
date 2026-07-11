# Domain Experts — Review-Only Reviewers for Specialized Non-IT Domains

> **Since:** v5.26.0 · **Scripts:** `scripts/synth-expert.sh`, `scripts/domain-gap-scan.sh`,
> `scripts/promote-experts.sh` · **Protocol:** `agents/_domain-gap-protocol.md`

Generic model output in a specialized non-IT field is often *technically correct but
professionally wrong* — the vocabulary or register a practitioner would never sign off.
SkillFoundry can synthesize a **project-scoped, review-only domain reviewer** for such a field
(law, accounting, real estate, medical, insurance, tax, notarial), grounded in a citable
knowledge pack.

A reviewer is to prose what `/review` is to code: a **review pass** that returns findings. It
**reviews** vocabulary, terminology, register, and way-of-working — it never **advises**, never
makes a legal/financial/medical determination, and never authors substantive content.

---

## Quick start

```bash
# Create a reviewer for a non-IT domain (or use the /domain expert command)
bash scripts/synth-expert.sh synthesize \
  --domain "French legal contract drafting" \
  --jurisdiction FR --language fr --signal manual

# List reviewers in this project
bash scripts/synth-expert.sh list      #  or:  /domain experts
```

This creates:

- `.claude/commands/legal-fr-expert.md` — the review-only reviewer (mirrored to every installed platform)
- `packs/legal-fr/` — a knowledge pack (`pack.json`, empty `rules.jsonl`, `SOURCES.md`)
- a provenance entry in `memory_bank/knowledge/experts.jsonl`

Then populate `packs/legal-fr/rules.jsonl` with **real, human-reviewed** terminology and cite
the sources in `SOURCES.md`. Until you do, findings are emitted as `⚠ unverified`.

---

## How a gap is detected

| Trigger | Mechanism | When it fires |
|---------|-----------|---------------|
| **Self-flag** | Agents raise `domain-expertise-gap` per `agents/_domain-gap-protocol.md` | While producing specialized non-IT output (first occurrence) |
| **Behavioral** | `domain-gap-scan.sh record` logs corrections; `scan` reports at threshold (default 3) | The same domain corrected 3+ times |
| **Declared** | `domain-gap-scan.sh from-prd` reads a PRD's `domains: [...]`; `/onboard` asks | At project kickoff |

```bash
bash scripts/domain-gap-scan.sh record --domain "Comptabilité LU"   # log a correction
bash scripts/domain-gap-scan.sh scan                                 # behavioral candidates
bash scripts/domain-gap-scan.sh from-prd genesis/my-prd.md           # declared candidates
```

Every trigger runs the guard first: **IT domains are never synthesized.** A slug matching the
IT denylist (software, api, database, frontend, security, testing, …) or an existing skill in
the registry is skipped — the framework's existing IT skills are reused, not duplicated.

---

## The review-only contract

A synthesized reviewer inherits these hard rules (also enforced by the `/domain` engine):

- **Review-only.** Vocabulary, terminology, register, way-of-working. No advice, no
  determinations, no recommendations, no substantive authoring.
- **Cite-or-flag.** Every finding cites a `packs/<slug>/rules.jsonl` entry or is marked
  `⚠ unverified`.
- **Disclaimer** on every response: *"Terminology/register review only — not
  legal/tax/financial/medical advice. Substantive determinations are for a qualified
  professional."*
- **Freshness.** Warns when a cited rule's `last_verified` is older than one year.
- **Human-in-the-loop.** The reviewer is never the final authority.

Finding shape:

```
{ span: "<quoted text>", issue: terminology|register|convention|phrasing,
  suggested_rewrite: "<text>", citation: "<rule id | ⚠ unverified>" }
```

---

## Scoping and cross-project promotion

Reviewers start **project-local** (`.claude/commands/`). When the same domain is synthesized in
**3+ distinct projects**, it graduates to **framework-shared** (`agents/<slug>-expert.md`), so
every future project inherits it. This runs inside `/evolve` (Step 3.5):

```bash
bash scripts/promote-experts.sh scan                     # domains in ≥3 projects, not yet shared
bash scripts/promote-experts.sh promote --domain <slug>  # promote to the framework
```

Distinct-project counts are aggregated from each registered project's
`memory_bank/knowledge/experts.jsonl`.

---

## Safety notes

- **Never runs unattended.** Interactive synthesis prompts for confirmation; a non-interactive
  run without `--confirm` logs the gap and exits without writing (skills are never created
  unattended).
- **Packs ship empty.** The reviewer is wired correctly but can only cite real terminology once
  `rules.jsonl` is populated and human-reviewed — by design, so it can't hallucinate
  authoritative rules.
- **No private data.** Synthesized files and pack scaffolds contain no project data, paths, or
  client names.
- **Path safety.** Domain/jurisdiction strings are slugified and validated before any
  filesystem write (no `../`, no shell metacharacters).

---

## Command & script reference

| Command / script | Purpose |
|------------------|---------|
| `/domain expert <description>` | Synthesize a reviewer (+ pack) — runs guard, confirm gate, synthesis |
| `/domain experts` | List synthesized reviewers with provenance |
| `synth-expert.sh slug "<text>"` | Canonicalize free text → validated domain slug |
| `synth-expert.sh guard --domain <slug>` | Coverage check (exit 10 = IT/covered, 0 = eligible) |
| `synth-expert.sh synthesize …` | Create reviewer + pack + provenance (idempotent) |
| `synth-expert.sh list` | List reviewers in a project |
| `domain-gap-scan.sh record\|scan\|from-prd` | Behavioral + declared detection |
| `promote-experts.sh scan\|promote` | Cross-project promotion (FR-007) |

See also: `/domain` (Industry Knowledge Engine — the passive pack query engine),
`agents/_domain-gap-protocol.md` (detection + activation protocol), and
`genesis/2026-07-10-domain-expert-synthesis.md` (the PRD).
