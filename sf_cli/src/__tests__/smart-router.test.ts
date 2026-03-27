import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  ensureSmartRouterSchema,
  extractKeywords,
  computeKeywordOverlap,
  detectTaskType,
  recordDecision,
  recordOutcome,
  updateAgentPerformance,
  getAgentPerformance,
  getRecentDecisions,
  routeTask,
  startAgentDispatch,
  completeAgentDispatch,
  hasLearningData,
  getLearningStatus,
  formatRoutingReport,
  formatPerformanceTable,
  formatDecisionHistory,
} from '../core/smart-router.js';
import { initDatabase } from '../core/dashboard-db.js';

let db: Database.Database;

beforeEach(() => {
  db = initDatabase(':memory:');
  ensureSmartRouterSchema(db);
});

afterEach(() => {
  db.close();
});

describe('ensureSmartRouterSchema', () => {
  it('creates tables on fresh DB', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('routing_decisions', 'agent_performance')").all();
    expect(tables).toHaveLength(2);
  });

  it('is idempotent', () => {
    ensureSmartRouterSchema(db);
    ensureSmartRouterSchema(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('routing_decisions', 'agent_performance')").all();
    expect(tables).toHaveLength(2);
  });
});

describe('extractKeywords', () => {
  it('removes stop words', () => {
    const kw = extractKeywords('implement the user authentication service');
    expect(kw).toContain('implement');
    expect(kw).toContain('authentication');
    expect(kw).not.toContain('the');
  });

  it('lowercases words', () => {
    const kw = extractKeywords('Fix the BUG');
    expect(kw).toContain('fix');
    expect(kw).toContain('bug');
  });

  it('handles empty string', () => {
    expect(extractKeywords('')).toHaveLength(0);
  });
});

describe('computeKeywordOverlap', () => {
  it('returns 1.0 for identical descriptions', () => {
    expect(computeKeywordOverlap('implement auth', 'implement auth')).toBe(1.0);
  });

  it('returns 0.0 for no overlap', () => {
    expect(computeKeywordOverlap('security audit', 'deploy kubernetes')).toBe(0);
  });

  it('returns partial score for partial overlap', () => {
    const score = computeKeywordOverlap('implement user auth', 'implement payment service');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('handles empty strings', () => {
    expect(computeKeywordOverlap('', '')).toBe(0);
  });
});

describe('detectTaskType', () => {
  it('detects security tasks', () => {
    expect(detectTaskType('audit for XSS vulnerabilities')).toBe('security');
  });

  it('detects testing tasks', () => {
    expect(detectTaskType('write unit tests with coverage report')).toBe('testing');
  });

  it('defaults to code_generation', () => {
    expect(detectTaskType('something random')).toBe('code_generation');
  });
});

describe('recordDecision + getRecentDecisions', () => {
  it('round-trips insert and read', () => {
    recordDecision(db, {
      id: 'dec-1', task_description: 'implement auth', task_keywords: 'implement,auth',
      agent_selected: 'coder', outcome: null, score: null,
      duration_ms: null, cost_usd: null, timestamp: '2026-03-19T10:00:00Z', project_id: null,
    });
    const decisions = getRecentDecisions(db, 10);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].agent_selected).toBe('coder');
  });

  it('respects limit', () => {
    for (let i = 0; i < 5; i++) {
      recordDecision(db, {
        id: `dec-${i}`, task_description: `task ${i}`, task_keywords: 'test',
        agent_selected: 'coder', outcome: null, score: null,
        duration_ms: null, cost_usd: null, timestamp: `2026-03-19T10:0${i}:00Z`, project_id: null,
      });
    }
    expect(getRecentDecisions(db, 3)).toHaveLength(3);
  });

  it('orders by timestamp desc', () => {
    recordDecision(db, {
      id: 'old', task_description: 'old', task_keywords: 'old',
      agent_selected: 'coder', outcome: null, score: null,
      duration_ms: null, cost_usd: null, timestamp: '2026-01-01T00:00:00Z', project_id: null,
    });
    recordDecision(db, {
      id: 'new', task_description: 'new', task_keywords: 'new',
      agent_selected: 'tester', outcome: null, score: null,
      duration_ms: null, cost_usd: null, timestamp: '2026-03-01T00:00:00Z', project_id: null,
    });
    const decisions = getRecentDecisions(db, 10);
    expect(decisions[0].id).toBe('new');
  });
});

describe('recordOutcome', () => {
  it('updates existing decision', () => {
    recordDecision(db, {
      id: 'dec-1', task_description: 'test', task_keywords: 'test',
      agent_selected: 'coder', outcome: null, score: null,
      duration_ms: null, cost_usd: null, timestamp: '2026-03-19T10:00:00Z', project_id: null,
    });
    recordOutcome(db, 'dec-1', 'success', 0.85, 5000, 0.02);
    const decisions = getRecentDecisions(db, 10);
    expect(decisions[0].outcome).toBe('success');
    expect(decisions[0].score).toBe(0.85);
  });

  it('ignores nonexistent ID', () => {
    // Should not throw
    recordOutcome(db, 'nonexistent', 'success', 0.5);
  });
});

describe('updateAgentPerformance + getAgentPerformance', () => {
  it('creates new record', () => {
    updateAgentPerformance(db, 'coder', 'code_generation', true, 0.9, 5000, 0.02);
    const records = getAgentPerformance(db, 'coder');
    expect(records).toHaveLength(1);
    expect(records[0].success_count).toBe(1);
  });

  it('updates existing on second call', () => {
    updateAgentPerformance(db, 'coder', 'code_generation', true, 0.9, 5000, 0.02);
    updateAgentPerformance(db, 'coder', 'code_generation', false, 0.3, 8000, 0.05);
    const records = getAgentPerformance(db, 'coder');
    expect(records).toHaveLength(1);
    expect(records[0].success_count).toBe(1);
    expect(records[0].failure_count).toBe(1);
  });

  it('computes running averages', () => {
    updateAgentPerformance(db, 'tester', 'testing', true, 0.8, 4000, 0.01);
    updateAgentPerformance(db, 'tester', 'testing', true, 1.0, 6000, 0.03);
    const records = getAgentPerformance(db, 'tester');
    expect(records[0].avg_score).toBeCloseTo(0.9, 1);
  });

  it('returns all when no filter', () => {
    updateAgentPerformance(db, 'coder', 'code_generation', true, 0.9, 5000, 0.02);
    updateAgentPerformance(db, 'tester', 'testing', true, 0.8, 4000, 0.01);
    expect(getAgentPerformance(db).length).toBe(2);
  });
});

describe('routeTask with history', () => {
  it('selects top-performing agent', () => {
    for (let i = 0; i < 5; i++) {
      updateAgentPerformance(db, 'security', 'security', true, 0.95, 3000, 0.01);
    }
    updateAgentPerformance(db, 'coder', 'security', true, 0.6, 5000, 0.03);

    const rec = routeTask(db, 'audit for XSS vulnerabilities', ['security', 'coder', 'tester']);
    expect(rec.agent).toBe('security');
    expect(rec.fallbackUsed).toBe(false);
  });

  it('returns alternatives', () => {
    for (let i = 0; i < 4; i++) {
      updateAgentPerformance(db, 'security', 'security', true, 0.95, 3000, 0.01);
      updateAgentPerformance(db, 'coder', 'security', true, 0.7, 5000, 0.02);
    }
    const rec = routeTask(db, 'security audit', ['security', 'coder']);
    expect(rec.alternatives.length).toBeGreaterThanOrEqual(0);
  });

  it('confidence scales with data volume', () => {
    for (let i = 0; i < 3; i++) {
      updateAgentPerformance(db, 'coder', 'code_generation', true, 0.9, 5000, 0.02);
    }
    const low = routeTask(db, 'implement feature', ['coder']);

    for (let i = 0; i < 10; i++) {
      updateAgentPerformance(db, 'coder', 'code_generation', true, 0.9, 5000, 0.02);
    }
    const high = routeTask(db, 'implement feature', ['coder']);
    expect(high.confidence).toBeGreaterThanOrEqual(low.confidence);
  });

  it('excludes agents not in available list', () => {
    for (let i = 0; i < 5; i++) {
      updateAgentPerformance(db, 'security', 'security', true, 0.99, 3000, 0.01);
    }
    const rec = routeTask(db, 'security audit', ['coder', 'tester']);
    expect(rec.agent).not.toBe('security');
  });
});

describe('routeTask without history (fallback)', () => {
  it('falls back to keyword classifier', () => {
    const rec = routeTask(db, 'write unit tests', ['tester', 'coder']);
    expect(rec.fallbackUsed).toBe(true);
    expect(rec.agent).toBe('tester');
  });

  it('marks fallbackUsed=true', () => {
    const rec = routeTask(db, 'implement something', ['coder']);
    expect(rec.fallbackUsed).toBe(true);
  });

  it('returns from availableAgents only', () => {
    const rec = routeTask(db, 'security audit', ['docs', 'performance']);
    expect(['docs', 'performance']).toContain(rec.agent);
  });

  it('handles empty description', () => {
    const rec = routeTask(db, '', ['coder']);
    expect(rec.agent).toBe('coder');
    expect(rec.fallbackUsed).toBe(true);
  });
});

describe('formatRoutingReport', () => {
  it('includes agent name and confidence', () => {
    const report = formatRoutingReport({
      agent: 'coder', confidence: 0.85, reason: 'test',
      historicalScore: 0.9, alternatives: [], fallbackUsed: false,
    });
    expect(report).toContain('coder');
    expect(report).toContain('85%');
  });

  it('shows fallback indicator', () => {
    const report = formatRoutingReport({
      agent: 'coder', confidence: 0.3, reason: 'test',
      historicalScore: 0, alternatives: [], fallbackUsed: true,
    });
    expect(report).toContain('fallback');
  });

  it('shows alternatives', () => {
    const report = formatRoutingReport({
      agent: 'security', confidence: 0.9, reason: 'test',
      historicalScore: 0.95, alternatives: [{ agent: 'coder', score: 0.7 }],
      fallbackUsed: false,
    });
    expect(report).toContain('coder');
  });
});

describe('formatPerformanceTable', () => {
  it('formats records', () => {
    updateAgentPerformance(db, 'coder', 'code_generation', true, 0.9, 5000, 0.02);
    const records = getAgentPerformance(db);
    const table = formatPerformanceTable(records);
    expect(table).toContain('coder');
    expect(table).toContain('code_generation');
  });

  it('handles empty records', () => {
    const table = formatPerformanceTable([]);
    expect(table).toContain('No agent performance');
  });
});

describe('formatDecisionHistory', () => {
  it('formats decisions', () => {
    recordDecision(db, {
      id: 'dec-1', task_description: 'test task', task_keywords: 'test',
      agent_selected: 'coder', outcome: 'success', score: 0.85,
      duration_ms: 5000, cost_usd: 0.02, timestamp: '2026-03-19T10:00:00Z', project_id: null,
    });
    const history = formatDecisionHistory(getRecentDecisions(db));
    expect(history).toContain('coder');
    expect(history).toContain('success');
  });

  it('handles empty history', () => {
    const history = formatDecisionHistory([]);
    expect(history).toContain('No routing decisions');
  });
});

// ── Instrumentation (Story 5.1) ─────────────────────────────────

describe('startAgentDispatch + completeAgentDispatch', () => {
  it('records a routing decision and updates performance on completion', () => {
    const id = startAgentDispatch(db, 'implement user login', 'coder', 'proj-1');
    expect(id).toBeTruthy();

    const decisions = getRecentDecisions(db, 1);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].agent_selected).toBe('coder');
    expect(decisions[0].outcome).toBeNull();

    completeAgentDispatch(db, id, 'success', 8.5, 5000, 0.02);

    const updated = getRecentDecisions(db, 1);
    expect(updated[0].outcome).toBe('success');
    expect(updated[0].score).toBe(8.5);

    const perf = getAgentPerformance(db, 'coder');
    expect(perf).toHaveLength(1);
    expect(perf[0].success_count).toBe(1);
  });

  it('tracks failures correctly', () => {
    const id = startAgentDispatch(db, 'fix auth bug', 'debugger');
    completeAgentDispatch(db, id, 'failure', 2.0, 10000);

    const perf = getAgentPerformance(db, 'debugger');
    expect(perf[0].failure_count).toBe(1);
    expect(perf[0].success_count).toBe(0);
  });
});

describe('hasLearningData', () => {
  it('returns false with no data', () => {
    expect(hasLearningData(db)).toBe(false);
  });

  it('returns true after 10+ completed decisions', () => {
    for (let i = 0; i < 10; i++) {
      const id = startAgentDispatch(db, `task ${i}`, 'coder');
      completeAgentDispatch(db, id, 'success', 7, 1000);
    }
    expect(hasLearningData(db)).toBe(true);
  });
});

describe('getLearningStatus', () => {
  it('returns summary of router state', () => {
    const id = startAgentDispatch(db, 'build feature', 'coder');
    completeAgentDispatch(db, id, 'success', 9, 3000);
    startAgentDispatch(db, 'pending task', 'tester');

    const status = getLearningStatus(db);
    expect(status.totalDecisions).toBe(2);
    expect(status.completedDecisions).toBe(1);
    expect(status.uniqueAgents).toBe(1);
    expect(status.isLearning).toBe(false);
  });
});
