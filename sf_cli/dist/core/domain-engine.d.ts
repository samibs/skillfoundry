/**
 * Domain Engine — Industry Knowledge Pack system for domain-specific intelligence.
 *
 * Loads, queries, and validates against structured industry knowledge packs.
 * Each pack contains rules (JSONL), reference docs, matrices, examples, and validators.
 */
export interface PackMetadata {
    name: string;
    version: string;
    title: string;
    description: string;
    jurisdiction: string[];
    industries: string[];
    rule_count: number;
    matrix_count: number;
    example_count: number;
    last_updated: string;
    disclaimer: string;
    dependencies?: string[];
}
export interface DomainRule {
    id: string;
    domain: string;
    category: string;
    title: string;
    rule: string;
    details: string;
    jurisdiction: string;
    exceptions: string[];
    formula: string | null;
    effective_date: string;
    source: string;
    source_url: string;
    confidence: 'legislation' | 'regulatory_guidance' | 'industry_standard' | 'expert_interpretation' | 'community_knowledge';
    tags: string[];
    last_verified: string;
}
export interface MatrixData {
    name: string;
    description: string;
    headers: string[];
    rows: Record<string, string | number>[];
    source: string;
    last_updated: string;
}
export interface DomainViolation {
    rule_id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
    file: string;
    line?: number;
    regulation: string;
    recommendation: string;
}
export interface PackInfo {
    metadata: PackMetadata;
    ruleCount: number;
    matrixCount: number;
    exampleCount: number;
    path: string;
}
export interface SearchResult {
    rule: DomainRule;
    score: number;
    pack: string;
}
export interface ExplainResponse {
    topic: string;
    rules: DomainRule[];
    disclaimer: string;
    pack: string;
}
/**
 * Get the packs directory path.
 */
export declare function getPacksDir(frameworkDir: string): string;
/**
 * List all installed packs.
 */
export declare function listInstalledPacks(frameworkDir: string): PackInfo[];
/**
 * Load all rules from a pack.
 */
export declare function loadPackRules(packPath: string): DomainRule[];
/**
 * Load a specific matrix from a pack.
 */
export declare function loadMatrix(packPath: string, matrixName: string): MatrixData | null;
/**
 * Load pack metadata.
 */
export declare function loadPackMetadata(packPath: string): PackMetadata | null;
/**
 * Extract search keywords from a query string.
 */
export declare function extractQueryKeywords(query: string): string[];
/**
 * Score a rule against a search query.
 */
export declare function scoreRule(rule: DomainRule, keywords: string[]): number;
/**
 * Search across all installed packs for rules matching a query.
 */
export declare function searchRules(frameworkDir: string, query: string, packFilter?: string): SearchResult[];
/**
 * Get a rule by exact ID.
 */
export declare function getRuleById(frameworkDir: string, ruleId: string): {
    rule: DomainRule;
    pack: string;
} | null;
/**
 * Explain a topic by finding relevant rules across packs.
 */
export declare function explainTopic(frameworkDir: string, topic: string): ExplainResponse;
/**
 * Simple pattern-based domain validation.
 * Each pack can define validation patterns in its rules.
 */
export declare function validateFile(frameworkDir: string, filePath: string, packName: string): DomainViolation[];
/**
 * Generate a domain-aware PRD from a description.
 */
export declare function generateDomainPrd(frameworkDir: string, description: string): string;
export type StalenessLevel = 'current' | 'stale' | 'outdated';
export interface RuleStaleness {
    rule: DomainRule;
    pack: string;
    level: StalenessLevel;
    daysSinceVerified: number;
}
/**
 * Compute staleness level for a rule based on last_verified date.
 * current: <6 months, stale: 6-12 months, outdated: >12 months
 */
export declare function computeStaleness(lastVerified: string): {
    level: StalenessLevel;
    daysSince: number;
};
/**
 * Get staleness info for all rules across all packs.
 */
export declare function getAllRuleStaleness(frameworkDir: string): RuleStaleness[];
/**
 * Format staleness summary per pack.
 */
export declare function formatStalenessSummary(frameworkDir: string): string;
export declare function formatPackList(packs: PackInfo[]): string;
export declare function formatExplainResponse(response: ExplainResponse): string;
export declare function formatSearchResults(results: SearchResult[]): string;
export declare function formatViolations(violations: DomainViolation[]): string;
export declare function formatMatrixData(matrix: MatrixData): string;
