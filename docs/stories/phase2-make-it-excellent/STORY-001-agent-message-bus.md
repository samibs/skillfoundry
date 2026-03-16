# STORY-001: Agent Message Bus

## Goal

Implement a typed, in-process publish/subscribe message bus enabling cross-agent communication with structured message envelopes, topic-based routing, and correlation tracking.

## PRD Mapping

- FR-001 (Cross-Agent Message Bus)

## Epic

5 — Runtime Agent Orchestration

## Effort

M (Medium) — New module with types, tests, and integration into existing Agent base class

## Dependencies

- None (foundation story)

## Scope

### Files to Create

- `sf_cli/src/core/agent-message-bus.ts` — Message bus implementation
- `sf_cli/src/core/__tests__/agent-message-bus.test.ts` — Unit tests

### Files to Modify

- `sf_cli/src/core/agent.ts` — Add `bus` property and convenience methods (`publish`, `subscribe`, `unsubscribe`)
- `sf_cli/src/types.ts` — Add message envelope types

## Technical Approach

### Message Envelope Type

```typescript
// In src/types.ts
export type MessageType =
  | 'task:delegate'
  | 'task:cancel'
  | 'result:complete'
  | 'result:error'
  | 'status:heartbeat'
  | 'status:request'
  | 'memory:store'
  | 'memory:query';

export interface AgentMessage<T = Record<string, unknown>> {
  id: string;            // UUID v4
  sender: string;        // Agent ID
  recipient: string;     // Agent ID or '*' for broadcast
  type: MessageType;
  payload: T;
  correlationId: string; // Links request/response pairs
  timestamp: number;     // Date.now()
}
```

### Bus Implementation

```typescript
// In src/core/agent-message-bus.ts
export class AgentMessageBus {
  private subscribers: Map<string, Set<SubscriberFn>>;
  private history: AgentMessage[];       // Ring buffer, configurable max (default 1000)
  private middleware: MiddlewareFn[];     // Pre-dispatch hooks (logging, filtering)

  publish(message: AgentMessage): void;
  subscribe(topic: string, handler: SubscriberFn): UnsubscribeFn;
  subscribeOnce(topic: string, handler: SubscriberFn): UnsubscribeFn;
  request(message: AgentMessage, timeoutMs?: number): Promise<AgentMessage>;  // Publish + wait for correlated response
  getHistory(filter?: { type?: MessageType; sender?: string; correlationId?: string }): AgentMessage[];
  use(middleware: MiddlewareFn): void;    // Register middleware
  clear(): void;                          // Reset for testing
}
```

### Topic Routing

- Subscribers register for a `type` string (e.g., `task:delegate`)
- Wildcard `*` subscribes to all message types
- Messages with `recipient: '*'` are delivered to all subscribers of that type
- Messages with a specific `recipient` are delivered only to that agent's subscriptions

### Integration with Agent Base Class

```typescript
// In agent.ts, add to Agent constructor:
this.bus = bus ?? AgentMessageBus.global();

// Convenience methods on Agent:
protected publish(type: MessageType, payload: Record<string, unknown>, recipient?: string): void;
protected subscribe(type: MessageType, handler: SubscriberFn): UnsubscribeFn;
```

### Middleware Pattern

Middleware runs before delivery, receives the message and a `next()` function. Use cases:
- Logging middleware (writes every message to structured log)
- Filtering middleware (drop messages from unauthorized senders)
- Metrics middleware (count messages per type)

### Singleton vs Instance

- `AgentMessageBus.global()` returns a singleton for the current process (used by pipeline)
- Constructor allows standalone instances (used in tests)

## Acceptance Criteria

```gherkin
Feature: Agent Message Bus

  Scenario: Direct message delivery
    Given agent "coder-001" subscribes to "task:delegate"
    And agent "orchestrator-001" publishes a "task:delegate" message with recipient "coder-001"
    When the message is dispatched
    Then agent "coder-001" receives the message within 50ms
    And the message envelope contains sender, recipient, type, payload, correlationId, and timestamp

  Scenario: Broadcast message delivery
    Given agent "coder-001" subscribes to "status:heartbeat"
    And agent "tester-001" subscribes to "status:heartbeat"
    And agent "orchestrator-001" publishes a "status:heartbeat" message with recipient "*"
    When the message is dispatched
    Then both "coder-001" and "tester-001" receive the message

  Scenario: Request-response correlation
    Given agent "orchestrator-001" sends a request with correlationId "abc-123"
    And agent "coder-001" is subscribed and replies with the same correlationId
    When the response is published
    Then the orchestrator's request() promise resolves with the response message

  Scenario: Request timeout
    Given agent "orchestrator-001" sends a request with 1000ms timeout
    And no agent responds within 1000ms
    When the timeout expires
    Then the request() promise rejects with a TimeoutError

  Scenario: Message history
    Given 5 messages have been published
    When getHistory() is called with no filter
    Then all 5 messages are returned in chronological order
    When getHistory({ type: 'task:delegate' }) is called
    Then only messages of that type are returned

  Scenario: Middleware execution
    Given a logging middleware is registered
    When a message is published
    Then the middleware receives the message before subscribers
    And the middleware can modify or drop the message

  Scenario: Unsubscribe
    Given agent "coder-001" subscribes to "task:delegate"
    And then unsubscribes
    When a "task:delegate" message is published
    Then agent "coder-001" does not receive the message
```

## Tests

- Unit: Publish/subscribe delivery with type filtering
- Unit: Broadcast vs direct recipient routing
- Unit: Request/response with correlation ID matching
- Unit: Timeout on unanswered request
- Unit: History ring buffer with max size enforcement
- Unit: Middleware chain execution order
- Unit: Unsubscribe removes listener cleanly (no memory leak)
- Unit: Singleton vs instance isolation
- Performance: 1000 messages dispatched in <100ms
