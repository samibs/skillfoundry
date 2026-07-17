import type { AgentMessage, MessageType } from '../types.js';
import type { MiddlewareFn } from './agent-message-bus.js';
/** Result of validating one message against its registered contract. */
export interface ValidationResult {
    /** True if valid OR if no contract is registered for this (type, recipient). */
    valid: boolean;
    /** True only when a contract existed and was applied. */
    enforced: boolean;
    /** Human-readable validation errors (empty when valid). */
    errors: string[];
}
export interface ContractMiddlewareOptions {
    /** Invoked when a message is rejected, for custom handling (metrics, dead-letter). */
    onReject?: (message: AgentMessage, errors: string[]) => void;
    /**
     * Fail-closed mode (strict rollout): reject a message that has NO registered
     * contract instead of letting it pass through unenforced. Default false.
     */
    failClosed?: boolean;
}
/**
 * Compiles and stores JSON Schemas for agent-to-agent message payloads, keyed by
 * message type and recipient. A recipient-specific contract takes precedence over a
 * wildcard one.
 */
export declare class MessageContractRegistry {
    private readonly ajv;
    private readonly validators;
    private static key;
    /**
     * Register a payload schema for a message `type`, optionally scoped to a specific
     * `recipient` (defaults to all recipients). Throws if the schema fails to compile,
     * surfacing malformed contracts at registration time rather than at delivery.
     *
     * @param type - The MessageType this contract applies to.
     * @param schema - JSON Schema validated against `message.payload`.
     * @param recipient - Recipient agent id, or '*' for any (default).
     */
    register(type: MessageType, schema: Record<string, unknown>, recipient?: string): void;
    /** Whether any contract (specific or wildcard) is registered for this message. */
    has(type: MessageType, recipient: string): boolean;
    /** Resolve the most specific validator: exact recipient first, then wildcard. */
    private resolve;
    /**
     * Validate a message's payload against its registered contract. When no contract is
     * registered the message is considered valid but not enforced (FR-008).
     */
    validate(message: AgentMessage): ValidationResult;
}
/**
 * Build a bus middleware that enforces registered message contracts. Install with
 * `bus.use(createContractMiddleware(registry))`. Invalid messages are dropped (not
 * delivered) and logged; valid or unenforced messages proceed via `next()`.
 */
export declare function createContractMiddleware(registry: MessageContractRegistry, options?: ContractMiddlewareOptions): MiddlewareFn;
