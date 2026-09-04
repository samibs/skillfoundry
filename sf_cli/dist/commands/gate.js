import { runSingleGate, runAllGates } from '../core/gates.js';
import { recordEvent } from '../core/telemetry.js';
import { randomUUID } from 'node:crypto';
import { planTask, runOrReuse, deliveryRunnerEnabled } from '../core/delivery-runner.js';
import { topLevel } from '../core/mission-git.js';
export const gateCommand = {
    name: 'gate',
    description: 'Run a single quality gate or all gates',
    usage: '/gate <t0|t1|t2|t3|t4|t5|t6|t7|all> [target] [--force]',
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
            // Delivery efficiency: the full tier suite is the expensive path. Re-running it
            // against a tree unchanged since it last ran proves nothing, so consult the evidence
            // store first. `--force` and a disabled layer both fall straight through.
            const force = /(^|\s)--force(\s|$)/.test(args);
            const repoRoot = topLevel(session.workDir) ?? session.workDir;
            let summary;
            let reuseNote = '';
            if (!force && deliveryRunnerEnabled(repoRoot)) {
                const plan = planTask(repoRoot, { taskId: 'gate-all', text: 'run all quality gates' });
                const outcome = await runOrReuse(repoRoot, {
                    kind: 'static-analysis',
                    // A stable identity for this work — a label, never executed.
                    command: `gates:all:${target}`,
                    scope: plan.scope,
                    changedFiles: plan.changedFiles,
                    owner: 'gate-command',
                    taskId: 'gate-all',
                    budget: plan.budget.level,
                }, () => runAllGates({ workDir: session.workDir, target }), (s) => s.verdict !== 'FAIL');
                if (outcome.value) {
                    summary = outcome.value;
                    const saved = outcome.secondsSaved !== null ? `, saving ${outcome.secondsSaved}s` : '';
                    if (outcome.action === 'REUSED') {
                        reuseNote = `_Reused: already proven against this tree${saved}. Use \`--force\` to re-run._`;
                    }
                    else if (outcome.action === 'BLOCKED_KNOWN_FAILURE') {
                        reuseNote = `_Reused: already failed against this tree — fix the cause${saved}. Use \`--force\` to re-run._`;
                    }
                }
                else {
                    summary = await runAllGates({ workDir: session.workDir, target });
                }
            }
            else {
                summary = await runAllGates({ workDir: session.workDir, target });
            }
            const durationMs = Date.now() - start;
            recordEvent(session.workDir, 'gate_execution', sessionId, summary.verdict === 'PASS' ? 'pass' : summary.verdict === 'WARN' ? 'warn' : 'fail', durationMs, {
                tier: 'all',
                gate_name: 'All Gates',
                findings_count: summary.failed + summary.warned,
            });
            const lines = ['**Gate Results (All Tiers)**', ''];
            if (reuseNote) {
                lines.push(reuseNote);
                lines.push('');
            }
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