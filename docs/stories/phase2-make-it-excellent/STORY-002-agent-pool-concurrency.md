# STORY-002: AgentPool with Concurrency Control

## Goal

Implement an AgentPool that manages parallel agent execution with a configurable concurrency limit, FIFO task queue, and lifecycle management (start, drain, shutdown).

## PRD Mapping

- FR-002 (AgentPool)

## Epic

5 — Runtime Agent Orchestration

## Effort

M (Medium) — Core concurrency primitive with queue management

## Dependencies

- STORY-001 (Agent Message Bus) — Pool uses the bus to coordinate agent lifecycle events

## Scope

### Files to Create

- `sf_cli/src/core/agent-pool.ts` — Pool implementation
- `sf_cli/src/core/__tests__/agent-pool.test.ts` — Unit tests

### Files to Modify

- `sf_cli/src/core/pipeline.ts` — Replace sequential agent execution with pool-based execution
- `sf_cli/src/core/config.ts` — Add `agentPool.maxConcurrency` config option (default: 3)

## Technical Approach

### Pool Design

```typescript
export interface AgentTask {
  id: string;              // UUID
  agentId: string;         // Which agent type to run
  input: AgentInput;       // Task-specific input (from existing types)
  priority: number;        // 0 = normal, higher = run first
  correlationId: string;   // Links to message bus correlation
  enqueuedAt: number;      // Timestamp
}

export interface PoolOptions {
  maxConcurrency: number;  // Max parallel agents (default: 3, min: 1, max: 10)
  taskTimeout: number;     // Per-task timeout in ms (default: 300_000 = 5min)
  drainTimeout: number;    // Max wait for drain() in ms (default: 60_000)
}

export class AgentPool {
  constructor(bus: AgentMessageBus, options?: Partial<PoolOptions>);

  submit(task: AgentTask): Promise<AgentResult>;   // Returns when task completes
  submitBatch(tasks: AgentTask[]): Promise<AgentResult[]>;  // Parallel submission
  drain(): Promise<void>;                           // Wait for all queued tasks to complete
  shutdown(): Promise<void>;                        // Cancel queued, wait for running, cleanup
  getStatus(): PoolStatus;                          // Current state snapshot
}

export interface PoolStatus {
  running: number;         // Currently executing agents
  queued: number;          // Waiting in FIFO queue
  completed: number;       // Total completed since pool creation
  failed: number;          // Total failed since pool creation
  maxConcurrency: number;
  activeTasks: Array<{ taskId: string; agentId: string; startedAt: number }>;
  queuedTasks: Array<{ taskId: string; agentId: string; enqueuedAt: number }>;
}
```

### Concurrency Control

- Use a semaphore pattern: maintain a counter of active agents, dispatch from queue when counter < max
- When an agent completes (success or failure), decrement counter and dispatch next queued task
- Priority queue: tasks with higher priority number run before lower (same priority = FIFO)
- Task timeout: if an agent exceeds `taskTimeout`, abort it and mark as failed

### Agent Instantiation

- Pool calls `AgentRegistry.create(agentId)` to instantiate agents (uses existing registry)
- Each agent instance gets the shared `AgentMessageBus` injected
- Agent runs via `agent.execute(input)` (existing Agent base class method)

### Error Handling

- If an agent throws, the pool catches the error, marks the task as failed, and recovers the concurrency slot
- Failed tasks include the error in the result (no silent failures)
- If shutdown is called with running tasks, wait up to `drainTimeout` then force-abort remaining

### Bus Integration

- Pool publishes `status:heartbeat` messages every 5s with current PoolStatus
- Pool subscribes to `task:cancel` messages to remove queued tasks or abort running ones

## Acceptance Criteria

```gherkin
Feature: AgentPool Concurrency Control

  Scenario: Concurrency limit enforcement
    Given pool maxConcurrency is 3
    And 5 tasks are submitted
    When execution starts
    Then exactly 3 agents are running concurrently
    And 2 tasks are in the queue
    When a running agent completes
    Then a queued task starts within 100ms

  Scenario: Task completion returns result
    Given a task is submitted to the pool
    When the agent completes successfully
    Then the submit() promise resolves with the AgentResult
    And the result contains the task ID, agent ID, duration, and output

  Scenario: Task failure recovery
    Given pool maxConcurrency is 2
    And 3 tasks are submitted
    And the first agent throws an error
    When the error is caught
    Then the pool recovers the concurrency slot
    And the next queued task starts
    And the failed task's promise rejects with the error

  Scenario: Task timeout
    Given pool taskTimeout is 1000ms
    And a task is submitted that takes 5000ms
    When 1000ms passes
    Then the task is aborted
    And the submit() promise rejects with a TimeoutError
    And the concurrency slot is recovered

  Scenario: Drain waits for completion
    Given 3 tasks are running
    When drain() is called
    Then drain() resolves only after all 3 tasks complete

  Scenario: Priority ordering
    Given pool maxConcurrency is 1 and 1 task is running
    And task A (priority 0) is queued, then task B (priority 5) is queued
    When the running task completes
    Then task B (higher priority) starts before task A

  Scenario: Shutdown with running tasks
    Given 2 tasks are running and 3 are queued
    When shutdown() is called
    Then queued tasks are cancelled (promises reject with ShutdownError)
    And running tasks are allowed to complete up to drainTimeout
    And pool rejects new submissions after shutdown

  Scenario: Pool status snapshot
    Given 2 tasks are running and 1 is queued
    When getStatus() is called
    Then running is 2, queued is 1
    And activeTasks contains task IDs and start times
    And queuedTasks contains task IDs and enqueue times
```

## Tests

- Unit: Concurrency limit respected (never exceeds max)
- Unit: FIFO ordering within same priority
- Unit: Priority ordering across different priorities
- Unit: Task completion resolves promise with result
- Unit: Task failure rejects promise and recovers slot
- Unit: Task timeout aborts and recovers slot
- Unit: drain() waits for all tasks
- Unit: shutdown() cancels queue and waits for running
- Unit: Reject submissions after shutdown
- Unit: Pool status accuracy
- Integration: Pool with real Agent instances (mock AI runner)
- Performance: Submit 100 tasks with concurrency 5, all complete without deadlock
