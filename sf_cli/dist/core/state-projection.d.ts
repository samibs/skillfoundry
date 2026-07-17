import { StateKernel, type StateDocument } from './state.js';
export interface Projection {
    /** 'success' when the run is not failing; 'failure' otherwise. */
    mode: 'success' | 'failure';
    /** Human-readable text for the CLI / IDE boundary. */
    text: string;
}
/**
 * Render a state document to a compact success summary or a failure post-mortem.
 *
 * A run is considered failing when `build_status` is `FAILING` or any slice is marked
 * `FAILED` (per-slice halt, FR-006). Otherwise the happy-path summary is produced.
 */
export declare function projectState(doc: StateDocument): Projection;
/** Convenience: load a kernel's document and project it. */
export declare function projectKernel(kernel: StateKernel): Projection;
