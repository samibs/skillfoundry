// State Projection — lazy natural-language rendering of run state (AgentOS PRD FR-007).
//
// Natural language is a projection layer generated only when a human boundary is
// crossed, not the medium agents work in. On the happy path this renders a compact
// one-block success summary from the state document; on failure it renders a
// human-readable post-mortem from the FAILED slices' structured error_logs. Neither
// path prints agent-to-agent chatter — the state document is the source, prose is derived.
import { isSpilledRef } from './state.js';
/** Control fields present on every slice that are not agent-authored metrics. */
const SLICE_CONTROL_FIELDS = new Set(['version', 'owner', 'status', 'error_logs']);
/**
 * Render a state document to a compact success summary or a failure post-mortem.
 *
 * A run is considered failing when `build_status` is `FAILING` or any slice is marked
 * `FAILED` (per-slice halt, FR-006). Otherwise the happy-path summary is produced.
 */
export function projectState(doc) {
    const failedSlices = Object.entries(doc.slices).filter(([, slice]) => slice.status === 'FAILED');
    const failing = doc.project_metadata.build_status === 'FAILING' || failedSlices.length > 0;
    return failing
        ? { mode: 'failure', text: renderPostMortem(doc, failedSlices) }
        : { mode: 'success', text: renderSuccess(doc) };
}
/** Convenience: load a kernel's document and project it. */
export function projectKernel(kernel) {
    return projectState(kernel.load());
}
// ── renderers ──────────────────────────────────────────────────────────────
function renderSuccess(doc) {
    const lines = [];
    const target = doc.project_metadata.target ? ` (${doc.project_metadata.target})` : '';
    lines.push(`✓ ${doc.run_id}${target} — build ${doc.project_metadata.build_status}`);
    for (const [name, slice] of Object.entries(doc.slices)) {
        const metrics = summariseMetrics(slice);
        lines.push(`  ${name}: ${metrics || '(no metrics)'}`);
    }
    return lines.join('\n');
}
function renderPostMortem(doc, failedSlices) {
    const lines = [];
    lines.push(`✗ ${doc.run_id} — build ${doc.project_metadata.build_status}`);
    if (failedSlices.length === 0) {
        lines.push('  build_status is FAILING but no slice recorded a failure.');
        return lines.join('\n');
    }
    for (const [name, slice] of failedSlices) {
        lines.push(`  ${name} FAILED (owner: ${slice.owner}):`);
        const errors = Array.isArray(slice.error_logs) ? slice.error_logs : [];
        if (errors.length === 0) {
            lines.push('    - no structured error_logs recorded');
            continue;
        }
        for (const err of errors) {
            const e = err;
            const tier = e.tier ? `[${e.tier}] ` : '';
            const nm = e.name ? `${e.name}: ` : '';
            lines.push(`    - ${tier}${nm}${e.detail ?? 'failure'}`);
        }
    }
    return lines.join('\n');
}
/** Compact "k=v" of a slice's agent-authored metric fields (control fields elided). */
function summariseMetrics(slice) {
    const parts = [];
    for (const [key, value] of Object.entries(slice)) {
        if (SLICE_CONTROL_FIELDS.has(key))
            continue;
        if (isSpilledRef(value)) {
            parts.push(`${key}=<spilled ${value.bytes}B>`);
        }
        else if (typeof value === 'number' ||
            typeof value === 'string' ||
            typeof value === 'boolean') {
            parts.push(`${key}=${value}`);
        }
        else if (Array.isArray(value)) {
            parts.push(`${key}=[${value.length}]`);
        }
        // Objects (non-spilled) are omitted from the compact summary.
    }
    return parts.join(', ');
}
//# sourceMappingURL=state-projection.js.map