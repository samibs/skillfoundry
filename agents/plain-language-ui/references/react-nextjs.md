# React / Next.js — where labels live and how to fix them

## Where the crawler looks

| Source | Pattern |
|---|---|
| Pages | `app/**/page.tsx`, `pages/**/*.tsx` (not `_app`, `_document`, `api/`) |
| Native | `<label>`, `<th>`, `<button>`, `placeholder=`, `title=`, `aria-label=`, `aria-describedby=` |
| shadcn/ui | `<FormLabel>`, `<FormDescription>`, `<Label>`, `<CardTitle>`, `<DialogTitle>`, `<TooltipContent>` |
| MUI | `label=`, `helperText=`, `<InputLabel>`, `<FormHelperText>` |
| Chakra / Mantine | `label=`, `description=`, `<FormHelperText>` |
| Tables (TanStack, MUI DataGrid) | `header:`, `headerName:`, `accessorKey` rendered as header |
| Schema-driven forms | zod `.describe("...")`, JSON schema `title`/`description`, react-hook-form field configs |
| i18n | `messages/*.json`, `locales/**/*.json`, `public/locales/**` (next-intl, i18next) |
| Enums rendered raw | `{item.status}` / `{row.original.kycStatus}` with no map or function call |

## Screen Brief convention

Top of `page.tsx` (or the route component):

```tsx
/**
 * SCREEN_BRIEF
 * SCREEN: app/onboarding/[clientId]/owners/page.tsx
 * WHO:    The client's own director filling in onboarding from an emailed link.
 * GOAL:   Tell us who ultimately owns or controls the company.
 * AFTER:  "Send ownership details" saves the people, marks the checklist step done,
 *         and notifies compliance. Editable until we approve.
 */
export default function OwnersPage() { ... }
```

## Idiomatic fixes

### shadcn + react-hook-form

```tsx
// before
<FormField name="uboPercentage" render={({ field }) => (
  <FormItem>
    <FormLabel>UBO %</FormLabel>
    <FormControl><Input {...field} /></FormControl>
  </FormItem>
)} />

// after
<FormField name="uboPercentage" render={({ field }) => (
  <FormItem>
    <FormLabel>Share of the company this person owns <span className="text-muted-foreground">(UBO %)</span></FormLabel>
    <FormControl><Input {...field} inputMode="decimal" /></FormControl>
    <FormDescription>Directly or through other companies. Anyone at 25 % or more must be listed.</FormDescription>
    <FormMessage />
  </FormItem>
)} />
```

`FormDescription` is visible by default; a `<Tooltip>` alone is a **low** finding.
Keep the `name` prop — it's the form/API field.

### One label map per feature

Put wording in one place so audits and translations are cheap:

```ts
// features/owners/labels.ts
export const ownerLabels = {
  uboPercentage: {
    label: 'Share of the company this person owns',
    term: 'UBO %',
    help: 'Directly or through other companies. Anyone at 25 % or more must be listed.',
  },
  isPep: {
    label: 'Holds or recently held a senior public role',
    term: 'PEP',
    help: 'Includes close family members of such a person.',
  },
} as const;
```

### zod schemas

`.describe()` becomes the helper text automatically if the form renderer reads it:

```ts
uboPercentage: z.number().min(0).max(100)
  .describe('Directly or through other companies. Anyone at 25 % or more must be listed.'),
```

### Enum / status rendering

```tsx
// before
<Badge>{client.kycStatus}</Badge>

// after
const kycStatusLabel: Record<KycStatus, string> = {
  PENDING_UBO_CHECK: 'Waiting for ownership check',
  DOCS_MISSING: 'Missing identity documents',
  APPROVED: 'Approved',
};
<Badge>{kycStatusLabel[client.kycStatus] ?? client.kycStatus}</Badge>
```

### Buttons

```tsx
// before
<Button type="submit">Submit</Button>

// after
<Button type="submit">Send ownership details</Button>
<p className="text-sm text-muted-foreground">You can still edit until we approve.</p>
```

### TanStack table headers

```tsx
{
  accessorKey: 'isPep',
  header: () => <span>Public role <InfoHint text="Senior public office, or close family of someone who holds one" /></span>,
}
```
plus a one-line explanation above the table — icon-only help is low-visibility.

### i18n JSON (next-intl / i18next)

Change values, keep keys. If a raw key such as `owners.form.uboPercentage.label` is
appearing in the UI, the namespace isn't loaded — **high** finding, fix the loader.

### Server components / metadata

Page `<title>` and `metadata.title` count as page titles: state the goal.
`export const metadata = { title: 'Who owns this company' }` not `'UBO Register'`.

### Declared exceptions

```tsx
{/* @plain-language-exception official form box numbers, accountant cross-checks them */}
<th>Case 012</th>
```
