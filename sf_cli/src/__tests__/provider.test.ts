import { describe, it, expect } from 'vitest';
import { AVAILABLE_PROVIDERS, detectAvailableProviders, createProvider } from '../core/provider.js';

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
});
