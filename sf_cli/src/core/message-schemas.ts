// Message Schemas — shared JSON-Schema types and the default contract registry for
// agent handoffs (AgentOS PRD STORY-004; OQ-3 authoring decision).
//
// Shared types (Severity, Finding, FileRef) live here as the single source of truth so
// many agents reference one definition rather than drifting copies. The default
// contracts are intentionally PERMISSIVE (required-fields-only, additionalProperties
// allowed): per the PRD risk table we "start permissive and tighten with telemetry",
// so installing them cannot reject a legitimate in-flight message.
//
// This module does NOT auto-install on the global bus — that is an opt-in, flag-gated
// rollout decision (`installMessageContracts`). Wiring it into the live runtime with
// tightened per-recipient contracts is the follow-on to this story.

import type { MessageType } from '../types.js';
import {
  MessageContractRegistry,
  createContractMiddleware,
  type ContractMiddlewareOptions,
} from './message-contracts.js';
import type { AgentMessageBus } from './agent-message-bus.js';

// ── Shared reusable type schemas (single source of truth) ──────────────────

/** Severity levels used across security/quality findings. */
export const SEVERITY_SCHEMA = {
  type: 'string',
  enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
} as const;

/** A reference to a file + optional content hash (refs-not-blobs, FR-002). */
export const FILE_REF_SCHEMA = {
  type: 'object',
  required: ['file'],
  properties: {
    file: { type: 'string' },
    hash: { type: 'string' },
  },
  additionalProperties: true,
} as const;

/** A single finding emitted by an analysis agent. Strict — reused by opt-in contracts. */
export const FINDING_SCHEMA = {
  type: 'object',
  required: ['severity', 'file'],
  properties: {
    severity: SEVERITY_SCHEMA,
    file: { type: 'string' },
    line: { type: 'integer' },
    fix_suggestion: { type: 'string' },
  },
  additionalProperties: true,
} as const;

// ── Default per-MessageType contracts (permissive; safe to install) ────────

/** A contract entry: a schema for a MessageType, optionally scoped to a recipient. */
export interface ContractEntry {
  type: MessageType;
  schema: Record<string, unknown>;
  recipient?: string;
}

const OBJECT_PAYLOAD = { type: 'object', additionalProperties: true } as const;

/**
 * Permissive baseline contracts for every MessageType. Each only asserts the payload
 * is an object — enough to reject a stray string/narrative handoff, without rejecting
 * any structured payload the current system sends.
 */
export const DEFAULT_MESSAGE_CONTRACTS: ContractEntry[] = [
  { type: 'task:delegate', schema: { ...OBJECT_PAYLOAD } },
  { type: 'task:cancel', schema: { ...OBJECT_PAYLOAD } },
  { type: 'result:complete', schema: { ...OBJECT_PAYLOAD } },
  { type: 'result:error', schema: { ...OBJECT_PAYLOAD } },
  { type: 'status:heartbeat', schema: { ...OBJECT_PAYLOAD } },
  { type: 'status:request', schema: { ...OBJECT_PAYLOAD } },
  { type: 'memory:store', schema: { ...OBJECT_PAYLOAD } },
  { type: 'memory:query', schema: { ...OBJECT_PAYLOAD } },
];

/**
 * Build a registry pre-loaded with the default permissive contracts. Callers may
 * register stricter per-recipient contracts (e.g. using {@link FINDING_SCHEMA}) on the
 * returned registry before installing it.
 */
export function buildDefaultRegistry(
  extra: ContractEntry[] = [],
): MessageContractRegistry {
  const registry = new MessageContractRegistry();
  for (const c of [...DEFAULT_MESSAGE_CONTRACTS, ...extra]) {
    registry.register(c.type, c.schema, c.recipient);
  }
  return registry;
}

/**
 * Install contract enforcement on a bus (opt-in). Returns the registry so callers can
 * inspect or extend it. Defaults to the permissive baseline.
 *
 * @param bus - The message bus to guard.
 * @param registry - A registry to use (defaults to the baseline registry).
 * @param options - Reject-handling options forwarded to the middleware.
 */
export function installMessageContracts(
  bus: AgentMessageBus,
  registry: MessageContractRegistry = buildDefaultRegistry(),
  options: ContractMiddlewareOptions = {},
): MessageContractRegistry {
  bus.use(createContractMiddleware(registry, options));
  return registry;
}

/** Bus contract enforcement modes (flag-gated rollout). */
export type ContractMode = 'off' | 'permissive' | 'strict';

/**
 * Resolve the effective contract mode: the `SF_BUS_CONTRACTS` env var overrides the
 * configured mode when set to a valid value (useful for staged rollout / testing).
 */
export function resolveContractMode(configured: ContractMode | undefined): ContractMode {
  const env = process.env.SF_BUS_CONTRACTS;
  if (env === 'off' || env === 'permissive' || env === 'strict') return env;
  return configured ?? 'off';
}

/**
 * Install bus contract enforcement per the resolved mode. Returns the registry when
 * enforcement is active, or `null` for `off`. `strict` is fail-closed: handoffs with no
 * registered contract are rejected.
 *
 * @param bus - The message bus to guard (typically `AgentMessageBus.global()`).
 * @param configured - Mode from config; may be overridden by `SF_BUS_CONTRACTS`.
 * @param options - Reject-handling options (onReject) forwarded to the middleware.
 */
export function installContractsForMode(
  bus: AgentMessageBus,
  configured: ContractMode | undefined,
  options: Omit<ContractMiddlewareOptions, 'failClosed'> = {},
): MessageContractRegistry | null {
  const mode = resolveContractMode(configured);
  if (mode === 'off') return null;
  return installMessageContracts(bus, buildDefaultRegistry(), {
    ...options,
    failClosed: mode === 'strict',
  });
}
