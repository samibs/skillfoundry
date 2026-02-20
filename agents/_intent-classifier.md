# Intent Classifier Reference v1.0.0

> Classification examples, edge cases, and confidence calibration for the Autonomous Protocol.
> Referenced by: `agents/_autonomous-protocol.md`

---

## Classification Matrix

### FEATURE — New Capability

**High Confidence (90%+):**
- "Add a dark mode toggle to the settings page"
- "Create a user registration form"
- "Build an API endpoint for product search"
- "Implement email notifications when orders ship"
- "I need a dashboard that shows daily revenue"

**Medium Confidence (70-89%):**
- "We need better error messages" (could be REFACTOR)
- "Add logging" (FEATURE if new, OPS if infrastructure)
- "Make the app work offline" (complex FEATURE)

**Decision: Simple vs Complex**

| Simple (skip PRD) | Complex (needs PRD) |
|-------------------|---------------------|
| "Add a health check endpoint" | "Build user authentication with JWT" |
| "Add a loading spinner to the button" | "Create a payment processing system" |
| "Add a timestamp to the log output" | "Implement a notification service with channels" |
| "Export this table to CSV" | "Build a multi-tenant dashboard" |

---

### BUG — Something is Broken

**High Confidence (90%+):**
- "The login page crashes when I submit"
- "Error 500 on the /api/users endpoint"
- "The form validation isn't working"
- "Users can't logout — clicking the button does nothing"
- "The date picker shows wrong timezone"

**Medium Confidence (70-89%):**
- "The page is slow" (BUG or PERFORMANCE/REFACTOR)
- "Something is wrong with the sidebar" (vague — ask)
- "It doesn't look right on mobile" (BUG or FEATURE)

**Low Confidence (<70%) — ASK:**
- "The app feels weird" → What specifically? Behavior? Appearance? Performance?
- "It's not great" → What aspect needs improvement?

---

### REFACTOR — Improve Existing Code

**High Confidence (90%+):**
- "Refactor the auth module to use the repository pattern"
- "Clean up the duplicate code in the API handlers"
- "Simplify the state management in the dashboard"
- "Extract the validation logic into a shared utility"
- "Reorganize the project structure"

**Medium Confidence (70-89%):**
- "Make the code better" (REFACTOR, but vague — ask what aspect)
- "Optimize the database queries" (REFACTOR or PERFORMANCE)
- "Improve the error handling" (REFACTOR or BUG)

---

### QUESTION — Information Request

**High Confidence (95%+):**
- "How does the authentication flow work?"
- "What files handle the payment processing?"
- "Explain the purpose of the middleware layer"
- "Where is the database connection configured?"
- "Show me the API endpoints for user management"
- "Why does this function use recursion?"

**Key Rule:** QUESTION intent = **read-only**. Never modify files.

If the user asks a question and then says "fix it" or "change it", reclassify as BUG or REFACTOR.

---

### OPS — Deployment & Infrastructure

**High Confidence (90%+):**
- "Deploy to production"
- "Set up the CI pipeline"
- "Create a Docker container for this"
- "Push this to staging"
- "Set up GitHub Actions"
- "Configure the load balancer"

**Medium Confidence (70-89%):**
- "Ship it" (OPS, but verify what "it" refers to)
- "Make it production-ready" (OPS + REFACTOR)

---

### MEMORY — Knowledge Capture

**High Confidence (95%+):**
- "Remember that we use PostgreSQL for this project"
- "Save this decision: we chose JWT over sessions"
- "Note: the API rate limit is 100 req/min"
- "Record that dark mode uses CSS variables"
- "Don't forget: the client wants ISO 8601 dates"

**Implicit Memory (always record, no explicit ask):**
- Architectural decisions made during FEATURE/REFACTOR pipelines
- Error patterns discovered during BUG fixes
- User corrections to autonomous output

---

## Edge Cases & Disambiguation

### Multi-Intent Inputs

| Input | Intents | Resolution |
|-------|---------|------------|
| "Fix the login bug and add a forgot password feature" | BUG + FEATURE | Split into two: BUG first (fix login), then FEATURE (forgot password) |
| "Refactor the auth module and add rate limiting" | REFACTOR + FEATURE | Execute as REFACTOR (includes the addition as part of the improvement) |
| "Why is the API slow and can you fix it?" | QUESTION + BUG | Answer QUESTION first (explain why), then route to BUG pipeline |
| "Deploy the fix we just made" | OPS | Single intent — the context is clear |

### Ambiguous Inputs

| Input | Why Ambiguous | Action |
|-------|--------------|--------|
| "Make it faster" | BUG? REFACTOR? What specifically? | ASK: "What specifically is slow? Page load? API response? Database queries?" |
| "Update the dashboard" | FEATURE? REFACTOR? BUG? | ASK: "What about the dashboard? New widget? Fix a bug? Redesign?" |
| "Handle the edge case" | Which edge case? | ASK: "Which edge case? Can you describe the scenario?" |
| "Do the thing we discussed" | No context available | ASK: "I don't have context from a previous conversation. What would you like me to do?" |

### Context-Dependent Classification

| Input | If Project Has Tests | If Project Has No Tests |
|-------|---------------------|------------------------|
| "Make sure it works" | BUG (run tests, fix failures) | FEATURE (add test suite) |
| "Set up the project" | QUESTION (explain existing setup) | FEATURE (scaffold the project) |

---

## Confidence Calibration

### When to be MORE confident:
- User uses specific technical terms (endpoint, migration, component)
- User references specific files or functions
- User gives clear acceptance criteria ("should return 200")
- Previous messages in session establish context

### When to be LESS confident:
- User uses vague language ("make it better", "fix stuff")
- User references something outside the current project
- Input is very short (< 5 words) without context
- Input contradicts previous session decisions

### The 70% Rule

```
IF confidence >= threshold for the intent:
    → Proceed silently with the pipeline
    → Show classification in the review output

IF confidence < threshold:
    → ASK before proceeding
    → Present top 2 interpretations
    → Let user choose or clarify

NEVER guess at < 50% confidence.
```

---

*Cold-blooded classification. No assumptions. Ask if unclear.*
