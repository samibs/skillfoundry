import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AVAILABLE_PROVIDERS, detectAvailableProviders, createProvider } from '../core/provider.js';

// Set test API keys for providers that now require them
const originalEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const key of ['OPENAI_API_KEY', 'XAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY']) {
    originalEnv[key] = process.env[key];
    if (!process.env[key]) {
      process.env[key] = `test-key-${key}`;
    }
  }
});
afterEach(() => {
  for (const [key, val] of Object.entries(originalEnv)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
});

describe('AVAILABLE_PROVIDERS', () => {
  it('should define 5 providers', () => {
    expect(Object.keys(AVAILABLE_PROVIDERS)).toHaveLength(5);
  });

  it('should include anthropic, openai, xai, gemini, ollama', () => {
    expect(AVAILABLE_PROVIDERS).toHaveProperty('anthropic');
    expect(AVAILABLE_PROVIDERS).toHaveProperty('openai');
    expect(AVAILABLE_PROVIDERS).toHaveProperty('xai');
    expect(AVAILABLE_PROVIDERS).toHaveProperty('gemini');
    expect(AVAILABLE_PROVIDERS).toHaveProperty('ollama');
  });

  it('should have envKey and defaultModel for each provider', () => {
    for (const [, info] of Object.entries(AVAILABLE_PROVIDERS)) {
      expect(info.envKey).toBeTruthy();
      expect(info.defaultModel).toBeTruthy();
      expect(info.name).toBeTruthy();
    }
  });
});

describe('detectAvailableProviders', () => {
  it('should always include ollama', () => {
    const available = detectAvailableProviders();
    expect(available).toContain('ollama');
  });
});

describe('createProvider', () => {
  it('should throw for unknown provider', () => {
    expect(() => createProvider('nonexistent')).toThrow('not supported');
  });

  it('should create anthropic provider', () => {
    // This will succeed even without API key (key checked at request time)
    const provider = createProvider('anthropic');
    expect(provider.name).toBe('anthropic');
  });

  it('should create openai provider', () => {
    const provider = createProvider('openai');
    expect(provider.name).toBe('openai');
  });

  it('should create xai provider', () => {
    const provider = createProvider('xai');
    expect(provider.name).toBe('xai');
  });

  it('should create gemini provider', () => {
    const provider = createProvider('gemini');
    expect(provider.name).toBe('gemini');
  });

  it('should create ollama provider', () => {
    const provider = createProvider('ollama');
    expect(provider.name).toBe('ollama');
  });

  it('should throw when openai API key is missing', () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => createProvider('openai')).toThrow('API key required');
  });

  it('should throw when xai API key is missing', () => {
    delete process.env.XAI_API_KEY;
    expect(() => createProvider('xai')).toThrow('API key required');
  });
});
