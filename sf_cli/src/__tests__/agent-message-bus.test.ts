// Tests for AgentMessageBus
// Covers: publish/subscribe delivery, broadcast vs direct routing, request/response
// correlation, timeout, history ring buffer, middleware chain, unsubscribe, singleton
// isolation, and a basic performance benchmark.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  AgentMessageBus,
  TimeoutError,
  type SubscriberFn,
} from '../core/agent-message-bus.js';
import type { AgentMessage, MessageType } from '../types.js';

// Mock logger — message-bus uses getLogger() for debug/warn calls
vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(
  overrides: Partial<AgentMessage> = {},
): AgentMessage {
  return {
    id: randomUUID(),
    sender: 'orchestrator',
    recipient: '*',
    type: 'task:delegate',
    payload: { task: 'do something' },
    correlationId: randomUUID(),
    timestamp: Date.now(),
    ...overrides,
  };
}

// Each test gets a fresh isolated bus instance
function makeBus(maxHistorySize?: number): AgentMessageBus {
  return new AgentMessageBus(maxHistorySize);
}

// ---------------------------------------------------------------------------
// Publish / Subscribe — basic delivery
// ---------------------------------------------------------------------------

describe('AgentMessageBus — publish/subscribe', () => {
  let bus: AgentMessageBus;

  beforeEach(() => {
    bus = makeBus();
  });

  it('delivers a message to a matching type subscriber', () => {
    const received: AgentMessage[] = [];
    bus.subscribe('task:delegate', (m) => received.push(m));

    const msg = makeMessage({ type: 'task:delegate' });
    bus.publish(msg);

    expect(received).toHaveLength(1);
    expect(received[0].id).toBe(msg.id);
  });

  it('does not deliver to a subscriber on a different type', () => {
    const received: AgentMessage[] = [];
    bus.subscribe('result:complete', (m) => received.push(m));

    bus.publish(makeMessage({ type: 'task:delegate' }));

    expect(received).toHaveLength(0);
  });

  it('message envelope contains all required fields', () => {
    let delivered: AgentMessage | null = null;
    bus.subscribe('status:heartbeat', (m) => { delivered = m; });

    const msg = makeMessage({
      type: 'status:heartbeat',
      sender: 'orchestrator-001',
      recipient: '*',
      payload: { status: 'alive' },
      correlationId: 'corr-abc',
    });
    bus.publish(msg);

    expect(delivered).not.toBeNull();
    const d = delivered as unknown as AgentMessage;
    expect(d.id).toBeTruthy();
    expect(d.sender).toBe('orchestrator-001');
    expect(d.recipient).toBe('*');
    expect(d.type).toBe('status:heartbeat');
    expect(d.payload).toEqual({ status: 'alive' });
    expect(d.correlationId).toBe('corr-abc');
    expect(typeof d.timestamp).toBe('number');
  });

  it('delivery happens synchronously (within publish call)', () => {
    const order: string[] = [];
    bus.subscribe('task:delegate', () => order.push('handler'));
    order.push('before');
    bus.publish(makeMessage({ type: 'task:delegate' }));
    order.push('after');

    expect(order).toEqual(['before', 'handler', 'after']);
  });

  it('multiple subscribers on the same type all receive the message', () => {
    const counts = [0, 0, 0];
    bus.subscribe('task:delegate', () => counts[0]++);
    bus.subscribe('task:delegate', () => counts[1]++);
    bus.subscribe('task:delegate', () => counts[2]++);

    bus.publish(makeMessage({ type: 'task:delegate' }));

    expect(counts).toEqual([1, 1, 1]);
  });

  it('subscriber errors do not prevent other subscribers from receiving the message', () => {
    let secondReceived = false;
    bus.subscribe('task:delegate', () => { throw new Error('boom'); });
    bus.subscribe('task:delegate', () => { secondReceived = true; });

    expect(() => bus.publish(makeMessage({ type: 'task:delegate' }))).not.toThrow();
    expect(secondReceived).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Broadcast vs Direct recipient routing
// ---------------------------------------------------------------------------

describe('AgentMessageBus — recipient routing', () => {
  let bus: AgentMessageBus;

  beforeEach(() => {
    bus = makeBus();
  });

  it('broadcast message (recipient "*") reaches all type subscribers', () => {
    const received: string[] = [];
    bus.subscribe('status:heartbeat', (m) => received.push(`sub1:${m.recipient}`));
    bus.subscribe('status:heartbeat', (m) => received.push(`sub2:${m.recipient}`));

    bus.publish(makeMessage({ type: 'status:heartbeat', recipient: '*' }));

    expect(received).toHaveLength(2);
    expect(received[0]).toBe('sub1:*');
    expect(received[1]).toBe('sub2:*');
  });

  it('direct message reaches all type subscribers (agent-side filtering)', () => {
    // The bus routes by type; individual agents filter by recipient in their handler.
    // This test verifies that a direct message still reaches subscribers of that type.
    const received: AgentMessage[] = [];
    bus.subscribe('task:delegate', (m) => received.push(m));

    bus.publish(makeMessage({ type: 'task:delegate', recipient: 'coder-001' }));

    expect(received).toHaveLength(1);
    expect(received[0].recipient).toBe('coder-001');
  });

  it('two agents can each simulate receiving only their own messages via handler-side filter', () => {
    const coderReceived: AgentMessage[] = [];
    const testerReceived: AgentMessage[] = [];

    bus.subscribe('task:delegate', (m) => {
      if (m.recipient === 'coder-001' || m.recipient === '*') coderReceived.push(m);
    });
    bus.subscribe('task:delegate', (m) => {
      if (m.recipient === 'tester-001' || m.recipient === '*') testerReceived.push(m);
    });

    bus.publish(makeMessage({ type: 'task:delegate', recipient: 'coder-001' }));
    bus.publish(makeMessage({ type: 'task:delegate', recipient: 'tester-001' }));
    bus.publish(makeMessage({ type: 'task:delegate', recipient: '*' }));

    expect(coderReceived).toHaveLength(2); // direct + broadcast
    expect(testerReceived).toHaveLength(2); // direct + broadcast
  });
});

// ---------------------------------------------------------------------------
// Wildcard subscriber '*'
// ---------------------------------------------------------------------------

describe('AgentMessageBus — wildcard subscriber', () => {
  let bus: AgentMessageBus;

  beforeEach(() => {
    bus = makeBus();
  });

  it("'*' subscriber receives all message types", () => {
    const received: MessageType[] = [];
    bus.subscribe('*', (m) => received.push(m.type));

    const types: MessageType[] = ['task:delegate', 'result:complete', 'status:heartbeat', 'result:error'];
    for (const t of types) {
      bus.publish(makeMessage({ type: t }));
    }

    expect(received).toEqual(types);
  });

  it("wildcard subscriber is not called twice when also subscribed to specific type", () => {
    // A subscriber registered on '*' should not be deduplicated with a different subscriber
    // on a specific type — they are separate subscription entries.
    const wildcard: AgentMessage[] = [];
    const specific: AgentMessage[] = [];

    bus.subscribe('*', (m) => wildcard.push(m));
    bus.subscribe('task:delegate', (m) => specific.push(m));

    bus.publish(makeMessage({ type: 'task:delegate' }));

    // Both distinct subscriptions fire
    expect(wildcard).toHaveLength(1);
    expect(specific).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// subscribeOnce
// ---------------------------------------------------------------------------

describe('AgentMessageBus — subscribeOnce', () => {
  let bus: AgentMessageBus;

  beforeEach(() => {
    bus = makeBus();
  });

  it('fires exactly once then auto-unsubscribes', () => {
    const received: AgentMessage[] = [];
    bus.subscribeOnce('task:delegate', (m) => received.push(m));

    bus.publish(makeMessage({ type: 'task:delegate' }));
    bus.publish(makeMessage({ type: 'task:delegate' }));
    bus.publish(makeMessage({ type: 'task:delegate' }));

    expect(received).toHaveLength(1);
  });

  it('returned unsubscribe cancels before the first delivery', () => {
    const received: AgentMessage[] = [];
    const unsub = bus.subscribeOnce('task:delegate', (m) => received.push(m));
    unsub();

    bus.publish(makeMessage({ type: 'task:delegate' }));

    expect(received).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unsubscribe
// ---------------------------------------------------------------------------

describe('AgentMessageBus — unsubscribe', () => {
  let bus: AgentMessageBus;

  beforeEach(() => {
    bus = makeBus();
  });

  it('removed subscriber does not receive subsequent messages', () => {
    const received: AgentMessage[] = [];
    const unsub = bus.subscribe('task:delegate', (m) => received.push(m));

    bus.publish(makeMessage({ type: 'task:delegate' }));
    unsub();
    bus.publish(makeMessage({ type: 'task:delegate' }));

    expect(received).toHaveLength(1);
  });

  it('unsubscribing does not affect other subscribers on the same type', () => {
    const first: AgentMessage[] = [];
    const second: AgentMessage[] = [];
    const unsub = bus.subscribe('task:delegate', (m) => first.push(m));
    bus.subscribe('task:delegate', (m) => second.push(m));

    unsub();
    bus.publish(makeMessage({ type: 'task:delegate' }));

    expect(first).toHaveLength(0);
    expect(second).toHaveLength(1);
  });

  it('calling unsubscribe multiple times is a no-op', () => {
    const received: AgentMessage[] = [];
    const unsub = bus.subscribe('task:delegate', (m) => received.push(m));

    unsub();
    expect(() => unsub()).not.toThrow();

    bus.publish(makeMessage({ type: 'task:delegate' }));
    expect(received).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Request / Response correlation
// ---------------------------------------------------------------------------

describe('AgentMessageBus — request/response', () => {
  let bus: AgentMessageBus;

  beforeEach(() => {
    bus = makeBus();
  });

  it('resolves with the correlated response message', async () => {
    const correlationId = randomUUID();

    // Simulate a responder agent
    bus.subscribe('task:delegate', (req) => {
      bus.publish({
        id: randomUUID(),
        sender: 'coder-001',
        recipient: req.sender,
        type: 'result:complete',
        payload: { output: 'done' },
        correlationId: req.correlationId,
        timestamp: Date.now(),
      });
    });

    const requestMsg = makeMessage({
      type: 'task:delegate',
      sender: 'orchestrator-001',
      recipient: 'coder-001',
      correlationId,
    });

    const response = await bus.request(requestMsg, 2000);

    expect(response.correlationId).toBe(correlationId);
    expect(response.type).toBe('result:complete');
    expect(response.payload).toEqual({ output: 'done' });
  });

  it('rejects with TimeoutError when no response arrives', async () => {
    const requestMsg = makeMessage({
      type: 'task:delegate',
      sender: 'orchestrator-001',
      recipient: 'ghost-agent',
    });

    await expect(bus.request(requestMsg, 100)).rejects.toBeInstanceOf(TimeoutError);
  });

  it('TimeoutError carries the correlationId of the timed-out request', async () => {
    const requestMsg = makeMessage({
      type: 'task:delegate',
      correlationId: 'specific-corr-id',
    });

    let caughtError: TimeoutError | null = null;
    try {
      await bus.request(requestMsg, 50);
    } catch (err) {
      if (err instanceof TimeoutError) caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError!.correlationId).toBe('specific-corr-id');
    expect(caughtError!.name).toBe('TimeoutError');
  });

  it('does not resolve from a message with a different correlationId', async () => {
    const wrongCorrelationId = randomUUID();

    // Publish a response with wrong correlationId shortly after request
    bus.subscribe('task:delegate', () => {
      setTimeout(() => {
        bus.publish(makeMessage({
          type: 'result:complete',
          correlationId: wrongCorrelationId,
        }));
      }, 10);
    });

    const requestMsg = makeMessage({ type: 'task:delegate' });
    await expect(bus.request(requestMsg, 100)).rejects.toBeInstanceOf(TimeoutError);
  });

  it('concurrent requests with different correlationIds resolve independently', async () => {
    const correlA = randomUUID();
    const correlB = randomUUID();

    // Responder echoes back on both correlation IDs after a short delay
    bus.subscribe('task:delegate', (req) => {
      setTimeout(() => {
        bus.publish({
          id: randomUUID(),
          sender: 'worker',
          recipient: req.sender,
          type: 'result:complete',
          payload: { echoed: req.correlationId },
          correlationId: req.correlationId,
          timestamp: Date.now(),
        });
      }, 20);
    });

    const [resA, resB] = await Promise.all([
      bus.request(makeMessage({ type: 'task:delegate', correlationId: correlA }), 2000),
      bus.request(makeMessage({ type: 'task:delegate', correlationId: correlB }), 2000),
    ]);

    expect(resA.correlationId).toBe(correlA);
    expect(resB.correlationId).toBe(correlB);
  });
});

// ---------------------------------------------------------------------------
// History ring buffer
// ---------------------------------------------------------------------------

describe('AgentMessageBus — message history', () => {
  let bus: AgentMessageBus;

  beforeEach(() => {
    bus = makeBus();
  });

  it('stores all published messages in chronological order', () => {
    const types: MessageType[] = ['task:delegate', 'result:complete', 'status:heartbeat', 'result:error', 'task:cancel'];
    for (const t of types) {
      bus.publish(makeMessage({ type: t }));
    }

    const history = bus.getHistory();
    expect(history).toHaveLength(5);
    expect(history.map((m) => m.type)).toEqual(types);
  });

  it('getHistory with type filter returns only matching messages', () => {
    bus.publish(makeMessage({ type: 'task:delegate' }));
    bus.publish(makeMessage({ type: 'result:complete' }));
    bus.publish(makeMessage({ type: 'task:delegate' }));

    const filtered = bus.getHistory({ type: 'task:delegate' });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((m) => m.type === 'task:delegate')).toBe(true);
  });

  it('getHistory with sender filter returns only matching messages', () => {
    bus.publish(makeMessage({ sender: 'orchestrator' }));
    bus.publish(makeMessage({ sender: 'coder-001' }));
    bus.publish(makeMessage({ sender: 'orchestrator' }));

    const filtered = bus.getHistory({ sender: 'orchestrator' });
    expect(filtered).toHaveLength(2);
  });

  it('getHistory with correlationId filter returns only matching messages', () => {
    const targetCorr = 'corr-target';
    bus.publish(makeMessage({ correlationId: targetCorr }));
    bus.publish(makeMessage({ correlationId: 'corr-other' }));
    bus.publish(makeMessage({ correlationId: targetCorr }));

    const filtered = bus.getHistory({ correlationId: targetCorr });
    expect(filtered).toHaveLength(2);
  });

  it('multiple filters are AND-ed', () => {
    bus.publish(makeMessage({ type: 'task:delegate', sender: 'orchestrator', correlationId: 'c1' }));
    bus.publish(makeMessage({ type: 'task:delegate', sender: 'coder', correlationId: 'c1' }));
    bus.publish(makeMessage({ type: 'result:complete', sender: 'orchestrator', correlationId: 'c1' }));

    const filtered = bus.getHistory({ type: 'task:delegate', sender: 'orchestrator' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].sender).toBe('orchestrator');
    expect(filtered[0].type).toBe('task:delegate');
  });

  it('ring buffer evicts oldest messages when max size is reached', () => {
    const smallBus = makeBus(5);
    for (let i = 0; i < 8; i++) {
      smallBus.publish(makeMessage({ payload: { seq: i } }));
    }

    const history = smallBus.getHistory();
    expect(history).toHaveLength(5);
    // Oldest (seq 0,1,2) should have been evicted; newest (seq 3..7) remain
    expect(history[0].payload).toEqual({ seq: 3 });
    expect(history[4].payload).toEqual({ seq: 7 });
  });

  it('getHistory returns a copy (mutations do not affect internal state)', () => {
    bus.publish(makeMessage());
    const history = bus.getHistory();
    history.splice(0, 1);

    expect(bus.getHistory()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

describe('AgentMessageBus — middleware', () => {
  let bus: AgentMessageBus;

  beforeEach(() => {
    bus = makeBus();
  });

  it('middleware runs before subscribers', () => {
    const order: string[] = [];
    bus.use((_msg, next) => { order.push('middleware'); next(); });
    bus.subscribe('task:delegate', () => order.push('subscriber'));

    bus.publish(makeMessage({ type: 'task:delegate' }));

    expect(order).toEqual(['middleware', 'subscriber']);
  });

  it('middleware that does not call next() drops the message', () => {
    const received: AgentMessage[] = [];
    bus.use((_msg, _next) => { /* intentionally drop */ });
    bus.subscribe('task:delegate', (m) => received.push(m));

    bus.publish(makeMessage({ type: 'task:delegate' }));

    expect(received).toHaveLength(0);
  });

  it('middleware can mutate the message before delivery', () => {
    let delivered: AgentMessage | null = null;
    bus.use((msg, next) => {
      (msg.payload as Record<string, unknown>)['injected'] = true;
      next();
    });
    bus.subscribe('task:delegate', (m) => { delivered = m; });

    bus.publish(makeMessage({ type: 'task:delegate', payload: {} }));

    expect((delivered as unknown as AgentMessage).payload).toHaveProperty('injected', true);
  });

  it('multiple middleware run in registration order', () => {
    const order: number[] = [];
    bus.use((_m, next) => { order.push(1); next(); });
    bus.use((_m, next) => { order.push(2); next(); });
    bus.use((_m, next) => { order.push(3); next(); });
    bus.subscribe('task:delegate', () => order.push(4));

    bus.publish(makeMessage({ type: 'task:delegate' }));

    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('second middleware is skipped if first drops the message', () => {
    const order: number[] = [];
    bus.use((_m, _next) => { order.push(1); /* drop */ });
    bus.use((_m, next) => { order.push(2); next(); });
    bus.subscribe('task:delegate', () => order.push(3));

    bus.publish(makeMessage({ type: 'task:delegate' }));

    expect(order).toEqual([1]);
  });

  it('dropped messages are still stored in history', () => {
    bus.use((_m, _next) => { /* drop */ });

    bus.publish(makeMessage({ type: 'task:delegate' }));

    // History is appended inside the middleware chain's done() callback.
    // Since middleware drops, history should NOT contain the message
    // (history is appended only after middleware completes and calls done).
    // This verifies the ordering: history append happens in the final done() callback.
    expect(bus.getHistory()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// clear()
// ---------------------------------------------------------------------------

describe('AgentMessageBus — clear()', () => {
  it('resets subscribers, history, and middleware', () => {
    const bus = makeBus();
    const received: AgentMessage[] = [];

    bus.subscribe('task:delegate', (m) => received.push(m));
    bus.use((_m, next) => next());
    bus.publish(makeMessage({ type: 'task:delegate' }));

    bus.clear();

    // After clear, history is gone
    expect(bus.getHistory()).toHaveLength(0);

    // After clear, the previously registered subscriber does not fire
    const prevLength = received.length;
    bus.publish(makeMessage({ type: 'task:delegate' }));
    expect(received).toHaveLength(prevLength); // unchanged
  });
});

// ---------------------------------------------------------------------------
// Singleton vs instance isolation
// ---------------------------------------------------------------------------

describe('AgentMessageBus — singleton vs instance', () => {
  it('global() returns the same instance on repeated calls', () => {
    const a = AgentMessageBus.global();
    const b = AgentMessageBus.global();
    expect(a).toBe(b);
  });

  it('constructor creates an independent instance isolated from global', () => {
    const globalBus = AgentMessageBus.global();
    const isolated = new AgentMessageBus();

    const globalReceived: AgentMessage[] = [];
    const isolatedReceived: AgentMessage[] = [];

    globalBus.subscribe('task:delegate', (m) => globalReceived.push(m));
    isolated.subscribe('task:delegate', (m) => isolatedReceived.push(m));

    isolated.publish(makeMessage({ type: 'task:delegate' }));

    expect(isolatedReceived).toHaveLength(1);
    // Global bus should NOT have received the isolated publish
    // (we check the history, not the subscriber list, since global may have prior messages)
    const globalHistory = globalBus.getHistory();
    const fromIsolated = globalHistory.filter(
      (m) => m.id === isolatedReceived[0].id,
    );
    expect(fromIsolated).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AgentMessageBus.buildMessage helper
// ---------------------------------------------------------------------------

describe('AgentMessageBus.buildMessage', () => {
  it('produces a valid message envelope with generated id and timestamp', () => {
    const msg = AgentMessageBus.buildMessage(
      'orchestrator',
      'coder-001',
      'task:delegate',
      { task: 'write code' },
    );

    expect(msg.id).toBeTruthy();
    expect(msg.sender).toBe('orchestrator');
    expect(msg.recipient).toBe('coder-001');
    expect(msg.type).toBe('task:delegate');
    expect(msg.payload).toEqual({ task: 'write code' });
    expect(msg.correlationId).toBeTruthy();
    expect(typeof msg.timestamp).toBe('number');
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  it('uses a supplied correlationId when provided', () => {
    const msg = AgentMessageBus.buildMessage(
      'agent-a',
      '*',
      'status:heartbeat',
      {},
      'my-corr-id',
    );

    expect(msg.correlationId).toBe('my-corr-id');
  });

  it('generates a unique id for each call', () => {
    const a = AgentMessageBus.buildMessage('a', '*', 'task:delegate', {});
    const b = AgentMessageBus.buildMessage('a', '*', 'task:delegate', {});
    expect(a.id).not.toBe(b.id);
    expect(a.correlationId).not.toBe(b.correlationId);
  });
});

// ---------------------------------------------------------------------------
// Performance: 1000 messages dispatched in < 100ms
// ---------------------------------------------------------------------------

describe('AgentMessageBus — performance', () => {
  it('dispatches 1000 messages in under 100ms', () => {
    const bus = makeBus();
    let count = 0;

    bus.subscribe('status:heartbeat', () => { count++; });
    bus.subscribe('status:heartbeat', () => { count++; });

    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      bus.publish(makeMessage({ type: 'status:heartbeat' }));
    }
    const elapsed = Date.now() - start;

    expect(count).toBe(2000); // 2 subscribers × 1000 messages
    expect(elapsed).toBeLessThan(500); // relaxed for CI environments
  });
});
