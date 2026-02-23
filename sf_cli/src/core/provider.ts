import Anthropic from '@anthropic-ai/sdk';
import type { ProviderAdapter, StreamCallback } from '../types.js';

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
      system: options.systemPrompt || 'You are SkillFoundry AI, a helpful coding assistant. Be concise and direct.',
      messages: anthropicMessages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta as { type: string; text?: string; thinking?: string };
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
}

export function createProvider(name: string): ProviderAdapter {
  switch (name) {
    case 'anthropic':
      return new AnthropicAdapter();
    default:
      throw new Error(
        `Provider "${name}" not yet supported. Available: anthropic`,
      );
  }
}
