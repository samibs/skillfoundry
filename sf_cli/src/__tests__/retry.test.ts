import { describe, it, expect, vi } from 'vitest';
import { streamWithRetry } from '../core/retry.js';
import type { ProviderAdapter } from '../types.js';

function mockProvider(name: string): ProviderAdapter {
  return {
    name,
    stream: vi.fn(),
    streamWithTools: vi.fn(),
  };
}

describe('streamWithRetry', () => {
  it('returns result on first success', async () => {
    const primary = mockProvider('primary');
    const result = await streamWithRetry(
      async () => ({ data: 'ok' }),
      primary,
      null,
    );
    expect(result.result).toEqual({ data: 'ok' });
    expect(result.fallbackUsed).toBeUndefined();
  });

  it('retries on retryable error and succeeds', async () => {
    const primary = mockProvider('primary');
    let attempt = 0;
    const result = await streamWithRetry(
      async () => {
        attempt++;
        if (attempt < 2) throw new Error('503 Service Unavailable');
        return { data: 'recovered' };
      },
      primary,
      null,
    );
    expect(attempt).toBe(2);
    expect(result.result).toEqual({ data: 'recovered' });
  });

  it('does NOT retry auth errors (401)', async () => {
    const primary = mockProvider('primary');
    const fallback = mockProvider('fallback');
    let attempts = 0;

    const result = await streamWithRetry(
      async (p) => {
        attempts++;
        if (p.name === 'primary') throw new Error('401 Unauthorized');
        return { data: 'from-fallback' };
      },
      primary,
      fallback,
    );

    expect(attempts).toBe(2); // 1 primary fail + 1 fallback
    expect(result.fallbackUsed).toBe('fallback');
  });

  it('falls back to secondary provider after retries exhausted', async () => {
    const primary = mockProvider('primary');
    const fallback = mockProvider('fallback');

    const result = await streamWithRetry(
      async (p) => {
        if (p.name === 'primary') throw new Error('500 Server Error');
        return { data: 'fallback-response' };
      },
      primary,
      fallback,
    );

    expect(result.result).toEqual({ data: 'fallback-response' });
    expect(result.fallbackUsed).toBe('fallback');
  });

  it('throws when both primary and fallback fail', async () => {
    const primary = mockProvider('primary');
    const fallback = mockProvider('fallback');

    await expect(
      streamWithRetry(
        async () => {
          throw new Error('all providers down');
        },
        primary,
        fallback,
      ),
    ).rejects.toThrow('all providers down');
  });

  it('throws when primary fails and no fallback configured', async () => {
    const primary = mockProvider('primary');

    await expect(
      streamWithRetry(
        async () => {
          throw new Error('provider down');
        },
        primary,
        null,
      ),
    ).rejects.toThrow('provider down');
  });
});
