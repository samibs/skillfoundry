# PRD: [Dashboard Name]

---
prd_id: dashboard-[name]
title: [Dashboard Name]
version: 1.0
status: DRAFT
created: [YYYY-MM-DD]
author: [Your Name]
tags: [dashboard, ui, analytics]
priority: medium
layers: [backend, frontend]
---

## 1. Overview

### Problem Statement
[What data needs to be visualized? What decisions does it support?]

### Proposed Solution
[Dashboard that provides real-time visibility into...]

### Success Metrics
| Metric | Target |
|--------|--------|
| Page load time | < 2s |
| Data freshness | < [X] minutes |
| Daily active users | [X] |

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | Manager | see KPIs at a glance | I can make informed decisions | MUST |
| US-002 | Developer | filter by date/team | I can drill down into specifics | SHOULD |
| US-003 | CISO | enable debug mode | I can see raw data | COULD |

---

## 3. Dashboard Layout

### KPI Cards (Top Row)
| KPI | Data Source | Update Frequency |
|-----|------------|------------------|
| [KPI 1] | [API/DB] | Real-time |
| [KPI 2] | [API/DB] | Hourly |

### Charts
| Chart | Type | Data |
|-------|------|------|
| [Chart 1] | Line/Bar/Heatmap | [What it shows] |
| [Chart 2] | Line/Bar/Heatmap | [What it shows] |

### Tables
| Table | Columns | Sortable | Filterable | Export |
|-------|---------|----------|------------|--------|
| [Table 1] | [columns] | Yes | Yes | CSV/PDF |

---

## 4. Filters

| Filter | Type | Default | Options |
|--------|------|---------|---------|
| Date range | Date picker | Last 7 days | Custom range |
| Team/User | Dropdown | All | [List] |
| Environment | Toggle | Production | Dev/Staging/Prod |

---

## 5. Requirements

- Dark mode ready by default
- Responsive (desktop + tablet)
- Accessible (WCAG 2.1 AA)
- Export: PDF + CSV per table/chart

---

## 6. Out of Scope

- [ ] [Explicitly excluded feature]

---

*Template: Dashboard — The Forge — SkillFoundry Framework*
