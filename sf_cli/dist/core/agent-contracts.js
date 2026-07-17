// Agent Contracts — strict per-agent output contracts (AgentOS follow-up 3, FR-003/FR-008).
//
// Every registered agent is "converted" to a strict output contract **through its
// archetype** (implementer / reviewer / operator / advisor), from the single source of
// truth `AGENT_ARCHETYPE_MAP`. This honors OQ-3 (shared types, one definition) rather
// than duplicating a schema into ~66 agent markdown files that would inevitably drift.
//
// Two consumption paths, both real:
//   1. `validateAgentOutput(name, output)` — a direct API any caller with a structured
//      agent result can use (e.g. reviewers/scanners that emit findings).
//   2. `registerAgentResultContracts(registry)` — composes an agent-result contract onto
//      the bus contract registry so, under the flag-gated rollout (follow-up 2), a
//      `result:complete` handoff must be a structured agent result, not narrative prose.
import { Ajv } from 'ajv';
import { getAgentArchetype, AGENT_ARCHETYPE_MAP, } from './agent-registry.js';
import { FINDING_SCHEMA, FILE_REF_SCHEMA } from './message-schemas.js';
// ── Per-archetype output contracts (built from shared types) ───────────────
/** Implementer agents write code: they report an outcome and the files they touched. */
export const IMPLEMENTER_OUTPUT_SCHEMA = {
    type: 'object',
    required: ['status'],
    properties: {
        status: { type: 'string', enum: ['completed', 'aborted', 'failed'] },
        files_changed: { type: 'array', items: FILE_REF_SCHEMA },
        summary: { type: 'string' },
    },
    additionalProperties: true,
};
/** Reviewer agents read-only: they emit findings and never write. */
export const REVIEWER_OUTPUT_SCHEMA = {
    type: 'object',
    required: ['findings'],
    properties: {
        findings: { type: 'array', items: FINDING_SCHEMA },
    },
    additionalProperties: true,
};
/** Operator agents run diagnostics and produce a report with a status. */
export const OPERATOR_OUTPUT_SCHEMA = {
    type: 'object',
    required: ['status'],
    properties: {
        status: { type: 'string' },
        report: {},
    },
    additionalProperties: true,
};
/** Advisor agents answer questions (no tools). */
export const ADVISOR_OUTPUT_SCHEMA = {
    type: 'object',
    required: ['answer'],
    properties: {
        answer: { type: 'string' },
    },
    additionalProperties: true,
};
/** Archetype → output contract. Every registered agent resolves through here. */
export const ARCHETYPE_OUTPUT_CONTRACTS = {
    implementer: IMPLEMENTER_OUTPUT_SCHEMA,
    reviewer: REVIEWER_OUTPUT_SCHEMA,
    operator: OPERATOR_OUTPUT_SCHEMA,
    advisor: ADVISOR_OUTPUT_SCHEMA,
};
/**
 * A structured agent result on the bus must match at least one archetype's key shape —
 * enough to reject a stray narrative string handoff while accepting any real result.
 */
export const AGENT_RESULT_SCHEMA = {
    type: 'object',
    anyOf: [
        { required: ['findings'] },
        { required: ['status'] },
        { required: ['answer'] },
        { required: ['report'] },
    ],
    additionalProperties: true,
};
// ── Validation ─────────────────────────────────────────────────────────────
const ajv = new Ajv({ allErrors: true, strict: false });
const compiled = new Map();
for (const [archetype, schema] of Object.entries(ARCHETYPE_OUTPUT_CONTRACTS)) {
    compiled.set(archetype, ajv.compile(schema));
}
/** The output contract for an agent, resolved via its archetype. */
export function getAgentOutputContract(agentName) {
    return ARCHETYPE_OUTPUT_CONTRACTS[getAgentArchetype(agentName)];
}
/** Validate a structured agent output against its archetype's contract. */
export function validateAgentOutput(agentName, output) {
    const archetype = getAgentArchetype(agentName);
    const validate = compiled.get(archetype);
    const valid = validate(output);
    return {
        valid,
        archetype,
        errors: valid ? [] : formatErrors(validate.errors),
    };
}
/** Every distinct agent name that has a declared contract (via the archetype map). */
export function contractedAgentNames() {
    return Object.keys(AGENT_ARCHETYPE_MAP);
}
/**
 * Register the agent-result contract onto a bus contract registry so `result:complete`
 * handoffs must be structured agent results. Composes with the flag-gated bus rollout
 * (follow-up 2) — call after `installContractsForMode` returns a registry.
 */
export function registerAgentResultContracts(registry) {
    registry.register('result:complete', { ...AGENT_RESULT_SCHEMA });
}
function formatErrors(errors) {
    if (!errors || errors.length === 0)
        return ['output failed the agent contract'];
    return errors.map((e) => `output${e.instancePath || ''} ${e.message ?? 'is invalid'}`.trim());
}
//# sourceMappingURL=agent-contracts.js.map