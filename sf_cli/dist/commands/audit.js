/**
 * STORY-002 (CLI): sf audit — View audit log
 *
 * Usage:
 *   sf audit                 Show audit log summary
 *   sf audit --recent N      Show last N entries
 *   sf audit --gate T1       Filter by gate tier
 *   sf audit --verdict fail  Filter by verdict
 *   sf audit --json          JSON output
 */
import { getAuditSummary, getRecentAuditEntries, filterAuditEntries, countAuditEntries, rotateAuditLogIfNeeded, } from '../core/audit-log.js';
function parseAuditArgs(args) {
    const parts = args.trim().split(/\s+/);
    const flags = parts.filter((p) => p.startsWith('--'));
    let recent = 0;
    const recentFlag = flags.find((f) => f.startsWith('--recent'));
    if (recentFlag) {
        if (recentFlag.includes('=')) {
            recent = parseInt(recentFlag.split('=')[1], 10) || 20;
        }
        else {
            const idx = parts.indexOf('--recent');
            recent = parseInt(parts[idx + 1], 10) || 20;
        }
    }
    let gate;
    const gateFlag = flags.find((f) => f.startsWith('--gate'));
    if (gateFlag) {
        gate = gateFlag.includes('=') ? gateFlag.split('=')[1] : parts[parts.indexOf('--gate') + 1];
    }
    let verdict;
    const verdictFlag = flags.find((f) => f.startsWith('--verdict'));
    if (verdictFlag) {
        verdict = verdictFlag.includes('=') ? verdictFlag.split('=')[1] : parts[parts.indexOf('--verdict') + 1];
    }
    return {
        recent,
        gate,
        verdict,
        json: flags.includes('--json'),
        rotate: flags.includes('--rotate'),
    };
}
export const auditCommand = {
    name: 'audit',
    description: 'View gate decision audit log',
    usage: '/audit [--recent N] [--gate T1] [--verdict fail] [--json] [--rotate]',
    execute: async (args, session) => {
        const { recent, gate, verdict, json, rotate } = parseAuditArgs(args);
        if (rotate) {
            const rotated = rotateAuditLogIfNeeded(session.workDir, 0); // Force rotation
            return rotated
                ? '\n  Audit log rotated successfully.\n'
                : '\n  No rotation needed (log is empty or already rotated).\n';
        }
        // Filter mode
        if (gate || verdict) {
            const entries = filterAuditEntries(session.workDir, { gate, verdict });
            if (json) {
                return JSON.stringify(entries, null, 2);
            }
            const lines = ['', `  Audit log (${entries.length} entries matching filters)`, ''];
            for (const e of entries.slice(-50)) {
                const icon = e.verdict === 'pass' ? '\x1b[32m✓\x1b[0m' :
                    e.verdict === 'fail' ? '\x1b[31m✗\x1b[0m' :
                        e.verdict === 'warn' ? '\x1b[33m⚠\x1b[0m' : '\x1b[2m○\x1b[0m';
                lines.push(`  ${icon} ${e.gate.padEnd(4)} ${e.verdict.padEnd(5)} ${e.reason.slice(0, 60).padEnd(60)} ${e.actor}`);
            }
            lines.push('');
            return lines.join('\n');
        }
        // Recent mode
        if (recent > 0) {
            const entries = getRecentAuditEntries(session.workDir, recent);
            if (json) {
                return JSON.stringify(entries, null, 2);
            }
            const lines = ['', `  Last ${entries.length} audit entries`, ''];
            for (const e of entries) {
                const icon = e.verdict === 'pass' ? '\x1b[32m✓\x1b[0m' :
                    e.verdict === 'fail' ? '\x1b[31m✗\x1b[0m' :
                        e.verdict === 'warn' ? '\x1b[33m⚠\x1b[0m' : '\x1b[2m○\x1b[0m';
                lines.push(`  ${icon} ${e.gate.padEnd(4)} ${e.verdict.padEnd(5)} ${(e.duration_ms + 'ms').padEnd(8)} ${e.reason.slice(0, 50)}`);
            }
            lines.push('');
            return lines.join('\n');
        }
        // Summary mode (default)
        const summary = getAuditSummary(session.workDir);
        if (json) {
            return JSON.stringify(summary, null, 2);
        }
        const total = countAuditEntries(session.workDir);
        const lines = [
            '',
            '  Audit Log Summary',
            '  ─────────────────',
            `  Total entries: ${total}`,
            '',
        ];
        if (total === 0) {
            lines.push('  No audit entries yet. Run gates to generate entries.');
        }
        else {
            lines.push('  By verdict:');
            for (const [v, count] of Object.entries(summary.by_verdict)) {
                lines.push(`    ${v.padEnd(6)} ${count}`);
            }
            lines.push('');
            lines.push('  By gate:');
            for (const [g, count] of Object.entries(summary.by_gate)) {
                lines.push(`    ${g.padEnd(6)} ${count}`);
            }
            if (summary.first_entry) {
                lines.push('');
                lines.push(`  First: ${summary.first_entry}`);
                lines.push(`  Last:  ${summary.last_entry}`);
            }
        }
        lines.push('');
        return lines.join('\n');
    },
};
//# sourceMappingURL=audit.js.map