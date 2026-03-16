// Contract test helpers — lightweight runtime schema validation for agent pair contract tests.
// Replicates a subset of Zod's API surface without the zod dependency.
// Used exclusively in test files to validate message payload shapes between producer and consumer.

import { randomUUID } from 'node:crypto';
import type { AgentMessage, MessageType } from '../../../types.js';

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

/**
 * A parsed-success result carrying validated data.
 */
export interface ParseSuccess<T> {
  success: true;
  data: T;
}

/**
 * A parsed-failure result carrying a structured error.
 */
export interface ParseFailure {
  success: false;
  error: {
    /** Human-readable description of all validation failures. */
    format(): string;
    issues: Array<{ path: string[]; message: string }>;
  };
}

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

/**
 * A runtime-validatable schema type.
 */
export interface SchemaType<T> {
  safeParse(input: unknown): ParseResult<T>;
  parse(input: unknown): T;
}

// ---------------------------------------------------------------------------
// Validation error accumulator
// ---------------------------------------------------------------------------

class ValidationError {
  readonly issues: Array<{ path: string[]; message: string }> = [];

  add(path: string[], message: string): void {
    this.issues.push({ path, message });
  }

  format(): string {
    if (this.issues.length === 0) return 'No errors';
    return this.issues
      .map((i) => `  ${i.path.length > 0 ? i.path.join('.') + ': ' : ''}${i.message}`)
      .join('\n');
  }

  get hasErrors(): boolean {
    return this.issues.length > 0;
  }
}

// ---------------------------------------------------------------------------
// Schema builders
// ---------------------------------------------------------------------------

function makeSuccess<T>(data: T): ParseSuccess<T> {
  return { success: true, data };
}

function makeFailure(err: ValidationError): ParseFailure {
  return {
    success: false,
    error: {
      format: () => err.format(),
      issues: err.issues,
    },
  };
}

/**
 * Validates that input is a string.
 */
function zString(): SchemaType<string> {
  return {
    safeParse(input: unknown): ParseResult<string> {
      const err = new ValidationError();
      if (typeof input !== 'string') {
        err.add([], `Expected string, got ${typeof input}`);
        return makeFailure(err);
      }
      return makeSuccess(input);
    },
    parse(input: unknown): string {
      const r = this.safeParse(input);
      if (!r.success) throw new Error(`Schema validation failed:\n${(r as ParseFailure).error.format()}`);
      return (r as ParseSuccess<string>).data;
    },
  };
}

/**
 * Validates that input is a number.
 */
function zNumber(): SchemaType<number> {
  return {
    safeParse(input: unknown): ParseResult<number> {
      const err = new ValidationError();
      if (typeof input !== 'number') {
        err.add([], `Expected number, got ${typeof input}`);
        return makeFailure(err);
      }
      return makeSuccess(input);
    },
    parse(input: unknown): number {
      const r = this.safeParse(input);
      if (!r.success) throw new Error(`Schema validation failed:\n${(r as ParseFailure).error.format()}`);
      return (r as ParseSuccess<number>).data;
    },
  };
}

type EnumValues<T extends readonly string[]> = T[number];

/**
 * Validates that input is one of the given enum values.
 */
function zEnum<T extends readonly string[]>(values: T): SchemaType<EnumValues<T>> {
  return {
    safeParse(input: unknown): ParseResult<EnumValues<T>> {
      const err = new ValidationError();
      if (typeof input !== 'string' || !(values as readonly string[]).includes(input)) {
        err.add([], `Expected one of [${values.join(', ')}], got ${JSON.stringify(input)}`);
        return makeFailure(err);
      }
      return makeSuccess(input as EnumValues<T>);
    },
    parse(input: unknown): EnumValues<T> {
      const r = this.safeParse(input);
      if (!r.success) throw new Error(`Schema validation failed:\n${(r as ParseFailure).error.format()}`);
      return (r as ParseSuccess<EnumValues<T>>).data;
    },
  };
}

type InferSchema<T> = T extends SchemaType<infer U> ? U : never;
type ObjectShape = Record<string, SchemaType<unknown>>;
type InferObject<S extends ObjectShape> = { [K in keyof S]: InferSchema<S[K]> };

/**
 * Validates that input is a plain object whose required keys all pass their sub-schema.
 * Unknown additional keys are tolerated (forward compatibility).
 */
function zObject<S extends ObjectShape>(shape: S): SchemaType<InferObject<S>> {
  return {
    safeParse(input: unknown): ParseResult<InferObject<S>> {
      const err = new ValidationError();
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        err.add([], `Expected object, got ${input === null ? 'null' : typeof input}`);
        return makeFailure(err);
      }
      const obj = input as Record<string, unknown>;
      const result: Record<string, unknown> = {};

      for (const key of Object.keys(shape)) {
        const fieldSchema = shape[key];
        const fieldResult = fieldSchema.safeParse(obj[key]);
        if (!fieldResult.success) {
          const failure = fieldResult as ParseFailure;
          for (const issue of failure.error.issues) {
            err.add([key, ...issue.path], issue.message);
          }
          // Also add a field-level missing/invalid marker
          if (obj[key] === undefined) {
            err.add([key], 'Required field is missing');
          }
        } else {
          result[key] = (fieldResult as ParseSuccess<unknown>).data;
        }
      }

      if (err.hasErrors) return makeFailure(err);
      return makeSuccess(result as InferObject<S>);
    },
    parse(input: unknown): InferObject<S> {
      const r = this.safeParse(input);
      if (!r.success) throw new Error(`Schema validation failed:\n${(r as ParseFailure).error.format()}`);
      return (r as ParseSuccess<InferObject<S>>).data;
    },
  };
}

/**
 * Validates that input is an array where each element passes the given sub-schema.
 */
function zArray<T>(itemSchema: SchemaType<T>): SchemaType<T[]> {
  return {
    safeParse(input: unknown): ParseResult<T[]> {
      const err = new ValidationError();
      if (!Array.isArray(input)) {
        err.add([], `Expected array, got ${typeof input}`);
        return makeFailure(err);
      }
      const result: T[] = [];
      for (let i = 0; i < input.length; i++) {
        const itemResult = itemSchema.safeParse(input[i]);
        if (!itemResult.success) {
          const failure = itemResult as ParseFailure;
          for (const issue of failure.error.issues) {
            err.add([`[${i}]`, ...issue.path], issue.message);
          }
        } else {
          result.push((itemResult as ParseSuccess<T>).data);
        }
      }
      if (err.hasErrors) return makeFailure(err);
      return makeSuccess(result);
    },
    parse(input: unknown): T[] {
      const r = this.safeParse(input);
      if (!r.success) throw new Error(`Schema validation failed:\n${(r as ParseFailure).error.format()}`);
      return (r as ParseSuccess<T[]>).data;
    },
  };
}

/**
 * Wraps a schema to allow undefined values (optional field).
 */
function zOptional<T>(inner: SchemaType<T>): SchemaType<T | undefined> {
  return {
    safeParse(input: unknown): ParseResult<T | undefined> {
      if (input === undefined) return makeSuccess(undefined);
      return inner.safeParse(input) as ParseResult<T | undefined>;
    },
    parse(input: unknown): T | undefined {
      const r = this.safeParse(input);
      if (!r.success) throw new Error(`Schema validation failed:\n${(r as ParseFailure).error.format()}`);
      return (r as ParseSuccess<T | undefined>).data;
    },
  };
}

/**
 * Validates that input is a plain object (record) with unknown value types.
 */
function zRecord(): SchemaType<Record<string, unknown>> {
  return {
    safeParse(input: unknown): ParseResult<Record<string, unknown>> {
      const err = new ValidationError();
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        err.add([], `Expected record object, got ${input === null ? 'null' : typeof input}`);
        return makeFailure(err);
      }
      return makeSuccess(input as Record<string, unknown>);
    },
    parse(input: unknown): Record<string, unknown> {
      const r = this.safeParse(input);
      if (!r.success) throw new Error(`Schema validation failed:\n${(r as ParseFailure).error.format()}`);
      return (r as ParseSuccess<Record<string, unknown>>).data;
    },
  };
}

// ---------------------------------------------------------------------------
// Public z namespace — mirrors the Zod API used in the story spec
// ---------------------------------------------------------------------------

export const z = {
  string: zString,
  number: zNumber,
  enum: zEnum,
  object: zObject,
  array: zArray,
  optional: zOptional,
  record: zRecord,
};

// ---------------------------------------------------------------------------
// assertContractMatch — primary contract test utility
// ---------------------------------------------------------------------------

/**
 * Validates that `producerOutput` satisfies `consumerSchema`.
 * Throws a descriptive error if validation fails.
 *
 * @param producerOutput - The payload produced by the sending agent.
 * @param consumerSchema - The schema the receiving agent expects.
 * @param context - Human-readable name for the contract being checked (for error messages).
 * @returns The typed, validated data.
 */
export function assertContractMatch<T>(
  producerOutput: unknown,
  consumerSchema: SchemaType<T>,
  context: string,
): T {
  const result = consumerSchema.safeParse(producerOutput);
  if (!result.success) {
    throw new Error(
      `Contract violation (${context}):\n${(result as ParseFailure).error.format()}`,
    );
  }
  return (result as ParseSuccess<T>).data;
}

// ---------------------------------------------------------------------------
// Message envelope builder — used across all contract tests
// ---------------------------------------------------------------------------

/**
 * Build a well-formed AgentMessage envelope for contract tests.
 *
 * @param sender - ID of the producing agent.
 * @param recipient - ID of the receiving agent, or '*' for broadcast.
 * @param type - MessageType for routing.
 * @param payload - Payload to carry in the envelope.
 * @param correlationId - Optional; generated if omitted.
 */
export function buildTestMessage(
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
// AgentMessage envelope schema — shared across all contract tests
// ---------------------------------------------------------------------------

/**
 * Schema for the AgentMessage envelope fields (excluding typed payload).
 * Tests use this to verify that every message satisfies the bus contract.
 */
export const AgentMessageEnvelopeSchema = z.object({
  id: z.string(),
  sender: z.string(),
  recipient: z.string(),
  type: z.enum([
    'task:delegate',
    'task:cancel',
    'result:complete',
    'result:error',
    'status:heartbeat',
    'status:request',
    'memory:store',
    'memory:query',
  ] as const),
  payload: z.record(),
  correlationId: z.string(),
  timestamp: z.number(),
});
