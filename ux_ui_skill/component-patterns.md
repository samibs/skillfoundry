# Component Patterns — Empty States, Tables, Status Badges

Reusable patterns for the most commonly broken components in enterprise apps.

---

## Empty States

Every list, table, or data view MUST have a designed empty state. Here's the pattern:

### Structure
```
┌─────────────────────────────────┐
│                                 │
│           [Icon 48px]           │
│                                 │
│     Title (16-18px, semibold)   │
│                                 │
│   Description (14px, muted,     │
│   max-width 400px, centered)    │
│                                 │
│      [ Primary CTA Button ]     │
│                                 │
└─────────────────────────────────┘
```

### Examples by Context

| Context | Icon | Title | Description | CTA |
|---------|------|-------|-------------|-----|
| No companies | building | No companies yet | Add your first company to start managing payroll | + Add Company |
| No employees | users | No employees found | Add employees to this company or import from a file | + Add Employee |
| No simulations | play-circle | No payroll simulations | Create a simulation to preview and validate payroll before committing | + New Simulation |
| No payslips | file-text | No payslips generated | Run a payroll first, then generate payslips here | Go to Payroll |
| Empty search | search | No results found | Try adjusting your search terms or filters | Clear Filters |
| No reports | bar-chart-2 | No reports generated | Select a report type and company to generate your first report | — |
| No data (charts) | trending-up | Not enough data | Payroll data will appear here after your first payroll run | Run Payroll |
| Error loading | alert-circle | Something went wrong | We couldn't load this data. Please try again. | Retry |

### CSS Pattern (Framework-Agnostic)

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  text-align: center;
  min-height: 300px;
}

.empty-state__icon {
  width: 48px;
  height: 48px;
  color: var(--text-muted);
  margin-bottom: 16px;
  opacity: 0.6;
}

.empty-state__title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.empty-state__description {
  font-size: 0.875rem;
  color: var(--text-secondary);
  max-width: 400px;
  line-height: 1.5;
  margin-bottom: 24px;
}

.empty-state__action {
  /* Use standard primary button styles */
}
```

---

## Status Badges

### Color Mapping (use EVERYWHERE)

| Status | Background | Text | Border (optional) | Use For |
|--------|-----------|------|--------------------|---------|
| **Draft** | `--color-gray-100` | `--color-gray-700` | `--color-gray-300` | Unpublished, not started |
| **Pending** | `--color-warning-light` | `--color-warning-dark` | — | Awaiting action, in review |
| **Active / Running** | `--color-info-light` | `--color-info-dark` | — | In progress, processing |
| **Success / Completed** | `--color-success-light` | `--color-success-dark` | — | Done, approved, valid |
| **Error / Failed** | `--color-error-light` | `--color-error-dark` | — | Failed, rejected, invalid |
| **Cancelled / Archived** | `--color-gray-100` | `--color-gray-500` | — | Inactive, removed |

### Badge CSS

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 9999px;  /* pill shape */
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

/* Optional: dot indicator */
.badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.badge--draft { background: var(--color-gray-100); color: var(--color-gray-700); }
.badge--pending { background: var(--color-warning-light); color: var(--color-warning-dark); }
.badge--active { background: var(--color-info-light); color: var(--color-info-dark); }
.badge--success { background: var(--color-success-light); color: var(--color-success-dark); }
.badge--error { background: var(--color-error-light); color: var(--color-error-dark); }
```

---

## Table Standards

### Structure

```
┌──────────────────────────────────────────────────────────┐
│  Column A ▾    Column B        Column C       Actions    │  ← Header: 44px, bg-gray-50
├──────────────────────────────────────────────────────────┤
│  Cell data     Cell data       Cell data      ⋮ ✎ 🗑      │  ← Row: 52px, hover:bg-gray-50
├──────────────────────────────────────────────────────────┤
│  Cell data     Cell data       Cell data      ⋮ ✎ 🗑      │
├──────────────────────────────────────────────────────────┤
│  Cell data     Cell data       Cell data      ⋮ ✎ 🗑      │
└──────────────────────────────────────────────────────────┘
  Showing 1-10 of 50                    ◀ 1 2 3 4 5 ▶       ← Footer: pagination
```

### Rules

1. **Header**: `bg-gray-50`, `font-size: 13px`, `font-weight: 600`, `text-transform: uppercase` or just semibold, `color: text-secondary`, `letter-spacing: 0.025em` (if uppercase)
2. **Rows**: `height: 52px`, `padding: 12px 16px` per cell, `border-bottom: 1px solid border-default`
3. **Hover**: `background: gray-50` (subtle highlight)
4. **Alternating rows**: Optional — use `bg-gray-50/25` for even rows
5. **Actions column**: Right-aligned, icon buttons only (no text), `gap: 8px` between icons
6. **Numeric columns**: Right-aligned with tabular-nums font feature
7. **Status columns**: Use badge component
8. **Link columns**: Use `text-link` color, no underline (underline on hover)
9. **Pagination**: Right-aligned, consistent button sizes, current page highlighted

### Table CSS

```css
.table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.table thead th {
  height: 44px;
  padding: 0 16px;
  background: var(--color-gray-50);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-align: left;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
}

.table tbody tr {
  height: 52px;
  transition: background var(--transition-fast);
}

.table tbody tr:hover {
  background: var(--color-gray-50);
}

.table tbody td {
  padding: 0 16px;
  font-size: 0.875rem;
  color: var(--text-primary);
  border-bottom: 1px solid var(--color-gray-100);
}

.table tbody tr:last-child td {
  border-bottom: none;
}

/* Numeric columns */
.table td[data-type="number"],
.table th[data-type="number"] {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* Actions column */
.table td.actions {
  text-align: right;
  white-space: nowrap;
}

.table td.actions button {
  padding: 6px;
  border: none;
  background: none;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.table td.actions button:hover {
  color: var(--text-primary);
  background: var(--color-gray-100);
}
```

---

## Page Header Standard

Every page should have a consistent header:

```
┌──────────────────────────────────────────────────────────┐
│  Dashboard / Companies / Employees                        │  ← Breadcrumb: 13px, muted
│                                                           │
│  Employee Management                  [ + Add Employee ]  │  ← Title: 24-28px, bold
│  25 employees across 5 companies                          │  ← Subtitle: 14px, secondary
└──────────────────────────────────────────────────────────┘
   ↕ 24px gap to content below
```

### Rules

1. **Breadcrumb**: Always present, `font-size: 13px`, `color: text-muted`, separator: `/` or `>`
2. **Title**: `font-size: 24-28px`, `font-weight: 700`, `color: text-primary`
3. **Subtitle**: `font-size: 14px`, `color: text-secondary`, contextual info (counts, dates)
4. **Actions**: Right-aligned with title, primary CTA as filled button, secondary actions as outline
5. **Spacing**: `margin-bottom: 24-32px` before content
6. **Consistency**: EVERY page must use this exact same structure

---

## Card Standards

### Structure

```css
.card {
  background: var(--bg-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--card-padding);  /* 20-24px */
  box-shadow: var(--shadow-xs);
}

.card--clickable {
  cursor: pointer;
  transition: all var(--transition-normal);
}

.card--clickable:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.card__title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.card__subtitle {
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.card__value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
```

### KPI/Stat Cards (Dashboard)

All stat cards in a row MUST:
- Be the same height (use min-height or flexbox stretch)
- Have the same padding
- Have the same border-radius
- Use consistent label position (top or bottom)
- Use tabular-nums for numbers so digits align
