---
story_id: STORY-009
title: Enhanced Health Endpoint
phase: 3
priority: SHOULD
complexity: small
depends_on: [STORY-008]
blocks: []
layers: [backend]
---

# STORY-009: Enhanced Health Endpoint

## Objective

Upgrade the /health endpoint to report bootstrap stage, session metrics, and permission state.

## Technical Approach

Modify `src/api/routes.ts` to return:

```json
{
  "status": "healthy",
  "version": "3.1.0",
  "bootstrap": {
    "stage": "ready",
    "completed": 7,
    "total": 7,
    "durationMs": 1850,
    "errors": []
  },
  "sessions": {
    "activeSessions": 3,
    "totalTokensConsumed": 45000,
    "totalTurns": 120
  },
  "permissions": {
    "simpleMode": false,
    "trusted": true,
    "deniedToolCount": 2,
    "availableToolCount": 18
  },
  "tools": {
    "registered": 20,
    "fromRegistry": 3,
    "fromLegacy": 17,
    "dynamic": 2
  }
}
```

Also add `/ready` endpoint that returns 200 only after bootstrap stage 7 completes (503 during bootstrap).

## Acceptance Criteria

```gherkin
Given the server is fully bootstrapped
When GET /health is called
Then it returns 200 with bootstrap.stage="ready" and all metrics

Given the server is mid-bootstrap (stage 4)
When GET /health is called
Then it returns 200 with bootstrap.stage="skill-load" and completed=3

Given the server is mid-bootstrap
When GET /ready is called
Then it returns 503 with {status: "not_ready", stage: "skill-load"}

Given the server is fully ready
When GET /ready is called
Then it returns 200 with {status: "ready"}
```

## Files to Modify

| Action | File | Purpose |
|--------|------|---------|
| MODIFY | `src/api/routes.ts` | Enhanced /health and new /ready endpoint |
