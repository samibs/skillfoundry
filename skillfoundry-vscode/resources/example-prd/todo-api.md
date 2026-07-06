# PRD: Todo REST API

**Date:** 2026-03-13
**Author:** SkillFoundry Examples
**Status:** READY

---

## Problem Statement

Developers need a simple, well-structured REST API example to understand how SkillFoundry transforms a PRD into production-ready code. This Todo API serves as both a learning tool and a template for building real APIs.

## Goals

1. Provide a complete CRUD REST API for managing todo items
2. Demonstrate proper API design patterns (validation, error handling, status codes)
3. Include database persistence with migrations
4. Ship with comprehensive tests (unit + integration)
5. Follow production-ready conventions (health checks, environment configuration)

## Non-Goals

- Authentication/authorization (keep the example focused)
- Frontend UI (API only)
- Deployment configuration (Docker, CI/CD)

---

## User Stories

### US-1: Create a Todo

**As** an API consumer,
**I want** to create a new todo item via POST,
**So that** I can track tasks.

**Acceptance Criteria:**
```gherkin
Given a valid POST request to /api/todos with { "title": "Buy groceries", "description": "Milk, eggs, bread" }
When the server processes the request
Then it returns 201 Created with the new todo including an auto-generated id, created_at, and completed: false
And the todo is persisted in the database

Given a POST request to /api/todos with an empty title
When the server processes the request
Then it returns 400 Bad Request with a validation error message
```

### US-2: List All Todos

**As** an API consumer,
**I want** to retrieve all todos via GET,
**So that** I can see what tasks exist.

**Acceptance Criteria:**
```gherkin
Given todos exist in the database
When I send GET /api/todos
Then it returns 200 OK with an array of all todo items ordered by created_at descending

Given no todos exist
When I send GET /api/todos
Then it returns 200 OK with an empty array
```

### US-3: Get a Single Todo

**As** an API consumer,
**I want** to retrieve a specific todo by ID,
**So that** I can see its details.

**Acceptance Criteria:**
```gherkin
Given a todo with id 1 exists
When I send GET /api/todos/1
Then it returns 200 OK with the todo object

Given no todo with id 999 exists
When I send GET /api/todos/999
Then it returns 404 Not Found with an error message
```

### US-4: Update a Todo

**As** an API consumer,
**I want** to update a todo's title, description, or completion status,
**So that** I can track progress.

**Acceptance Criteria:**
```gherkin
Given a todo with id 1 exists
When I send PUT /api/todos/1 with { "completed": true }
Then it returns 200 OK with the updated todo including updated_at timestamp

Given no todo with id 999 exists
When I send PUT /api/todos/999 with { "completed": true }
Then it returns 404 Not Found
```

### US-5: Delete a Todo

**As** an API consumer,
**I want** to delete a todo by ID,
**So that** I can remove completed or irrelevant tasks.

**Acceptance Criteria:**
```gherkin
Given a todo with id 1 exists
When I send DELETE /api/todos/1
Then it returns 204 No Content and the todo is removed from the database

Given no todo with id 999 exists
When I send DELETE /api/todos/999
Then it returns 404 Not Found
```

### US-6: Health Check

**As** a DevOps engineer,
**I want** a /health endpoint,
**So that** I can monitor the service status.

**Acceptance Criteria:**
```gherkin
When I send GET /health
Then it returns 200 OK with { "status": "ok", "timestamp": "<ISO date>" }
```

---

## Technical Requirements

### Stack
- **Runtime:** Node.js 20+
- **Framework:** Express.js with TypeScript
- **Database:** SQLite (via better-sqlite3)
- **Testing:** Vitest + supertest
- **Validation:** Zod schemas

### Data Model

```
Todo {
  id:          INTEGER PRIMARY KEY AUTOINCREMENT
  title:       TEXT NOT NULL (max 200 chars)
  description: TEXT (max 2000 chars, nullable)
  completed:   BOOLEAN DEFAULT false
  created_at:  DATETIME DEFAULT CURRENT_TIMESTAMP
  updated_at:  DATETIME DEFAULT CURRENT_TIMESTAMP
}
```

### API Endpoints

| Method | Path | Description | Status Codes |
|--------|------|-------------|--------------|
| GET | /api/todos | List all todos | 200 |
| GET | /api/todos/:id | Get single todo | 200, 404 |
| POST | /api/todos | Create todo | 201, 400 |
| PUT | /api/todos/:id | Update todo | 200, 400, 404 |
| DELETE | /api/todos/:id | Delete todo | 204, 404 |
| GET | /health | Health check | 200 |

### Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Title is required",
    "details": []
  }
}
```

---

## Security Requirements

- Input validation on all endpoints (Zod schemas)
- SQL injection prevention (parameterized queries via better-sqlite3)
- Request body size limit (100KB)
- No sensitive data in error responses
- Environment-based configuration (.env file)

---

## Out of Scope

- Authentication / authorization
- Rate limiting
- Pagination (acceptable for a demo with small dataset)
- WebSocket / real-time updates
- Docker / deployment configuration
- Frontend UI

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SQLite not suitable for production scale | Low (this is an example) | Low | Document as demo-only; suggest PostgreSQL for production |
| Missing edge cases in validation | Medium | Low | Comprehensive test coverage including boundary values |
