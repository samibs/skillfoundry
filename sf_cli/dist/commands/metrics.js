import { aggregateMetrics, formatMetrics, formatMetricsWithBaselines } from '../core/telemetry.js';
export const metricsCommand = {
    name: 'metrics',
    description: 'Show quality metrics dashboard',
    usage: '/metrics [--window N] [--baseline] [--json]',
    execute: async (args, session) => {
        const parts = args.trim().split(/\s+/);
        let window = 10;
        let showBaseline = false;
        let jsonOutput = false;
        for (let i = 0; i < parts.length; i++) {
            if (parts[i] === '--window' && parts[i + 1]) {
                window = parseInt(parts[i + 1], 10) || 10;
                i++;
            }
            else if (parts[i] === '--baseline') {
                showBaseline = true;
            }
            else if (parts[i] === '--json') {
                jsonOutput = true;
            }
        }
        const agg = aggregateMetrics(session.workDir, window);
        if (jsonOutput) {
            return JSON.stringify(agg, null, 2);
        }
        return showBaseline
            ? formatMetricsWithBaselines(agg)
            : formatMetrics(agg);
    },
};
//# sourceMappingURL=metrics.js.map