# PRD: [Feature Name]

---
prd_id: feature-[name]
title: [Feature Name]
version: 1.0
status: DRAFT
created: [YYYY-MM-DD]
author: [Your Name]
tags: [feature, fullstack]
priority: medium
layers: [database, backend, frontend]
---

## 1. Overview

### Problem Statement
[What user need is unmet?]

### Proposed Solution
[Full-stack feature that provides...]

### Success Metrics
| Metric | Target |
|--------|--------|
| User adoption | [X]% within first month |
| Task completion rate | > 90% |
| Error rate | < 2% |

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | User | [action] | [benefit] | MUST |
| US-002 | Admin | [action] | [benefit] | SHOULD |

---

## 3. Three-Layer Specification

### Database
| Table | Key Fields | Constraints |
|-------|-----------|-------------|
| [table_name] | id, name, status | Unique on name |

### Backend API
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/[resource]` | GET | List |
| `/api/v1/[resource]` | POST | Create |

### Frontend
| Screen | Components | States |
|--------|------------|--------|
| [Screen Name] | [List, Form, Modal] | Loading, Empty, Error, Success |

---

## 4. Security

- Authentication: [JWT/Session]
- Authorization: [Roles that can access]
- Input validation: [Key fields to validate]

---

## 5. Out of Scope

- [ ] [Explicitly excluded feature]

---

*Template: Full-Stack Feature — The Forge — Claude AS Framework*
