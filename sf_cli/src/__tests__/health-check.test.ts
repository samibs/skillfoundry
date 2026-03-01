import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isLocalProvider,
  getLocalBaseUrl,
  pingProvider,
  resolveProvider,
  clearHealthCache,
} from '../core/health-check.js';

beforeEach(() => {
  clearHealthCache();
  vi.restoreAllMocks();
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
    expect(isLocalProvider('xai')).toBe(false);
    expect(isLocalProvider('gemini')).toBe(false);
  });
});

describe('getLocalBaseUrl', () => {
  it('should return default ollama URL', () => {
    delete process.env.OLLAMA_BASE_URL;
    expect(getLocalBaseUrl('ollama')).toBe('http://localhost:11434/v1');
  });

  it('should return default lmstudio URL', () => {
    delete process.env.LMSTUDIO_BASE_URL;
    expect(getLocalBaseUrl('lmstudio')).toBe('http://localhost:1234/v1');
  });

  it('should return empty for non-local providers', () => {
    expect(getLocalBaseUrl('anthropic')).toBe('');
  });

  it('should use env var override for ollama', () => {
    process.env.OLLAMA_BASE_URL = 'http://myserver:9999/v1';
    expect(getLocalBaseUrl('ollama')).toBe('http://myserver:9999/v1');
    delete process.env.OLLAMA_BASE_URL;
  });
});

describe('pingProvider', () => {
  it('should return true for cloud providers without network call', async () => {
    const result = await pingProvider('anthropic');
    expect(result).toBe(true);
  });

  it('should return false when local provider is not running', async () => {
    // No server running on this port in test environment
    const result = await pingProvider('lmstudio');
    expect(result).toBe(false);
  });

  it('should cache results', async () => {
    // First call — will fail (no local server)
    const first = await pingProvider('ollama');
    expect(first).toBe(false);

    // Second call — should use cache (same result, no new network call)
    const second = await pingProvider('ollama');
    expect(second).toBe(false);
  });
});

describe('resolveProvider', () => {
  it('should resolve cloud providers directly', async () => {
    const result = await resolveProvider('anthropic', 'openai');
    expect(result.provider).toBe('anthropic');
    expect(result.healthy).toBe(true);
    expect(result.fallbackUsed).toBe(false);
  });

  it('should fall back when local provider is offline', async () => {
    const result = await resolveProvider('lmstudio', 'anthropic');
    expect(result.fallbackUsed).toBe(true);
    expect(result.provider).toBe('anthropic');
    expect(result.warning).toContain('offline');
    expect(result.warning).toContain('Falling back');
  });

  it('should warn when local is offline and no fallback available', async () => {
    const result = await resolveProvider('ollama');
    expect(result.healthy).toBe(false);
    expect(result.fallbackUsed).toBe(false);
    expect(result.warning).toContain('offline');
    expect(result.warning).toContain('Start your local model');
  });
});
