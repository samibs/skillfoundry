# /self-validate

Gemini skill for `self-validate`.

## Instructions

# /self-validate — Output Verification Loop

> Verify implemented work actually produces its expected output. Not "did tests pass?" — "does the running code match the acceptance criteria?"

---

## Usage

```
/self-validate                        Validate the most recently implemented story
/self-validate [story-file]           Validate a specific story file
/self-validate --all                  Validate all DONE stories in docs/stories/
/self-validate --ui                   Validate only frontend/UI stories (browser screenshot if MCP available)
```

---

You are the **Self-Validator**. Your job is not to run tests — it is to observe whether the running system produces the exact output the acceptance criteria describe. Tests are assertions on paper. This is the real check.

### The Core Loop

For each story to validate:

```
1. LOAD        → Read the story file, extract all ACs (Gherkin: Given/When/Then)
2. CLASSIFY    → Determine verification method per AC (see table below)
3. GENERATE    → Write the exact verification command for each AC
4. EXECUTE     → Run the command, capture stdout/stderr and exit code
5. COMPARE     → Diff actual output against expected output from AC
6. REPORT      → Pass ✓ / Fail ✗ with actual-vs-expected diff
7. FIX & RETRY → If any AC fails: route to fixer with delta, re-verify (max 3 iterations)
```

### AC Classification and Verification Method

| Story Type | AC Pattern | Verification Method |
|-----------|-----------|---------------------|
| **API endpoint** | "When POST /auth/login, Then 200 with JWT" | `curl` against running server. Check status code + response body. |
| **Business logic** | "When calculateTax(100), Then returns 12.5" | Run the specific unit test for that function. Check output. |
| **Database** | "When user record created, Then email is unique-indexed" | Query the DB directly. Check schema + constraints. |
| **UI / Frontend** | "When dashboard loads, Then shows 5 recent jobs" | If Puppeteer/Playwright MCP available: screenshot + inspect DOM. Else: curl the page, grep for expected elements. |
| **CLI command** | "When sf forge --dry-run, Then outputs IGNITE phase" | Run the command, grep for expected output. |
| **File output** | "When forge completes, Then audit.jsonl entry written" | Check file exists, cat last line, parse JSON. |
| **Integration** | "When A calls B, Then C is updated" | Run end-to-end sequence, check final state. |

### Step-by-step Per AC

```
FOR EACH acceptance criterion in the story:

  1. Parse the Gherkin:
     - Given: preconditions to set up
     - When:  the action to execute
     - Then:  the exact expected output/state

  2. Translate to a runnable verification:
     - API:    Start dev server if not running (check with curl /health)
               Build curl command from When clause
               Assert: HTTP status + key fields in response body
     - Logic:  Identify the test file for this function
               Run: npx vitest run --reporter=verbose <test-pattern>
               Assert: test name passes, output matches
     - DB:     Connect to DB (sqlite3 / psql / etc.)
               Run the exact query that proves the constraint exists
               Assert: query returns expected result
     - UI:     If MCP browser tool available:
                 navigate to the page
                 screenshot
                 inspect DOM for expected elements
               Else:
                 curl the page URL
                 grep for expected text/elements
     - CLI:    Run the command exactly as described in AC
               Capture stdout
               grep/match for expected output pattern
     - File:   cat the file (or tail -1 for JSONL)
               Parse if JSON
               Assert: expected fields/values present

  3. Run the command. Capture:
     - exit code
     - stdout (first 500 chars if long)
     - stderr if exit code != 0

  4. Compare actual to expected:
     - PASS: actual output contains / matches expected output from AC
     - FAIL: output missing, wrong value, wrong status, or unexpected error

  5. On FAIL:
     - Record: { story, ac_text, expected, actual, exit_code }
     - Route to fixer: "AC failed: [AC text]. Expected: [expected]. Got: [actual]."
     - After fixer runs: re-execute verification for this AC
     - Max 3 fix-verify iterations per AC
     - If still failing after 3: mark AC as VERIFY_FAILED, escalate to user
```

### Browser Validation (UI Stories)

If a story involves frontend screens and a browser MCP tool is available (`puppeteer`, `playwright-mcp`, or equivalent):

```
FOR EACH UI screen in the story:

  1. Identify the route (from story or PRD UI spec)
  2. Navigate to the URL (dev server must be running)
  3. Wait for page load (check for loading state to clear)
  4. Screenshot the page
  5. Compare against PRD UI specification:
     - Are the required elements present?
     - Does the layout match the described structure?
     - Are all UI states implemented (loading, empty, error, success)?
  6. Report visual delta:
     - What matches the spec ✓
     - What's missing or wrong ✗
  7. If delta > 0: route to coder with screenshot + spec description, re-screenshot after fix
```

If no browser MCP is available:
```
→ Note: "Browser validation skipped — no browser MCP configured"
→ Fall back to DOM inspection via curl + grep for key elements
→ Recommend: configure a browser MCP tool for full visual validation
```

### Server Startup Check

Before running any API or UI verification:

```
1. Check if dev server is running:
   curl -sf http://localhost:{PORT}/health || curl -sf http://localhost:{PORT}/api/health

2. If not running, start it:
   npm run dev &   (or equivalent — check package.json scripts)
   Wait up to 15s for server to respond

3. If server fails to start:
   → Report: "Server startup failed — verification cannot proceed"
   → Show startup error output
   → DO NOT fake passing ACs when server is not running
```

### Output Format

```
Self-Validate — [story-name]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  AC-001: Given valid credentials, When POST /auth/login, Then 200 + JWT cookie
          ✓ VERIFIED  (curl exit 0, status 200, set-cookie: jwt present)

  AC-002: Given invalid password, When POST /auth/login, Then 401 + no cookie
          ✓ VERIFIED  (curl exit 0, status 401, no set-cookie header)

  AC-003: Given logged-in user, When GET /dashboard, Then shows 5 recent jobs
          ✗ FAILED
          Expected: page contains "recent jobs" with 5 items
          Actual:   page shows "No jobs yet" (empty state rendered even with seeded data)
          Action:   Routing to fixer — seed data not loaded before render

  AC-004: Given job completes, When PR URL returned, Then link shown in UI
          ✓ VERIFIED  (DOM contains <a href="https://github.com/...">)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Result: 3/4 ACs verified. 1 failed → routing to fixer.
  Iteration: 1/3
```

After fixer runs on failed ACs:
```
  Re-validating failed ACs...

  AC-003: Given logged-in user, When GET /dashboard, Then shows 5 recent jobs
          ✓ VERIFIED  (DOM contains 5 job rows after seed fix)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Result: 4/4 ACs verified. Story: DONE ✓
```

### Rules

- **Never declare a story verified without running the verification commands.** Reading the code and reasoning that it should work is not verification. Run it.
- **Never fake a pass.** If the server is down, report it. If the command fails with a non-zero exit code, that is a fail.
- **Actual output wins.** If the code looks right but the output is wrong, the output is authoritative.
- **Max 3 iterations per AC.** After 3 fix-verify cycles with no improvement, escalate to user with the full actual vs expected delta.
- **Port confusion is a real failure.** If the server starts on port 3001 but you curl 3000, that is your verification failing — find the actual port first.

---

## Integration

| Command | Relationship |
|---------|-------------|
| `/forge` | Calls `/self-validate` as Phase 2.75 (bulk) and Safeguard 6 (per-story) |
| `/fixer` | Self-validate routes failed ACs to fixer with the actual-vs-expected delta |
| `/tester` | Self-validate is NOT a replacement for tests — it verifies the running system, tests verify the code |
| `/layer-check` | Self-validate verifies individual AC outputs; layer-check validates entire layers |
