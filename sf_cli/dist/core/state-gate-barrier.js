// State Gate Barrier — the "MMU" write barrier from the AgentOS PRD
// (genesis/2026-07-17-agentos-state-kernel.md, FR-005 / FR-006 / §4.2).
//
// An agent never writes the state kernel directly for a gated slice. It proposes an
// update; the barrier runs the deterministic gate validators; only if they pass does
// the proposed data reach the kernel. On failure the barrier does NOT merge the
// proposal — it marks the owning slice FAILED with structured error_logs and flips the
// run build_status to FAILING, forcing a retry. Because only the one owning slice is
// touched, sibling slices continue unaffected (FR-006 per-slice halt).
//
// The barrier is decoupled from any specific gate runner: it takes a `SliceValidator`.
// The real pipeline passes the shell-based Anvil/gates through `fromGateSummary`, but
// tests (and future validators) can supply any function returning a GateVerdict.
import { getLogger } from '../utils/logger.js';
const logger = getLogger();
/**
 * Adapt a {@link GateRunSummary} (from the shell-based Anvil/gates runner) into a
 * {@link GateVerdict}, collecting failing tiers as structured error logs.
 */
export function fromGateSummary(summary) {
    const errors = summary.gates
        .filter((g) => g.status === 'fail')
        .map((g) => ({ tier: g.tier, name: g.name, detail: g.detail }));
    return { verdict: summary.verdict, errors };
}
/**
 * Guards state writes with a deterministic gate pass (the determinism boundary, §4.2).
 *
 * Wrap a {@link StateKernel} and a {@link SliceValidator}; call {@link GateBarrier.commit}
 * instead of `kernel.commitSlice` for any gated slice.
 */
export class GateBarrier {
    kernel;
    validate;
    strictWarn;
    constructor(kernel, validate, options = {}) {
        this.kernel = kernel;
        this.validate = validate;
        this.strictWarn = options.strictWarn ?? false;
    }
    /**
     * Attempt to commit `proposal` at `expectedVersion`, guarded by the gate validators.
     *
     * - Gates PASS (or WARN when not strict): the proposed data is committed to the
     *   kernel and returned with `committed: true`.
     * - Gates FAIL (or WARN when strict): the proposal is rejected — NOT merged. The
     *   owning slice is marked `{ status: 'FAILED', error_logs }`, run build_status is
     *   set to FAILING, and `committed: false` is returned so the caller can retry.
     *
     * An agent-authored slice therefore can never self-certify a passing build.
     */
    async commit(proposal, expectedVersion) {
        const { verdict, errors } = await this.validate(proposal);
        const blocked = verdict === 'FAIL' || (verdict === 'WARN' && this.strictWarn);
        if (blocked) {
            logger.warn('gate', 'state_write_blocked', {
                slice: proposal.slice,
                verdict,
                failures: errors.length,
            });
            // Reject the proposal (do not merge). Record the failure on the owning slice.
            const failedSlice = this.kernel.commitSlice(proposal.slice, proposal.owner, { status: 'FAILED', error_logs: errors }, expectedVersion);
            this.kernel.setBuildStatus('FAILING');
            return { committed: false, slice: failedSlice, verdict, errors };
        }
        const slice = this.kernel.commitSlice(proposal.slice, proposal.owner, proposal.data, expectedVersion);
        logger.info('gate', 'state_write_committed', {
            slice: proposal.slice,
            version: slice.version,
            verdict,
        });
        return { committed: true, slice, verdict, errors };
    }
}
//# sourceMappingURL=state-gate-barrier.js.map