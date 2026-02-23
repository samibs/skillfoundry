// OpenAI provider adapter — supports GPT-4o, GPT-4.1, o3, etc.
// Also used as base for xAI (Grok) and Ollama since they use OpenAI-compatible APIs.

import OpenAI from 'openai';
import type {
  ProviderAdapter,
  StreamCallback,
  ContentBlock,
  AnthropicMessage,
  AnthropicContentBlock,
} from '../../types.js';

// Pricing per million tokens (approximate)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'o3': { input: 2, output: 8 },
  'o3-mini': { input: 1.1, output: 4.4 },
  'o4-mini': { input: 1.1, output: 4.4 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || { input: 2.5, output: 10 };
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

// Convert our message format to OpenAI format
function toOpenAIMessages(
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string,
): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = [];
  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }
  for (const m of messages) {
    result.push({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    });
  }
  return result;
}

// Convert tool definitions to OpenAI format
function toOpenAITools(
  tools: Array<{ name: string; description: string; input_schema: unknown }>,
): OpenAI.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
}

// Convert AnthropicMessage format to OpenAI messages for tool conversations
function toOpenAIToolMessages(
  messages: AnthropicMessage[],
  systemPrompt?: string,
): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = [];
  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  for (const m of messages) {
    if (typeof m.content === 'string') {
      result.push({ role: m.role, content: m.content });
    } else {
      // Array of content blocks
      if (m.role === 'assistant') {
        // May contain text and tool_use blocks
        const textParts = (m.content as AnthropicContentBlock[])
          .filter((b) => b.type === 'text')
          .map((b) => b.text || '')
          .join('');
        const toolCalls = (m.content as AnthropicContentBlock[])
          .filter((b) => b.type === 'tool_use')
          .map((b) => ({
            id: b.id || '',
            type: 'function' as const,
            function: {
              name: b.name || '',
              arguments: JSON.stringify(b.input || {}),
            },
          }));

        const msg: OpenAI.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: textParts || null,
        };
        if (toolCalls.length > 0) {
          msg.tool_calls = toolCalls;
        }
        result.push(msg);
      } else {
        // User messages with tool_result blocks
        const toolResults = (m.content as AnthropicContentBlock[]).filter(
          (b) => b.type === 'tool_result',
        );
        for (const tr of toolResults) {
          result.push({
            role: 'tool',
            tool_call_id: tr.tool_use_id || '',
            content: tr.content || '',
          });
        }
        // Also include any text content
        const textParts = (m.content as AnthropicContentBlock[])
          .filter((b) => b.type === 'text')
          .map((b) => b.text || '')
          .join('');
        if (textParts) {
          result.push({ role: 'user', content: textParts });
        }
      }
    }
  }

  return result;
}

export interface OpenAIAdapterOptions {
  name: string;
  apiKey?: string;
  baseURL?: string;
  defaultModel: string;
}

export class OpenAIAdapter implements ProviderAdapter {
  name: string;
  private client: OpenAI;
  private defaultModel: string;

  constructor(options: OpenAIAdapterOptions) {
    this.name = options.name;
    this.defaultModel = options.defaultModel;
    // Use a placeholder key to avoid constructor validation errors.
    // The real key is validated at request time by the API.
    this.client = new OpenAI({
      apiKey: options.apiKey || process.env[this.getEnvKey()] || 'sk-placeholder-configure-via-env',
      baseURL: options.baseURL,
    });
  }

  private getEnvKey(): string {
    switch (this.name) {
      case 'openai': return 'OPENAI_API_KEY';
      case 'xai': return 'XAI_API_KEY';
      case 'ollama': return 'OLLAMA_API_KEY';
      default: return 'OPENAI_API_KEY';
    }
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
    const model = options.model || this.defaultModel;
    const openaiMessages = toOpenAIMessages(messages, options.systemPrompt);

    const stream = await this.client.chat.completions.create({
      model,
      messages: openaiMessages,
      max_tokens: options.maxTokens || 8192,
      stream: true,
      stream_options: { include_usage: true },
    });

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) {
        onChunk(delta.content, false);
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens || 0;
        outputTokens = chunk.usage.completion_tokens || 0;
      }
    }

    const costUsd = estimateCost(model, inputTokens, outputTokens);
    onChunk('', true);

    return { inputTokens, outputTokens, costUsd };
  }

  async streamWithTools(
    messages: AnthropicMessage[],
    options: {
      model: string;
      maxTokens?: number;
      systemPrompt?: string;
      tools: Array<{ name: string; description: string; input_schema: unknown }>;
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
    const model = options.model || this.defaultModel;
    const openaiMessages = toOpenAIToolMessages(messages, options.systemPrompt);
    const openaiTools = toOpenAITools(options.tools);

    const stream = await this.client.chat.completions.create({
      model,
      messages: openaiMessages,
      tools: openaiTools,
      max_tokens: options.maxTokens || 8192,
      stream: true,
      stream_options: { include_usage: true },
    });

    const contentBlocks: ContentBlock[] = [];
    let currentText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason = 'end_turn';

    // Track tool calls being assembled from deltas
    const toolCallAccumulator: Record<number, { id: string; name: string; args: string }> = {};

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      if (choice?.delta?.content) {
        currentText += choice.delta.content;
        onChunk(choice.delta.content, false);
      }

      // Accumulate tool calls from stream deltas
      if (choice?.delta?.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallAccumulator[idx]) {
            toolCallAccumulator[idx] = { id: tc.id || '', name: '', args: '' };
          }
          if (tc.function?.name) {
            toolCallAccumulator[idx].name = tc.function.name;
          }
          if (tc.function?.arguments) {
            toolCallAccumulator[idx].args += tc.function.arguments;
          }
        }
      }

      if (choice?.finish_reason) {
        stopReason = choice.finish_reason === 'tool_calls' ? 'tool_use' : choice.finish_reason;
      }

      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens || 0;
        outputTokens = chunk.usage.completion_tokens || 0;
      }
    }

    if (currentText) {
      contentBlocks.push({ type: 'text', text: currentText });
    }

    // Convert accumulated tool calls to ContentBlocks
    for (const [, tc] of Object.entries(toolCallAccumulator)) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.args || '{}');
      } catch {
        // Use empty object if parsing fails
      }
      contentBlocks.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.name,
        input: parsedArgs,
      });
    }

    const costUsd = estimateCost(model, inputTokens, outputTokens);
    onChunk('', true);

    return { content: contentBlocks, inputTokens, outputTokens, costUsd, stopReason };
  }
}

// Factory helpers for specific OpenAI-compatible providers
export function createOpenAIProvider(): ProviderAdapter {
  return new OpenAIAdapter({
    name: 'openai',
    defaultModel: 'gpt-4o',
  });
}

export function createXAIProvider(): ProviderAdapter {
  return new OpenAIAdapter({
    name: 'xai',
    baseURL: 'https://api.x.ai/v1',
    defaultModel: 'grok-3',
  });
}

export function createOllamaProvider(): ProviderAdapter {
  return new OpenAIAdapter({
    name: 'ollama',
    apiKey: 'ollama',
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
    defaultModel: 'llama3.1',
  });
}
