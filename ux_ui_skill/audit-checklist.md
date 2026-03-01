# UX/UI Audit Checklist — Quick Reference

Use this checklist when walking through each page of the application.
Score each item 0–3 (0 = Critical, 1 = Poor, 2 = Acceptable, 3 = Good).

---

## Per-Page Checklist

### Page: _______________

#### Layout & Spacing
| # | Check | Score | Notes |
|---|-------|-------|-------|
| 1 | Spacing uses consistent scale (4/8/12/16/24/32/48px) | | |
| 2 | Content density balanced (not barren, not cramped) | | |
| 3 | Elements align to a coherent grid | | |
| 4 | Page header present with title + breadcrumb + actions | | |
| 5 | Consistent padding inside containers/cards | | |

#### Color & Hierarchy
| # | Check | Score | Notes |
|---|-------|-------|-------|
| 6 | All colors from defined palette (no random hex values) | | |
| 7 | Status colors consistent (success=green, error=red, etc.) | | |
| 8 | Clear visual hierarchy (can identify #1 priority in 2 sec) | | |
| 9 | Sufficient contrast for all text (WCAG AA) | | |
| 10 | Background colors purposeful (not random light tints) | | |

#### Typography
| # | Check | Score | Notes |
|---|-------|-------|-------|
| 11 | Font sizes from defined scale | | |
| 12 | Font weights used purposefully (not bold everywhere) | | |
| 13 | Language consistent (no mixed EN/FR/DE) | | |
| 14 | Labels consistent in casing (Title Case vs sentence case) | | |
| 15 | No placeholder/lorem ipsum text in production | | |

#### Components
| # | Check | Score | Notes |
|---|-------|-------|-------|
| 16 | Buttons: consistent size/color/radius across page | | |
| 17 | Tables: header style, row height, hover, alignment | | |
| 18 | Cards: consistent padding, radius, shadow | | |
| 19 | Badges/Tags: consistent size and color mapping | | |
| 20 | Forms: consistent input height, label position, spacing | | |

#### States
| # | Check | Score | Notes |
|---|-------|-------|-------|
| 21 | Empty state designed (icon + title + description + CTA) | | |
| 22 | Loading state present for async data | | |
| 23 | Error state designed and informative | | |
| 24 | Hover states on all interactive elements | | |
| 25 | Focus states visible for keyboard navigation | | |

#### Page Score: ___/75

---

## Cross-Page Consistency Checks

| # | Check | Pass? | Notes |
|---|-------|-------|-------|
| 1 | Same component looks identical on every page | | |
| 2 | Same action (e.g., "Add New") uses same button style everywhere | | |
| 3 | Page header pattern identical across all pages | | |
| 4 | Sidebar active state consistent | | |
| 5 | Status badges use same colors everywhere | | |
| 6 | Tables use same header/row styling everywhere | | |
| 7 | Empty states follow same pattern everywhere | | |
| 8 | Breadcrumbs present and consistent | | |
| 9 | Action buttons positioned consistently (top-right, etc.) | | |
| 10 | Loading indicators identical everywhere | | |

---

## Priority Matrix

After scoring, categorize findings:

### P0 — Fix Immediately (blocks professional use)
- Placeholder text in production ("Subtitle", "Lorem ipsum")
- Broken layouts / overlapping elements
- Unreadable text (contrast failures)
- Mixed languages with no i18n system

### P1 — Fix Soon (users notice, looks unfinished)
- Inconsistent spacing (random padding/margins)
- Missing empty states (blank pages)
- Inconsistent component styling across pages
- Missing hover/focus states
- Status color inconsistencies

### P2 — Fix Next (polish & refinement)
- Typography scale cleanup
- Shadow/elevation consistency
- Micro-animation additions
- Responsive edge cases
- Dark mode improvements

### P3 — Nice to Have (delight layer)
- Page transition animations
- Skeleton loading states
- Scroll-based animations
- Custom illustrations for empty states
- Onboarding hints/tooltips
