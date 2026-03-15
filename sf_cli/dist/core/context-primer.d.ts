interface KnowledgeEntry {
    id: string;
    type: string;
    content: string;
    created_at: string;
    weight?: number;
    tags?: string[];
}
export interface PrimerResult {
    markdown: string;
    totalEntries: number;
    estimatedTokens: number;
    isStale: boolean;
}
/**
 * Generate a context primer from all JSONL knowledge files.
 * Returns compact markdown suitable for session-start injection.
 *
 * @param workDir - Project root directory
 * @returns PrimerResult with markdown and metadata
 */
export declare function generatePrimer(workDir: string): PrimerResult;
/**
 * Load and parse a JSONL file, skipping malformed lines.
 */
declare function loadJSONLFile(filePath: string): KnowledgeEntry[];
/**
 * Estimate token count from character count (chars / 4 heuristic).
 */
declare function estimateTokens(charCount: number): number;
/**
 * Truncate a string to maxLen, appending "..." if truncated.
 */
declare function truncate(text: string, maxLen: number): string;
/**
 * Short ID: first 8 chars of UUID.
 */
declare function shortID(id: string): string;
/**
 * Format a date as relative age: "today", "1d ago", "7d ago", etc.
 */
export declare function formatRelativeAge(dateStr: string): string;
export { loadJSONLFile, estimateTokens, truncate, shortID };
