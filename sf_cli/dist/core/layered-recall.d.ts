export interface RecallFilters {
    type?: string;
    minWeight?: number;
    since?: string;
    tags?: string[];
    limit?: number;
}
interface KnowledgeEntry {
    id: string;
    type: string;
    content: string;
    created_at: string;
    created_by?: string;
    session_id?: string;
    weight?: number;
    tags?: string[];
    context?: {
        prd_id?: string | null;
        story_id?: string | null;
        phase?: string;
    };
    reality_anchor?: {
        has_tests?: boolean;
        test_file?: string | null;
        test_passing?: boolean;
    };
    lineage?: {
        parent_id?: string | null;
        supersedes?: string[];
        superseded_by?: string | null;
    };
    validation_count?: number;
    retrieval_count?: number;
}
export interface IndexResult {
    id: string;
    type: string;
    snippet: string;
    score: number;
    weight: number;
    scoreBreakdown: ScoreBreakdown;
}
export interface PreviewResult {
    id: string;
    type: string;
    content: string;
    weight: number;
    tags: string[];
    createdAt: string;
}
export interface FullResult {
    entry: KnowledgeEntry;
}
interface ScoreBreakdown {
    exactMatch: number;
    wordMatches: number;
    typeBonus: number;
    weightBonus: number;
    tagBonus: number;
}
/**
 * Search knowledge and return a compact index of matches.
 * Returns: id, type, snippet (60 chars), score, weight.
 */
export declare function recallIndex(query: string, workDir: string, filters?: RecallFilters): IndexResult[];
/**
 * Load specific entries by ID and return content previews (200 chars).
 */
export declare function recallPreview(ids: string[], workDir: string): PreviewResult[];
/**
 * Load specific entries by ID and return complete entries.
 */
export declare function recallFull(ids: string[], workDir: string): FullResult[];
interface ScoredEntry {
    entry: KnowledgeEntry;
    score: number;
    breakdown: ScoreBreakdown;
}
declare function scoreEntries(entries: KnowledgeEntry[], query: string): ScoredEntry[];
declare function applyFilters(entries: KnowledgeEntry[], filters?: RecallFilters): KnowledgeEntry[];
declare function parseSinceFilter(since: string): Date | null;
declare function loadAllEntries(workDir: string): KnowledgeEntry[];
/**
 * Format index results as compact markdown table.
 */
export declare function formatIndexResults(results: IndexResult[]): string;
/**
 * Format preview results as readable markdown.
 */
export declare function formatPreviewResults(results: PreviewResult[]): string;
/**
 * Format full results as complete JSON blocks.
 */
export declare function formatFullResults(results: FullResult[]): string;
export { loadAllEntries, scoreEntries, applyFilters, parseSinceFilter };
