---
story_id: STORY-007
title: Streaming Event Protocol
phase: 3
priority: MUST
complexity: medium
depends_on: [STORY-001]
blocks: []
layers: [backend]
---

# STORY-007: Streaming Event Protocol

## Objective

Implement a streaming event protocol that emits SSE events during tool execution lifecycle: message_start, tool_match, message_delta, message_stop, permission_denial.

## Technical Approach

### 1. Define Event Types

Create `src/streaming/protocol.ts`:

```typescript
export type StreamEventType =
  | 'message_start'
  | 'tool_match'
  | 'message_delta'
  | 'message_stop'
  | 'permission_denial';

export interface StreamEvent {
  type: StreamEventType;
  sessionId: string;
  timestamp: string;
  toolName?: string;
  tier?: string;
  category?: string;
  text?: string;
  progress?: number;          // 0.0 - 1.0
  usage?: { inputTokens: number; outputTokens: number };
  stopReason?: string;
  reason?: string;            // For permission_denial
}
```

### 2. Create Stream Emitter

Create `src/streaming/emitter.ts`:

```typescript
import { Response } from 'express';
import { StreamEvent } from './protocol';

export class StreamEmitter {
  private listeners: Set<Response> = new Set();

  addClient(res: Response): void {
    this.listeners.add(res);
    res.on('close', () => this.listeners.delete(res));
  }

  emit(event: StreamEvent): void {
    const data = JSON.stringify(event);
    for (const res of this.listeners) {
      res.write(`event: ${event.type}\ndata: ${data}\n\n`);
    }
  }

  emitStart(sessionId: string, toolName: string): void {
    this.emit({
      type: 'message_start',
      sessionId,
      toolName,
      timestamp: new Date().toISOString(),
    });
  }

  emitMatch(sessionId: string, toolName: string, tier: string, category: string): void {
    this.emit({
      type: 'tool_match',
      sessionId,
      toolName,
      tier,
      category,
      timestamp: new Date().toISOString(),
    });
  }

  emitDelta(sessionId: string, text: string, progress?: number): void {
    this.emit({
      type: 'message_delta',
      sessionId,
      text,
      progress,
      timestamp: new Date().toISOString(),
    });
  }

  emitStop(sessionId: string, usage: { inputTokens: number; outputTokens: number }, stopReason: string): void {
    this.emit({
      type: 'message_stop',
      sessionId,
      usage,
      stopReason,
      timestamp: new Date().toISOString(),
    });
  }

  emitDenial(sessionId: string, toolName: string, reason: string): void {
    this.emit({
      type: 'permission_denial',
      sessionId,
      toolName,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  clientCount(): number {
    return this.listeners.size;
  }
}
```

### 3. Wire into Handler

Modify `src/mcp/handler.ts` to:
- Accept a StreamEmitter instance
- Emit `message_start` when a tool call begins
- Emit `tool_match` when the tool is resolved from registry
- Emit `message_delta` with tool output
- Emit `message_stop` with usage and stop reason
- Emit `permission_denial` when a tool is blocked

### 4. SSE Endpoint

Add SSE endpoint in `src/server.ts` (alongside existing /mcp/sse):
- `GET /events/stream` — dedicated event stream for tool lifecycle events
- Sets `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`

## Acceptance Criteria

```gherkin
Given a client connected to /events/stream
When sf_build is called via MCP
Then the client receives events in order: message_start → tool_match → message_delta → message_stop

Given a denied tool call
When permission check fails
Then the client receives a permission_denial event with the reason

Given message_stop event
When inspected
Then it contains usage (inputTokens, outputTokens) and stopReason

Given no SSE clients connected
When events are emitted
Then no errors occur (fire-and-forget)
```

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `src/streaming/protocol.ts` | Event type definitions |
| CREATE | `src/streaming/emitter.ts` | SSE event emitter |
| CREATE | `src/streaming/index.ts` | Public exports |
| MODIFY | `src/mcp/handler.ts` | Emit events during tool lifecycle |
| MODIFY | `src/server.ts` | Add /events/stream SSE endpoint |
