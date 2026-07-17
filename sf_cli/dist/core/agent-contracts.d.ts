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
 * Gate-keeper is a reviewer, but its output is a gate VERDICT, not a findings list.
 * Verdict vocabulary is grounded in the gate-keeper agent (APPROVE / WARN / REJECT / BLOCK).
 */
export declare const GATE_KEEPER_OUTPUT_SCHEMA: {
    readonly type: "object";
    readonly required: readonly ["verdict"];
    readonly properties: {
        readonly verdict: {
            readonly type: "string";
            readonly enum: readonly ["APPROVE", "WARN", "REJECT", "BLOCK"];
        };
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
/**
 * Tester is an operator, but its report is structured test metrics — grounded in the
 * tester agent's output (tests run, failures, coverage).
 */
export declare const TESTER_OUTPUT_SCHEMA: {
    readonly type: "object";
    readonly required: readonly ["status", "tests_run"];
    readonly properties: {
        readonly status: {
            readonly type: "string";
        };
        readonly tests_run: {
            readonly type: "integer";
        };
        readonly failures: {
            readonly type: "integer";
        };
        readonly coverage: {
            readonly type: "number";
        };
    };
    readonly additionalProperties: true;
};
/**
 * Per-agent contract overrides. An agent whose real output shape differs from its
 * archetype's generic shape is listed here; everything else uses the archetype default.
 * Kept deliberately small and grounded — the archetype map is still the single source.
 */
export declare const AGENT_OUTPUT_OVERRIDES: Record<string, Record<string, unknown>>;
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
    /** True when a per-agent override contract (not the archetype default) was applied. */
    override: boolean;
    errors: string[];
}
/** The output contract for an agent: a per-agent override if present, else the archetype default. */
export declare function getAgentOutputContract(agentName: string): Record<string, unknown>;
/** Validate a structured agent output against its (override or archetype) contract. */
export declare function validateAgentOutput(agentName: string, output: unknown): AgentOutputValidation;
/**
 * Extract a structured object from an agent's free-text output: a fenced ```json block
 * if present, otherwise the whole text when it is itself a JSON object/array. Returns
 * `null` when the agent emitted prose (nothing to enforce).
 */
export declare function extractStructuredOutput(text: string): unknown | null;
export interface AgentResultValidation {
    /** True only when the agent emitted structured output that a contract could check. */
    enforced: boolean;
    valid: boolean;
    archetype: AgentArchetype;
    errors: string[];
}
/**
 * Validate an agent's raw result text against its contract, when it contains structured
 * output. Prose results are `enforced: false` (nothing to validate) — free-text agents
 * are never penalized. This is the extraction step the runtime hook uses.
 */
export declare function validateAgentResultText(agentName: string, text: string): AgentResultValidation;
/** Every distinct agent name that has a declared contract (via the archetype map). */
export declare function contractedAgentNames(): string[];
/**
 * Register the agent-result contract onto a bus contract registry so `result:complete`
 * handoffs must be structured agent results. Composes with the flag-gated bus rollout
 * (follow-up 2) — call after `installContractsForMode` returns a registry.
 */
export declare function registerAgentResultContracts(registry: MessageContractRegistry): void;
