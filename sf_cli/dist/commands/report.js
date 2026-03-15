import { generateReport, formatReportMarkdown, formatReportJson } from '../core/report-generator.js';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
export const reportCommand = {
    name: 'report',
    description: 'Generate quality report from telemetry data',
    usage: '/report [--format md|json] [--window N] [--output path] [--baseline]',
    execute: async (args, session) => {
        const parts = args.trim().split(/\s+/);
        let format = 'md';
        let window = 10;
        let outputPath = null;
        for (let i = 0; i < parts.length; i++) {
            if (parts[i] === '--format' && parts[i + 1]) {
                format = parts[i + 1].toLowerCase();
                i++;
            }
            else if (parts[i] === '--window' && parts[i + 1]) {
                window = parseInt(parts[i + 1], 10) || 10;
                i++;
            }
            else if (parts[i] === '--output' && parts[i + 1]) {
                outputPath = parts[i + 1];
                i++;
            }
        }
        const report = generateReport(session.workDir, window);
        if (report.summary.total_runs === 0) {
            return [
                '**Quality Report**',
                '',
                '  No telemetry data available. Run /forge to start collecting metrics.',
                '  After 5+ forge runs, trend analysis and industry comparison become available.',
            ].join('\n');
        }
        const formatted = format === 'json'
            ? formatReportJson(report)
            : formatReportMarkdown(report);
        if (outputPath) {
            const fullPath = resolve(session.workDir, outputPath);
            if (!fullPath.startsWith(resolve(session.workDir))) {
                return 'Error: output path must be within the project directory.';
            }
            writeFileSync(fullPath, formatted);
            return `Report written to ${fullPath} (${format.toUpperCase()}, ${report.summary.total_runs} runs)`;
        }
        return formatted;
    },
};
//# sourceMappingURL=report.js.map