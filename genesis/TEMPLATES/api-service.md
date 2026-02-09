# PRD: [API Service Name]

---
prd_id: api-[service-name]
title: [API Service Name]
version: 1.0
status: DRAFT
created: [YYYY-MM-DD]
author: [Your Name]
tags: [api, backend, service]
priority: medium
layers: [database, backend]
---

## 1. Overview

### Problem Statement
[What data/functionality needs to be exposed via API?]

### Proposed Solution
[RESTful API service that provides...]

### Success Metrics
| Metric | Target |
|--------|--------|
| Response time (p95) | < 200ms |
| Uptime | 99.9% |
| Test coverage | > 80% |

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | API consumer | [action] | [benefit] | MUST |
| US-002 | Admin | [action] | [benefit] | SHOULD |

---

## 3. API Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/v1/[resource]` | GET | List resources | JWT |
| `/api/v1/[resource]` | POST | Create resource | JWT |
| `/api/v1/[resource]/:id` | GET | Get single resource | JWT |
| `/api/v1/[resource]/:id` | PUT | Update resource | JWT |
| `/api/v1/[resource]/:id` | DELETE | Delete resource | JWT + Admin |

---

## 4. Data Model

**Entity: [ResourceName]**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| created_at | timestamp | NOT NULL | Creation time |
| updated_at | timestamp | NOT NULL | Last update time |

---

## 5. Security

- Authentication: JWT (RS256)
- Authorization: RBAC (Admin, User)
- Input validation: All endpoints
- Rate limiting: 100 req/min per user

---

## 6. Out of Scope

- [ ] [Explicitly excluded feature]

---

*Template: API Service — The Forge — Claude AS Framework*
