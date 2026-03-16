import type { AgentMessage, MessageType } from '../types.js';
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
export declare class TimeoutError extends Error {
    /** The correlationId of the request that timed out. */
    readonly correlationId: string;
    constructor(correlationId: string, timeoutMs: number);
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
export declare class AgentMessageBus {
    private subscribers;
    private history;
    private middleware;
    private readonly maxHistorySize;
    private static _global;
    /**
     * Create a new AgentMessageBus instance.
     *
     * @param maxHistorySize - Maximum number of messages to retain in the ring buffer. Defaults to 1000.
     */
    constructor(maxHistorySize?: number);
    /**
     * Returns the process-level singleton AgentMessageBus.
     * All agents in the same process share this bus by default.
     */
    static global(): AgentMessageBus;
    /**
     * Register a middleware function that runs before subscribers receive each message.
     * Middleware is executed in registration order. Call `next()` to continue the chain.
     * If `next()` is not called, the message is dropped.
     *
     * @param fn - The middleware function to register.
     */
    use(fn: MiddlewareFn): void;
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
    subscribe(topic: string, handler: SubscriberFn): UnsubscribeFn;
    /**
     * Subscribe to a single message of a given topic, then auto-unsubscribe.
     *
     * @param topic - A `MessageType` string or `'*'` to receive all message types.
     * @param handler - The function called once when a matching message is dispatched.
     * @returns An unsubscribe function to cancel before the message arrives.
     */
    subscribeOnce(topic: string, handler: SubscriberFn): UnsubscribeFn;
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
    publish(message: AgentMessage): void;
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
    request(message: AgentMessage, timeoutMs?: number): Promise<AgentMessage>;
    /**
     * Retrieve messages from the ring buffer, optionally filtered.
     *
     * @param filter - Optional filter criteria. Multiple criteria are AND-ed.
     * @returns Messages in chronological order (oldest first).
     */
    getHistory(filter?: HistoryFilter): AgentMessage[];
    /**
     * Reset the bus to a clean state.
     * Removes all subscribers, clears history, and removes all middleware.
     * Intended for test isolation — do NOT call in production code.
     */
    clear(): void;
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
    static buildMessage(sender: string, recipient: string, type: MessageType, payload: Record<string, unknown>, correlationId?: string): AgentMessage;
    private addSubscriber;
    /**
     * Execute the middleware chain. When all middleware have called `next()`, invoke `done`.
     */
    private runMiddleware;
    /**
     * Append a message to the history ring buffer, evicting the oldest entry when
     * the buffer is at capacity.
     */
    private appendHistory;
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
    private deliver;
}
