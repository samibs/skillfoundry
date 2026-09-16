# Screen Brief — template and examples

Every screen gets one of these before code. Put it at the top of the page/component file
inside a comment block that starts with `SCREEN_BRIEF` so `audit_labels.py` can detect it.

## Template

```
SCREEN_BRIEF
SCREEN: <route or component>
WHO:    <a person, described by what they are doing — not a role code>
GOAL:   <the one thing they want to finish on this screen>
AFTER:  <what visibly happens when they click the main action, and who else is affected>
EXCEPTIONS: <optional — bare domain terms deliberately kept, and why>
```

## What makes each line valid

**WHO** — a human in a situation.
- ✗ "Admin", "User", "Compliance officer role"
- ✓ "The fiduciary's junior accountant who was handed a new client folder this morning and has never seen this client before"
- ✓ "The company's HR person doing the monthly payroll run, who is not an accountant"

**GOAL** — a finish line the person would name themselves.
- ✗ "Manage beneficial owners" (that's a feature name)
- ✓ "Record who really owns this company so the KYC file can be closed"
- ✗ "View dashboard"
- ✓ "See which of my 40 clients still have something missing before the 15th"

**AFTER** — consequences, not mechanics.
- ✗ "The form is submitted and the entity is updated"
- ✓ "The return is sent to the tax office's eCDF portal, the user sees a receipt number, and the client gets an email with the PDF. Nothing can be edited after this without filing a correction."
- If the honest answer is "a record is saved and nothing else", ask whether the screen needs a primary action at all.

## Worked examples

### Example 1 — VAT return preparation (Angular, Elyxen-style)

```
SCREEN_BRIEF
SCREEN: /clients/:id/vat/returns/:period
WHO:    The accountant at a fiduciary preparing one client's quarterly VAT return.
        They know accounting, not the tax office's form codes.
GOAL:   Check that the totals pulled from the bookkeeping look right, fix anything
        that was mis-classified, and submit the return before the deadline.
AFTER:  Clicking "Submit return to the tax office" sends the XML to eCDF, shows the
        receipt number on screen, locks the period, and emails the client a PDF copy.
EXCEPTIONS: Box numbers (e.g. "Case 012") stay visible next to each line because the
        accountant cross-checks them against the official form.
```

### Example 2 — Beneficial-owner capture (React/Next, KYC onboarding)

```
SCREEN_BRIEF
SCREEN: app/onboarding/[clientId]/owners/page.tsx
WHO:    The client's own director filling in onboarding from a link we emailed them.
        No compliance background at all.
GOAL:   Tell us who ultimately owns or controls the company so we can finish opening
        their file.
AFTER:  Clicking "Send ownership details" saves the people listed, marks this step done
        on their checklist, and notifies our compliance team to review. The director
        can still come back and edit until we approve.
```

### Example 3 — A screen that fails the brief

```
SCREEN_BRIEF
SCREEN: /admin/entities
WHO:    ???  (someone with admin rights — but doing what?)
GOAL:   "Manage entities" — not a goal
AFTER:  "Entity is updated" — not a consequence
```

This screen should not be built as specified. Go back to the user: "Who opens this page, and what are they trying to get done that day?" Usually the answer splits it into two or three real screens with real goals.
