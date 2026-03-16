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
import type { GateCacheEntry } from '../types.js';
/**
 * Gate logic version — increment this when gate evaluation logic changes.
 * This ensures stale cache entries from old logic are automatically invalidated.
 */
export declare const GATE_LOGIC_VERSION = "1";
/**
 * Compute SHA256 hash of a file's contents.
 */
export declare function hashFile(filePath: string): string;
/**
 * Compute SHA256 hash of a string.
 */
export declare function hashString(content: string): string;
export interface GateCache {
    entries: Record<string, GateCacheEntry>;
    created_at: string;
    gate_logic_version: string;
}
/**
 * Load the gate cache from disk.
 * Returns empty cache if file doesn't exist or is corrupted.
 */
export declare function loadGateCache(workDir: string): GateCache;
/**
 * Save the gate cache to disk.
 */
export declare function saveGateCache(workDir: string, cache: GateCache): void;
/**
 * Look up a cached gate result for a file.
 * Returns null if not cached or expired.
 */
export declare function getCachedResult(cache: GateCache, gate: string, fileSha256: string): GateCacheEntry | null;
/**
 * Store a gate result in the cache.
 */
export declare function setCachedResult(cache: GateCache, gate: string, fileSha256: string, verdict: 'pass' | 'fail' | 'warn', reason: string, ttlMs?: number): void;
/**
 * Clear all expired entries from the cache.
 * Returns the number of entries purged.
 */
export declare function purgeExpiredEntries(cache: GateCache): number;
/**
 * Clear the entire cache.
 */
export declare function clearGateCache(workDir: string): void;
/**
 * Get cache statistics.
 */
export declare function getCacheStats(cache: GateCache): {
    total_entries: number;
    by_gate: Record<string, number>;
    by_verdict: Record<string, number>;
    expired: number;
};
