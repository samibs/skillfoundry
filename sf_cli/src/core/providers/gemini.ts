// Google Gemini provider adapter — uses native fetch against Gemini API.
// Avoids the heavy @google/generative-ai SDK.

import type {
  ProviderAdapter,
  StreamCallback,
  ContentBlock,
  AnthropicMessage,
  AnthropicContentBlock,
} from '../../types.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Pricing per million tokens
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Strip the models/ prefix if present
  const modelName = model.replace('models/', '');
  const pricing = MODEL_PRICING[modelName] || { input: 1.25, output: 10 };
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: { content: string } } }>;
}

function toGeminiMessages(
  messages: Array<{ role: string; content: string }>,
): GeminiContent[] {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

function toGeminiToolMessages(messages: AnthropicMessage[]): GeminiContent[] {
  const result: GeminiContent[] = [];

  for (const m of messages) {
    if (typeof m.content === 'string') {
      result.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      });
    } else {
      const blocks = m.content as AnthropicContentBlock[];
      const parts: GeminiContent['parts'] = [];

      for (const block of blocks) {
        if (block.type === 'text' && block.text) {
          parts.push({ text: block.text });
        } else if (block.type === 'tool_use') {
          parts.push({
            functionCall: {
              name: block.name || '',
              args: (block.input || {}) as Record<string, unknown>,
            },
          });
        } else if (block.type === 'tool_result') {
          parts.push({
            functionResponse: {
              name: block.tool_use_id || '',
              response: { content: block.content || '' },
            },
          });
        }
      }

      if (parts.length > 0) {
        result.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts,
        });
      }
    }
  }

  return result;
}

function toGeminiTools(
  tools: Array<{ name: string; description: string; input_schema: unknown }>,
): Array<{ functionDeclarations: Array<{ name: string; description: string; parameters: unknown }> }> {
  return [{
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    })),
  }];
}

export class GeminiAdapter implements ProviderAdapter {
  name = 'gemini';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
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
    const model = options.model || 'gemini-2.5-flash';
    const geminiMessages = toGeminiMessages(messages);

    const body: Record<string, unknown> = {
      contents: geminiMessages,
      generationConfig: {
        maxOutputTokens: options.maxTokens || 8192,
      },
    };

    if (options.systemPrompt) {
      body.systemInstruction = { parts: [{ text: options.systemPrompt }] };
    }

    const url = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 200)}`);
    }

    let inputTokens = 0;
    let outputTokens = 0;

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const data = JSON.parse(jsonStr);
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            onChunk(text, false);
          }
          if (data.usageMetadata) {
            inputTokens = data.usageMetadata.promptTokenCount || 0;
            outputTokens = data.usageMetadata.candidatesTokenCount || 0;
          }
        } catch {
          // Skip malformed SSE lines
        }
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
    const model = options.model || 'gemini-2.5-flash';
    const geminiMessages = toGeminiToolMessages(messages);

    const body: Record<string, unknown> = {
      contents: geminiMessages,
      tools: toGeminiTools(options.tools),
      generationConfig: {
        maxOutputTokens: options.maxTokens || 8192,
      },
    };

    if (options.systemPrompt) {
      body.systemInstruction = { parts: [{ text: options.systemPrompt }] };
    }

    // Use non-streaming for tool calls (Gemini tool streaming is complex)
    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 200)}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content: { parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> };
        finishReason?: string;
      }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const contentBlocks: ContentBlock[] = [];
    const parts = data.candidates?.[0]?.content?.parts || [];
    let stopReason = 'end_turn';

    for (const part of parts) {
      if (part.text) {
        contentBlocks.push({ type: 'text', text: part.text });
        onChunk(part.text, false);
      }
      if (part.functionCall) {
        contentBlocks.push({
          type: 'tool_use',
          id: `gemini-${Date.now()}-${part.functionCall.name}`,
          name: part.functionCall.name,
          input: part.functionCall.args || {},
        });
        stopReason = 'tool_use';
      }
    }

    const inputTokens = data.usageMetadata?.promptTokenCount || 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
    const costUsd = estimateCost(model, inputTokens, outputTokens);

    onChunk('', true);

    return { content: contentBlocks, inputTokens, outputTokens, costUsd, stopReason };
  }
}

export function createGeminiProvider(): ProviderAdapter {
  return new GeminiAdapter();
}
