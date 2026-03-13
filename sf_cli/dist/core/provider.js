import Anthropic from '@anthropic-ai/sdk';
const DEFAULT_SYSTEM_PROMPT = 'You are SkillFoundry AI, a helpful coding assistant. Be concise and direct. You have access to tools for reading files, writing files, searching code, and running shell commands. Use them when needed to help the user.';
export class AnthropicAdapter {
    name = 'anthropic';
    client;
    constructor() {
        this.client = new Anthropic();
    }
    async stream(messages, options, onChunk) {
        const model = options.model || 'claude-sonnet-4-20250514';
        const maxTokens = options.maxTokens || 8192;
        const anthropicMessages = messages.map((m) => ({
            role: m.role,
            content: m.content,
        }));
        let inputTokens = 0;
        let outputTokens = 0;
        let thinkingContent = '';
        const stream = this.client.messages.stream({
            model,
            max_tokens: maxTokens,
            system: [{
                    type: 'text',
                    text: options.systemPrompt || DEFAULT_SYSTEM_PROMPT,
                    cache_control: { type: 'ephemeral' },
                }],
            messages: anthropicMessages,
        });
        for await (const event of stream) {
            if (event.type === 'content_block_delta') {
                const delta = event.delta;
                if (delta.type === 'text_delta' && delta.text) {
                    onChunk(delta.text, false);
                }
                else if (delta.type === 'thinking_delta' && delta.thinking) {
                    thinkingContent += delta.thinking;
                }
            }
        }
        const finalMessage = await stream.finalMessage();
        inputTokens = finalMessage.usage.input_tokens;
        outputTokens = finalMessage.usage.output_tokens;
        // Cost estimation (Claude Sonnet 4 pricing: $3/MTok input, $15/MTok output)
        const costUsd = (inputTokens * 3 + outputTokens * 15) / 1_000_000;
        onChunk('', true);
        return { inputTokens, outputTokens, costUsd, thinkingContent };
    }
    async streamWithTools(messages, options, onChunk) {
        const model = options.model || 'claude-sonnet-4-20250514';
        const maxTokens = options.maxTokens || 8192;
        let inputTokens = 0;
        let outputTokens = 0;
        let thinkingContent = '';
        // Mark system prompt and last tool with cache_control for Anthropic prompt caching.
        // Saves ~90% on repeated tokens (system prompt + tool schemas are identical every turn).
        const cachedTools = options.tools.map((t, i) => {
            const tool = { ...t };
            if (i === options.tools.length - 1) {
                tool.cache_control = { type: 'ephemeral' };
            }
            return tool;
        });
        const stream = this.client.messages.stream({
            model,
            max_tokens: maxTokens,
            system: [{
                    type: 'text',
                    text: options.systemPrompt || DEFAULT_SYSTEM_PROMPT,
                    cache_control: { type: 'ephemeral' },
                }],
            messages: messages,
            tools: cachedTools,
        });
        const contentBlocks = [];
        let currentTextBlock = '';
        let currentBlockType = null;
        let currentToolId = '';
        let currentToolName = '';
        let currentToolInput = '';
        for await (const event of stream) {
            if (event.type === 'content_block_start') {
                const block = event
                    .content_block;
                currentBlockType = block.type;
                if (block.type === 'tool_use') {
                    currentToolId = block.id || '';
                    currentToolName = block.name || '';
                    currentToolInput = '';
                }
                else if (block.type === 'text') {
                    currentTextBlock = '';
                }
            }
            else if (event.type === 'content_block_delta') {
                const delta = event.delta;
                if (delta.type === 'text_delta' && delta.text) {
                    currentTextBlock += delta.text;
                    onChunk(delta.text, false);
                }
                else if (delta.type === 'input_json_delta' && delta.partial_json) {
                    currentToolInput += delta.partial_json;
                }
                else if (delta.type === 'thinking_delta' && delta.thinking) {
                    thinkingContent += delta.thinking;
                }
            }
            else if (event.type === 'content_block_stop') {
                if (currentBlockType === 'text' && currentTextBlock) {
                    contentBlocks.push({ type: 'text', text: currentTextBlock });
                }
                else if (currentBlockType === 'tool_use') {
                    let parsedInput = {};
                    try {
                        parsedInput = JSON.parse(currentToolInput || '{}');
                    }
                    catch {
                        // If JSON parsing fails, use empty object
                    }
                    contentBlocks.push({
                        type: 'tool_use',
                        id: currentToolId,
                        name: currentToolName,
                        input: parsedInput,
                    });
                }
                currentBlockType = null;
            }
        }
        const finalMessage = await stream.finalMessage();
        inputTokens = finalMessage.usage.input_tokens;
        outputTokens = finalMessage.usage.output_tokens;
        const stopReason = finalMessage.stop_reason || 'end_turn';
        const costUsd = (inputTokens * 3 + outputTokens * 15) / 1_000_000;
        onChunk('', true);
        return {
            content: contentBlocks,
            inputTokens,
            outputTokens,
            costUsd,
            stopReason,
            thinkingContent,
        };
    }
}
import { createOpenAIProvider, createXAIProvider, createOllamaProvider, createLMStudioProvider } from './providers/openai.js';
import { createGeminiProvider } from './providers/gemini.js';
export const AVAILABLE_PROVIDERS = {
    anthropic: {
        name: 'Anthropic Claude',
        envKey: 'ANTHROPIC_API_KEY',
        altEnvKeys: ['ANTHROPIC_AUTH_TOKEN'],
        defaultModel: 'claude-sonnet-4-20250514',
    },
    openai: { name: 'OpenAI', envKey: 'OPENAI_API_KEY', defaultModel: 'gpt-4o' },
    xai: { name: 'xAI Grok', envKey: 'XAI_API_KEY', defaultModel: 'grok-3' },
    gemini: {
        name: 'Google Gemini',
        envKey: 'GOOGLE_API_KEY',
        altEnvKeys: ['GEMINI_API_KEY'],
        defaultModel: 'gemini-2.5-flash',
    },
    ollama: { name: 'Ollama (local)', envKey: 'OLLAMA_BASE_URL', defaultModel: 'llama3.1' },
    lmstudio: { name: 'LM Studio (local)', envKey: 'LMSTUDIO_BASE_URL', defaultModel: 'qwen2.5-coder-7b' },
};
export function createProvider(name) {
    switch (name) {
        case 'anthropic':
            return new AnthropicAdapter();
        case 'openai':
            return createOpenAIProvider();
        case 'xai':
            return createXAIProvider();
        case 'gemini':
            return createGeminiProvider();
        case 'ollama':
            return createOllamaProvider();
        case 'lmstudio':
            return createLMStudioProvider();
        default:
            throw new Error(`Provider "${name}" not supported. Available: ${Object.keys(AVAILABLE_PROVIDERS).join(', ')}`);
    }
}
const MODEL_TIERS = {
    // Tier 1 — Full pipeline
    'claude-opus-4-6': 1,
    'claude-opus-4-20250514': 1,
    'claude-sonnet-4-20250514': 1,
    'claude-sonnet-4-6': 1,
    'gpt-4o': 1,
    'gpt-4-turbo': 1,
    'grok-3': 1,
    'grok-4': 1,
    'gemini-2.5-pro': 1,
    // Tier 2 — Capable
    'claude-haiku-4-5-20251001': 2,
    'gemini-2.5-flash': 2,
    'gpt-4o-mini': 2,
    'grok-3-mini': 2,
    // Tier 3 — Limited (large local models)
    'llama3.1': 3,
    'llama3.1:70b': 3,
    'mixtral-8x22b': 3,
    'deepseek-coder-v2': 3,
    'qwen2.5-coder:32b': 3,
    // Tier 4 — Basic (small local models)
    'llama3.1:8b': 4,
    'qwen2.5-coder-7b': 4,
    'phi-3-mini': 4,
    'codellama:7b': 4,
};
const TIER_LABELS = {
    1: 'Full Pipeline',
    2: 'Capable',
    3: 'Limited',
    4: 'Basic',
};
export function getModelTier(model) {
    // Exact match
    if (MODEL_TIERS[model] !== undefined) {
        return MODEL_TIERS[model];
    }
    // Prefix match (e.g. "claude-sonnet-4" matches "claude-sonnet-4-20250514")
    for (const [pattern, tier] of Object.entries(MODEL_TIERS)) {
        if (model.startsWith(pattern) || pattern.startsWith(model)) {
            return tier;
        }
    }
    // Default: cloud providers → Tier 2, local → Tier 3
    return 2;
}
export function getModelTierLabel(tier) {
    return TIER_LABELS[tier];
}
export function checkModelTierWarning(model, feature) {
    const tier = getModelTier(model);
    if (tier === 1)
        return null;
    const pipelineFeatures = ['/forge', '/go', '/goma', '/gosm', 'pipeline', 'autonomous'];
    const gateFeatures = ['/gates', 'anvil', 'micro-gate', 'quality gate'];
    const isPipeline = pipelineFeatures.some((f) => feature.toLowerCase().includes(f));
    const isGate = gateFeatures.some((f) => feature.toLowerCase().includes(f));
    if (tier === 2 && isPipeline) {
        return `Model "${model}" (Tier 2: Capable) may need retries for complex pipelines. Recommended: claude-sonnet-4, gpt-4o, or grok-3 for ${feature}. See: docs/model-compatibility.md`;
    }
    if (tier >= 3 && (isPipeline || isGate)) {
        return `Model "${model}" (Tier ${tier}: ${TIER_LABELS[tier]}) does not support ${feature}. Recommended: Use a Tier 1 model (claude-sonnet-4, gpt-4o, grok-3). See: docs/model-compatibility.md`;
    }
    return null;
}
export function detectAvailableProviders() {
    const available = [];
    for (const [key, info] of Object.entries(AVAILABLE_PROVIDERS)) {
        if (key === 'ollama' || key === 'lmstudio') {
            available.push(key);
            continue;
        }
        if (process.env[info.envKey]) {
            available.push(key);
            continue;
        }
        // Check alternate env keys (e.g. ANTHROPIC_AUTH_TOKEN, GEMINI_API_KEY)
        if (info.altEnvKeys?.some((alt) => process.env[alt])) {
            available.push(key);
        }
    }
    return available;
}
//# sourceMappingURL=provider.js.map