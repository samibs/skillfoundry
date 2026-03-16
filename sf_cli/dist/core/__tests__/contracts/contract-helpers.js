// Contract test helpers — lightweight runtime schema validation for agent pair contract tests.
// Replicates a subset of Zod's API surface without the zod dependency.
// Used exclusively in test files to validate message payload shapes between producer and consumer.
import { randomUUID } from 'node:crypto';
// ---------------------------------------------------------------------------
// Validation error accumulator
// ---------------------------------------------------------------------------
class ValidationError {
    issues = [];
    add(path, message) {
        this.issues.push({ path, message });
    }
    format() {
        if (this.issues.length === 0)
            return 'No errors';
        return this.issues
            .map((i) => `  ${i.path.length > 0 ? i.path.join('.') + ': ' : ''}${i.message}`)
            .join('\n');
    }
    get hasErrors() {
        return this.issues.length > 0;
    }
}
// ---------------------------------------------------------------------------
// Schema builders
// ---------------------------------------------------------------------------
function makeSuccess(data) {
    return { success: true, data };
}
function makeFailure(err) {
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
function zString() {
    return {
        safeParse(input) {
            const err = new ValidationError();
            if (typeof input !== 'string') {
                err.add([], `Expected string, got ${typeof input}`);
                return makeFailure(err);
            }
            return makeSuccess(input);
        },
        parse(input) {
            const r = this.safeParse(input);
            if (!r.success)
                throw new Error(`Schema validation failed:\n${r.error.format()}`);
            return r.data;
        },
    };
}
/**
 * Validates that input is a number.
 */
function zNumber() {
    return {
        safeParse(input) {
            const err = new ValidationError();
            if (typeof input !== 'number') {
                err.add([], `Expected number, got ${typeof input}`);
                return makeFailure(err);
            }
            return makeSuccess(input);
        },
        parse(input) {
            const r = this.safeParse(input);
            if (!r.success)
                throw new Error(`Schema validation failed:\n${r.error.format()}`);
            return r.data;
        },
    };
}
/**
 * Validates that input is one of the given enum values.
 */
function zEnum(values) {
    return {
        safeParse(input) {
            const err = new ValidationError();
            if (typeof input !== 'string' || !values.includes(input)) {
                err.add([], `Expected one of [${values.join(', ')}], got ${JSON.stringify(input)}`);
                return makeFailure(err);
            }
            return makeSuccess(input);
        },
        parse(input) {
            const r = this.safeParse(input);
            if (!r.success)
                throw new Error(`Schema validation failed:\n${r.error.format()}`);
            return r.data;
        },
    };
}
/**
 * Validates that input is a plain object whose required keys all pass their sub-schema.
 * Unknown additional keys are tolerated (forward compatibility).
 */
function zObject(shape) {
    return {
        safeParse(input) {
            const err = new ValidationError();
            if (input === null || typeof input !== 'object' || Array.isArray(input)) {
                err.add([], `Expected object, got ${input === null ? 'null' : typeof input}`);
                return makeFailure(err);
            }
            const obj = input;
            const result = {};
            for (const key of Object.keys(shape)) {
                const fieldSchema = shape[key];
                const fieldResult = fieldSchema.safeParse(obj[key]);
                if (!fieldResult.success) {
                    const failure = fieldResult;
                    for (const issue of failure.error.issues) {
                        err.add([key, ...issue.path], issue.message);
                    }
                    // Also add a field-level missing/invalid marker
                    if (obj[key] === undefined) {
                        err.add([key], 'Required field is missing');
                    }
                }
                else {
                    result[key] = fieldResult.data;
                }
            }
            if (err.hasErrors)
                return makeFailure(err);
            return makeSuccess(result);
        },
        parse(input) {
            const r = this.safeParse(input);
            if (!r.success)
                throw new Error(`Schema validation failed:\n${r.error.format()}`);
            return r.data;
        },
    };
}
/**
 * Validates that input is an array where each element passes the given sub-schema.
 */
function zArray(itemSchema) {
    return {
        safeParse(input) {
            const err = new ValidationError();
            if (!Array.isArray(input)) {
                err.add([], `Expected array, got ${typeof input}`);
                return makeFailure(err);
            }
            const result = [];
            for (let i = 0; i < input.length; i++) {
                const itemResult = itemSchema.safeParse(input[i]);
                if (!itemResult.success) {
                    const failure = itemResult;
                    for (const issue of failure.error.issues) {
                        err.add([`[${i}]`, ...issue.path], issue.message);
                    }
                }
                else {
                    result.push(itemResult.data);
                }
            }
            if (err.hasErrors)
                return makeFailure(err);
            return makeSuccess(result);
        },
        parse(input) {
            const r = this.safeParse(input);
            if (!r.success)
                throw new Error(`Schema validation failed:\n${r.error.format()}`);
            return r.data;
        },
    };
}
/**
 * Wraps a schema to allow undefined values (optional field).
 */
function zOptional(inner) {
    return {
        safeParse(input) {
            if (input === undefined)
                return makeSuccess(undefined);
            return inner.safeParse(input);
        },
        parse(input) {
            const r = this.safeParse(input);
            if (!r.success)
                throw new Error(`Schema validation failed:\n${r.error.format()}`);
            return r.data;
        },
    };
}
/**
 * Validates that input is a plain object (record) with unknown value types.
 */
function zRecord() {
    return {
        safeParse(input) {
            const err = new ValidationError();
            if (input === null || typeof input !== 'object' || Array.isArray(input)) {
                err.add([], `Expected record object, got ${input === null ? 'null' : typeof input}`);
                return makeFailure(err);
            }
            return makeSuccess(input);
        },
        parse(input) {
            const r = this.safeParse(input);
            if (!r.success)
                throw new Error(`Schema validation failed:\n${r.error.format()}`);
            return r.data;
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
export function assertContractMatch(producerOutput, consumerSchema, context) {
    const result = consumerSchema.safeParse(producerOutput);
    if (!result.success) {
        throw new Error(`Contract violation (${context}):\n${result.error.format()}`);
    }
    return result.data;
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
export function buildTestMessage(sender, recipient, type, payload, correlationId) {
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
    ]),
    payload: z.record(),
    correlationId: z.string(),
    timestamp: z.number(),
});
//# sourceMappingURL=contract-helpers.js.map