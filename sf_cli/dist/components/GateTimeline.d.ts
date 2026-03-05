import type { GateResult, GateRunSummary } from '../core/gates.js';
interface GateTimelineProps {
    gates: Array<GateResult & {
        isRunning?: boolean;
    }>;
    summary?: GateRunSummary;
}
export declare function GateTimeline({ gates, summary }: GateTimelineProps): import("react/jsx-runtime").JSX.Element;
export {};
