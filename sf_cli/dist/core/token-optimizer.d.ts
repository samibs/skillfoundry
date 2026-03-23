/**
 * Token Optimizer — Context compression to reduce LLM costs.
 *
 * Strategies: strip markdown overhead, collapse repeated patterns,
 * strip code comments, truncate long file contents, deduplicate
 * instructions, and compact tables.
 */
export type CompressionStrategy = 'strip-markdown' | 'collapse-repeats' | 'strip-comments' | 'truncate-files' | 'dedup-instructions' | 'compact-tables';
export interface CompressionSavings {
    strategy: CompressionStrategy;
    originalTokens: number;
    compressedTokens: number;
    savedTokens: number;
    savedPct: number;
}
export interface TokenAnalysis {
    totalTokens: number;
    breakdown: Array<{
        section: string;
        tokens: number;
        pct: number;
    }>;
    suggestions: string[];
    estimatedCostUsd: number;
}
export interface CompressResult {
    original: string;
    compressed: string;
    originalTokens: number;
    compressedTokens: number;
    totalSaved: number;
    totalSavedPct: number;
    strategiesApplied: CompressionSavings[];
}
export declare function estimateTokens(text: string): number;
/**
 * Convert markdown headers to bold, tables to key-value, remove HRs.
 */
export declare function stripMarkdownOverhead(text: string): string;
/**
 * Collapse 3+ repeated or similar lines into a count.
 */
export declare function collapseRepeatedPatterns(text: string): string;
/**
 * Remove code comments (// and /* *\/) but preserve JSDoc.
 */
export declare function stripCodeComments(code: string): string;
/**
 * Truncate long code blocks (>50 lines) to first 10 + last 10.
 */
export declare function truncateFileContents(text: string, maxLines?: number): string;
/**
 * Remove duplicate sentences across the text.
 */
export declare function deduplicateInstructions(text: string): string;
/**
 * Convert markdown tables to compact key: value lists.
 */
export declare function compactTables(text: string): string;
export declare function getAllCompressionStrategies(): Array<{
    id: CompressionStrategy;
    description: string;
}>;
/**
 * Analyze token usage in a text, broken down by section.
 */
export declare function analyzeTokens(text: string): TokenAnalysis;
/**
 * Compress text using selected (or all) strategies.
 */
export declare function compressContext(text: string, options?: {
    strategies?: CompressionStrategy[];
    maxTokens?: number;
}): CompressResult;
export declare function formatAnalysisReport(analysis: TokenAnalysis): string;
export declare function formatCompressReport(result: CompressResult): string;
