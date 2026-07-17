import { type AgentArchetype } from './agent-registry.js';
import type { MessageContractRegistry } from './message-contracts.js';
/** Implementer agents write code: they report an outcome and the files they touched. */
export declare const IMPLEMENTER_OUTPUT_SCHEMA: {
    readonly type: "object";
    readonly required: readonly ["status"];
    readonly properties: {
        readonly status: {
            readonly type: "string";
            readonly enum: readonly ["completed", "aborted", "failed"];
        };
        readonly files_changed: {
            readonly type: "array";
            readonly items: {
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
        };
        readonly summary: {
            readonly type: "string";
        };
    };
    readonly additionalProperties: true;
};
/** Reviewer agents read-only: they emit findings and never write. */
export declare const REVIEWER_OUTPUT_SCHEMA: {
    readonly type: "object";
    readonly required: readonly ["findings"];
    readonly properties: {
        readonly findings: {
            readonly type: "array";
            readonly items: {
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
        };
    };
    readonly additionalProperties: true;
};
/** Operator agents run diagnostics and produce a report with a status. */
export declare const OPERATOR_OUTPUT_SCHEMA: {
    readonly type: "object";
    readonly required: readonly ["status"];
    readonly properties: {
        readonly status: {
            readonly type: "string";
        };
        readonly report: {};
    };
    readonly additionalProperties: true;
};
/** Advisor agents answer questions (no tools). */
export declare const ADVISOR_OUTPUT_SCHEMA: {
    readonly type: "object";
    readonly required: readonly ["answer"];
    readonly properties: {
        readonly answer: {
            readonly type: "string";
        };
    };
    readonly additionalProperties: true;
};
/** Archetype → output contract. Every registered agent resolves through here. */
export declare const ARCHETYPE_OUTPUT_CONTRACTS: Record<AgentArchetype, Record<string, unknown>>;
/**
 * A structured agent result on the bus must match at least one archetype's key shape —
 * enough to reject a stray narrative string handoff while accepting any real result.
 */
export declare const AGENT_RESULT_SCHEMA: {
    readonly type: "object";
    readonly anyOf: readonly [{
        readonly required: readonly ["findings"];
    }, {
        readonly required: readonly ["status"];
    }, {
        readonly required: readonly ["answer"];
    }, {
        readonly required: readonly ["report"];
    }];
    readonly additionalProperties: true;
};
export interface AgentOutputValidation {
    valid: boolean;
    archetype: AgentArchetype;
    errors: string[];
}
/** The output contract for an agent, resolved via its archetype. */
export declare function getAgentOutputContract(agentName: string): Record<string, unknown>;
/** Validate a structured agent output against its archetype's contract. */
export declare function validateAgentOutput(agentName: string, output: unknown): AgentOutputValidation;
/** Every distinct agent name that has a declared contract (via the archetype map). */
export declare function contractedAgentNames(): string[];
/**
 * Register the agent-result contract onto a bus contract registry so `result:complete`
 * handoffs must be structured agent results. Composes with the flag-gated bus rollout
 * (follow-up 2) — call after `installContractsForMode` returns a registry.
 */
export declare function registerAgentResultContracts(registry: MessageContractRegistry): void;
