import type { AnthropicMessage } from '../types.js';
export declare function estimateTokens(text: string, charsPerToken?: number): number;
/**
 * Get the context window size for a model.
 * Returns configured override if provided, else looks up the model,
 * else returns the safe default (8192).
 */
export declare function getContextWindow(model: string, override?: number): number;
/**
 * Check if a provider is local (context compaction is most relevant for these).
 */
export declare function isLocalProvider(provider: string): boolean;
/**
 * Compress a system prompt to fit within a token budget.
 * Strategy: remove example blocks, long explanations, and keep core directives.
 * Preserves tool descriptions and critical instructions.
 */
export declare function compressSystemPrompt(prompt: string, maxTokens: number): string;
export interface CompactionOptions {
    /** Max context window in tokens for the target model */
    contextWindow: number;
    /** Max tokens reserved for the system prompt */
    systemPromptBudget?: number;
    /** Max tokens to reserve for the model's response */
    responseBudget?: number;
    /** Whether to inject a summary of pruned messages */
    injectSummary?: boolean;
    /** Chars-per-token ratio (default: 3.5) */
    charsPerToken?: number;
}
export interface CompactionResult {
    /** The compacted messages ready to send */
    messages: AnthropicMessage[];
    /** System prompt (possibly compressed) */
    systemPrompt: string;
    /** Number of messages pruned */
    prunedCount: number;
    /** Whether compaction was applied */
    wasCompacted: boolean;
    /** Estimated total tokens after compaction */
    estimatedTokens: number;
}
/**
 * Compact a conversation to fit within a model's context window.
 *
 * Strategy:
 * 1. Estimate total tokens (system prompt + all messages)
 * 2. If within budget → return unchanged
 * 3. Compress system prompt if it alone exceeds budget
 * 4. Sliding window: keep first user message + last N turns
 * 5. Optionally inject a summary of pruned messages
 */
export declare function compactMessages(messages: AnthropicMessage[], systemPrompt: string, options: CompactionOptions): CompactionResult;
