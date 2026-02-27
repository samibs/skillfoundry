import Anthropic from '@anthropic-ai/sdk';
import type {
  ProviderAdapter,
  StreamCallback,
  ContentBlock,
  AnthropicMessage,
} from '../types.js';

const DEFAULT_SYSTEM_PROMPT =
  'You are SkillFoundry AI, a helpful coding assistant. Be concise and direct. You have access to tools for reading files, writing files, searching code, and running shell commands. Use them when needed to help the user.';

export class AnthropicAdapter implements ProviderAdapter {
  name = 'anthropic';
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  async stream(
    messages: Array<{ role: string; content: string }>,
    options: { model: string; maxTokens?: number; systemPrompt?: string },
    onChunk: StreamCallback,
  ): Promise<{
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    thinkingContent?: string;
  }> {
    const model = options.model || 'claude-sonnet-4-20250514';
    const maxTokens = options.maxTokens || 8192;

    const anthropicMessages = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
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
      }] as unknown as string,
      messages: anthropicMessages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta as {
          type: string;
          text?: string;
          thinking?: string;
        };
        if (delta.type === 'text_delta' && delta.text) {
          onChunk(delta.text, false);
        } else if (delta.type === 'thinking_delta' && delta.thinking) {
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

  async streamWithTools(
    messages: AnthropicMessage[],
    options: {
      model: string;
      maxTokens?: number;
      systemPrompt?: string;
      tools: Array<{
        name: string;
        description: string;
        input_schema: unknown;
      }>;
    },
    onChunk: StreamCallback,
  ): Promise<{
    content: ContentBlock[];
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    stopReason: string;
    thinkingContent?: string;
  }> {
    const model = options.model || 'claude-sonnet-4-20250514';
    const maxTokens = options.maxTokens || 8192;

    let inputTokens = 0;
    let outputTokens = 0;
    let thinkingContent = '';

    // Mark system prompt and last tool with cache_control for Anthropic prompt caching.
    // Saves ~90% on repeated tokens (system prompt + tool schemas are identical every turn).
    const cachedTools = options.tools.map((t, i) => {
      const tool = { ...t } as Record<string, unknown>;
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
      }] as unknown as string,
      messages: messages as Anthropic.MessageParam[],
      tools: cachedTools as unknown as Anthropic.Tool[],
    });

    const contentBlocks: ContentBlock[] = [];
    let currentTextBlock = '';
    let currentBlockType: string | null = null;
    let currentToolId = '';
    let currentToolName = '';
    let currentToolInput = '';

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const block = (event as { content_block: { type: string; id?: string; name?: string } })
          .content_block;
        currentBlockType = block.type;
        if (block.type === 'tool_use') {
          currentToolId = block.id || '';
          currentToolName = block.name || '';
          currentToolInput = '';
        } else if (block.type === 'text') {
          currentTextBlock = '';
        }
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta as {
          type: string;
          text?: string;
          partial_json?: string;
          thinking?: string;
        };
        if (delta.type === 'text_delta' && delta.text) {
          currentTextBlock += delta.text;
          onChunk(delta.text, false);
        } else if (delta.type === 'input_json_delta' && delta.partial_json) {
          currentToolInput += delta.partial_json;
        } else if (delta.type === 'thinking_delta' && delta.thinking) {
          thinkingContent += delta.thinking;
        }
      } else if (event.type === 'content_block_stop') {
        if (currentBlockType === 'text' && currentTextBlock) {
          contentBlocks.push({ type: 'text', text: currentTextBlock });
        } else if (currentBlockType === 'tool_use') {
          let parsedInput: Record<string, unknown> = {};
          try {
            parsedInput = JSON.parse(currentToolInput || '{}');
          } catch {
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

export const AVAILABLE_PROVIDERS: Record<
  string,
  { name: string; envKey: string; altEnvKeys?: string[]; defaultModel: string }
> = {
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

export function createProvider(name: string): ProviderAdapter {
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
      throw new Error(
        `Provider "${name}" not supported. Available: ${Object.keys(AVAILABLE_PROVIDERS).join(', ')}`,
      );
  }
}

export function detectAvailableProviders(): string[] {
  const available: string[] = [];
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
