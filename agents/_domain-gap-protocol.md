# _domain-gap-protocol — Domain Expertise Gap Detection (shared module)

> Included by all agents. Implements FR-001 (self-flag) and FR-011 (review-pass activation)
> of the Domain Expert Synthesis PRD. This module governs **detection and review only** —
> synthesis of the reviewer skill is performed by `scripts/synth-expert.sh`.

---

## Why this exists

Generic model output in a specialized **non-IT** field is often *technically correct but
professionally wrong* — grammatically valid French that no jurist would sign, an accounting
entry that balances but uses the wrong term for the local chart of accounts. The output
*looks* fine, so the gap ships silently. This protocol makes agents notice the gap and offer
a **domain reviewer** (a review lens over vocabulary, terminology, register, and
way-of-working) — never an advisor.

---

## FR-001 — Raise a domain-expertise gap

While producing or editing content, raise a `domain-expertise-gap` signal when **all** of
these hold:

1. The output is **specialized non-IT** professional content — legal, financial, accounting,
   real-estate, medical, insurance, tax, or notarial material; regulated filings, contracts,
   or official correspondence.
2. Getting the **vocabulary, terminology, or register** right requires domain fluency the
   base model cannot be trusted to have (a term of art, a jurisdiction-specific phrasing, a
   mandatory clause form), OR the target natural language is **not English** and the register
   is professional/formal.
3. The concern is **not** already covered by an IT skill in the registry (see the guard in
   `scripts/synth-expert.sh guard`). Ordinary software work never raises this signal.

**Do NOT raise the signal for:** code, config, IT architecture, plain conversational text, or
casual prose. When in doubt, prefer *not* flagging — false positives erode trust (Risk R-002).

### Signal shape

```
domain-expertise-gap: { domain: "<free text>", jurisdiction: "<code|unknown>", language: "<iso|en>", why: "<one line>" }
```

### What to do with it

1. Classify to a canonical slug: `bash scripts/synth-expert.sh slug "<domain free text>"`.
2. Run the guard: `bash scripts/synth-expert.sh guard --domain <slug>`.
   - Exit 10 (IT/covered) → **do not** propose; name the existing skill and continue.
   - Exit 0 (eligible) → propose synthesis to the user (never create silently, FR-003):
     `bash scripts/synth-expert.sh synthesize --domain <slug> --jurisdiction <j> --language <l> --signal self-flag`
     (the script prints the y/N prompt and writes nothing on `N`, timeout, or non-interactive mode).

---

## FR-011 — Reviewer activation (review pass)

Once a reviewer exists for the active domain (a `<slug>-expert` skill is present), it runs as
a **review pass**, never as an author:

- **Automatically** on subsequent same-domain output in the session that raised the gap.
- **On demand** via `/<slug>-expert review <file|selection>`.

The reviewer returns a **findings list** and the caller applies what it accepts:

```
{ span: "<quoted text>", issue: "<terminology|register|convention|phrasing>", suggested_rewrite: "<text>", citation: "<pack rule id | ⚠ unverified>" }
```

It **never** rewrites in place, makes a determination, gives advice, or answers a domain
question. Asked "is this valid/compliant/correct?", it declines the determination and reviews
the wording instead, deferring the substantive judgement to a qualified human (FR-010).

---

## Hard rules (inherited by every synthesized reviewer)

- **Review-only.** Vocabulary, terminology, register, way-of-working. No advice, no
  determinations, no recommendations, no substantive authoring.
- **Cite-or-flag.** Every finding cites a pack entry or is marked `⚠ unverified`.
- **Disclaimer** on every response: "Terminology/register review only — not
  legal/tax/financial/medical advice. Substantive determinations are for a qualified
  professional."
- **Freshness.** Warn when a cited pack rule's `last_verified` is older than one year.
- **Human-in-the-loop.** The reviewer is never the final authority.
