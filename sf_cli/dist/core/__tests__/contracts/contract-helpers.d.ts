import type { AgentMessage, MessageType } from '../../../types.js';
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
        issues: Array<{
            path: string[];
            message: string;
        }>;
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
/**
 * Validates that input is a string.
 */
declare function zString(): SchemaType<string>;
/**
 * Validates that input is a number.
 */
declare function zNumber(): SchemaType<number>;
type EnumValues<T extends readonly string[]> = T[number];
/**
 * Validates that input is one of the given enum values.
 */
declare function zEnum<T extends readonly string[]>(values: T): SchemaType<EnumValues<T>>;
type InferSchema<T> = T extends SchemaType<infer U> ? U : never;
type ObjectShape = Record<string, SchemaType<unknown>>;
type InferObject<S extends ObjectShape> = {
    [K in keyof S]: InferSchema<S[K]>;
};
/**
 * Validates that input is a plain object whose required keys all pass their sub-schema.
 * Unknown additional keys are tolerated (forward compatibility).
 */
declare function zObject<S extends ObjectShape>(shape: S): SchemaType<InferObject<S>>;
/**
 * Validates that input is an array where each element passes the given sub-schema.
 */
declare function zArray<T>(itemSchema: SchemaType<T>): SchemaType<T[]>;
/**
 * Wraps a schema to allow undefined values (optional field).
 */
declare function zOptional<T>(inner: SchemaType<T>): SchemaType<T | undefined>;
/**
 * Validates that input is a plain object (record) with unknown value types.
 */
declare function zRecord(): SchemaType<Record<string, unknown>>;
export declare const z: {
    string: typeof zString;
    number: typeof zNumber;
    enum: typeof zEnum;
    object: typeof zObject;
    array: typeof zArray;
    optional: typeof zOptional;
    record: typeof zRecord;
};
/**
 * Validates that `producerOutput` satisfies `consumerSchema`.
 * Throws a descriptive error if validation fails.
 *
 * @param producerOutput - The payload produced by the sending agent.
 * @param consumerSchema - The schema the receiving agent expects.
 * @param context - Human-readable name for the contract being checked (for error messages).
 * @returns The typed, validated data.
 */
export declare function assertContractMatch<T>(producerOutput: unknown, consumerSchema: SchemaType<T>, context: string): T;
/**
 * Build a well-formed AgentMessage envelope for contract tests.
 *
 * @param sender - ID of the producing agent.
 * @param recipient - ID of the receiving agent, or '*' for broadcast.
 * @param type - MessageType for routing.
 * @param payload - Payload to carry in the envelope.
 * @param correlationId - Optional; generated if omitted.
 */
export declare function buildTestMessage(sender: string, recipient: string, type: MessageType, payload: Record<string, unknown>, correlationId?: string): AgentMessage;
/**
 * Schema for the AgentMessage envelope fields (excluding typed payload).
 * Tests use this to verify that every message satisfies the bus contract.
 */
export declare const AgentMessageEnvelopeSchema: SchemaType<InferObject<{
    id: SchemaType<string>;
    sender: SchemaType<string>;
    recipient: SchemaType<string>;
    type: SchemaType<"task:delegate" | "task:cancel" | "result:complete" | "result:error" | "status:heartbeat" | "status:request" | "memory:store" | "memory:query">;
    payload: SchemaType<Record<string, unknown>>;
    correlationId: SchemaType<string>;
    timestamp: SchemaType<number>;
}>>;
export {};
