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
// ── Per-agent overrides (stricter than the archetype default where justified) ──
/**
 * Gate-keeper is a reviewer, but its output is a gate VERDICT, not a findings list.
 * Verdict vocabulary is grounded in the gate-keeper agent (APPROVE / WARN / REJECT / BLOCK).
 */
export const GATE_KEEPER_OUTPUT_SCHEMA = {
    type: 'object',
    required: ['verdict'],
    properties: {
        verdict: { type: 'string', enum: ['APPROVE', 'WARN', 'REJECT', 'BLOCK'] },
        findings: { type: 'array', items: FINDING_SCHEMA },
    },
    additionalProperties: true,
};
/**
 * Tester is an operator, but its report is structured test metrics — grounded in the
 * tester agent's output (tests run, failures, coverage).
 */
export const TESTER_OUTPUT_SCHEMA = {
    type: 'object',
    required: ['status', 'tests_run'],
    properties: {
        status: { type: 'string' },
        tests_run: { type: 'integer' },
        failures: { type: 'integer' },
        coverage: { type: 'number' },
    },
    additionalProperties: true,
};
/**
 * Per-agent contract overrides. An agent whose real output shape differs from its
 * archetype's generic shape is listed here; everything else uses the archetype default.
 * Kept deliberately small and grounded — the archetype map is still the single source.
 */
export const AGENT_OUTPUT_OVERRIDES = {
    'gate-keeper': GATE_KEEPER_OUTPUT_SCHEMA,
    tester: TESTER_OUTPUT_SCHEMA,
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
// Validators are compiled per unique schema object (archetype defaults + overrides) and
// cached, so a per-agent override validates against its own schema.
const validatorCache = new Map();
function validatorFor(schema) {
    let validate = validatorCache.get(schema);
    if (!validate) {
        validate = ajv.compile(schema);
        validatorCache.set(schema, validate);
    }
    return validate;
}
/** The output contract for an agent: a per-agent override if present, else the archetype default. */
export function getAgentOutputContract(agentName) {
    return AGENT_OUTPUT_OVERRIDES[agentName] ?? ARCHETYPE_OUTPUT_CONTRACTS[getAgentArchetype(agentName)];
}
/** Validate a structured agent output against its (override or archetype) contract. */
export function validateAgentOutput(agentName, output) {
    const archetype = getAgentArchetype(agentName);
    const schema = getAgentOutputContract(agentName);
    const validate = validatorFor(schema);
    const valid = validate(output);
    return {
        valid,
        archetype,
        override: agentName in AGENT_OUTPUT_OVERRIDES,
        errors: valid ? [] : formatErrors(validate.errors),
    };
}
// ── Runtime enforcement (graduated rollout: observe → warn → enforce) ──────
/**
 * Extract a structured object from an agent's free-text output: a fenced ```json block
 * if present, otherwise the whole text when it is itself a JSON object/array. Returns
 * `null` when the agent emitted prose (nothing to enforce).
 */
export function extractStructuredOutput(text) {
    if (!text || typeof text !== 'string')
        return null;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = (fenced ? fenced[1] : text).trim();
    if (!(raw.startsWith('{') || raw.startsWith('[')))
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
/**
 * Validate an agent's raw result text against its contract, when it contains structured
 * output. Prose results are `enforced: false` (nothing to validate) — free-text agents
 * are never penalized. This is the extraction step the runtime hook uses.
 */
export function validateAgentResultText(agentName, text) {
    const archetype = getAgentArchetype(agentName);
    const obj = extractStructuredOutput(text);
    if (obj === null) {
        return { enforced: false, valid: true, archetype, errors: [] };
    }
    const result = validateAgentOutput(agentName, obj);
    return { enforced: true, valid: result.valid, archetype, errors: result.errors };
}
// ── Hard enforcement (top tier: elicit structured output + fail on violation) ──
/** The required-field names of an agent's output contract (for the prompt instruction). */
function requiredFields(agentName) {
    const schema = getAgentOutputContract(agentName);
    return Array.isArray(schema.required) ? schema.required : [];
}
/**
 * An ADDITIVE prompt instruction (used only in `enforce` mode) asking the agent to end
 * its message with a fenced ```json block matching its output contract. It is additive:
 * the agent keeps producing its normal prose/code, then appends the structured block —
 * so existing text consumers are unaffected while the contract becomes checkable.
 */
export function structuredOutputInstruction(agentName) {
    const fields = requiredFields(agentName);
    const fieldList = fields.length ? fields.join(', ') : 'your structured result';
    return [
        '',
        'OUTPUT CONTRACT (required): In addition to your normal response, end your message with',
        'a single fenced ```json code block containing a JSON object that includes at least',
        `these fields: ${fieldList}. The block is validated against your agent contract; a`,
        'missing or invalid block will fail the task.',
    ].join('\n');
}
/**
 * Pure decision function for the runtime output-contract hook. Given an agent's result
 * text and the active mode, decide whether the result stands or is downgraded to
 * `failed`. In `off` nothing happens; in `permissive`/`strict` a violation is reported
 * but the result stands (warn stage); in `enforce` a violation downgrades to `failed`.
 * Prose results (no structured output) are never a violation.
 */
export function enforceOutputContract(agentName, text, mode) {
    const check = validateAgentResultText(agentName, text);
    const violation = mode !== 'off' && check.enforced && !check.valid;
    const hardFailed = violation && mode === 'enforce';
    return {
        status: hardFailed ? 'failed' : 'completed',
        enforced: check.enforced,
        valid: check.valid,
        violation,
        hardFailed,
        archetype: check.archetype,
        errors: check.errors,
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