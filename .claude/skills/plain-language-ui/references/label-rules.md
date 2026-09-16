# Label rules — the Stranger Test in practice

## The test

Would a competent adult who has never worked in this domain know, from the label and its
helper alone:
1. what to type / pick / click,
2. where they would find that information,
3. what happens next?

If any of the three is a guess, the label fails.

## The formula

```
[Plain-language label]
[One- or two-sentence helper, visible by default]   ← what + where + (why)
(Official term)                                       ← parenthetical, secondary text
```

The official term is kept — users must be able to match the screen to government
paperwork — but it never stands alone.

## Before / after — Luxembourg compliance vocabulary

| Bare term (fails) | Plain label | Helper | Parenthetical |
|---|---|---|---|
| Assujetti | Company that files VAT | The business whose VAT return you are preparing. | (assujetti) |
| N° d'identification TVA | VAT number | The number starting with LU that the tax office gave this company. It's on their VAT registration letter. | (numéro d'identification TVA) |
| Matricule | National ID number | The 13-digit number on the person's Luxembourg social security card. | (matricule) |
| UBO | Real owner | A person who ultimately owns or controls at least 25 % of the company, even through other companies. | (beneficial owner / UBO) |
| PEP | Politically exposed | Tick if this person holds or recently held a senior public role, or is close family of someone who does. | (PEP) |
| eCDF | Tax office filing portal | The government portal that receives VAT and financial-statement filings. | (eCDF) |
| FAIA | Audit export file | The standard file the tax office can request to inspect your books. | (FAIA / SAF-T) |
| PSF | Licensed financial firm | A company authorised by the CSSF to provide financial services. | (PSF) |
| RCS / LBR | Company register | The public register where every Luxembourg company is listed. | (RCS / LBR) |
| Régime | VAT filing frequency | How often this company must file: monthly, quarterly or yearly. | (régime de déclaration) |
| Autoliquidation | You pay the VAT, not the supplier | For this purchase the buyer declares the VAT instead of the seller. | (autoliquidation / reverse charge) |
| Frontalier | Cross-border worker | An employee who lives in France, Belgium or Germany and works in Luxembourg. | (frontalier) |
| Classe d'impôt | Tax class | Determines the tax rate on this employee's salary. Found on their tax card. | (classe d'impôt) |
| Fiche de retenue d'impôt | Tax card | The document the tax office sends each employee saying how much tax to withhold. | (fiche de retenue d'impôt) |
| Indexation | Cost-of-living pay adjustment | Automatic salary increase Luxembourg applies when inflation crosses a threshold. | (indexation) |

## Buttons

A button says what will happen. Verb + object + consequence when the consequence is not obvious.

| Fails | Passes |
|---|---|
| Submit | Submit return to the tax office |
| Validate | Confirm these numbers are correct |
| Process | Run payroll for October |
| Generate | Create the PDF for the client |
| Sync | Refresh from the company register |
| Save | Save (fine, *if* nothing else happens) — otherwise "Save and notify the client" |
| OK / Continue | Continue to bank details |
| Delete | Remove this owner from the file |

Destructive or irreversible actions say so in the button or directly under it:
"Submit — you won't be able to edit this period afterwards."

## Status and enum values

Never render a code. Map every enum to a human phrase in one place (a `labels` map, an i18n
key, a pipe) and reuse it.

| Code | Shown |
|---|---|
| `PENDING_UBO_CHECK` | Waiting for ownership check |
| `DRAFT` | Not sent yet |
| `SUBMITTED` | Sent to tax office |
| `REJECTED_BY_ECDF` | Tax office refused it — see why |
| `KYC_INCOMPLETE` | Missing identity documents |

## Page titles and navigation

Title the goal, not the table.

| Fails | Passes |
|---|---|
| VAT Declarations | Prepare this quarter's VAT return |
| Entities | Your clients |
| UBO Register | Who owns each client company |
| Dashboard | What needs your attention this week |
| Settings | Company details and filing preferences |

## Empty states

An empty table with no text is a failed screen. Say what to do first:
"No owners recorded yet. Add the first person who owns 25 % or more."

## Error messages

Order: what went wrong → what to do.
- ✗ "Invalid matricule"
- ✓ "That ID number should be 13 digits. Check the social security card and try again."

## French/English/German

Write the plain version in the app's main language, translate the plain version, keep the
official term as the parenthetical untranslated. Do not translate "assujetti" to "taxable
person" and stop — "taxable person" is still jargon in English.

## Deliberate exceptions

Sometimes the domain term must stand alone (a column of official box numbers the accountant
cross-checks). Mark it in code with `@plain-language-exception <reason>` on the line or in the
Screen Brief's EXCEPTIONS field. The audit script skips marked items and lists them in a
separate "declared exceptions" section so they stay visible.
