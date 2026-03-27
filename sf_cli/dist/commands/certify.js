/**
 * Certify CLI command — RegForge certification pipeline.
 */
import { resolve, join } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { runCertification, formatCertificationReport, generateHtmlReport, insertCertificationRun, getCertificationHistory, getCertificationRun, getAllCategories, } from '../core/certification-engine.js';
import { initDatabase } from '../core/dashboard-db.js';
const LINE = '\u2501';
const DEFAULT_DB_PATH = 'data/dashboard.db';
function getDbPath(workDir) {
    const { existsSync: ex } = require('node:fs');
    let dir = resolve(workDir);
    for (let i = 0; i < 10; i++) {
        if (ex(join(dir, '.project-registry')))
            return join(dir, DEFAULT_DB_PATH);
        const parent = resolve(dir, '..');
        if (parent === dir)
            break;
        dir = parent;
    }
    return join(resolve(workDir), DEFAULT_DB_PATH);
}
export const certifyCommand = {
    name: 'certify',
    description: 'Run RegForge certification pipeline — 15 categories including contracts, authorization, error-handling, and supply-chain',
    usage: '/certify [project-path] [--category name] [--html output.html] | /certify history | /certify report <id>',
    async execute(args, session) {
        const workDir = session?.workDir || process.cwd();
        const dbPath = getDbPath(workDir);
        const parts = args.trim().split(/\s+/).filter(Boolean);
        const flags = {};
        let subcommand = '';
        for (let i = 0; i < parts.length; i++) {
            if (parts[i].startsWith('--')) {
                const key = parts[i].slice(2);
                if (i + 1 < parts.length && !parts[i + 1].startsWith('--')) {
                    flags[key] = parts[i + 1];
                    i++;
                }
                else {
                    flags[key] = 'true';
                }
            }
            else if (!subcommand) {
                subcommand = parts[i];
            }
        }
        switch (subcommand) {
            case 'history': {
                const db = initDatabase(dbPath);
                try {
                    const runs = getCertificationHistory(db, 20);
                    if (runs.length === 0)
                        return '  No certification runs found.';
                    const lines = [
                        'Certification History',
                        LINE.repeat(60),
                        '',
                        '  ID        Project              Grade  Score  Findings  Date',
                        '  ' + '\u2500'.repeat(56),
                    ];
                    for (const r of runs) {
                        lines.push(`  ${r.id.slice(0, 8)}  ${(r.project_name || '').padEnd(20).slice(0, 20)} ${r.grade.padEnd(6)} ${String(r.overall_score.toFixed(1)).padStart(5)}  ${String(r.total_findings).padStart(8)}  ${(r.completed_at || '').slice(0, 10)}`);
                    }
                    lines.push('');
                    return lines.join('\n');
                }
                finally {
                    db.close();
                }
            }
            case 'report': {
                const id = parts[1] || '';
                if (!id)
                    return '  Usage: /certify report <id>';
                const db = initDatabase(dbPath);
                try {
                    const runs = getCertificationHistory(db, 100);
                    const match = runs.find((r) => r.id.startsWith(id));
                    if (!match)
                        return `  Certification run "${id}" not found.`;
                    const result = getCertificationRun(db, match.id);
                    if (!result)
                        return `  Run data not found.`;
                    return formatCertificationReport(result);
                }
                finally {
                    db.close();
                }
            }
            case 'categories':
                return [
                    'Certification Categories',
                    LINE.repeat(60),
                    '',
                    ...getAllCategories().map((c) => `  - ${c}`),
                    '',
                ].join('\n');
            case 'help':
            case '': {
                // If no subcommand, run certification on current directory
                if (!subcommand) {
                    const projectPath = resolve(workDir);
                    return runAndReport(projectPath, flags, dbPath);
                }
                return [
                    'RegForge Certification Pipeline',
                    LINE.repeat(60),
                    '',
                    '  Usage:',
                    '    /certify                            Certify current project',
                    '    /certify <path>                     Certify specific project',
                    '    /certify --category security        Run single category',
                    '    /certify --html report.html         Generate HTML report',
                    '    /certify history                    List past certifications',
                    '    /certify report <id>                View past report',
                    '    /certify categories                 List all 15 categories',
                    '',
                    '  Categories: security, documentation, testing, dependencies, license,',
                    '              accessibility, privacy, architecture, seo, performance, ci-cd,',
                    '              contracts, authorization, error-handling, supply-chain',
                    '',
                    '  Grading: A (90+), B (75-89), C (60-74), D (40-59), F (<40)',
                    '',
                ].join('\n');
            }
            default: {
                // subcommand is likely a project path
                const projectPath = resolve(workDir, subcommand);
                if (!existsSync(projectPath)) {
                    return `  Path not found: ${projectPath}\n  Usage: /certify [project-path] or /certify help`;
                }
                return runAndReport(projectPath, flags, dbPath);
            }
        }
    },
};
function runAndReport(projectPath, flags, dbPath) {
    const categories = flags.category ? [flags.category] : undefined;
    const result = runCertification({ projectPath, categories });
    // Persist to DB
    try {
        const db = initDatabase(dbPath);
        try {
            insertCertificationRun(db, result);
        }
        finally {
            db.close();
        }
    }
    catch { /* non-critical */ }
    // Generate HTML if requested
    if (flags.html) {
        const html = generateHtmlReport(result);
        writeFileSync(flags.html, html, 'utf-8');
    }
    let output = formatCertificationReport(result);
    if (flags.html) {
        output += `  HTML report: ${flags.html}\n`;
    }
    else {
        output += `  Generate HTML: /certify ${projectPath} --html report.html\n`;
    }
    return output;
}
//# sourceMappingURL=certify.js.map