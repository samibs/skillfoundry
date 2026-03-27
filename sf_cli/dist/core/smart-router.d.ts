/**
 * Smart Router — Learning-based task routing for agent selection.
 *
 * Tracks which agents succeed at which task types and uses historical
 * performance to route new tasks to the best-fit agent. Falls back to
 * keyword-based classification when no history exists.
 */
import type Database from 'better-sqlite3';
export interface RoutingRecommendation {
    agent: string;
    confidence: number;
    reason: string;
    historicalScore: number;
    alternatives: Array<{
        agent: string;
        score: number;
    }>;
    fallbackUsed: boolean;
}
export interface RoutingDecisionRecord {
    id: string;
    task_description: string;
    task_keywords: string;
    agent_selected: string;
    outcome: string | null;
    score: number | null;
    duration_ms: number | null;
    cost_usd: number | null;
    timestamp: string;
    project_id: string | null;
}
export interface AgentPerformanceRecord {
    agent_name: string;
    task_type: string;
    success_count: number;
    failure_count: number;
    avg_score: number;
    avg_duration_ms: number;
    avg_cost_usd: number;
}
export declare const SMART_ROUTER_SCHEMA = "\nCREATE TABLE IF NOT EXISTS routing_decisions (\n  id TEXT PRIMARY KEY,\n  task_description TEXT NOT NULL,\n  task_keywords TEXT NOT NULL,\n  agent_selected TEXT NOT NULL,\n  outcome TEXT,\n  score REAL,\n  duration_ms INTEGER,\n  cost_usd REAL,\n  timestamp TEXT NOT NULL,\n  project_id TEXT\n);\n\nCREATE TABLE IF NOT EXISTS agent_performance (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  agent_name TEXT NOT NULL,\n  task_type TEXT NOT NULL,\n  success_count INTEGER DEFAULT 0,\n  failure_count INTEGER DEFAULT 0,\n  avg_score REAL DEFAULT 0,\n  avg_duration_ms REAL DEFAULT 0,\n  avg_cost_usd REAL DEFAULT 0,\n  last_updated TEXT,\n  UNIQUE(agent_name, task_type)\n);\n\nCREATE INDEX IF NOT EXISTS idx_routing_timestamp ON routing_decisions(timestamp);\nCREATE INDEX IF NOT EXISTS idx_routing_agent ON routing_decisions(agent_selected);\nCREATE INDEX IF NOT EXISTS idx_agent_perf ON agent_performance(agent_name, task_type);\n";
/**
 * Extract meaningful keywords from a description.
 */
export declare function extractKeywords(description: string): string[];
/**
 * Compute Jaccard similarity between two descriptions.
 */
export declare function computeKeywordOverlap(a: string, b: string): number;
/**
 * Detect the task type from a description using keyword matching.
 */
export declare function detectTaskType(description: string): string;
export declare function ensureSmartRouterSchema(db: Database.Database): void;
export declare function recordDecision(db: Database.Database, decision: RoutingDecisionRecord): void;
export declare function recordOutcome(db: Database.Database, decisionId: string, outcome: string, score: number, durationMs?: number, costUsd?: number): void;
export declare function updateAgentPerformance(db: Database.Database, agentName: string, taskType: string, success: boolean, score: number, durationMs: number, costUsd: number): void;
export declare function getAgentPerformance(db: Database.Database, agentName?: string): AgentPerformanceRecord[];
export declare function getRecentDecisions(db: Database.Database, limit?: number): RoutingDecisionRecord[];
/**
 * Route a task to the best agent based on historical performance.
 */
export declare function routeTask(db: Database.Database, description: string, availableAgents: string[]): RoutingRecommendation;
/**
 * Record the start of an agent dispatch. Returns a decision ID that must be
 * passed to `completeAgentDispatch` when the story/task finishes.
 */
export declare function startAgentDispatch(db: Database.Database, description: string, agentName: string, projectId?: string): string;
/**
 * Record the outcome of an agent dispatch. Updates both the routing decision
 * and the agent performance tables. Call this when a story/task completes.
 */
export declare function completeAgentDispatch(db: Database.Database, decisionId: string, outcome: 'success' | 'failure' | 'partial', score: number, durationMs: number, costUsd?: number): void;
/**
 * Check if the router has enough data to make data-driven recommendations.
 * Returns true when 10+ decisions have been recorded with outcomes.
 */
export declare function hasLearningData(db: Database.Database): boolean;
/**
 * Get a summary of router learning status for display.
 */
export declare function getLearningStatus(db: Database.Database): {
    totalDecisions: number;
    completedDecisions: number;
    uniqueAgents: number;
    isLearning: boolean;
};
export declare function formatRoutingReport(rec: RoutingRecommendation): string;
export declare function formatPerformanceTable(records: AgentPerformanceRecord[]): string;
export declare function formatDecisionHistory(records: RoutingDecisionRecord[]): string;
