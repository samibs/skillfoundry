# Angular + .NET — where labels live and how to fix them

## Where the crawler looks

| Source | Pattern |
|---|---|
| Component templates | `*.component.html`, inline `template:` in `*.component.ts` |
| Angular Material | `<mat-label>`, `<mat-hint>`, `matTooltip`, `<mat-error>`, `placeholder` |
| Native | `<label>`, `<th>`, `<button>`, `placeholder`, `title`, `aria-label`, `aria-describedby` |
| Formly / dynamic forms | `props.label`, `props.description`, `props.placeholder`, `templateOptions.label` in `*.ts` |
| Tables (Material / ag-Grid / PrimeNG) | `<th mat-header-cell>`, `headerName:`, `header=` |
| Routes | `path:` entries in `*-routing.module.ts`, `app.routes.ts`, `Routes` arrays |
| i18n | `src/assets/i18n/*.json`, `messages.*.xlf`, `$localize` template strings |
| Enums rendered raw | `{{ item.status }}` where `status` is an enum, without a pipe or map |

## Screen Brief convention

Top of the page component's `.ts` file:

```ts
/**
 * SCREEN_BRIEF
 * SCREEN: /clients/:id/vat/returns/:period
 * WHO:    The fiduciary accountant preparing one client's quarterly VAT return.
 * GOAL:   Check totals, fix mis-classified lines, submit before the deadline.
 * AFTER:  "Submit return to the tax office" sends XML to eCDF, shows the receipt
 *         number, locks the period, emails the client the PDF.
 */
@Component({ ... })
export class VatReturnPageComponent { }
```

## Idiomatic fixes

### Material form field — label + always-visible helper

```html
<!-- before -->
<mat-form-field>
  <mat-label>Assujetti</mat-label>
  <input matInput formControlName="taxablePersonId">
</mat-form-field>

<!-- after -->
<mat-form-field>
  <mat-label>Company that files VAT <span class="term">(assujetti)</span></mat-label>
  <input matInput formControlName="taxablePersonId">
  <mat-hint>The business whose VAT return you are preparing.</mat-hint>
</mat-form-field>
```

`mat-hint` is visible by default; `matTooltip` alone is a **low** finding (hidden on touch).
Keep `formControlName` unchanged — it is bound to the DTO.

### Formly

```ts
{
  key: 'taxablePersonId',
  type: 'input',
  props: {
    label: 'Company that files VAT (assujetti)',
    description: 'The business whose VAT return you are preparing.',
    placeholder: 'e.g. LU12345678',
  },
}
```

Prefer a shared `plainLabels.ts` map keyed by control name so the same wording is reused
across forms and the audit can verify coverage in one file.

### Enum / status rendering

Never `{{ client.kycStatus }}`. Add a pipe:

```ts
@Pipe({ name: 'kycStatusLabel', standalone: true })
export class KycStatusLabelPipe implements PipeTransform {
  private readonly labels: Record<KycStatus, string> = {
    PENDING_UBO_CHECK: 'Waiting for ownership check',
    DOCS_MISSING: 'Missing identity documents',
    APPROVED: 'Approved',
  };
  transform(v: KycStatus) { return this.labels[v] ?? v; }
}
```

The crawler flags any interpolation whose expression ends in a property named `status`,
`state`, `type`, `kind`, `code`, `regime` with no pipe applied.

### Buttons

```html
<!-- before --> <button mat-flat-button (click)="submit()">Submit</button>
<!-- after  --> <button mat-flat-button (click)="submit()">Submit return to the tax office</button>
<p class="mat-caption">You won't be able to edit this period afterwards.</p>
```

### Table headers

```html
<th mat-header-cell *matHeaderCellDef>
  Real owner <mat-icon matTooltip="Person who ultimately owns 25 % or more">info</mat-icon>
</th>
```
and one sentence above the table explaining the column set, since tooltips are low-visibility.

### i18n JSON

Change values, keep keys:

```json
{ "vat.form.taxablePerson.label": "Company that files VAT (assujetti)",
  "vat.form.taxablePerson.hint":  "The business whose VAT return you are preparing." }
```

If a key like `vat.form.taxablePerson` is itself being rendered (missing translation),
that's a **high** finding — fix the code path, not the JSON.

### Declared exceptions

```html
<!-- @plain-language-exception official form box numbers, accountant cross-checks them -->
<th>Case 012</th>
```

## .NET side

The UI must not leak DTO property names. Two checks:
- Swagger/OpenAPI `description` on each DTO property — the front end can pull it as helper
  text (`[Description("...")]` or `/// <summary>` with `IncludeXmlComments`). This gives
  one source of truth for helper sentences.
- Validation errors returned as `ProblemDetails` must be human sentences, not
  `"TaxablePersonId is required"`. Map `MemberNames` to the front-end label map.

If the API returns enum names as strings, the front end **must** map them (pipe above).
Do not fix this by changing the API contract unless asked.
