import { aggregateMetrics, formatMetrics, formatMetricsWithBaselines, recordEvent } from '../core/telemetry.js';
import { collectBaseline, formatBaseline } from '../core/baseline-collector.js';
import { getConsentStatus, promptConsent } from '../core/consent.js';
import { randomUUID } from 'node:crypto';
export const metricsCommand = {
    name: 'metrics',
    description: 'Show quality metrics dashboard',
    usage: '/metrics [baseline] [--window N] [--baseline] [--json]',
    execute: async (args, session) => {
        const parts = args.trim().split(/\s+/);
        let window = 10;
        let showBaseline = false;
        let jsonOutput = false;
        let isBaselineSubcommand = false;
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
            else if (parts[i] === 'baseline') {
                isBaselineSubcommand = true;
            }
        }
        // Handle baseline subcommand: collect and record a baseline snapshot
        if (isBaselineSubcommand) {
            const snapshot = await collectBaseline(session.workDir);
            // Check telemetry consent before recording events
            let consent = getConsentStatus(session.workDir);
            if (consent === 'pending') {
                consent = await promptConsent(session.workDir);
            }
            // Record baseline event to telemetry (local write even if opted_out)
            recordEvent(session.workDir, 'benchmark_run', randomUUID(), 'pass', 0, {
                baseline_snapshot: true,
                test_file_count: snapshot.test_file_count,
                lint_error_count: snapshot.lint_error_count,
                type_error_count: snapshot.type_error_count,
                loc: snapshot.loc,
                file_count: snapshot.file_count,
                primary_language: snapshot.primary_language,
                language_breakdown: snapshot.language_breakdown,
            });
            if (jsonOutput) {
                return JSON.stringify(snapshot, null, 2);
            }
            return formatBaseline(snapshot) + '\n\n  Baseline recorded to .skillfoundry/telemetry.jsonl';
        }
        // Check consent for aggregate reporting
        let metricsConsent = getConsentStatus(session.workDir);
        if (metricsConsent === 'pending') {
            metricsConsent = await promptConsent(session.workDir);
        }
        // If opted out, skip aggregate reporting
        if (metricsConsent === 'opted_out') {
            return [
                'Quality Metrics',
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
                '  Telemetry is opted out. Local events are still recorded.',
                '  To enable aggregate reporting: sf consent --opt-in',
            ].join('\n');
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