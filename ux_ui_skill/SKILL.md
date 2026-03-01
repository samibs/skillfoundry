---
name: ux-ui-doctor
description: Systematically audit and fix UX/UI issues across an entire application codebase. Use this skill whenever the user asks to improve, fix, audit, polish, or remediate the design, styling, UX, or UI of an existing app — regardless of framework (React, Angular, Vue, Svelte, plain HTML, mobile). Triggers include requests like "improve the UI", "fix the design", "make it look professional", "audit UX", "polish the app", "fix alignment issues", "improve consistency", "the app looks ugly/broken/unfinished", "redesign", or any mention of visual inconsistencies, spacing problems, color issues, or layout problems. Also triggers when the user shares screenshots showing UI problems. This skill performs a full-app systematic audit, generates a prioritized remediation plan, and executes fixes file by file. Always use this skill even for partial UI requests ("fix just this page") because local fixes require understanding the global design system.
---

# UX/UI Doctor — Systematic App-Wide Audit & Remediation

## Overview

This skill transforms visually inconsistent, unpolished applications into professional, cohesive products through a **systematic, file-by-file audit and remediation process**. It works with any frontend technology.

## Philosophy

> Fix the system, not the symptom. Every local fix must reinforce a global design language.

Most apps don't look bad because of one broken page — they look bad because of **accumulated micro-inconsistencies**: a different padding here, a mismatched color there, an empty state nobody designed, a table that doesn't breathe. This skill attacks the root causes.

---

## Phase 1: Discovery & Audit

### Step 1.1 — Identify the Tech Stack

Before anything, determine what you're working with:

```bash
# Check for framework indicators
ls -la package.json angular.json vue.config.js svelte.config.js next.config.* nuxt.config.* vite.config.* tailwind.config.* tsconfig.json
cat package.json | head -50  # Check dependencies
```

Identify:
- **Framework**: React, Angular, Vue, Svelte, plain HTML, etc.
- **Styling approach**: CSS modules, Tailwind, SCSS, styled-components, CSS-in-JS, theme files
- **Component library**: Material UI, Ant Design, PrimeNG, Vuetify, shadcn, custom, none
- **Design token system**: CSS variables, SCSS variables, theme objects, none

### Step 1.2 — Map the Application Structure

```bash
# Get the full component/page tree
find src -name "*.tsx" -o -name "*.jsx" -o -name "*.vue" -o -name "*.svelte" -o -name "*.html" -o -name "*.component.ts" | head -100
# Find all style files
find src -name "*.css" -o -name "*.scss" -o -name "*.less" -o -name "*.styled.*" -o -name "*.styles.*" | head -100
# Find theme/design token files
find src -name "*theme*" -o -name "*token*" -o -name "*variable*" -o -name "*palette*" -o -name "*color*" 2>/dev/null | grep -v node_modules | head -30
```

### Step 1.3 — Run the 12-Point Visual Audit

For EVERY page/view in the app, check these 12 categories. Create a findings document.

**Score each item 0-3**: 0 = Critical, 1 = Poor, 2 = Acceptable, 3 = Good

#### LAYOUT & SPACING
1. **Spacing Consistency** — Are margins, paddings, and gaps using a consistent scale (e.g., 4px/8px/16px/24px/32px/48px)? Or are there random values like 13px, 17px, 22px?
2. **Content Density Balance** — Are some pages packed while others are barren? Do pages have appropriate content-to-whitespace ratios? Are empty states designed or just blank?
3. **Alignment Grid** — Do elements snap to a coherent grid? Are there subtle misalignments between sections, columns, or components on the same page?

#### COLOR & VISUAL HIERARCHY
4. **Color System Coherence** — Is there a defined palette used consistently? Are status colors (success/warning/error/info) uniform across all pages? Are there one-off color values?
5. **Visual Hierarchy** — Can you instantly tell what's most important on each page? Are headings, subheadings, body text, and labels clearly differentiated?
6. **Contrast & Accessibility** — Do text/background combinations meet WCAG AA (4.5:1 for body text, 3:1 for large text)? Are interactive elements distinguishable?

#### TYPOGRAPHY
7. **Type Scale** — Is there a consistent type scale? Or are font sizes random? Are font weights used purposefully (not just bold everywhere)?
8. **Language & Labeling Consistency** — Is the UI language consistent (no mixing EN/FR/DE unless intentional i18n)? Are labels, placeholders, and button texts consistent in casing and tone?

#### COMPONENTS & PATTERNS
9. **Component Consistency** — Do similar elements look the same everywhere? (e.g., all tables styled identically, all cards same border radius, all buttons same height)
10. **Interactive States** — Do buttons, links, inputs have visible hover, focus, active, and disabled states? Are loading states present?
11. **Empty & Error States** — Are empty states designed with icons, messages, and CTAs? Or just "No data" text? Are error states informative?

#### RESPONSIVE & POLISH
12. **Responsive Behavior** — Does the layout adapt to different screen sizes? Are tables horizontally scrollable on mobile? Does the sidebar collapse?

### Step 1.4 — Generate the Audit Report

Create a structured findings document:

```markdown
# UX/UI Audit Report — [App Name]

## Overall Score: XX/36

## Critical Issues (Score 0)
- [Issue]: [Where] — [Impact]

## Major Issues (Score 1)
- [Issue]: [Where] — [Impact]

## Minor Issues (Score 2)
- [Issue]: [Where] — [Impact]

## What's Working (Score 3)
- [Positive finding]
```

---

## Phase 2: Design System Foundation

Before fixing individual pages, establish (or fix) the design foundation. **This is the most important phase** — skip it and you'll just create new inconsistencies.

### Step 2.1 — Define or Extract Design Tokens

Create/update a central token file. Adapt format to the tech stack:

**For CSS/SCSS apps** → CSS custom properties in `:root`
**For Tailwind apps** → `tailwind.config.js` theme extensions
**For component library apps** → Theme override object
**For Angular Material** → Custom theme SCSS
**For React styled-components** → Theme provider object

The tokens MUST include:

```
SPACING SCALE:       4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96
FONT SIZE SCALE:     12, 13, 14, 16, 18, 20, 24, 30, 36, 48
FONT WEIGHTS:        400 (normal), 500 (medium), 600 (semibold), 700 (bold)
BORDER RADIUS:       2, 4, 6, 8, 12, 16 (pick 2-3 to use app-wide)
COLORS — Semantic:   primary, secondary, accent, background, surface, text-primary, text-secondary, text-muted
COLORS — Status:     success, warning, error, info (+ light variants for backgrounds)
COLORS — Neutral:    gray-50 through gray-900 (or equivalent scale)
SHADOWS:             sm, md, lg (consistent elevation system)
TRANSITIONS:         fast (150ms), normal (250ms), slow (350ms)
```

### Step 2.2 — Establish Component Standards

Document the "canonical" version of each reusable component:

| Component | Height | Padding | Border Radius | Font Size | States |
|-----------|--------|---------|---------------|-----------|--------|
| Button (sm) | 32px | 8px 12px | token | 13px | hover, active, disabled, loading |
| Button (md) | 40px | 10px 16px | token | 14px | hover, active, disabled, loading |
| Button (lg) | 48px | 12px 24px | token | 16px | hover, active, disabled, loading |
| Input | 40px | 10px 12px | token | 14px | focus, error, disabled |
| Card | auto | 20px-24px | token | — | hover (if clickable) |
| Table header | 44px | 12px 16px | 0 | 13px semi | sortable indicator |
| Table row | 48-52px | 12px 16px | 0 | 14px | hover, selected, striped |
| Badge/Tag | 24px | 4px 8px | 12px | 12px | color variants |
| Modal | auto | 24px | token | — | overlay dimming |

### Step 2.3 — Define Layout Rules

```
PAGE STRUCTURE:
- Page header: consistent height, title + subtitle + breadcrumbs + actions
- Content area: consistent max-width or full-width with consistent padding
- Sidebar: fixed or collapsible, consistent width

SECTION SPACING:
- Between page header and content: 24-32px
- Between content sections: 24-32px
- Inside cards/containers: 16-24px

TABLE RULES:
- Header: slightly darker background, uppercase or semibold text, smaller font
- Rows: consistent height, hover state, alternating backgrounds (optional)
- Actions column: right-aligned, consistent icon sizes
- Empty state: centered, icon + message + CTA

EMPTY STATE PATTERN:
- Centered vertically in the available space (or near top-third)
- Icon (48-64px, muted color)
- Title (16-18px, semibold)
- Description (14px, muted)
- CTA button (if applicable)
```

---

## Phase 3: Systematic Remediation

### Execution Order (IMPORTANT)

Fix in this exact order to avoid rework:

1. **Design tokens / theme file** — Foundation everything else depends on
2. **Global styles / base CSS** — Reset, typography, body defaults
3. **Layout shell** — Sidebar, header, page wrapper, content container
4. **Shared components** — Buttons, inputs, cards, tables, badges, modals
5. **Page by page** — Apply the fixed components and tokens to each view
6. **Empty states** — Add designed empty states to every list/table/view
7. **Interactive states** — Hover, focus, loading, disabled across the app
8. **Responsive fixes** — Mobile/tablet breakpoints
9. **Final polish** — Micro-animations, transitions, shadows, subtle refinements

### Per-File Remediation Process

For each file you modify:

1. **Read the current file** completely
2. **Identify all violations** against the audit checklist and design tokens
3. **Plan the changes** — list what you'll fix (don't start editing blindly)
4. **Make the edits** — apply changes methodically
5. **Verify** — re-read the file to confirm consistency

### Common Fix Patterns

#### Fix: Random spacing → Token-based spacing
```
BEFORE: padding: 13px 17px; margin-bottom: 22px;
AFTER:  padding: 12px 16px; margin-bottom: 24px;  /* snap to scale */
```

#### Fix: Inconsistent colors → Semantic tokens
```
BEFORE: color: #2c3e50; background: #e8f5e9;
AFTER:  color: var(--text-primary); background: var(--color-success-light);
```

#### Fix: Barren empty state → Designed empty state
```
BEFORE: <p>No data available</p>
AFTER:  <EmptyState icon="inbox" title="No companies yet" description="Add your first company to get started" action="Add Company" />
```

#### Fix: Inconsistent table styling → Standard table component
```
Apply: consistent header height, row height, cell padding, hover state,
       sorted column indicator, action column alignment
```

#### Fix: Mixed language → Consistent i18n
```
Audit all user-facing strings. Either:
- Move ALL strings to i18n files and use translation keys
- Or at minimum, ensure every page uses the same language consistently
```

#### Fix: Missing interactive states
```
ADD to every interactive element:
- Buttons: hover (darken 10%), active (darken 15%), disabled (opacity 0.5, no pointer)
- Links: hover (underline or color shift), visited (optional)
- Inputs: focus (ring/border highlight), error (red border + message)
- Table rows: hover (subtle background)
- Cards (clickable): hover (lift shadow or border change)
```

#### Fix: Status badge inconsistency
```
DEFINE once, use everywhere:
- Draft/Pending: amber/yellow background, dark amber text
- Active/Success: green background, dark green text  
- Error/Failed: red background, dark red text
- Info/Default: blue background, dark blue text
- Neutral: gray background, dark gray text
```

---

## Phase 4: Quality Assurance

### Visual Regression Checklist

After all fixes, walk through EVERY page and verify:

- [ ] All spacing snaps to the token scale
- [ ] All colors come from the token system (no hardcoded hex in components)
- [ ] All pages have consistent page headers (title, breadcrumb, actions)
- [ ] All tables look identical in structure and styling
- [ ] All buttons are the same height/padding at each size
- [ ] All empty states are designed (icon + title + description + CTA)
- [ ] All status badges use the same color scheme
- [ ] Language is consistent (no EN/FR mixing unless i18n is properly set up)
- [ ] Every interactive element has hover and focus states
- [ ] Cards have consistent border-radius, shadow, and padding
- [ ] Typography hierarchy is clear on every page
- [ ] Content density is balanced (no page feels barren or overwhelming)

### Before Declaring Done

1. Check the app at 1920px, 1440px, 1280px, 1024px, 768px widths
2. Verify dark mode (if applicable) uses proper token mappings
3. Test with keyboard navigation (focus states visible)
4. Spot-check WCAG contrast ratios on critical text

---

## Anti-Patterns to Watch For

These are the most common UX/UI anti-patterns in enterprise/SaaS apps:

| Anti-Pattern | Why It Happens | Fix |
|---|---|---|
| **Ghost town pages** | Feature built, no data populated | Design proper empty states |
| **Frankenstein styling** | Multiple devs, no design system | Establish tokens, enforce globally |
| **Label salad** | Mixed languages in UI | i18n audit, single source of truth |
| **Table wilderness** | Tables with no hover, no stripes, cramped cells | Standardize table component |
| **Button roulette** | Different sizes/colors/shapes on each page | Component standards doc |
| **Padding chaos** | Random spacing values everywhere | Spacing scale enforcement |
| **Status color anarchy** | Green means "draft" on one page, "success" on another | Semantic color mapping |
| **Orphan pages** | Pages with placeholder text ("Subtitle") left in production | Content audit pass |
| **Missing states** | No loading, no error, no empty states | Add all states to every data view |
| **Visual hierarchy collapse** | Everything same size/weight, nothing stands out | Type scale + intentional sizing |

---

## Notes for Claude

- **Always start with Phase 1** (audit) even if the user says "just fix the colors." You need the full picture.
- **Create the design tokens first** (Phase 2) before touching any individual component or page.
- **Work file by file systematically** — don't jump between pages randomly.
- **Show the user the audit report** so they can prioritize. Not all fixes are equal.
- **Preserve existing functionality** — this is a visual remediation, not a refactor. Don't change component APIs, routing, state management, or business logic.
- **When in doubt, choose the simpler/cleaner option.** Enterprise apps need clarity, not flair.
- **Track every change** — the user should be able to see exactly what was modified and why.
- **If the codebase is large (50+ components)**, present the audit and ask the user which sections to prioritize rather than trying to fix everything in one pass.
