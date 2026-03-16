# STORY-006: File-Hash Gate Caching

**Phase:** 2 — Performance
**PRD:** phase3-make-it-the-standard
**Priority:** MUST
**Effort:** M
**Status:** READY
**Dependencies:** STORY-005
**Blocks:** STORY-007
**Affects:** FR-006

---

## Description

Implement a file-level gate result cache keyed by SHA256 hash of file contents. When a gate evaluates a file, the result (verdict + reason) is stored in a cache keyed by `{fileSha256}:{gateTier}:{gateVersion}`. On subsequent runs, if the file hash is unchanged and the gate version matches, the cached result is returned without re-running the gate. This eliminates redundant gate execution on unchanged files, significantly reducing pipeline time on incremental changes.

---

## Acceptance Contract

**done_when:**
- [ ] `sf_cli/src/core/gate-cache.ts` exports `getGateCacheEntry(fileSha: string, gate: string): GateCacheEntry | null` and `setGateCacheEntry(entry: GateCacheEntry): void`
- [ ] Cache is stored at `.skillfoundry/gate-cache.json` as a JSON object keyed by `{fileSha256}:{gate}:{gateVersion}`
- [ ] `gateVersion` is a hash of the gate logic source (changes when gate logic is updated), ensuring stale results are auto-invalidated
- [ ] Each cache entry includes: `fileSha256`, `gate`, `gateVersion`, `verdict`, `reason`, `cachedAt` (ISO 8601), `expiresAt` (ISO 8601, default 24h TTL)
- [ ] `getGateCacheEntry` returns `null` for expired entries (past `expiresAt`)
- [ ] `getGateCacheEntry` returns `null` for entries with mismatched `gateVersion`
- [ ] Cache lookup completes in <10ms per file (measured in unit tests)
- [ ] `sf_cli/src/core/gates.ts` checks the cache before running each gate; on cache hit, returns the cached result and logs `[cache hit] T1 for <file>` at debug level
- [ ] `invalidateCache()` clears the entire cache file (for `sf gates --no-cache` flag)
- [ ] `sf gates --no-cache` flag bypasses the cache and runs all gates fresh
- [ ] Cache file is created lazily on first write
- [ ] Unit tests in `sf_cli/src/__tests__/gate-cache.test.ts` cover: cache miss, cache hit, expired entry, gate version mismatch, invalidation, corrupt cache file recovery, lookup performance (<10ms)

**fail_when:**
- A cached result is returned for a file whose contents have changed (hash mismatch)
- A cached result is returned after the gate logic has been updated (version mismatch)
- An expired cache entry is returned instead of null
- Cache lookup takes more than 10ms per file on a cache with 10,000 entries
- A corrupt cache file crashes the system instead of being rebuilt

---

## Technical Approach

### Cache Key Design

```
Key: "{fileSha256}:{gate}:{gateVersion}"
Example: "a3f2b1c4d5e6...:{T1}:{v1.2.3-abc123}"
```

- `fileSha256`: SHA256 of the file contents (computed via `crypto.createHash('sha256').update(content).digest('hex')`)
- `gate`: tier name (T1, T2, etc.)
- `gateVersion`: short hash of the gate function source to detect logic changes

### Gate Version Computation

Compute a stable hash of each gate function's source file at startup:

```typescript
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const GATE_SOURCE = readFileSync(join(__dirname, 'gates.ts'), 'utf-8');
const GATE_VERSION = createHash('sha256').update(GATE_SOURCE).digest('hex').slice(0, 12);
```

This ensures that any change to `gates.ts` invalidates all cached results.

### Cache Storage

Use a single JSON file at `.skillfoundry/gate-cache.json`:

```json
{
  "a3f2...:{T1}:{abc123}": {
    "fileSha256": "a3f2...",
    "gate": "T1",
    "gateVersion": "abc123",
    "verdict": "pass",
    "reason": "No banned patterns found",
    "cachedAt": "2026-03-16T10:00:00Z",
    "expiresAt": "2026-03-17T10:00:00Z"
  }
}
```

The cache is loaded into memory once at the start of a gate run. Writes are batched and flushed at the end of `runAllGates()`.

### Cache Integration in gates.ts

```typescript
async function runGateWithCache(
  gate: string,
  fileSha: string,
  runner: () => Promise<GateResult>
): Promise<GateResult> {
  if (!noCache) {
    const cached = getGateCacheEntry(fileSha, gate);
    if (cached) {
      logger.debug(`[cache hit] ${gate} for ${fileSha.slice(0, 8)}`);
      return { tier: gate, name: gate, status: cached.verdict, detail: cached.reason, durationMs: 0 };
    }
  }
  const result = await runner();
  setGateCacheEntry({
    fileSha256: fileSha, gate, gateVersion: GATE_VERSION,
    verdict: result.status, reason: result.detail,
    cachedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  return result;
}
```

### Corrupt Cache Recovery

If `JSON.parse()` fails on the cache file, log a warning, delete the file, and start with an empty cache. No user action required.

---

## Files Affected

| File | Action |
|------|--------|
| `sf_cli/src/core/gate-cache.ts` | CREATE — Cache read/write/invalidate, GateCacheEntry type |
| `sf_cli/src/__tests__/gate-cache.test.ts` | CREATE — Unit tests |
| `sf_cli/src/core/gates.ts` | MODIFY — Integrate cache lookup before each gate, add `--no-cache` flag |
| `.gitignore` | MODIFY — Add `.skillfoundry/gate-cache.json` |
