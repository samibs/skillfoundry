# The Anvil — Tier 5: Contract-First Enforcement

**Version**: 1.0
**Status**: ACTIVE
**Applies To**: Gate-Keeper Validation Phase (API stories)
**Protocol**: See `agents/_anvil-protocol.md` for overview

---

## Purpose

Validate that API implementation matches the contract declared in the story. This catches API drift — when endpoints, methods, request/response schemas, or status codes don't match what was specified.

**Applies only to stories that include an API Contract section.** Stories without API contracts skip this tier.

---

## When to Run

- During Gate-Keeper validation
- After Coder + Tester complete
- Only when the story contains an "API Contract" section

---

## Story Metadata: API Contract

Stories with API work should declare their contract:

```markdown
### API Contract

| Endpoint | Method | Request Body | Response | Status |
|----------|--------|-------------|----------|--------|
| /api/users | GET | - | User[] | 200 |
| /api/users | POST | {name: string, email: string} | User | 201 |
| /api/users/:id | GET | - | User | 200 |
| /api/users/:id | PUT | {name?: string, email?: string} | User | 200 |
| /api/users/:id | DELETE | - | - | 204 |

#### Request Models
- **User**: {id: int, name: string, email: string, created_at: datetime}

#### Error Responses
- 400: Validation error (missing required fields)
- 401: Unauthorized
- 404: User not found
- 409: Email already exists
```

---

## Validation Process

### Step 1: Parse Contract

Extract from the story:
- Endpoint paths
- HTTP methods
- Request body fields
- Response model fields
- Expected status codes

### Step 2: Locate Implementation

Find the route/controller files in the codebase:
- Python (FastAPI): `@app.get()`, `@router.post()`, etc.
- Node (Express): `router.get()`, `app.post()`, etc.
- C# (.NET): `[HttpGet]`, `[HttpPost]`, etc.

### Step 3: Validate

| Check | How | Severity |
|-------|-----|----------|
| Endpoint exists | Route declaration found in code | BLOCK if missing |
| HTTP method matches | Decorator/method matches contract | BLOCK if wrong |
| Request body fields | Model/schema includes declared fields | BLOCK if missing |
| Response model fields | Return type includes declared fields | WARN if missing |
| Status codes | Return statements use correct codes | WARN if different |
| Error responses | Error handlers exist for declared codes | WARN if missing |

---

## Output Format

```markdown
ANVIL CHECK: T5 Contract Enforcement — [story ID]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Contract: [N] endpoints declared

Validation:
  [PASS] GET /api/users — route found at src/routes/users.py:12
  [PASS] POST /api/users — route found, request model matches
  [BLOCK] PUT /api/users/:id — route NOT found
  [WARN] DELETE /api/users/:id — returns 200 instead of 204

Status: PASS / WARN / FAIL
Action: CONTINUE / FIX_REQUIRED / BLOCK
```

---

## Implementation Notes

This is an **LLM-powered check** (not shell). The Gate-Keeper:

1. Reads the API Contract from the story
2. Reads the route/controller files
3. Validates that each declared endpoint exists in the code
4. Checks method signatures, parameter names, and return types
5. Reports mismatches

The Gate-Keeper already reads source files during three-layer validation. Contract enforcement is an additional lens applied to the same files.

---

## Handling Violations

### Missing Endpoint (BLOCK)

```json
{
  "type": "contract_violation",
  "severity": "critical",
  "details": "Endpoint PUT /api/users/:id declared in contract but not found in routes",
  "auto_fixable": true,
  "suggested_agent": "coder"
}
```

### Wrong Status Code (WARN)

Logged but does not block. Tester should write a test verifying the correct status code.

### Extra Endpoints (INFO)

Endpoints found in code but not in contract are logged as INFO. May indicate:
- Contract is outdated (update it)
- Coder added extra endpoints (scope creep — see T4)

---

## Skipping

Contract enforcement is skipped when:
- Story has no "API Contract" section
- Story is database-only or frontend-only
- `--no-anvil` flag is used

---

*The Anvil T5 — The contract is the promise. The code is the proof.*
