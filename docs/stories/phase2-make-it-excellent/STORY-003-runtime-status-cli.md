# STORY-003: Runtime Status CLI + Structured Agent Logging

## Goal

Implement the `sf runtime status` CLI command to display per-agent state, task queues, and health. Add structured JSON logging per agent with task correlation IDs.

## PRD Mapping

- FR-003 (Runtime Status Command)
- FR-004 (Structured Agent Logging)

## Epic

5 — Runtime Agent Orchestration

## Effort

S (Small) — CLI command wrapping existing pool status + logging decorator

## Dependencies

- STORY-001 (Agent Message Bus) — Status reads bus message history
- STORY-002 (AgentPool) — Status reads pool state via `getStatus()`

## Scope

### Files to Create

- `sf_cli/src/commands/runtime.ts` — `sf runtime status` command handler
- `sf_cli/src/core/agent-logger.ts` — Structured JSON log wrapper for agents
- `sf_cli/src/core/__tests__/agent-logger.test.ts` — Unit tests

### Files to Modify

- `sf_cli/src/commands/index.ts` — Register the `runtime` command
- `sf_cli/src/core/agent.ts` — Inject AgentLogger into Agent base class lifecycle hooks

## Technical Approach

### CLI Command: `sf runtime status`

```
$ sf runtime status

  Agent Pool Status
  ─────────────────────────────────────────────────────────
  Concurrency: 2 / 3 active │ Queue: 1 pending │ Uptime: 4m 23s

  Active Agents
  ┌──────────────┬──────────┬─────────────────┬──────────┐
  │ Agent ID     │ State    │ Current Task    │ Duration │
  ├──────────────┼──────────┼─────────────────┼──────────┤
  │ coder-001    │ running  │ STORY-003-impl  │ 12.4s    │
  │ tester-002   │ running  │ STORY-001-test  │ 5.1s     │
  └──────────────┴──────────┴─────────────────┴──────────┘

  Queued Tasks
  ┌──────────────┬──────────────────┬──────────┐
  │ Agent ID     │ Task             │ Wait     │
  ├──────────────┼──────────────────┼──────────┤
  │ reporter-001 │ STORY-001-report │ 8.3s     │
  └──────────────┴──────────────────┴──────────┘

  Completed: 14 │ Failed: 1 │ Messages: 47
```

Flags:
- `--json` — Output raw JSON instead of formatted table
- `--watch` — Refresh every 2s (clear + reprint)

### Structured Agent Logger

```typescript
export interface AgentLogEntry {
  timestamp: string;       // ISO 8601
  level: 'info' | 'warn' | 'error' | 'debug';
  agentId: string;
  taskId: string;
  correlationId: string;
  phase: 'start' | 'execute' | 'delegate' | 'complete' | 'fail' | 'abort';
  durationMs?: number;     // Present on complete/fail/abort
  message: string;
  metadata?: Record<string, unknown>;  // Extra context (tool calls, token usage)
}

export class AgentLogger {
  constructor(agentId: string, taskId: string, correlationId: string);

  start(): void;           // Logs phase: 'start'
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
  complete(result?: unknown): void;  // Logs phase: 'complete' with duration
  fail(error: Error): void;          // Logs phase: 'fail' with duration and error
  abort(reason: string): void;       // Logs phase: 'abort' with duration
}
```

### Integration with Agent Base Class

In `agent.ts`, wrap the `execute()` method:
1. Before execution: create `AgentLogger` with agent ID, task ID, correlation ID; call `start()`
2. On success: call `complete(result)` which calculates duration from start time
3. On failure: call `fail(error)` which calculates duration and includes error details
4. On abort: call `abort(reason)`

Logs are written via the existing `getLogger()` utility, ensuring they go to the same log destination as all other framework logs.

### Status Data Source

The `sf runtime status` command reads:
1. `AgentPool.getStatus()` for active/queued task information
2. `AgentMessageBus.global().getHistory()` for message count
3. Process uptime from `process.uptime()`

If the pool is not running (no active pipeline), the command reports "No active pipeline session."

## Acceptance Criteria

```gherkin
Feature: Runtime Status CLI

  Scenario: Display active pipeline status
    Given a pipeline is running with 2 active agents and 1 queued task
    When `sf runtime status` is executed
    Then output shows a formatted table with agent IDs, states, current tasks, and durations
    And output shows pool concurrency, queue depth, and uptime
    And output shows completed/failed task counts

  Scenario: JSON output mode
    Given a pipeline is running
    When `sf runtime status --json` is executed
    Then output is valid JSON matching the PoolStatus schema
    And contains activeTasks and queuedTasks arrays

  Scenario: No active pipeline
    Given no pipeline is currently running
    When `sf runtime status` is executed
    Then output shows "No active pipeline session."

Feature: Structured Agent Logging

  Scenario: Task lifecycle logging
    Given an agent starts executing a task
    Then a JSON log entry is written with phase "start", agentId, taskId, and correlationId
    When the agent completes successfully
    Then a JSON log entry is written with phase "complete" and accurate durationMs
    And durationMs reflects actual wall-clock time to millisecond precision

  Scenario: Task failure logging
    Given an agent encounters an error during execution
    When the error is caught
    Then a JSON log entry is written with phase "fail", durationMs, and error message
    And the error stack trace is included in metadata

  Scenario: Log correlation
    Given agent A delegates to agent B with correlationId "xyz-789"
    When both agents log their activities
    Then all log entries from both agents share correlationId "xyz-789"
    And logs can be filtered by correlationId to reconstruct the full interaction
```

## Tests

- Unit: AgentLogger.start() writes correct JSON structure
- Unit: AgentLogger.complete() includes accurate duration
- Unit: AgentLogger.fail() includes error details and duration
- Unit: AgentLogger correlation ID propagation
- Unit: Runtime status command formats table correctly
- Unit: Runtime status --json outputs valid JSON
- Unit: Runtime status with no active pool shows appropriate message
- Integration: Agent lifecycle produces expected log sequence (start -> complete)
