---
name: plain-language-ui
description: "Make every screen, field, button and page in a web app explain itself in plain language. PRE-BUILD GATE: before any UI code, write a Screen Brief (who is on this screen, what they want to finish, what happens after they click) and refuse bare domain-term labels like 'Assujetti', 'UBO', 'eCDF'. POST-BUILD AUDIT: crawl an existing Angular/.NET or React/Next.js repo with scripts/audit_labels.py, inventory every label/field/page, report what is unexplained, remediate. Use whenever the user builds, adds or redesigns any screen, form, page, dashboard, wizard, table or component in a compliance/fintech/regtech app (AML, KYC, VAT, payroll, audit, CSSF, tax filing); says labels are cryptic, confusing or 'I don't understand this button/field'; asks to audit, review or fix front-end wording; or turns a PRD into UI. Trigger even if they never say 'label' or 'plain language'."
---

# Plain-Language UI

## Why this skill exists

Apps built fast from a PRD inherit the PRD's vocabulary. Terms like *Assujetti*, *UBO*, *eCDF*, *FAIA*, *PSF*, *matricule* are precise in a spec and opaque on a screen — even to the person who commissioned the app. The result is software that works and cannot be operated.

This skill installs two habits:

1. **Nothing is built until the screen can explain itself** (pre-build gate).
2. **Existing screens are inventoried and fixed, not rewritten** (post-build audit).

The standard is the same in both modes: **a first-day user with no domain training must be able to say, for every screen, field and button, what it is for and what happens next.**

## Choose the mode

| Situation | Mode | Go to |
|---|---|---|
| About to create or change any UI (new screen, form, field, button, page, wizard step) | **Pre-build gate** | Section A |
| Existing app, user complains labels are cryptic, or asks for an audit/review/fix | **Post-build audit** | Section B |
| Both — auditing an app while also adding features | Run B first, then apply A to each new screen | B then A |

Stack-specific mechanics (where labels live, how to add helper text idiomatically) are in:
- `references/angular-dotnet.md` — Angular (Material, Formly, i18n) + .NET DTO naming
- `references/react-nextjs.md` — React / Next.js (App Router, shadcn, react-hook-form, zod, i18n JSON)

Read the one matching the target codebase before writing or editing code.

---

## Section A — Pre-build gate

### A1. Write the Screen Brief first, in prose, before any code

Every screen (route, page, modal, wizard step, drawer) gets a **Screen Brief** — three short answers in plain language. Use the template in `references/screen-brief-template.md`.

```
SCREEN: <route or component name>
WHO:    <the role, in human words — "the accountant preparing the client's quarterly VAT return">
GOAL:   <the one thing they want to finish here — "confirm the numbers and submit to the tax office">
AFTER:  <what happens when they click the main action — "the return is sent to eCDF, a receipt appears, and the client is emailed a copy">
```

Rules for a valid brief:
- Each answer is one or two sentences a non-specialist could read aloud and understand.
- WHO names a person, not a permission level. "Admin" is not an answer; "the fiduciary's office manager who sets up new client files" is.
- GOAL is a finish line, not a feature. "Manage entities" is a feature. "Add the client's new company so payroll can start next month" is a goal.
- AFTER describes consequences the user can see or that affect someone else. If nothing visible happens, the button probably should not exist.

If the brief cannot be written, stop. The screen is not understood yet — go back to the user with the three questions rather than guessing.

**Show the brief to the user and get a nod before writing code.** In Claude Code, put the brief in a comment block at the top of the page/component file (see stack reference for the exact convention) so the audit script can find it later.

### A2. Label rules — no bare domain terms ship

Every field, column header, button, tab, badge and status pill must pass the **Stranger Test**: would a competent adult who has never worked in this domain know what to type, click, or expect?

Concretely:

| Element | Requirement |
|---|---|
| Text/number/date input | Label in plain words **+** a one-sentence helper visible by default (not tooltip-only) explaining what to enter and where the user would find it. |
| Select / radio | Plain label + helper explaining what the choice changes. Each option that is a domain term gets a short parenthetical. |
| Checkbox / toggle | Phrased as the consequence: "Send a copy to the client" not "Client notification". |
| Button | Verb + object + what happens: "Submit return to tax office" not "Submit". "Validate" alone is banned. |
| Table column | Plain header; if it must be a domain term, the header has an info icon **and** the column is explained once above the table. |
| Status / badge | Never a raw enum value. `PENDING_UBO_CHECK` becomes "Waiting for ownership check". |
| Page title | Names the goal, not the data model: "Prepare this quarter's VAT return" not "VAT Declarations". |
| Error message | Says what went wrong and what to do, in that order. |

A domain term may appear, but only **after** the plain-language version, in parentheses or as secondary text — never as the sole label. Details, French/English patterns, and the compliance-term glossary are in `references/label-rules.md` and `references/glossary-lu-compliance.md`.

### A3. Gate checklist (run before declaring a screen done)

- [ ] Screen Brief exists, approved, and is in the file.
- [ ] Every input has label + visible helper.
- [ ] Every button says what will happen.
- [ ] No raw enum, acronym, or camelCase key is visible in the UI.
- [ ] Page title states the goal.
- [ ] Empty state tells the user what to do first.
- [ ] Any domain term is preceded by its plain-language equivalent.

If any box is unchecked, the screen is **not** done. Say so plainly rather than shipping and noting it as a TODO.

---

## Section B — Post-build audit

### B1. Run the crawler

```bash
python scripts/audit_labels.py <path-to-repo> --out ./ui-audit
```

Options:
- `--stack angular|react|auto` (default auto — detects from `angular.json` / `next.config.*` / `package.json`)
- `--glossary references/glossary-lu-compliance.md` (extra terms to flag; the built-in list is Luxembourg/EU compliance)
- `--allow allowlist.txt` — one plain word per line to never flag ("Name", "Email", "Save")
- `--min-severity low|medium|high`

It writes `ui-audit/report.md` (human) and `ui-audit/report.json` (machine). It does **not** modify source.

What it inventories:
- **Pages/routes** — Angular route `path:` entries, Next.js `app/**/page.tsx`, `pages/*.tsx`. Flags any page without a Screen Brief comment.
- **Labels** — `<label>`, `mat-label`, `placeholder`, `label=`, `<FormLabel>`, `<Label>`, `title=`, column `header`/`headerName`, button text, badge/enum renders, and every value in i18n JSON files.
- **Explanations** — for each label, whether a `mat-hint`, `matTooltip`, `helperText`, `description`, `<FormDescription>`, `aria-describedby`, or adjacent help text exists.

What gets flagged (severity):
- **High** — a raw enum/constant or camelCase/snake_case identifier rendered to the user; a button with a bare verb ("Submit", "Validate", "Process"); a glossary term with no explanation.
- **Medium** — an all-caps acronym ≤ 6 letters with no explanation; a label under three words that is not on the allowlist and has no helper.
- **Low** — helper exists only as a tooltip (invisible on touch, easy to miss); label is a noun phrase that doesn't say what to do.

### B2. Read the report with the user

Present the summary block first (counts per severity, top 10 worst pages), then ask which pages to fix first. Do not dump the entire item list in chat — point to `report.md`.

### B3. Remediate page by page

For each page in scope:
1. Write its Screen Brief retroactively (Section A1) — this is the step that makes the labels obvious. If the brief is impossible to write, tell the user the page may not have a reason to exist and ask before touching it.
2. For every flagged item, produce a replacement in the exact form the stack expects (see stack reference): new label, helper sentence, and — if the term is a domain term — the parenthetical.
3. Batch the edits per file; keep i18n keys stable, change values only, unless the key itself is being rendered (then fix the code path).
4. Re-run the crawler on the touched paths and show the before/after counts.

### B4. Remediation output format

Use this table when proposing changes so the user can approve in one pass:

```
| File | Element | Current | Proposed label | Proposed helper |
|------|---------|---------|----------------|-----------------|
```

Never silently rename something the backend depends on (form control names, DTO property names, API fields). UI text only, unless explicitly asked.

---

## Writing helper text that actually helps

The pattern that works, in this order:

1. **What to put here / what this does** — "The 11-digit number the Luxembourg tax office assigned to this company."
2. **Where they'd find it** — "It's on the VAT registration letter and every eCDF receipt."
3. **What it's used for** (only if not obvious) — "We use it to file the return under the right company."

Keep it to one or two sentences. Write it as if the person will read it once, when confused, at 17:45 on a filing deadline day.

Anti-patterns to reject in your own output:
- Restating the label as a sentence ("Enter the assujetti number." — still unexplained).
- Defining the term by another term ("The UBO is the beneficial owner.").
- Legal-register prose copied from a circular.
- Helper hidden in a tooltip only.

## Bilingual apps (FR/EN, sometimes DE)

Write the plain-language version in the app's primary language first, then translate the *plain* version — do not translate the domain term and call it done. "Assujetti" → "Personne ou société qui doit déclarer la TVA" → "Person or company that must file VAT returns". Keep the official term as the parenthetical in every language so users can match it to government paperwork.

## When the user pushes back that the terms are "standard"

They are standard for the regulator, not for the user. The app is not the regulator. Keep the official term visible in parentheses so nothing is lost, and keep the plain version first. If the user still insists on a bare term for a specific field, comply for that field and note it in the Screen Brief as a deliberate exception — the audit script honours `@plain-language-exception` comments.
