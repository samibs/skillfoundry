# PRD: Native Debugger Integration — Runtime State Inspection for AI Agents

---
prd_id: native-debugger-integration
title: Native Debugger Integration — Runtime State Inspection for AI Agents
version: 1.0
status: DRAFT
created: 2026-03-12
author: n00b73
last_updated: 2026-03-12

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []
  recommends: [correctness-contracts]
  blocks: []
  shared_with: []

tags: [debugging, tools, pipeline, agents, runtime]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

AI coding agents debug like beginners — flying blind. When a test fails or a bug is reported, the agent reads code, forms hypotheses, tries a fix, and if it fails, scatters `console.log` statements everywhere, retests, still doesn't understand, and repeats the cycle. Every experienced developer knows the efficient path: set a breakpoint, inspect variables, step through execution to see what's **actually happening** at runtime.

The root cause: Claude and other LLMs have **no access to runtime state**. They can read code (static analysis) and run commands (terminal output), but they cannot pause execution, inspect variable values in a specific scope, evaluate expressions in a live frame, or step through code line by line. This forces them into the least efficient debugging strategy — guess-and-check with print statements.

The SkillFoundry fixer agent compounds this: when it fails to fix a bug after 2 attempts, it gives up. It never had the right tools to begin with. A fixer with debugger access could inspect the actual runtime state on the first attempt and fix the root cause, not the symptom.

### 1.2 Proposed Solution

Build a native debugger integration module (`sf_cli/src/core/debugger.ts`) that exposes runtime debugging operations as agent tools. These tools connect to language-native debug protocols:

- **Node.js / TypeScript**: Chrome DevTools Protocol (CDP) via `node --inspect-brk` — zero external dependencies, built into Node.js
- **Python**: Debug Adapter Protocol (DAP) via `debugpy` — standard Python debugger
- **C/C++/Rust/Swift**: LLDB/GDB via command-line interface

The tools are structured: agents send tool calls (`debug_breakpoint`, `debug_inspect`, `debug_step`) and receive structured JSON responses — not raw terminal output they have to parse. This integrates naturally with the existing `runAgentLoop` → tool execution → structured result pipeline.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Fixer success rate on logic bugs | ~40% (guess-and-check) | 75%+ | Track fixer outcomes with/without debugger in pipeline runs |
| Debugging turns per bug | 5-8 (console.log cycles) | 2-3 (breakpoint → inspect → fix) | Count agent turns in debug sessions |
| Console.log additions by fixer | Frequent | Near-zero | Grep for console.log additions in fixer diffs |
| Runtime coverage | 0 (no debugger) | Node.js + Python (Phase 1) | Runtime detection in debugger module |

---

## 2. User Stories

### Primary User: AI Agent (Fixer, Debugger, Tester)

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | fixer agent | set a breakpoint at a specific file and line | I can pause execution at the suspected failure point | MUST |
| US-002 | fixer agent | inspect all variables in the current scope when paused | I can see actual runtime values instead of guessing | MUST |
| US-003 | fixer agent | evaluate an arbitrary expression in the current frame | I can test hypotheses about state without modifying code | MUST |
| US-004 | fixer agent | step through code line by line (over, into, out) | I can trace the exact execution path | MUST |
| US-005 | debugger agent | start a debug session for a test file or script | I can reproduce and investigate a failure | MUST |
| US-006 | fixer agent | set conditional breakpoints (break only when condition is true) | I can skip irrelevant iterations and focus on the failing case | SHOULD |
| US-007 | fixer agent | view the call stack when paused | I can understand how execution reached the current point | SHOULD |
| US-008 | debugger agent | hot-patch a variable value at runtime | I can verify a fix hypothesis without restarting | COULD |
| US-009 | developer | invoke `/debug` to manually start a debug investigation | I can direct Claude to use the debugger on a specific problem | MUST |

### Secondary User: Pipeline Engine

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-010 | pipeline | auto-escalate to debugger when fixer fails twice | the pipeline has a smarter fallback than retrying blind | SHOULD |
| US-011 | pipeline | get structured debug results (not raw terminal) | I can include debug findings in gate reports | SHOULD |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Debug session lifecycle | Start, manage, and stop debug sessions for supported runtimes | Given a file path and runtime, When `debug_start` is called, Then a debug session starts with the process paused at entry |
| FR-002 | Breakpoint management | Set, remove, and list breakpoints (line-based and conditional) | Given a running debug session, When `debug_breakpoint` is called with file:line, Then execution pauses at that line on next hit |
| FR-003 | Variable inspection | Inspect variables in current scope, specific variable by name, or nested object properties | Given execution is paused, When `debug_inspect` is called, Then returns JSON with variable names, types, and values |
| FR-004 | Expression evaluation | Evaluate arbitrary expressions in the current paused frame | Given execution is paused, When `debug_evaluate` is called with an expression, Then returns the result as structured JSON |
| FR-005 | Execution control | Step over, step into, step out, continue, and pause | Given execution is paused, When `debug_step` is called with action="next", Then execution advances one line and pauses again |
| FR-006 | Call stack inspection | View the full call stack with file, line, function name per frame | Given execution is paused, When `debug_inspect` is called with target="callstack", Then returns array of stack frames |
| FR-007 | Runtime auto-detection | Detect project runtime from config files (package.json, tsconfig, requirements.txt, Cargo.toml) | Given a project directory, When debug session starts, Then runtime is auto-detected without user specifying it |
| FR-008 | Session timeout | Debug sessions auto-terminate after configurable timeout (default 60s) | Given a debug session running longer than timeout, When timeout expires, Then session is killed and resources freed |
| FR-009 | Source map support | TypeScript debugging resolves to `.ts` source lines, not compiled `.js` | Given a TypeScript project, When breakpoint set on `.ts` file, Then debugger pauses at the correct source line |
| FR-010 | Tool definitions | All debug operations exposed as Anthropic tool_use compatible tools | Given the debugger tools are registered, When agent calls `debug_start`, Then tool execution returns structured result |
| FR-011 | `/debug` skill | CLI skill for manual debugger invocation | Given user types `/debug src/broken.ts:42`, When skill executes, Then a debug session starts with breakpoint at line 42 |

### 3.2 Tool Definitions

**`debug_start`** — Launch process under debugger
```json
{
  "name": "debug_start",
  "input": {
    "file": "src/index.ts",
    "runtime": "node",
    "args": ["--port", "3000"],
    "test_command": "npx vitest run src/index.test.ts"
  },
  "output": {
    "session_id": "dbg-abc123",
    "runtime": "node",
    "pid": 12345,
    "status": "paused_at_entry"
  }
}
```

**`debug_breakpoint`** — Set/remove/list breakpoints
```json
{
  "name": "debug_breakpoint",
  "input": {
    "session_id": "dbg-abc123",
    "action": "set",
    "file": "src/utils.ts",
    "line": 42,
    "condition": "items.length > 100"
  },
  "output": {
    "breakpoint_id": "bp-1",
    "file": "src/utils.ts",
    "line": 42,
    "condition": "items.length > 100",
    "verified": true
  }
}
```

**`debug_inspect`** — Inspect variables, scope, or call stack
```json
{
  "name": "debug_inspect",
  "input": {
    "session_id": "dbg-abc123",
    "target": "scope"
  },
  "output": {
    "paused_at": { "file": "src/utils.ts", "line": 42, "function": "processItems" },
    "locals": {
      "items": { "type": "Array", "length": 150, "preview": "[{id: 1, ...}, {id: 2, ...}, ...]" },
      "index": { "type": "number", "value": 99 },
      "result": { "type": "undefined", "value": null }
    }
  }
}
```

**`debug_evaluate`** — Evaluate expression in current frame
```json
{
  "name": "debug_evaluate",
  "input": {
    "session_id": "dbg-abc123",
    "expression": "items.filter(i => i.status === 'error').length"
  },
  "output": {
    "result": { "type": "number", "value": 12 },
    "paused_at": { "file": "src/utils.ts", "line": 42 }
  }
}
```

**`debug_step`** — Control execution flow
```json
{
  "name": "debug_step",
  "input": {
    "session_id": "dbg-abc123",
    "action": "next"
  },
  "output": {
    "status": "paused",
    "paused_at": { "file": "src/utils.ts", "line": 43, "function": "processItems" }
  }
}
```

**`debug_stop`** — End debug session
```json
{
  "name": "debug_stop",
  "input": {
    "session_id": "dbg-abc123"
  },
  "output": {
    "status": "terminated",
    "duration_ms": 4500
  }
}
```

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| Session start time | < 3s for Node.js, < 5s for Python |
| Breakpoint hit response | < 500ms from pause to structured JSON response |
| Variable inspection | < 1s for up to 50 variables in scope |
| Session timeout | Default 60s, configurable up to 300s |
| Max concurrent sessions | 1 (single debug session at a time) |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Process isolation | Debug sessions run in project working directory only — no access outside `policy.allow_paths` |
| Expression evaluation | Sandboxed to current frame — cannot spawn processes or access filesystem through eval |
| Session cleanup | All child processes killed on session stop, timeout, or pipeline abort |
| No network exposure | Inspector/debugpy listen on `127.0.0.1` only — never exposed on `0.0.0.0` |
| Credential safety | Debug output redacted using existing redaction patterns before returning to agent |

### 4.3 Reliability

| Metric | Target |
|--------|--------|
| Session cleanup guarantee | 100% — no orphan debug processes left running |
| Graceful timeout | Process SIGTERM, wait 2s, SIGKILL if still alive |
| Runtime detection accuracy | 95%+ — correct runtime chosen from project files |

---

## 5. Technical Specifications

### 5.1 Architecture

```
Agent Loop (runAgentLoop)
    │
    ├── debug_start     → DebugSession.create(runtime, file, args)
    │                       ├── Node: spawn `node --inspect-brk=0 file.js`
    │                       │         connect via CDP WebSocket
    │                       ├── Python: spawn `python -m debugpy --listen 0 --wait-for-client file.py`
    │                       │           connect via DAP
    │                       └── LLDB: spawn `lldb -- ./binary`
    │                                 communicate via stdin/stdout
    │
    ├── debug_breakpoint → session.setBreakpoint(file, line, condition?)
    ├── debug_inspect    → session.getScope() / session.getVariable(name) / session.getCallStack()
    ├── debug_evaluate   → session.evaluate(expression)
    ├── debug_step       → session.stepOver() / session.stepInto() / session.stepOut() / session.continue()
    └── debug_stop       → session.terminate()
```

### 5.2 Module Structure

```
sf_cli/src/core/
├── debugger.ts              # DebugSession class, session management, runtime detection
├── debugger-cdp.ts          # Chrome DevTools Protocol adapter (Node.js/Bun)
├── debugger-dap.ts          # Debug Adapter Protocol adapter (Python)
├── debugger-lldb.ts         # LLDB/GDB CLI adapter (C/C++/Rust)
└── debugger-tools.ts        # Tool definitions (TOOL_DEBUG_START, etc.) + executor
```

### 5.3 Dependencies

| Dependency | Version | Purpose | Risk if Unavailable |
|------------|---------|---------|---------------------|
| Node.js Inspector | Built-in (v20+) | CDP debug protocol for JS/TS | None — ships with Node |
| `ws` (WebSocket) | ^8.x | CDP WebSocket connection | Already in project deps OR use Node built-in WebSocket (v21+) |
| `debugpy` | User-installed | Python debug adapter | Graceful skip — Python debugging unavailable |
| `lldb` / `gdb` | System-installed | Native code debugging | Graceful skip — native debugging unavailable |

### 5.4 CDP Protocol Details (Node.js)

The Chrome DevTools Protocol is the most critical integration. Key domains:

| CDP Domain | Methods Used | Purpose |
|------------|-------------|---------|
| `Debugger` | `enable`, `setBreakpointByUrl`, `removeBreakpoint`, `resume`, `stepOver`, `stepInto`, `stepOut`, `pause` | Execution control |
| `Debugger` | `paused` (event), `getScriptSource` | Pause detection, source resolution |
| `Runtime` | `evaluate`, `getProperties`, `callFunctionOn` | Expression eval, variable inspection |
| `Runtime` | `consoleAPICalled` (event) | Capture console output during debug |

Connection flow:
1. Spawn `node --inspect-brk=0 file.js` (port 0 = random available port)
2. Parse `Debugger listening on ws://127.0.0.1:PORT/UUID` from stderr
3. Connect WebSocket to that URL
4. Send `Debugger.enable` → process pauses at first line
5. Agent interacts via tool calls
6. On stop: send `Runtime.terminateExecution`, close WebSocket, kill process

### 5.5 Source Map Support

For TypeScript projects:
1. Detect `tsconfig.json` with `sourceMap: true`
2. When setting breakpoints on `.ts` files, CDP resolves via source maps automatically (Node handles this natively with `--enable-source-maps`)
3. Stack frames include `.ts` file paths and line numbers
4. If source maps not available, fall back to compiled `.js` paths with warning

---

## 6. Constraints & Assumptions

### 6.1 Constraints

- **Technical:** Must use only Node.js built-in APIs + WebSocket for CDP. No native extensions or C++ bindings.
- **Single session:** Only one debug session at a time. Starting a new session terminates the previous one.
- **Timeout enforced:** Sessions cannot run indefinitely — hard cap at 300s to prevent resource leaks.
- **Local only:** Debugger binds to 127.0.0.1 — no remote debugging support.

### 6.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| Node.js v20+ available for CDP | CDP not available on older Node | Check Node version at session start, fail gracefully |
| TypeScript projects have source maps enabled | Breakpoints on .ts files won't resolve | Warn user, suggest adding `sourceMap: true` to tsconfig |
| debugpy installed for Python projects | Python debugging unavailable | Clear error message: "Install debugpy: pip install debugpy" |
| Single-file entry points for debug sessions | Complex apps may need multi-file setup | Support `test_command` parameter to debug via test runner |

### 6.3 Out of Scope

- [ ] Remote debugging (SSH, Docker containers)
- [ ] Browser/frontend JavaScript debugging (Chrome tab)
- [ ] Memory profiling / heap snapshots
- [ ] CPU profiling / flame graphs
- [ ] Multi-process / worker thread debugging
- [ ] GUI debugger interface
- [ ] Java / Go / .NET runtime support (future PRD)

---

## 7. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | Orphan debug processes after crash | M | H | Process cleanup on SIGINT/SIGTERM, session timeout, process group kill |
| R-002 | Agent gets stuck in debug loop (inspect → step → inspect forever) | M | M | Max debug turns limit (default 20), auto-terminate on limit |
| R-003 | Large variable inspection (100KB+ objects) | H | M | Truncate variable values at 2KB preview, deep inspection opt-in |
| R-004 | CDP WebSocket connection drops | L | M | Auto-reconnect once, then terminate session cleanly |
| R-005 | Source maps missing or incorrect | M | L | Fall back to .js with warning, suggest tsconfig fix |

---

## 8. Implementation Plan

### 8.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | Node.js Debugger | CDP adapter, all 6 tools, tool definitions, executor, `/debug` skill, source map support | None |
| 2 | Python Debugger | DAP adapter, debugpy integration, Python runtime detection | Phase 1 (shared session interface) |
| 3 | Pipeline Integration | Fixer auto-escalation, debug findings in gate reports, LLDB adapter | Phase 1 |

### 8.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 | L | High | Medium |
| 2 | M | Medium | Low |
| 3 | M | Medium | Medium |

---

## 9. Acceptance Criteria

### 9.1 Definition of Done

- [ ] `debug_start` launches Node.js process under debugger, pauses at entry, returns session ID
- [ ] `debug_breakpoint` sets breakpoint at file:line, execution pauses when hit
- [ ] `debug_inspect` returns structured JSON with local variables, types, and values
- [ ] `debug_evaluate` evaluates expression in paused frame and returns result
- [ ] `debug_step` advances execution (next/into/out/continue) and returns new position
- [ ] `debug_stop` terminates session, kills process, frees all resources
- [ ] Conditional breakpoints work (break only when condition is true)
- [ ] TypeScript source maps resolve correctly (breakpoints on .ts, not .js)
- [ ] Session auto-terminates after timeout (default 60s)
- [ ] No orphan processes after any termination path (stop, timeout, crash, pipeline abort)
- [ ] All tools return structured JSON (no raw terminal output)
- [ ] Tool definitions registered in agent-registry with new `DEBUG` tool category
- [ ] `/debug` skill works for manual invocation
- [ ] Unit tests for session lifecycle, breakpoint management, variable inspection
- [ ] Integration test: set breakpoint → run → hit breakpoint → inspect variables → evaluate expression → step → continue → stop

---

## 10. Appendix

### 10.1 Glossary

| Term | Definition | Code Name |
|------|------------|-----------|
| CDP | Chrome DevTools Protocol — debug interface for V8/Node.js | `cdp` |
| DAP | Debug Adapter Protocol — language-agnostic debug interface (VS Code standard) | `dap` |
| Debug session | A running process under debugger control | `DebugSession` |
| Breakpoint | A point in code where execution pauses | `Breakpoint` |
| Frame | A single function call in the call stack | `StackFrame` |
| Scope | The set of variables visible at a pause point | `Scope` |
| Hot-patch | Modifying a variable value at runtime without restarting | `evaluate` (with assignment) |

### 10.2 References

- [Chrome DevTools Protocol documentation](https://chromedevtools.github.io/devtools-protocol/)
- [Node.js Inspector API](https://nodejs.org/api/inspector.html)
- [Debug Adapter Protocol specification](https://microsoft.github.io/debug-adapter-protocol/)
- [debugpy documentation](https://github.com/microsoft/debugpy)
- [Original insight: "Claude debugs like a beginner"](https://www.linkedin.com/posts/)

### 10.3 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-12 | n00b73 | Initial draft |
