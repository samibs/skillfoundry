import type { MessageType } from '../types.js';
import { MessageContractRegistry, type ContractMiddlewareOptions } from './message-contracts.js';
import type { AgentMessageBus } from './agent-message-bus.js';
/** Severity levels used across security/quality findings. */
export declare const SEVERITY_SCHEMA: {
    readonly type: "string";
    readonly enum: readonly ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
};
/** A reference to a file + optional content hash (refs-not-blobs, FR-002). */
export declare const FILE_REF_SCHEMA: {
    readonly type: "object";
    readonly required: readonly ["file"];
    readonly properties: {
        readonly file: {
            readonly type: "string";
        };
        readonly hash: {
            readonly type: "string";
        };
    };
    readonly additionalProperties: true;
};
/** A single finding emitted by an analysis agent. Strict — reused by opt-in contracts. */
export declare const FINDING_SCHEMA: {
    readonly type: "object";
    readonly required: readonly ["severity", "file"];
    readonly properties: {
        readonly severity: {
            readonly type: "string";
            readonly enum: readonly ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
        };
        readonly file: {
            readonly type: "string";
        };
        readonly line: {
            readonly type: "integer";
        };
        readonly fix_suggestion: {
            readonly type: "string";
        };
    };
    readonly additionalProperties: true;
};
/** A contract entry: a schema for a MessageType, optionally scoped to a recipient. */
export interface ContractEntry {
    type: MessageType;
    schema: Record<string, unknown>;
    recipient?: string;
}
/**
 * Permissive baseline contracts for every MessageType. Each only asserts the payload
 * is an object — enough to reject a stray string/narrative handoff, without rejecting
 * any structured payload the current system sends.
 */
export declare const DEFAULT_MESSAGE_CONTRACTS: ContractEntry[];
/**
 * Build a registry pre-loaded with the default permissive contracts. Callers may
 * register stricter per-recipient contracts (e.g. using {@link FINDING_SCHEMA}) on the
 * returned registry before installing it.
 */
export declare function buildDefaultRegistry(extra?: ContractEntry[]): MessageContractRegistry;
/**
 * Install contract enforcement on a bus (opt-in). Returns the registry so callers can
 * inspect or extend it. Defaults to the permissive baseline.
 *
 * @param bus - The message bus to guard.
 * @param registry - A registry to use (defaults to the baseline registry).
 * @param options - Reject-handling options forwarded to the middleware.
 */
export declare function installMessageContracts(bus: AgentMessageBus, registry?: MessageContractRegistry, options?: ContractMiddlewareOptions): MessageContractRegistry;
