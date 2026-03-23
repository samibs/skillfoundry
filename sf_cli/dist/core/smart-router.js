/**
 * Smart Router — Learning-based task routing for agent selection.
 *
 * Tracks which agents succeed at which task types and uses historical
 * performance to route new tasks to the best-fit agent. Falls back to
 * keyword-based classification when no history exists.
 */
// ── Constants ───────────────────────────────────────────────────
const LINE = '\u2501';
const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet',
    'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'only', 'same', 'than',
    'too', 'very', 'just', 'because', 'if', 'when', 'where', 'how', 'what',
    'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'i', 'me',
    'my', 'we', 'our', 'you', 'your', 'it', 'its', 'they', 'them', 'their',
]);
/**
 * Task type keywords for fallback classification.
 */
const TASK_TYPE_MAP = {
    security: ['security', 'auth', 'xss', 'csrf', 'injection', 'vulnerability', 'audit', 'pentest', 'owasp'],
    testing: ['test', 'coverage', 'spec', 'jest', 'vitest', 'unit', 'integration', 'e2e', 'tdd'],
    code_generation: ['implement', 'build', 'create', 'add', 'feature', 'function', 'module', 'class', 'component'],
    architecture: ['architect', 'design', 'pattern', 'structure', 'system', 'database', 'schema', 'api', 'microservice'],
    debugging: ['bug', 'fix', 'error', 'crash', 'debug', 'issue', 'broken', 'failing', 'regression'],
    documentation: ['document', 'docs', 'readme', 'changelog', 'comment', 'jsdoc', 'guide', 'tutorial'],
    refactoring: ['refactor', 'clean', 'simplify', 'optimize', 'improve', 'modernize', 'migrate', 'upgrade'],
    devops: ['deploy', 'ci', 'cd', 'pipeline', 'docker', 'kubernetes', 'monitoring', 'sre', 'incident'],
    review: ['review', 'audit', 'evaluate', 'check', 'assess', 'inspect', 'quality'],
    performance: ['performance', 'speed', 'latency', 'throughput', 'memory', 'cpu', 'optimize', 'benchmark'],
};
/**
 * Default agent mapping for each task type (fallback).
 */
const DEFAULT_AGENT_MAP = {
    security: 'security',
    testing: 'tester',
    code_generation: 'coder',
    architecture: 'architect',
    debugging: 'debugger',
    documentation: 'docs',
    refactoring: 'refactor',
    devops: 'devops',
    review: 'review',
    performance: 'performance',
};
// ── Schema ──────────────────────────────────────────────────────
export const SMART_ROUTER_SCHEMA = `
CREATE TABLE IF NOT EXISTS routing_decisions (
  id TEXT PRIMARY KEY,
  task_description TEXT NOT NULL,
  task_keywords TEXT NOT NULL,
  agent_selected TEXT NOT NULL,
  outcome TEXT,
  score REAL,
  duration_ms INTEGER,
  cost_usd REAL,
  timestamp TEXT NOT NULL,
  project_id TEXT
);

CREATE TABLE IF NOT EXISTS agent_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  task_type TEXT NOT NULL,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  avg_score REAL DEFAULT 0,
  avg_duration_ms REAL DEFAULT 0,
  avg_cost_usd REAL DEFAULT 0,
  last_updated TEXT,
  UNIQUE(agent_name, task_type)
);

CREATE INDEX IF NOT EXISTS idx_routing_timestamp ON routing_decisions(timestamp);
CREATE INDEX IF NOT EXISTS idx_routing_agent ON routing_decisions(agent_selected);
CREATE INDEX IF NOT EXISTS idx_agent_perf ON agent_performance(agent_name, task_type);
`;
// ── Keyword Processing ──────────────────────────────────────────
/**
 * Extract meaningful keywords from a description.
 */
export function extractKeywords(description) {
    return description
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}
/**
 * Compute Jaccard similarity between two descriptions.
 */
export function computeKeywordOverlap(a, b) {
    const setA = new Set(extractKeywords(a));
    const setB = new Set(extractKeywords(b));
    if (setA.size === 0 && setB.size === 0)
        return 0;
    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size > 0 ? intersection.size / union.size : 0;
}
/**
 * Detect the task type from a description using keyword matching.
 */
export function detectTaskType(description) {
    const keywords = extractKeywords(description);
    let bestType = 'code_generation';
    let bestScore = 0;
    for (const [type, typeKeywords] of Object.entries(TASK_TYPE_MAP)) {
        const score = keywords.filter((k) => typeKeywords.includes(k)).length;
        if (score > bestScore) {
            bestScore = score;
            bestType = type;
        }
    }
    return bestType;
}
// ── Database Operations ─────────────────────────────────────────
export function ensureSmartRouterSchema(db) {
    db.exec(SMART_ROUTER_SCHEMA);
}
export function recordDecision(db, decision) {
    db.prepare(`
    INSERT INTO routing_decisions
      (id, task_description, task_keywords, agent_selected, outcome, score,
       duration_ms, cost_usd, timestamp, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(decision.id, decision.task_description, decision.task_keywords, decision.agent_selected, decision.outcome, decision.score, decision.duration_ms, decision.cost_usd, decision.timestamp, decision.project_id);
}
export function recordOutcome(db, decisionId, outcome, score, durationMs, costUsd) {
    db.prepare(`
    UPDATE routing_decisions
    SET outcome = ?, score = ?, duration_ms = COALESCE(?, duration_ms), cost_usd = COALESCE(?, cost_usd)
    WHERE id = ?
  `).run(outcome, score, durationMs ?? null, costUsd ?? null, decisionId);
}
export function updateAgentPerformance(db, agentName, taskType, success, score, durationMs, costUsd) {
    const existing = db.prepare('SELECT * FROM agent_performance WHERE agent_name = ? AND task_type = ?').get(agentName, taskType);
    if (existing) {
        const total = existing.success_count + existing.failure_count + 1;
        const newAvgScore = (existing.avg_score * (total - 1) + score) / total;
        const newAvgDuration = (existing.avg_duration_ms * (total - 1) + durationMs) / total;
        const newAvgCost = (existing.avg_cost_usd * (total - 1) + costUsd) / total;
        db.prepare(`
      UPDATE agent_performance
      SET success_count = success_count + ?, failure_count = failure_count + ?,
          avg_score = ?, avg_duration_ms = ?, avg_cost_usd = ?, last_updated = datetime('now')
      WHERE agent_name = ? AND task_type = ?
    `).run(success ? 1 : 0, success ? 0 : 1, newAvgScore, newAvgDuration, newAvgCost, agentName, taskType);
    }
    else {
        db.prepare(`
      INSERT INTO agent_performance
        (agent_name, task_type, success_count, failure_count, avg_score, avg_duration_ms, avg_cost_usd, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(agentName, taskType, success ? 1 : 0, success ? 0 : 1, score, durationMs, costUsd);
    }
}
export function getAgentPerformance(db, agentName) {
    if (agentName) {
        return db.prepare('SELECT * FROM agent_performance WHERE agent_name = ? ORDER BY avg_score DESC')
            .all(agentName);
    }
    return db.prepare('SELECT * FROM agent_performance ORDER BY avg_score DESC')
        .all();
}
export function getRecentDecisions(db, limit = 20) {
    return db.prepare('SELECT * FROM routing_decisions ORDER BY timestamp DESC LIMIT ?')
        .all(limit);
}
// ── Routing Algorithm ───────────────────────────────────────────
/**
 * Route a task to the best agent based on historical performance.
 */
export function routeTask(db, description, availableAgents) {
    ensureSmartRouterSchema(db);
    const taskType = detectTaskType(description);
    const keywords = extractKeywords(description);
    // Step 1: Check agent_performance for this task type
    const perfRecords = db.prepare('SELECT * FROM agent_performance WHERE task_type = ? ORDER BY avg_score DESC').all(taskType);
    const validPerf = perfRecords.filter((r) => availableAgents.includes(r.agent_name) && r.success_count + r.failure_count >= 3);
    if (validPerf.length > 0) {
        const best = validPerf[0];
        const total = best.success_count + best.failure_count;
        const winRate = best.success_count / total;
        const confidence = Math.min(0.95, winRate * Math.min(total / 10, 1));
        return {
            agent: best.agent_name,
            confidence,
            reason: `Best historical performance for "${taskType}" tasks (${best.success_count}W/${best.failure_count}L, avg score ${best.avg_score.toFixed(2)})`,
            historicalScore: best.avg_score,
            alternatives: validPerf.slice(1, 4).map((r) => ({ agent: r.agent_name, score: r.avg_score })),
            fallbackUsed: false,
        };
    }
    // Step 2: Check similar past routing decisions
    const pastDecisions = db.prepare('SELECT * FROM routing_decisions WHERE outcome = ? ORDER BY score DESC LIMIT 50').all('success');
    let bestMatch = null;
    for (const d of pastDecisions) {
        if (!availableAgents.includes(d.agent_selected))
            continue;
        const overlap = computeKeywordOverlap(description, d.task_description);
        if (overlap > 0.3 && (d.score ?? 0) > 0) {
            if (!bestMatch || overlap > bestMatch.overlap) {
                bestMatch = { agent: d.agent_selected, overlap, score: d.score ?? 0 };
            }
        }
    }
    if (bestMatch) {
        return {
            agent: bestMatch.agent,
            confidence: bestMatch.overlap * 0.7,
            reason: `Similar past task matched (${(bestMatch.overlap * 100).toFixed(0)}% keyword overlap, score ${bestMatch.score.toFixed(2)})`,
            historicalScore: bestMatch.score,
            alternatives: [],
            fallbackUsed: false,
        };
    }
    // Step 3: Fallback to keyword-based classification
    const defaultAgent = DEFAULT_AGENT_MAP[taskType] || 'coder';
    const fallbackAgent = availableAgents.includes(defaultAgent)
        ? defaultAgent
        : availableAgents[0] || 'coder';
    return {
        agent: fallbackAgent,
        confidence: 0.3,
        reason: `Keyword classification: "${taskType}" → ${fallbackAgent} (no historical data)`,
        historicalScore: 0,
        alternatives: [],
        fallbackUsed: true,
    };
}
// ── Formatting ──────────────────────────────────────────────────
export function formatRoutingReport(rec) {
    const lines = [
        'Smart Router',
        LINE.repeat(60),
        `  Recommended agent: ${rec.agent}`,
        `  Confidence:        ${(rec.confidence * 100).toFixed(0)}%${rec.fallbackUsed ? ' (fallback)' : ''}`,
        `  Reason:            ${rec.reason}`,
    ];
    if (rec.historicalScore > 0) {
        lines.push(`  Historical score:  ${rec.historicalScore.toFixed(3)}`);
    }
    if (rec.alternatives.length > 0) {
        lines.push('');
        lines.push('  Alternatives:');
        for (const alt of rec.alternatives) {
            lines.push(`    - ${alt.agent} (score: ${alt.score.toFixed(3)})`);
        }
    }
    lines.push('');
    return lines.join('\n');
}
export function formatPerformanceTable(records) {
    if (records.length === 0)
        return '  No agent performance data yet.\n';
    const lines = [
        'Agent Performance',
        LINE.repeat(60),
        '',
        '  Agent               Task Type        W    L   Avg Score  Avg Cost',
        '  ' + '\u2500'.repeat(56),
    ];
    for (const r of records) {
        const agent = r.agent_name.padEnd(20).slice(0, 20);
        const type = r.task_type.padEnd(16).slice(0, 16);
        const wins = String(r.success_count).padStart(3);
        const losses = String(r.failure_count).padStart(4);
        const score = r.avg_score.toFixed(3).padStart(10);
        const cost = ('$' + r.avg_cost_usd.toFixed(4)).padStart(9);
        lines.push(`  ${agent} ${type} ${wins} ${losses} ${score} ${cost}`);
    }
    lines.push('');
    return lines.join('\n');
}
export function formatDecisionHistory(records) {
    if (records.length === 0)
        return '  No routing decisions recorded yet.\n';
    const lines = [
        'Routing History',
        LINE.repeat(60),
        '',
        '  Time                Agent            Outcome  Score  Task',
        '  ' + '\u2500'.repeat(56),
    ];
    for (const r of records) {
        const time = (r.timestamp || '').slice(0, 16).padEnd(20);
        const agent = r.agent_selected.padEnd(16).slice(0, 16);
        const outcome = (r.outcome || 'pending').padEnd(8);
        const score = r.score != null ? r.score.toFixed(2).padStart(6) : '   n/a';
        const task = (r.task_description || '').slice(0, 30);
        lines.push(`  ${time} ${agent} ${outcome} ${score}  ${task}`);
    }
    lines.push('');
    return lines.join('\n');
}
//# sourceMappingURL=smart-router.js.map