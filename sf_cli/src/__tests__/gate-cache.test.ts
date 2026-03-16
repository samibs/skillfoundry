import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  hashFile,
  hashString,
  loadGateCache,
  saveGateCache,
  getCachedResult,
  setCachedResult,
  purgeExpiredEntries,
  clearGateCache,
  getCacheStats,
  GATE_LOGIC_VERSION,
} from '../core/gate-cache.js';
import type { GateCache } from '../core/gate-cache.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'gate-cache-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function makeEmptyCache(): GateCache {
  return {
    entries: {},
    created_at: new Date().toISOString(),
    gate_logic_version: GATE_LOGIC_VERSION,
  };
}

// ── hashFile ─────────────────────────────────────────────────────────────────

describe('hashFile', () => {
  it('returns consistent SHA256 for the same file', () => {
    const filePath = join(tempDir, 'sample.txt');
    writeFileSync(filePath, 'hello world', 'utf-8');

    const hash1 = hashFile(filePath);
    const hash2 = hashFile(filePath);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns different hashes for different file contents', () => {
    const file1 = join(tempDir, 'a.txt');
    const file2 = join(tempDir, 'b.txt');
    writeFileSync(file1, 'content A', 'utf-8');
    writeFileSync(file2, 'content B', 'utf-8');

    expect(hashFile(file1)).not.toBe(hashFile(file2));
  });
});

// ── hashString ───────────────────────────────────────────────────────────────

describe('hashString', () => {
  it('returns consistent SHA256 for the same string', () => {
    const hash1 = hashString('test input');
    const hash2 = hashString('test input');

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('matches hashFile for the same content', () => {
    const content = 'matching content';
    const filePath = join(tempDir, 'match.txt');
    writeFileSync(filePath, content, 'utf-8');

    expect(hashString(content)).toBe(hashFile(filePath));
  });
});

// ── loadGateCache ────────────────────────────────────────────────────────────

describe('loadGateCache', () => {
  it('returns empty cache when file does not exist', () => {
    const cache = loadGateCache(tempDir);

    expect(cache.entries).toEqual({});
    expect(cache.gate_logic_version).toBe(GATE_LOGIC_VERSION);
    expect(cache.created_at).toBeTruthy();
  });

  it('invalidates cache on gate logic version mismatch', () => {
    const cacheDir = join(tempDir, '.skillfoundry');
    const cachePath = join(cacheDir, 'gate-cache.json');
    const staleCache: GateCache = {
      entries: {
        'T1:abc123:v0': {
          file_sha256: 'abc123',
          gate: 'T1',
          verdict: 'pass',
          reason: 'ok',
          cached_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
      },
      created_at: new Date().toISOString(),
      gate_logic_version: 'OLD_VERSION',
    };

    require('node:fs').mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(staleCache), 'utf-8');

    const loaded = loadGateCache(tempDir);
    expect(loaded.entries).toEqual({});
    expect(loaded.gate_logic_version).toBe(GATE_LOGIC_VERSION);
  });

  it('handles corrupted JSON gracefully', () => {
    const cacheDir = join(tempDir, '.skillfoundry');
    const cachePath = join(cacheDir, 'gate-cache.json');

    require('node:fs').mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cachePath, '{not valid json!!!', 'utf-8');

    const loaded = loadGateCache(tempDir);
    expect(loaded.entries).toEqual({});
    expect(loaded.gate_logic_version).toBe(GATE_LOGIC_VERSION);
  });

  it('loads valid cache from disk', () => {
    const cache = makeEmptyCache();
    setCachedResult(cache, 'T1', 'sha_abc', 'pass', 'looks good');
    saveGateCache(tempDir, cache);

    const loaded = loadGateCache(tempDir);
    expect(Object.keys(loaded.entries).length).toBe(1);
    expect(loaded.gate_logic_version).toBe(GATE_LOGIC_VERSION);
  });
});

// ── saveGateCache ────────────────────────────────────────────────────────────

describe('saveGateCache', () => {
  it('writes valid JSON to disk', () => {
    const cache = makeEmptyCache();
    setCachedResult(cache, 'T2', 'sha_def', 'fail', 'bad pattern');
    saveGateCache(tempDir, cache);

    const filePath = join(tempDir, '.skillfoundry', 'gate-cache.json');
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'));

    expect(raw.gate_logic_version).toBe(GATE_LOGIC_VERSION);
    expect(Object.keys(raw.entries).length).toBe(1);
  });

  it('creates .skillfoundry directory if missing', () => {
    const nestedDir = join(tempDir, 'nested', 'project');
    require('node:fs').mkdirSync(nestedDir, { recursive: true });

    const cache = makeEmptyCache();
    saveGateCache(nestedDir, cache);

    expect(existsSync(join(nestedDir, '.skillfoundry', 'gate-cache.json'))).toBe(true);
  });
});

// ── getCachedResult ──────────────────────────────────────────────────────────

describe('getCachedResult', () => {
  it('returns null for missing entry', () => {
    const cache = makeEmptyCache();
    const result = getCachedResult(cache, 'T1', 'nonexistent_sha');

    expect(result).toBeNull();
  });

  it('returns entry when valid and not expired', () => {
    const cache = makeEmptyCache();
    setCachedResult(cache, 'T3', 'sha_xyz', 'warn', 'minor issue');

    const result = getCachedResult(cache, 'T3', 'sha_xyz');
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('warn');
    expect(result!.reason).toBe('minor issue');
    expect(result!.gate).toBe('T3');
    expect(result!.file_sha256).toBe('sha_xyz');
  });

  it('returns null for expired entry and removes it', () => {
    const cache = makeEmptyCache();
    // Manually insert an entry with an expiry in the past
    const key = `T1:sha_expired:v${GATE_LOGIC_VERSION}`;
    cache.entries[key] = {
      file_sha256: 'sha_expired',
      gate: 'T1',
      verdict: 'pass',
      reason: 'was ok',
      cached_at: new Date(Date.now() - 7200000).toISOString(),
      expires_at: new Date(Date.now() - 3600000).toISOString(),
    };

    const result = getCachedResult(cache, 'T1', 'sha_expired');
    expect(result).toBeNull();

    // Entry should have been deleted from the cache
    expect(cache.entries[key]).toBeUndefined();
  });
});

// ── setCachedResult ──────────────────────────────────────────────────────────

describe('setCachedResult', () => {
  it('stores entry with correct TTL', () => {
    const cache = makeEmptyCache();
    const ttl = 60000; // 1 minute
    const before = Date.now();

    setCachedResult(cache, 'T2', 'sha_ttl', 'pass', 'clean', ttl);

    const key = `T2:sha_ttl:v${GATE_LOGIC_VERSION}`;
    const entry = cache.entries[key];

    expect(entry).toBeDefined();
    expect(entry.verdict).toBe('pass');
    expect(entry.reason).toBe('clean');

    const expiresAt = new Date(entry.expires_at).getTime();
    const cachedAt = new Date(entry.cached_at).getTime();
    expect(expiresAt - cachedAt).toBe(ttl);
    expect(cachedAt).toBeGreaterThanOrEqual(before);
  });

  it('uses default 24h TTL when not specified', () => {
    const cache = makeEmptyCache();
    setCachedResult(cache, 'T1', 'sha_default', 'pass', 'default ttl');

    const key = `T1:sha_default:v${GATE_LOGIC_VERSION}`;
    const entry = cache.entries[key];

    const expiresAt = new Date(entry.expires_at).getTime();
    const cachedAt = new Date(entry.cached_at).getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    expect(expiresAt - cachedAt).toBe(twentyFourHours);
  });
});

// ── purgeExpiredEntries ──────────────────────────────────────────────────────

describe('purgeExpiredEntries', () => {
  it('removes expired entries and returns count', () => {
    const cache = makeEmptyCache();
    // Manually insert an expired entry
    const expiredKey = `T1:sha_old:v${GATE_LOGIC_VERSION}`;
    cache.entries[expiredKey] = {
      file_sha256: 'sha_old',
      gate: 'T1',
      verdict: 'pass',
      reason: 'old',
      cached_at: new Date(Date.now() - 7200000).toISOString(),
      expires_at: new Date(Date.now() - 3600000).toISOString(),
    };
    // Valid entry (TTL = 1 hour)
    setCachedResult(cache, 'T2', 'sha_new', 'fail', 'new', 3600000);

    const purged = purgeExpiredEntries(cache);

    expect(purged).toBe(1);
    expect(Object.keys(cache.entries).length).toBe(1);
  });

  it('keeps all valid entries when none are expired', () => {
    const cache = makeEmptyCache();
    setCachedResult(cache, 'T1', 'sha_a', 'pass', 'ok', 3600000);
    setCachedResult(cache, 'T2', 'sha_b', 'warn', 'hmm', 3600000);

    const purged = purgeExpiredEntries(cache);

    expect(purged).toBe(0);
    expect(Object.keys(cache.entries).length).toBe(2);
  });

  it('returns 0 on empty cache', () => {
    const cache = makeEmptyCache();
    expect(purgeExpiredEntries(cache)).toBe(0);
  });
});

// ── clearGateCache ───────────────────────────────────────────────────────────

describe('clearGateCache', () => {
  it('resets all entries and writes empty cache to disk', () => {
    const cache = makeEmptyCache();
    setCachedResult(cache, 'T1', 'sha_1', 'pass', 'ok');
    setCachedResult(cache, 'T2', 'sha_2', 'fail', 'bad');
    saveGateCache(tempDir, cache);

    clearGateCache(tempDir);

    const loaded = loadGateCache(tempDir);
    expect(loaded.entries).toEqual({});
    expect(loaded.gate_logic_version).toBe(GATE_LOGIC_VERSION);
  });
});

// ── getCacheStats ────────────────────────────────────────────────────────────

describe('getCacheStats', () => {
  it('returns correct breakdown of entries', () => {
    const cache = makeEmptyCache();
    setCachedResult(cache, 'T1', 'sha_a', 'pass', 'ok', 3600000);
    setCachedResult(cache, 'T1', 'sha_b', 'fail', 'bad', 3600000);
    setCachedResult(cache, 'T2', 'sha_c', 'pass', 'ok', 3600000);
    // Manually insert an expired entry for stats testing
    const expiredKey = `T3:sha_d:v${GATE_LOGIC_VERSION}`;
    cache.entries[expiredKey] = {
      file_sha256: 'sha_d',
      gate: 'T3',
      verdict: 'warn',
      reason: 'maybe',
      cached_at: new Date(Date.now() - 7200000).toISOString(),
      expires_at: new Date(Date.now() - 3600000).toISOString(),
    };

    const stats = getCacheStats(cache);

    expect(stats.total_entries).toBe(4);
    expect(stats.by_gate).toEqual({ T1: 2, T2: 1, T3: 1 });
    expect(stats.by_verdict).toEqual({ pass: 2, fail: 1, warn: 1 });
    expect(stats.expired).toBe(1);
  });

  it('returns zeroes for empty cache', () => {
    const cache = makeEmptyCache();
    const stats = getCacheStats(cache);

    expect(stats.total_entries).toBe(0);
    expect(stats.by_gate).toEqual({});
    expect(stats.by_verdict).toEqual({});
    expect(stats.expired).toBe(0);
  });
});

// ── Cache key includes gate logic version ────────────────────────────────────

describe('cache key versioning', () => {
  it('cache key includes gate logic version', () => {
    const cache = makeEmptyCache();
    setCachedResult(cache, 'T1', 'sha_ver', 'pass', 'versioned');

    const expectedKey = `T1:sha_ver:v${GATE_LOGIC_VERSION}`;
    expect(cache.entries[expectedKey]).toBeDefined();
  });
});

// ── Round-trip ───────────────────────────────────────────────────────────────

describe('round-trip: set -> save -> load -> get', () => {
  it('persists and retrieves cached result across save/load cycle', () => {
    const cache = makeEmptyCache();
    setCachedResult(cache, 'T2', 'sha_round', 'warn', 'needs review', 3600000);
    saveGateCache(tempDir, cache);

    const loaded = loadGateCache(tempDir);
    const result = getCachedResult(loaded, 'T2', 'sha_round');

    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('warn');
    expect(result!.reason).toBe('needs review');
    expect(result!.file_sha256).toBe('sha_round');
    expect(result!.gate).toBe('T2');
  });
});

// ── Multiple gates per file ──────────────────────────────────────────────────

describe('multiple gates for same file', () => {
  it('stores separate entries for different gates on the same file hash', () => {
    const cache = makeEmptyCache();
    const fileSha = 'sha_shared_file';

    setCachedResult(cache, 'T1', fileSha, 'pass', 'T1 ok');
    setCachedResult(cache, 'T2', fileSha, 'fail', 'T2 bad');
    setCachedResult(cache, 'T3', fileSha, 'warn', 'T3 maybe');

    expect(Object.keys(cache.entries).length).toBe(3);

    const t1 = getCachedResult(cache, 'T1', fileSha);
    const t2 = getCachedResult(cache, 'T2', fileSha);
    const t3 = getCachedResult(cache, 'T3', fileSha);

    expect(t1!.verdict).toBe('pass');
    expect(t2!.verdict).toBe('fail');
    expect(t3!.verdict).toBe('warn');
  });
});
