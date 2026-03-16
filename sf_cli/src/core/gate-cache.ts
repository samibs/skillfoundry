/**
 * STORY-006: File-Hash Gate Caching
 *
 * Caches gate results keyed by file SHA256 hash + gate tier + gate logic version.
 * Unchanged files skip re-evaluation on subsequent runs.
 *
 * Storage: `.skillfoundry/gate-cache.json` (flat JSON file, indexed by composite key)
 * TTL: 24 hours by default, configurable
 * Invalidation: auto-invalidate on gate logic version bump
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import type { GateCacheEntry } from '../types.js';
import { getLogger } from '../utils/logger.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_DIR = '.skillfoundry';
const CACHE_FILE = 'gate-cache.json';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Gate logic version — increment this when gate evaluation logic changes.
 * This ensures stale cache entries from old logic are automatically invalidated.
 */
export const GATE_LOGIC_VERSION = '1';

// ── SHA256 helpers ────────────────────────────────────────────────────────────

/**
 * Compute SHA256 hash of a file's contents.
 */
export function hashFile(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Compute SHA256 hash of a string.
 */
export function hashString(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Build the composite cache key: gate + file hash + logic version.
 */
function cacheKey(gate: string, fileSha256: string): string {
  return `${gate}:${fileSha256}:v${GATE_LOGIC_VERSION}`;
}

// ── Cache implementation ──────────────────────────────────────────────────────

export interface GateCache {
  entries: Record<string, GateCacheEntry>;
  created_at: string;
  gate_logic_version: string;
}

/**
 * Load the gate cache from disk.
 * Returns empty cache if file doesn't exist or is corrupted.
 */
export function loadGateCache(workDir: string): GateCache {
  const filePath = join(resolve(workDir), CACHE_DIR, CACHE_FILE);

  if (!existsSync(filePath)) {
    return {
      entries: {},
      created_at: new Date().toISOString(),
      gate_logic_version: GATE_LOGIC_VERSION,
    };
  }

  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as GateCache;

    // Auto-invalidate if gate logic version changed
    if (raw.gate_logic_version !== GATE_LOGIC_VERSION) {
      getLogger().info('gate-cache', 'invalidated_version_change', {
        old: raw.gate_logic_version,
        new: GATE_LOGIC_VERSION,
      });
      return {
        entries: {},
        created_at: new Date().toISOString(),
        gate_logic_version: GATE_LOGIC_VERSION,
      };
    }

    return raw;
  } catch {
    getLogger().warn('gate-cache', 'corrupted_cache_reset', {});
    return {
      entries: {},
      created_at: new Date().toISOString(),
      gate_logic_version: GATE_LOGIC_VERSION,
    };
  }
}

/**
 * Save the gate cache to disk.
 */
export function saveGateCache(workDir: string, cache: GateCache): void {
  const resolvedWorkDir = resolve(workDir);
  const dirPath = join(resolvedWorkDir, CACHE_DIR);
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }

  const filePath = join(resolvedWorkDir, CACHE_DIR, CACHE_FILE);
  writeFileSync(filePath, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * Look up a cached gate result for a file.
 * Returns null if not cached or expired.
 */
export function getCachedResult(
  cache: GateCache,
  gate: string,
  fileSha256: string,
): GateCacheEntry | null {
  const key = cacheKey(gate, fileSha256);
  const entry = cache.entries[key];

  if (!entry) return null;

  // Check expiry
  if (new Date(entry.expires_at) < new Date()) {
    delete cache.entries[key];
    return null;
  }

  return entry;
}

/**
 * Store a gate result in the cache.
 */
export function setCachedResult(
  cache: GateCache,
  gate: string,
  fileSha256: string,
  verdict: 'pass' | 'fail' | 'warn',
  reason: string,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  const key = cacheKey(gate, fileSha256);
  const now = new Date();

  cache.entries[key] = {
    file_sha256: fileSha256,
    gate,
    verdict,
    reason,
    cached_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttlMs).toISOString(),
  };
}

/**
 * Clear all expired entries from the cache.
 * Returns the number of entries purged.
 */
export function purgeExpiredEntries(cache: GateCache): number {
  const now = new Date();
  let purged = 0;

  for (const [key, entry] of Object.entries(cache.entries)) {
    if (new Date(entry.expires_at) < now) {
      delete cache.entries[key];
      purged++;
    }
  }

  return purged;
}

/**
 * Clear the entire cache.
 */
export function clearGateCache(workDir: string): void {
  const cache: GateCache = {
    entries: {},
    created_at: new Date().toISOString(),
    gate_logic_version: GATE_LOGIC_VERSION,
  };
  saveGateCache(resolve(workDir), cache);
}

/**
 * Get cache statistics.
 */
export function getCacheStats(cache: GateCache): {
  total_entries: number;
  by_gate: Record<string, number>;
  by_verdict: Record<string, number>;
  expired: number;
} {
  const now = new Date();
  const by_gate: Record<string, number> = {};
  const by_verdict: Record<string, number> = {};
  let expired = 0;

  for (const entry of Object.values(cache.entries)) {
    by_gate[entry.gate] = (by_gate[entry.gate] || 0) + 1;
    by_verdict[entry.verdict] = (by_verdict[entry.verdict] || 0) + 1;
    if (new Date(entry.expires_at) < now) expired++;
  }

  return {
    total_entries: Object.keys(cache.entries).length,
    by_gate,
    by_verdict,
    expired,
  };
}
