// Message Contracts — schema-validated agent handoffs on the existing message bus
// (AgentOS PRD FR-004 / FR-008: genesis/2026-07-17-agentos-state-kernel.md).
//
// Downstream agents must never parse an upstream agent's narrative. This registry
// holds a JSON Schema per (message type, recipient) and exposes a bus middleware that
// validates each message's payload BEFORE delivery. An invalid payload is dropped
// (the middleware does not call next()) and logged — never delivered as-is.
//
// Adoption is incremental (FR-008): a message whose (type, recipient) has no
// registered schema passes through unenforced. Only declared contracts are enforced,
// so unconverted agents keep working while contracts are added one handoff at a time.

import { Ajv, type ValidateFunction, type ErrorObject } from 'ajv';
import type { AgentMessage, MessageType } from '../types.js';
import type { MiddlewareFn } from './agent-message-bus.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();

/** Recipient wildcard: a schema registered under '*' applies to any recipient. */
const ANY_RECIPIENT = '*';

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
export class MessageContractRegistry {
  private readonly ajv = new Ajv({ allErrors: true, strict: false });
  private readonly validators = new Map<string, ValidateFunction>();

  private static key(type: MessageType, recipient: string): string {
    return `${type}::${recipient}`;
  }

  /**
   * Register a payload schema for a message `type`, optionally scoped to a specific
   * `recipient` (defaults to all recipients). Throws if the schema fails to compile,
   * surfacing malformed contracts at registration time rather than at delivery.
   *
   * @param type - The MessageType this contract applies to.
   * @param schema - JSON Schema validated against `message.payload`.
   * @param recipient - Recipient agent id, or '*' for any (default).
   */
  register(
    type: MessageType,
    schema: Record<string, unknown>,
    recipient: string = ANY_RECIPIENT,
  ): void {
    const validate = this.ajv.compile(schema);
    this.validators.set(MessageContractRegistry.key(type, recipient), validate);
  }

  /** Whether any contract (specific or wildcard) is registered for this message. */
  has(type: MessageType, recipient: string): boolean {
    return this.resolve(type, recipient) !== undefined;
  }

  /** Resolve the most specific validator: exact recipient first, then wildcard. */
  private resolve(
    type: MessageType,
    recipient: string,
  ): ValidateFunction | undefined {
    return (
      this.validators.get(MessageContractRegistry.key(type, recipient)) ??
      this.validators.get(MessageContractRegistry.key(type, ANY_RECIPIENT))
    );
  }

  /**
   * Validate a message's payload against its registered contract. When no contract is
   * registered the message is considered valid but not enforced (FR-008).
   */
  validate(message: AgentMessage): ValidationResult {
    const validate = this.resolve(message.type, message.recipient);
    if (!validate) {
      return { valid: true, enforced: false, errors: [] };
    }
    const valid = validate(message.payload) as boolean;
    if (valid) {
      return { valid: true, enforced: true, errors: [] };
    }
    return {
      valid: false,
      enforced: true,
      errors: formatErrors(validate.errors),
    };
  }
}

/** Turn Ajv's error objects into concise, human-readable strings. */
function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) return ['payload failed schema validation'];
  return errors.map((e) => `payload${e.instancePath || ''} ${e.message ?? 'is invalid'}`.trim());
}

/**
 * Build a bus middleware that enforces registered message contracts. Install with
 * `bus.use(createContractMiddleware(registry))`. Invalid messages are dropped (not
 * delivered) and logged; valid or unenforced messages proceed via `next()`.
 */
export function createContractMiddleware(
  registry: MessageContractRegistry,
  options: ContractMiddlewareOptions = {},
): MiddlewareFn {
  return (message, next) => {
    const result = registry.validate(message);
    // Fail-closed (strict): an unenforced message (no registered contract) is rejected.
    const rejectUnenforced = options.failClosed === true && !result.enforced;
    if (result.valid && !rejectUnenforced) {
      next();
      return;
    }
    const errors = rejectUnenforced
      ? [`no registered contract for ${message.type} → ${message.recipient} (fail-closed)`]
      : result.errors;
    logger.warn('message-bus', 'contract_rejected', {
      type: message.type,
      sender: message.sender,
      recipient: message.recipient,
      correlationId: message.correlationId,
      failClosed: rejectUnenforced,
      errors,
    });
    options.onReject?.(message, errors);
    // Do NOT call next() — the message is dropped, never delivered as-is.
  };
}
