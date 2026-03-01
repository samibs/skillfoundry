import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  getContextWindow,
  isLocalProvider,
  compressSystemPrompt,
  compactMessages,
} from '../core/compaction.js';
import type { AnthropicMessage } from '../types.js';

describe('estimateTokens', () => {
  it('should estimate tokens using 3.5 chars per token', () => {
    const text = 'Hello world!'; // 12 chars → ceil(12/3.5) = 4
    expect(estimateTokens(text)).toBe(4);
  });

  it('should return 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should accept custom chars-per-token ratio', () => {
    const text = 'Hello world!'; // 12 chars → ceil(12/4) = 3
    expect(estimateTokens(text, 4)).toBe(3);
  });

  it('should handle long text', () => {
    const text = 'a'.repeat(10000); // 10000 chars → ceil(10000/3.5) = 2858
    expect(estimateTokens(text)).toBe(2858);
  });
});

describe('getContextWindow', () => {
  it('should return known model context window', () => {
    expect(getContextWindow('gpt-4o')).toBe(128_000);
    expect(getContextWindow('llama3.1')).toBe(8_192);
    expect(getContextWindow('qwen2.5-coder-7b')).toBe(32_768);
  });

  it('should return default for unknown model', () => {
    expect(getContextWindow('some-unknown-model')).toBe(8_192);
  });

  it('should use override when provided', () => {
    expect(getContextWindow('llama3.1', 16384)).toBe(16384);
  });

  it('should ignore zero override', () => {
    expect(getContextWindow('llama3.1', 0)).toBe(8_192);
  });
});

describe('isLocalProvider', () => {
  it('should return true for ollama', () => {
    expect(isLocalProvider('ollama')).toBe(true);
  });

  it('should return true for lmstudio', () => {
    expect(isLocalProvider('lmstudio')).toBe(true);
  });

  it('should return false for cloud providers', () => {
    expect(isLocalProvider('anthropic')).toBe(false);
    expect(isLocalProvider('openai')).toBe(false);
  });
});

describe('compressSystemPrompt', () => {
  it('should return prompt unchanged if within budget', () => {
    const prompt = 'You are a helpful assistant.';
    const result = compressSystemPrompt(prompt, 1000);
    expect(result).toBe(prompt);
  });

  it('should remove code blocks when over budget', () => {
    const prompt = [
      'You are a helpful assistant.',
      '',
      '```typescript',
      'const example = "hello";',
      'console.log(example);',
      '```',
      '',
      'Be concise.',
    ].join('\n');

    // Small budget that forces compression
    const result = compressSystemPrompt(prompt, 20);
    expect(result).toContain('You are a helpful assistant.');
    expect(result).not.toContain('const example');
    expect(result).toContain('[example removed]');
  });

  it('should hard truncate as last resort', () => {
    const prompt = 'a'.repeat(10000);
    const result = compressSystemPrompt(prompt, 10);
    // 10 tokens * 3.5 chars = 35 chars
    expect(result.length).toBeLessThanOrEqual(35);
  });
});

describe('compactMessages', () => {
  const makeMsg = (role: 'user' | 'assistant', text: string): AnthropicMessage => ({
    role,
    content: text,
  });

  it('should return messages unchanged when within budget', () => {
    const msgs = [makeMsg('user', 'hello'), makeMsg('assistant', 'hi')];
    const result = compactMessages(msgs, 'system', { contextWindow: 200_000 });

    expect(result.wasCompacted).toBe(false);
    expect(result.prunedCount).toBe(0);
    expect(result.messages).toEqual(msgs);
  });

  it('should compact messages when over budget', () => {
    // Create a conversation that exceeds a small context window
    const msgs: AnthropicMessage[] = [];
    for (let i = 0; i < 50; i++) {
      msgs.push(makeMsg('user', `Question ${i}: ${'x'.repeat(200)}`));
      msgs.push(makeMsg('assistant', `Answer ${i}: ${'y'.repeat(200)}`));
    }

    const result = compactMessages(msgs, 'You are a helpful assistant.', {
      contextWindow: 1024, // Very small context window
    });

    expect(result.wasCompacted).toBe(true);
    expect(result.prunedCount).toBeGreaterThan(0);
    expect(result.messages.length).toBeLessThan(msgs.length);
    // First message should be preserved
    expect(result.messages[0]).toEqual(msgs[0]);
  });

  it('should inject summary of pruned messages', () => {
    // Create 100 messages totaling ~30K chars (~8500 tokens)
    const msgs: AnthropicMessage[] = [];
    for (let i = 0; i < 50; i++) {
      msgs.push(makeMsg('user', `Message ${i}: ${'x'.repeat(200)}`));
      msgs.push(makeMsg('assistant', `Reply ${i}: ${'y'.repeat(200)}`));
    }

    // Use 4096 context window — forces pruning but leaves room for
    // the first message + summary + a few recent messages
    const result = compactMessages(msgs, 'Short system prompt.', {
      contextWindow: 4096,
      injectSummary: true,
    });

    expect(result.wasCompacted).toBe(true);
    expect(result.prunedCount).toBeGreaterThan(0);

    // The summary message should be present
    const summaryMsg = result.messages.find(
      (m) => typeof m.content === 'string' && m.content.includes('earlier messages omitted'),
    );
    expect(summaryMsg).toBeDefined();
  });

  it('should not inject summary when disabled', () => {
    const msgs: AnthropicMessage[] = [];
    for (let i = 0; i < 30; i++) {
      msgs.push(makeMsg('user', `Message ${i}: ${'x'.repeat(100)}`));
      msgs.push(makeMsg('assistant', `Reply ${i}: ${'y'.repeat(100)}`));
    }

    const result = compactMessages(msgs, 'System prompt', {
      contextWindow: 1024,
      injectSummary: false,
    });

    const summaryMsg = result.messages.find(
      (m) => typeof m.content === 'string' && m.content.includes('earlier messages omitted'),
    );
    expect(summaryMsg).toBeUndefined();
  });

  it('should compress system prompt when too large', () => {
    const largePrompt = 'a'.repeat(5000);
    const msgs = [makeMsg('user', 'hello')];

    const result = compactMessages(msgs, largePrompt, {
      contextWindow: 512,
    });

    expect(result.systemPrompt.length).toBeLessThan(largePrompt.length);
  });

  it('should keep recent messages (last N turns)', () => {
    const msgs: AnthropicMessage[] = [];
    for (let i = 0; i < 20; i++) {
      msgs.push(makeMsg('user', `Message ${i}: ${'x'.repeat(100)}`));
      msgs.push(makeMsg('assistant', `Reply ${i}: ${'y'.repeat(100)}`));
    }

    const result = compactMessages(msgs, 'System', { contextWindow: 2048 });

    if (result.wasCompacted) {
      // Last message should be from the end of the original conversation
      const lastOriginal = msgs[msgs.length - 1];
      const lastCompacted = result.messages[result.messages.length - 1];
      expect(lastCompacted).toEqual(lastOriginal);
    }
  });
});
