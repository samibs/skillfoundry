// Agent Message Bus — in-process typed publish/subscribe system for cross-agent communication.
// Provides topic-based routing, wildcard broadcast, request/response correlation,
// message history with ring-buffer, and a middleware chain.

import { randomUUID } from 'node:crypto';
import type { AgentMessage, MessageType } from '../types.js';
import { getLogger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Handler function invoked when a subscribed message arrives.
 * @param message - The full message envelope delivered to this subscriber.
 */
export type SubscriberFn = (message: AgentMessage) => void;

/**
 * Calling this function removes the subscriber from the bus.
 */
export type UnsubscribeFn = () => void;

/**
 * Middleware function executed before any subscribers receive a message.
 * Call `next()` to allow the message to proceed. Returning without calling
 * `next()` drops the message silently.
 *
 * @param message - The message being dispatched. May be mutated before passing to next.
 * @param next - Continue the middleware chain and deliver to subscribers.
 */
export type MiddlewareFn = (message: AgentMessage, next: () => void) => void;

/**
 * Thrown by `request()` when no correlated response arrives within the timeout window.
 */
export class TimeoutError extends Error {
  /** The correlationId of the request that timed out. */
  readonly correlationId: string;

  constructor(correlationId: string, timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms (correlationId: ${correlationId})`);
    this.name = 'TimeoutError';
    this.correlationId = correlationId;
  }
}

/**
 * Filter options for `getHistory()`.
 */
export interface HistoryFilter {
  /** Return only messages with this MessageType. */
  type?: MessageType;
  /** Return only messages sent by this agent ID. */
  sender?: string;
  /** Return only messages with this correlationId. */
  correlationId?: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface SubscriberEntry {
  id: string;
  topic: string;
  handler: SubscriberFn;
  once: boolean;
}

// ---------------------------------------------------------------------------
// AgentMessageBus
// ---------------------------------------------------------------------------

/**
 * In-process typed publish/subscribe message bus for cross-agent communication.
 *
 * Features:
 * - Topic-based routing by `MessageType`
 * - Wildcard `'*'` topic subscribes to every message type
 * - Recipient filtering: messages with a specific `recipient` are delivered only to
 *   subscribers whose `topic` matches and who are registered with that agent's ID,
 *   OR to subscribers registered on `'*'` (wildcard topic)
 * - `request()` for correlated request/response with timeout
 * - Ring-buffer history (configurable max size, default 1000)
 * - Middleware chain for logging, filtering, or metrics
 * - Singleton `AgentMessageBus.global()` for the current process; constructor
 *   creates independent instances for isolated testing
 *
 * @example
 * ```typescript
 * const bus = new AgentMessageBus();
 *
 * const unsub = bus.subscribe('task:delegate', (msg) => {
 *   console.log('Received task', msg.payload);
 * });
 *
 * bus.publish({
 *   id: randomUUID(),
 *   sender: 'orchestrator',
 *   recipient: '*',
 *   type: 'task:delegate',
 *   payload: { task: 'write tests' },
 *   correlationId: randomUUID(),
 *   timestamp: Date.now(),
 * });
 *
 * unsub(); // remove subscriber
 * ```
 */
export class AgentMessageBus {
  private subscribers: Map<string, SubscriberEntry[]> = new Map();
  private history: AgentMessage[] = [];
  private middleware: MiddlewareFn[] = [];
  private readonly maxHistorySize: number;

  // Singleton instance for the current process
  private static _global: AgentMessageBus | null = null;

  /**
   * Create a new AgentMessageBus instance.
   *
   * @param maxHistorySize - Maximum number of messages to retain in the ring buffer. Defaults to 1000.
   */
  constructor(maxHistorySize = 1000) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Returns the process-level singleton AgentMessageBus.
   * All agents in the same process share this bus by default.
   */
  static global(): AgentMessageBus {
    if (!AgentMessageBus._global) {
      AgentMessageBus._global = new AgentMessageBus();
      // Install structured logging middleware on the global instance
      AgentMessageBus._global.use((message, next) => {
        const log = getLogger();
        log.debug('message-bus', 'message_dispatched', {
          id: message.id,
          type: message.type,
          sender: message.sender,
          recipient: message.recipient,
          correlationId: message.correlationId,
          timestamp: message.timestamp,
        });
        next();
      });
    }
    return AgentMessageBus._global;
  }

  // ---------------------------------------------------------------------------
  // Middleware
  // ---------------------------------------------------------------------------

  /**
   * Register a middleware function that runs before subscribers receive each message.
   * Middleware is executed in registration order. Call `next()` to continue the chain.
   * If `next()` is not called, the message is dropped.
   *
   * @param fn - The middleware function to register.
   */
  use(fn: MiddlewareFn): void {
    this.middleware.push(fn);
  }

  // ---------------------------------------------------------------------------
  // Subscribe
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to messages of a given topic (MessageType or `'*'` for all types).
   *
   * For direct-addressed messages (recipient !== '*'), the handler is only invoked
   * if the topic matches the message type.
   *
   * @param topic - A `MessageType` string or `'*'` to receive all message types.
   * @param handler - The function called when a matching message is dispatched.
   * @returns An unsubscribe function. Call it to remove the listener.
   */
  subscribe(topic: string, handler: SubscriberFn): UnsubscribeFn {
    return this.addSubscriber(topic, handler, false);
  }

  /**
   * Subscribe to a single message of a given topic, then auto-unsubscribe.
   *
   * @param topic - A `MessageType` string or `'*'` to receive all message types.
   * @param handler - The function called once when a matching message is dispatched.
   * @returns An unsubscribe function to cancel before the message arrives.
   */
  subscribeOnce(topic: string, handler: SubscriberFn): UnsubscribeFn {
    return this.addSubscriber(topic, handler, true);
  }

  // ---------------------------------------------------------------------------
  // Publish
  // ---------------------------------------------------------------------------

  /**
   * Publish a message envelope to the bus.
   *
   * Routing rules:
   * - Middleware chain runs first. If any middleware drops the message (skips `next()`), delivery stops.
   * - The message is appended to the history ring buffer before delivery.
   * - Subscribers registered on the message's `type` are candidates for delivery.
   * - Subscribers registered on `'*'` (wildcard) are always candidates.
   * - For broadcast messages (`recipient === '*'`): all candidates receive the message.
   * - For direct messages (`recipient !== '*'`): only candidates whose `topic` is `'*'` OR
   *   whose associated recipient filter matches receive the message. Because subscribers are
   *   topic-keyed (not agent-keyed), all type-matching subscribers receive direct messages
   *   unless filtered by middleware. This is intentional — agents filter by checking
   *   `message.recipient` in their handler.
   *
   * @param message - A fully populated AgentMessage envelope.
   */
  publish(message: AgentMessage): void {
    this.runMiddleware(message, 0, () => {
      this.appendHistory(message);
      this.deliver(message);
    });
  }

  // ---------------------------------------------------------------------------
  // Request / Response
  // ---------------------------------------------------------------------------

  /**
   * Publish a message and wait for a correlated response.
   *
   * The method waits for any published message whose `correlationId` matches the
   * request's `correlationId` (excluding the original request itself). If no response
   * arrives within `timeoutMs`, a `TimeoutError` is thrown.
   *
   * @param message - The request message to publish. Must have a unique `correlationId`.
   * @param timeoutMs - Maximum wait time in milliseconds. Defaults to 5000.
   * @returns A Promise that resolves with the correlated response message.
   * @throws TimeoutError if no response arrives within `timeoutMs`.
   *
   * @example
   * ```typescript
   * const response = await bus.request({
   *   id: randomUUID(),
   *   sender: 'orchestrator',
   *   recipient: 'coder-001',
   *   type: 'task:delegate',
   *   payload: { task: 'implement login' },
   *   correlationId: 'req-abc-123',
   *   timestamp: Date.now(),
   * }, 3000);
   * ```
   */
  request(message: AgentMessage, timeoutMs = 5000): Promise<AgentMessage> {
    return new Promise<AgentMessage>((resolve, reject) => {
      let resolved = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      // Subscribe to ALL message types using wildcard so we catch the response
      // regardless of its type. The response is identified by correlationId.
      const unsub = this.subscribe('*', (incoming) => {
        // Skip the outbound request itself
        if (incoming.id === message.id) return;
        if (incoming.correlationId === message.correlationId) {
          if (resolved) return;
          resolved = true;
          if (timer !== null) clearTimeout(timer);
          unsub();
          resolve(incoming);
        }
      });

      timer = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        unsub();
        reject(new TimeoutError(message.correlationId, timeoutMs));
      }, timeoutMs);

      // Publish after setting up the listener to avoid race conditions
      this.publish(message);
    });
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  /**
   * Retrieve messages from the ring buffer, optionally filtered.
   *
   * @param filter - Optional filter criteria. Multiple criteria are AND-ed.
   * @returns Messages in chronological order (oldest first).
   */
  getHistory(filter?: HistoryFilter): AgentMessage[] {
    let result = [...this.history];

    if (filter?.type !== undefined) {
      const t = filter.type;
      result = result.filter((m) => m.type === t);
    }
    if (filter?.sender !== undefined) {
      const s = filter.sender;
      result = result.filter((m) => m.sender === s);
    }
    if (filter?.correlationId !== undefined) {
      const c = filter.correlationId;
      result = result.filter((m) => m.correlationId === c);
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  /**
   * Reset the bus to a clean state.
   * Removes all subscribers, clears history, and removes all middleware.
   * Intended for test isolation — do NOT call in production code.
   */
  clear(): void {
    this.subscribers.clear();
    this.history = [];
    this.middleware = [];
  }

  // ---------------------------------------------------------------------------
  // Helpers — Message construction
  // ---------------------------------------------------------------------------

  /**
   * Build a well-formed AgentMessage envelope. Convenience helper for agents
   * that want to avoid manually populating `id` and `timestamp`.
   *
   * @param sender - ID of the sending agent.
   * @param recipient - Target agent ID or '*' for broadcast.
   * @param type - The MessageType for topic routing.
   * @param payload - Arbitrary structured payload.
   * @param correlationId - Optional. Generated if not supplied.
   * @returns A populated AgentMessage ready for `publish()`.
   */
  static buildMessage(
    sender: string,
    recipient: string,
    type: MessageType,
    payload: Record<string, unknown>,
    correlationId?: string,
  ): AgentMessage {
    return {
      id: randomUUID(),
      sender,
      recipient,
      type,
      payload,
      correlationId: correlationId ?? randomUUID(),
      timestamp: Date.now(),
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private addSubscriber(topic: string, handler: SubscriberFn, once: boolean): UnsubscribeFn {
    const entry: SubscriberEntry = {
      id: randomUUID(),
      topic,
      handler,
      once,
    };

    const existing = this.subscribers.get(topic) ?? [];
    existing.push(entry);
    this.subscribers.set(topic, existing);

    return () => {
      const current = this.subscribers.get(topic) ?? [];
      this.subscribers.set(
        topic,
        current.filter((e) => e.id !== entry.id),
      );
    };
  }

  /**
   * Execute the middleware chain. When all middleware have called `next()`, invoke `done`.
   */
  private runMiddleware(message: AgentMessage, index: number, done: () => void): void {
    if (index >= this.middleware.length) {
      done();
      return;
    }
    const fn = this.middleware[index];
    fn(message, () => this.runMiddleware(message, index + 1, done));
  }

  /**
   * Append a message to the history ring buffer, evicting the oldest entry when
   * the buffer is at capacity.
   */
  private appendHistory(message: AgentMessage): void {
    this.history.push(message);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Deliver a message to matching subscribers.
   *
   * Delivery logic:
   * 1. Collect all subscribers registered on the message's exact `type`.
   * 2. Collect all subscribers registered on `'*'` (wildcard).
   * 3. Deduplicate by subscriber ID.
   * 4. Invoke each handler. `once` subscribers are removed after first invocation.
   * 5. Handler errors are caught and logged — they never interrupt delivery.
   */
  private deliver(message: AgentMessage): void {
    const typeSubs = this.subscribers.get(message.type) ?? [];
    const wildcardSubs = this.subscribers.get('*') ?? [];

    // Deduplicate: a subscriber registered on '*' should not be called twice
    // if it also registered on a specific type. Guard by subscriber entry ID.
    const seen = new Set<string>();
    const candidates: SubscriberEntry[] = [];

    for (const entry of [...typeSubs, ...wildcardSubs]) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        candidates.push(entry);
      }
    }

    const log = getLogger();

    for (const entry of candidates) {
      // Remove `once` subscribers before invoking (prevents double-call on re-entrant publish)
      if (entry.once) {
        const current = this.subscribers.get(entry.topic) ?? [];
        this.subscribers.set(
          entry.topic,
          current.filter((e) => e.id !== entry.id),
        );
      }

      try {
        entry.handler(message);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        log.warn('message-bus', 'subscriber_error', {
          subscriberId: entry.id,
          topic: entry.topic,
          messageId: message.id,
          error,
        });
      }
    }
  }
}
