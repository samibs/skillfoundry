import type { GateRunSummary } from './gates.js';
import { StateKernel, type StateSlice } from './state.js';
/** A single deterministic failure recorded against a slice when a gate blocks a write. */
export interface GateErrorLog {
    tier: string;
    name: string;
    detail: string;
}
/** Verdict returned by a {@link SliceValidator}. WARN is a soft pass by default. */
export interface GateVerdict {
    verdict: 'PASS' | 'WARN' | 'FAIL';
    errors: GateErrorLog[];
}
/** An agent's proposed write to a gated slice, evaluated before it can be committed. */
export interface SliceProposal {
    slice: string;
    owner: string;
    data: Record<string, unknown>;
}
/**
 * Runs the deterministic checks for a proposal and returns a verdict. Sync or async.
 * The real pipeline wraps its Anvil/gates runner; unit tests inject a stub.
 */
export type SliceValidator = (proposal: SliceProposal) => Promise<GateVerdict> | GateVerdict;
/** Outcome of a barrier-guarded commit attempt. */
export interface BarrierResult {
    /** True only when gates passed and the proposal was committed to the kernel. */
    committed: boolean;
    /** The committed slice (on pass) or the FAILED-marked slice (on block). */
    slice: StateSlice;
    verdict: 'PASS' | 'WARN' | 'FAIL';
    errors: GateErrorLog[];
}
export interface GateBarrierOptions {
    /** Treat a WARN verdict as a block instead of a soft pass. Default false. */
    strictWarn?: boolean;
}
/**
 * Adapt a {@link GateRunSummary} (from the shell-based Anvil/gates runner) into a
 * {@link GateVerdict}, collecting failing tiers as structured error logs.
 */
export declare function fromGateSummary(summary: GateRunSummary): GateVerdict;
/**
 * Guards state writes with a deterministic gate pass (the determinism boundary, §4.2).
 *
 * Wrap a {@link StateKernel} and a {@link SliceValidator}; call {@link GateBarrier.commit}
 * instead of `kernel.commitSlice` for any gated slice.
 */
export declare class GateBarrier {
    private readonly kernel;
    private readonly validate;
    private readonly strictWarn;
    constructor(kernel: StateKernel, validate: SliceValidator, options?: GateBarrierOptions);
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
    commit(proposal: SliceProposal, expectedVersion: number): Promise<BarrierResult>;
}
