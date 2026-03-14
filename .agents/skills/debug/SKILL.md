---
name: debug
description: >-
  Debug — Interactive Debugger
---

# Debug — Interactive Debugger

**Role:** Launch and control an interactive debug session for a file, test, or running process.

---

## Usage

```
/debug <file>              Start debug session, paused at entry
/debug <file>:<line>       Start session with breakpoint at line
/debug test <test-file>    Debug a test file using its test runner
```

## Examples

```
/debug src/auth/login.ts
/debug src/utils/parser.ts:42
/debug test src/auth/__tests__/login.test.ts
```

---

## Behavior

When invoked, follow this sequence:

### 1. Start Session

- Parse the argument to extract file path and optional line number.
- If prefixed with `test`, detect the test runner (jest, vitest, pytest, mocha) from project config.
- Call `debug_start` with the resolved file, runtime, and test_command if applicable.
- Confirm the session started and report the paused location.

### 2. Set Initial Breakpoint (if line specified)

- If the user provided `<file>:<line>`, call `debug_breakpoint` with action `set` at that line.
- Then call `debug_step` with action `continue` to run to the breakpoint.
- Report the paused location and surrounding code context.

### 3. Guide Inspection

- Once paused, call `debug_inspect` with target `scope` to show local variables.
- Call `debug_inspect` with target `callstack` to show the call stack.
- Present findings and ask the user what to investigate next.

### 4. Interactive Loop

Respond to user instructions by mapping them to debug tools:

| User says | Tool call |
|-----------|-----------|
| "step" / "next" | `debug_step` action=next |
| "step into" | `debug_step` action=into |
| "step out" | `debug_step` action=out |
| "continue" | `debug_step` action=continue |
| "inspect X" | `debug_inspect` target=X |
| "eval <expr>" | `debug_evaluate` expression=expr |
| "break <file>:<line>" | `debug_breakpoint` action=set |
| "breakpoints" | `debug_breakpoint` action=list |
| "stop" / "quit" | `debug_stop` |

### 5. Cleanup

- Always call `debug_stop` when the user is done or the process exits.
- Report any uncaught exceptions with full stack trace and variable context.

---

## Notes

- Only one debug session can be active at a time.
- Session auto-terminates after the configured timeout (default 60s).
- Use `debug_evaluate` to test fix hypotheses before editing code.
