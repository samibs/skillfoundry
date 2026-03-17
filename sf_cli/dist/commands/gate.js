import { runSingleGate, runAllGates } from '../core/gates.js';
import { recordEvent } from '../core/telemetry.js';
import { randomUUID } from 'node:crypto';
export const gateCommand = {
    name: 'gate',
    description: 'Run a single quality gate or all gates',
    usage: '/gate <t0|t1|t2|t3|t4|t5|t6|t7|all> [target]',
    execute: async (args, session) => {
        const parts = args.trim().split(/\s+/);
        const tier = parts[0]?.toLowerCase() || 'all';
        const rawTarget = parts[1] || '.';
        // Reject shell metacharacters in target path
        if (/[;|&$`\\!{}()\[\]<>]/.test(rawTarget)) {
            return 'Error: target path contains invalid characters.';
        }
        const target = rawTarget;
        const sessionId = randomUUID();
        const start = Date.now();
        if (tier === 'all') {
            const summary = await runAllGates({ workDir: session.workDir, target });
            const durationMs = Date.now() - start;
            recordEvent(session.workDir, 'gate_execution', sessionId, summary.verdict === 'PASS' ? 'pass' : summary.verdict === 'WARN' ? 'warn' : 'fail', durationMs, {
                tier: 'all',
                gate_name: 'All Gates',
                findings_count: summary.failed + summary.warned,
            });
            const lines = ['**Gate Results (All Tiers)**', ''];
            for (const g of summary.gates) {
                const icon = g.status === 'pass' ? '✓' : g.status === 'fail' ? '✗' : g.status === 'warn' ? '⚠' : '○';
                lines.push(`  ${icon} ${g.tier} ${g.name}: ${g.status.toUpperCase()} (${g.durationMs}ms)`);
                if (g.status === 'fail' || g.status === 'warn') {
                    lines.push(`    ${g.detail.split('\n')[0].slice(0, 120)}`);
                }
            }
            lines.push('');
            lines.push(`  Verdict: ${summary.verdict} (${summary.passed} pass, ${summary.failed} fail, ${summary.warned} warn, ${summary.skipped} skip)`);
            lines.push(`  Duration: ${durationMs}ms`);
            return lines.join('\n');
        }
        // Single gate
        const validTiers = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'];
        if (!validTiers.includes(tier)) {
            return `Unknown gate tier: ${tier}\nUsage: /gate <t0|t1|t2|t3|t4|t5|t6|t7|all> [target]`;
        }
        const result = runSingleGate(tier.toUpperCase(), session.workDir, target);
        const durationMs = Date.now() - start;
        recordEvent(session.workDir, 'gate_execution', sessionId, result.status === 'pass' ? 'pass' : result.status === 'fail' ? 'fail' : 'warn', durationMs, {
            tier: result.tier,
            gate_name: result.name,
            findings_count: result.status === 'pass' ? 0 : 1,
        });
        const icon = result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : result.status === 'warn' ? '⚠' : '○';
        return [
            `**${result.tier} ${result.name}**: ${icon} ${result.status.toUpperCase()}`,
            '',
            `  ${result.detail}`,
            '',
            `  Duration: ${result.durationMs}ms`,
        ].join('\n');
    },
};
//# sourceMappingURL=gate.js.map