// Context compaction engine — adapts conversation context to fit within
// a provider's context window. Implements sliding-window message pruning,
// system prompt compression, and optional summary injection.
//
// Implements FR-001 through FR-004 of the local-first-development PRD.
// ── Token Estimation ────────────────────────────────────────────────
// Conservative 3.5 chars-per-token ratio. Overestimates slightly
// (safer — avoids overflow on models with aggressive tokenizers).
const DEFAULT_CHARS_PER_TOKEN = 3.5;
export function estimateTokens(text, charsPerToken = DEFAULT_CHARS_PER_TOKEN) {
    return Math.ceil(text.length / charsPerToken);
}
function messageTokens(msg, charsPerToken = DEFAULT_CHARS_PER_TOKEN) {
    if (typeof msg.content === 'string') {
        return estimateTokens(msg.content, charsPerToken);
    }
    // Array of content blocks — sum all text
    let totalChars = 0;
    for (const block of msg.content) {
        if (block.type === 'text' && block.text) {
            totalChars += block.text.length;
        }
        else if (block.type === 'tool_use') {
            totalChars += JSON.stringify(block.input || {}).length + (block.name?.length || 0);
        }
        else if (block.type === 'tool_result' && block.content) {
            totalChars += block.content.length;
        }
    }
    return Math.ceil(totalChars / charsPerToken);
}
// ── Context Window Defaults ─────────────────────────────────────────
const CONTEXT_WINDOWS = {
    // Cloud providers
    'claude-sonnet-4-20250514': 200_000,
    'claude-opus-4-20250514': 200_000,
    'claude-haiku-3.5': 200_000,
    'gpt-4o': 128_000,
    'gpt-4o-mini': 128_000,
    'gpt-4.1': 128_000,
    'gpt-4.1-mini': 128_000,
    'gpt-4.1-nano': 128_000,
    'o3': 200_000,
    'o3-mini': 200_000,
    'o4-mini': 200_000,
    'grok-3': 131_072,
    'gemini-2.5-pro': 1_048_576,
    'gemini-2.5-flash': 1_048_576,
    'gemini-2.0-flash': 1_048_576,
    // Local model defaults (conservative)
    'llama3.1': 8_192,
    'llama3.2': 8_192,
    'llama3': 8_192,
    'qwen2.5-coder-7b': 32_768,
    'qwen2.5-coder-14b': 32_768,
    'qwen2.5-coder-32b': 32_768,
    'codellama': 16_384,
    'deepseek-coder': 16_384,
    'mistral': 8_192,
    'mixtral': 32_768,
    'phi-3': 4_096,
    'phi-4': 16_384,
};
// Default for unknown models — conservative for safety
const DEFAULT_CONTEXT_WINDOW = 8_192;
/**
 * Get the context window size for a model.
 * Returns configured override if provided, else looks up the model,
 * else returns the safe default (8192).
 */
export function getContextWindow(model, override) {
    if (override && override > 0)
        return override;
    return CONTEXT_WINDOWS[model] || DEFAULT_CONTEXT_WINDOW;
}
/**
 * Check if a provider is local (context compaction is most relevant for these).
 */
export function isLocalProvider(provider) {
    return provider === 'ollama' || provider === 'lmstudio';
}
// ── System Prompt Compression ───────────────────────────────────────
/**
 * Compress a system prompt to fit within a token budget.
 * Strategy: remove example blocks, long explanations, and keep core directives.
 * Preserves tool descriptions and critical instructions.
 */
export function compressSystemPrompt(prompt, maxTokens) {
    let compressed = prompt;
    // If already within budget, return as-is
    if (estimateTokens(compressed) <= maxTokens) {
        return compressed;
    }
    // Step 1: Remove markdown code blocks (examples)
    compressed = compressed.replace(/```[\s\S]*?```/g, '[example removed]');
    if (estimateTokens(compressed) <= maxTokens) {
        return compressed;
    }
    // Step 2: Remove lines starting with "Example:", "For example", "e.g."
    compressed = compressed
        .split('\n')
        .filter((line) => !/^\s*(Example:|For example|e\.g\.|E\.g\.)/i.test(line))
        .join('\n');
    if (estimateTokens(compressed) <= maxTokens) {
        return compressed;
    }
    // Step 3: Remove multi-line table rows (keep headers)
    const lines = compressed.split('\n');
    const filteredLines = [];
    let tableRowCount = 0;
    for (const line of lines) {
        if (/^\|.*\|$/.test(line.trim())) {
            tableRowCount++;
            // Keep header row and separator only
            if (tableRowCount <= 2) {
                filteredLines.push(line);
            }
        }
        else {
            tableRowCount = 0;
            filteredLines.push(line);
        }
    }
    compressed = filteredLines.join('\n');
    if (estimateTokens(compressed) <= maxTokens) {
        return compressed;
    }
    // Step 4: Remove blank lines and compress whitespace
    compressed = compressed
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .join('\n');
    if (estimateTokens(compressed) <= maxTokens) {
        return compressed;
    }
    // Step 5: Hard truncate — keep first maxTokens worth of chars
    const maxChars = maxTokens * DEFAULT_CHARS_PER_TOKEN;
    compressed = compressed.slice(0, maxChars);
    return compressed;
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
export function compactMessages(messages, systemPrompt, options) {
    const { contextWindow, systemPromptBudget = Math.floor(contextWindow * 0.3), // 30% for system prompt
    responseBudget = Math.floor(contextWindow * 0.2), // 20% reserved for response
    injectSummary = true, charsPerToken = DEFAULT_CHARS_PER_TOKEN, } = options;
    const messageBudget = contextWindow - responseBudget;
    // Step 1: Compress system prompt if needed
    const compressedPrompt = compressSystemPrompt(systemPrompt, systemPromptBudget);
    const promptTokens = estimateTokens(compressedPrompt, charsPerToken);
    // Token budget remaining for messages
    const messageTokenBudget = messageBudget - promptTokens;
    // Step 2: Calculate current total message tokens
    let totalMsgTokens = 0;
    for (const msg of messages) {
        totalMsgTokens += messageTokens(msg, charsPerToken);
    }
    // If everything fits, return unchanged
    if (totalMsgTokens <= messageTokenBudget && compressedPrompt === systemPrompt) {
        return {
            messages,
            systemPrompt,
            prunedCount: 0,
            wasCompacted: false,
            estimatedTokens: promptTokens + totalMsgTokens,
        };
    }
    // Step 3: Sliding window — keep first message + last N messages that fit
    const result = [];
    let usedTokens = 0;
    // Always keep the first user message (original intent)
    if (messages.length > 0) {
        const firstMsgTokens = messageTokens(messages[0], charsPerToken);
        result.push(messages[0]);
        usedTokens += firstMsgTokens;
    }
    // Reserve space for summary message if injection is enabled
    const summaryReserve = injectSummary ? 40 : 0; // ~40 tokens for summary text
    const tailBudget = messageTokenBudget - summaryReserve;
    // Work backwards from the end, adding messages until budget is exhausted
    const tail = [];
    for (let i = messages.length - 1; i > 0; i--) {
        const msgToks = messageTokens(messages[i], charsPerToken);
        if (usedTokens + msgToks > tailBudget) {
            break;
        }
        tail.unshift(messages[i]);
        usedTokens += msgToks;
    }
    const prunedCount = messages.length - 1 - tail.length;
    // Step 4: Optionally inject summary of pruned messages
    if (injectSummary && prunedCount > 0) {
        const summaryText = `[${prunedCount} earlier messages omitted. The conversation has been compacted to fit within the model's context window.]`;
        const summaryMsg = {
            role: 'user',
            content: summaryText,
        };
        const summaryTokens = messageTokens(summaryMsg, charsPerToken);
        result.push(summaryMsg);
        usedTokens += summaryTokens;
    }
    // Append the tail (recent messages)
    result.push(...tail);
    return {
        messages: result,
        systemPrompt: compressedPrompt,
        prunedCount,
        wasCompacted: true,
        estimatedTokens: promptTokens + usedTokens,
    };
}
//# sourceMappingURL=compaction.js.map