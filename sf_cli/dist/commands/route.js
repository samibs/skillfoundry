/**
 * Route CLI command — smart task routing based on agent performance.
 */
import { resolve, join } from 'node:path';
import { routeTask, ensureSmartRouterSchema, getRecentDecisions, getAgentPerformance, formatRoutingReport, formatPerformanceTable, formatDecisionHistory, } from '../core/smart-router.js';
import { initDatabase } from '../core/dashboard-db.js';
const LINE = '\u2501';
const DEFAULT_DB_PATH = 'data/dashboard.db';
const AVAILABLE_AGENTS = [
    'coder', 'tester', 'architect', 'security', 'debugger', 'docs',
    'review', 'refactor', 'devops', 'performance', 'sre', 'seo',
    'ux-ui', 'i18n', 'migration', 'dependency', 'data-architect',
];
function getDbPath(workDir) {
    let dir = resolve(workDir);
    const { existsSync } = require('node:fs');
    for (let i = 0; i < 10; i++) {
        if (existsSync(join(dir, '.project-registry'))) {
            return join(dir, DEFAULT_DB_PATH);
        }
        const parent = resolve(dir, '..');
        if (parent === dir)
            break;
        dir = parent;
    }
    return join(resolve(workDir), DEFAULT_DB_PATH);
}
export const routeCommand = {
    name: 'route',
    description: 'Smart task routing based on historical agent performance',
    usage: '/route <description> | /route history | /route stats',
    async execute(args, session) {
        const workDir = session?.workDir || process.cwd();
        const dbPath = getDbPath(workDir);
        const parts = args.trim().split(/\s+/).filter(Boolean);
        const subcommand = parts[0] || '';
        switch (subcommand) {
            case 'history': {
                const db = initDatabase(dbPath);
                try {
                    ensureSmartRouterSchema(db);
                    return formatDecisionHistory(getRecentDecisions(db, 20));
                }
                finally {
                    db.close();
                }
            }
            case 'stats': {
                const db = initDatabase(dbPath);
                try {
                    ensureSmartRouterSchema(db);
                    return formatPerformanceTable(getAgentPerformance(db));
                }
                finally {
                    db.close();
                }
            }
            case 'help':
            case '':
                return [
                    'Smart Router — Learning-based task routing',
                    LINE.repeat(60),
                    '',
                    '  Usage:',
                    '    /route <description>      Recommend best agent for a task',
                    '    /route history             Show recent routing decisions',
                    '    /route stats               Show agent performance table',
                    '',
                    '  The router learns from past outcomes to improve future routing.',
                    '  Falls back to keyword-based classification when no history exists.',
                    '',
                ].join('\n');
            default: {
                const description = args.trim();
                const db = initDatabase(dbPath);
                try {
                    ensureSmartRouterSchema(db);
                    const recommendation = routeTask(db, description, AVAILABLE_AGENTS);
                    return formatRoutingReport(recommendation);
                }
                finally {
                    db.close();
                }
            }
        }
    },
};
//# sourceMappingURL=route.js.map