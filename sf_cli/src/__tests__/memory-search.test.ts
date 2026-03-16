/**
 * Unit tests for the `memory search` CLI command (STORY-007, FR-008).
 *
 * Covers:
 *   - Argument parsing (query, mode, top-k, scope, json)
 *   - Preview mode formatting (truncation, metadata display)
 *   - Index mode formatting (single-line per result)
 *   - Full mode formatting (complete text output)
 *   - JSON output schema validation
 *   - Fallback behaviour when embeddings are unavailable
 *   - Error message for empty query
 *   - Top-k clamping (max 50)
 *   - tokenise() helper correctness
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  parseSearchArgs,
  tokenise,
  convertSemanticResults,
  formatIndexOutput,
  formatPreviewOutput,
  formatFullOutput,
  formatJsonOutput,
  runKeywordSearch,
  executeMemorySearch,
  type MemorySearchOptions,
  type FormattedSearchResult,
} from '../commands/memory-search.js';

import type { SearchResult } from '../core/vector-store.js';
import type { SessionContext } from '../types.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), `sf-memory-search-test-${Date.now()}`);
const KNOWLEDGE_DIR = join(TEST_DIR, 'memory_bank', 'knowledge');

function makeSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'mem-a1b2c3d4',
    text: 'The login flow uses RS256 JWT with 15-minute access tokens and 7-day refresh tokens. Refresh tokens rotate on each use.',
    metadata: {
      source: 'memory_bank/decisions.jsonl',
      scope: 'project',
      type: 'decision',
      tags: ['auth', 'jwt'],
      timestamp: 1741564800000,
    },
    score: 0.92,
    distance: 0.08,
    ...overrides,
  };
}

function makeFormattedResult(overrides: Partial<FormattedSearchResult> = {}): FormattedSearchResult {
  return {
    id: 'mem-a1b2c3d4',
    score: 0.92,
    title: 'The login flow uses RS256 JWT with 15-minute access tokens and 7-day refresh tokens.',
    text: 'The login flow uses RS256 JWT with 15-minute access tokens and 7-day refresh tokens. Refresh tokens rotate on each use.',
    source: 'memory_bank/decisions.jsonl',
    scope: 'project',
    type: 'decision',
    tags: ['auth', 'jwt'],
    timestamp: 1741564800000,
    ...overrides,
  };
}

function makeSession(workDir = TEST_DIR): SessionContext {
  return {
    workDir,
    config: {} as any,
    policy: {} as any,
    state: {} as any,
    messages: [],
    permissionMode: 'auto',
    activeAgent: null,
    activeTeam: null,
    addMessage: () => {},
    setState: () => {},
    setActiveAgent: () => {},
    setActiveTeam: () => {},
  };
}

function writeKnowledgeEntry(entry: Record<string, unknown>): void {
  writeFileSync(join(KNOWLEDGE_DIR, 'facts.jsonl'), JSON.stringify(entry) + '\n', { flag: 'a' });
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  mkdirSync(KNOWLEDGE_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ── tokenise ──────────────────────────────────────────────────────────────────

describe('tokenise', () => {
  it('splits plain whitespace-separated tokens', () => {
    expect(tokenise('auth flow --mode preview')).toEqual(['auth', 'flow', '--mode', 'preview']);
  });

  it('preserves content inside double quotes as a single token', () => {
    expect(tokenise('"authentication flow" --mode index')).toEqual([
      'authentication flow',
      '--mode',
      'index',
    ]);
  });

  it('preserves content inside single quotes as a single token', () => {
    expect(tokenise("'authentication flow' --top-k 3")).toEqual([
      'authentication flow',
      '--top-k',
      '3',
    ]);
  });

  it('returns empty array for empty string', () => {
    expect(tokenise('')).toEqual([]);
  });

  it('handles multiple consecutive spaces', () => {
    expect(tokenise('auth  flow')).toEqual(['auth', 'flow']);
  });
});

// ── parseSearchArgs ───────────────────────────────────────────────────────────

describe('parseSearchArgs', () => {
  it('returns usage help for empty query', () => {
    const result = parseSearchArgs('');
    expect(typeof result).toBe('string');
    expect(result as string).toContain('Usage:');
  });

  it('returns usage help when only flags are provided with no query text', () => {
    const result = parseSearchArgs('--mode index');
    expect(typeof result).toBe('string');
    expect(result as string).toContain('Usage:');
  });

  it('parses a bare query string with default options', () => {
    const result = parseSearchArgs('authentication flow') as MemorySearchOptions;
    expect(result.query).toBe('authentication flow');
    expect(result.mode).toBe('preview');
    expect(result.topK).toBe(10);
    expect(result.scope).toBeUndefined();
    expect(result.json).toBe(false);
  });

  it('parses a double-quoted query', () => {
    const result = parseSearchArgs('"authentication flow"') as MemorySearchOptions;
    expect(result.query).toBe('authentication flow');
  });

  it('parses --mode index', () => {
    const result = parseSearchArgs('auth --mode index') as MemorySearchOptions;
    expect(result.mode).toBe('index');
  });

  it('parses --mode preview', () => {
    const result = parseSearchArgs('auth --mode preview') as MemorySearchOptions;
    expect(result.mode).toBe('preview');
  });

  it('parses --mode full', () => {
    const result = parseSearchArgs('auth --mode full') as MemorySearchOptions;
    expect(result.mode).toBe('full');
  });

  it('returns error for invalid --mode value', () => {
    const result = parseSearchArgs('auth --mode bad');
    expect(typeof result).toBe('string');
    expect(result as string).toContain('Invalid --mode');
  });

  it('parses --top-k N', () => {
    const result = parseSearchArgs('auth --top-k 3') as MemorySearchOptions;
    expect(result.topK).toBe(3);
  });

  it('clamps --top-k to max 50', () => {
    const result = parseSearchArgs('auth --top-k 999') as MemorySearchOptions;
    expect(result.topK).toBe(50);
  });

  it('returns error for invalid --top-k value', () => {
    const result = parseSearchArgs('auth --top-k abc');
    expect(typeof result).toBe('string');
    expect(result as string).toContain('Invalid --top-k');
  });

  it('returns error for non-positive --top-k', () => {
    const result = parseSearchArgs('auth --top-k 0');
    expect(typeof result).toBe('string');
    expect(result as string).toContain('Invalid --top-k');
  });

  it('parses --scope project', () => {
    const result = parseSearchArgs('auth --scope project') as MemorySearchOptions;
    expect(result.scope).toBe('project');
  });

  it('parses --scope framework', () => {
    const result = parseSearchArgs('auth --scope framework') as MemorySearchOptions;
    expect(result.scope).toBe('framework');
  });

  it('parses --scope global', () => {
    const result = parseSearchArgs('auth --scope global') as MemorySearchOptions;
    expect(result.scope).toBe('global');
  });

  it('returns error for invalid --scope value', () => {
    const result = parseSearchArgs('auth --scope company');
    expect(typeof result).toBe('string');
    expect(result as string).toContain('Invalid --scope');
  });

  it('parses --json flag', () => {
    const result = parseSearchArgs('auth --json') as MemorySearchOptions;
    expect(result.json).toBe(true);
  });

  it('returns error for unknown flag', () => {
    const result = parseSearchArgs('auth --unknown');
    expect(typeof result).toBe('string');
    expect(result as string).toContain('Unknown flag');
  });

  it('parses combination of all flags', () => {
    const result = parseSearchArgs(
      '"auth flow" --mode full --top-k 3 --scope project --json',
    ) as MemorySearchOptions;
    expect(result.query).toBe('auth flow');
    expect(result.mode).toBe('full');
    expect(result.topK).toBe(3);
    expect(result.scope).toBe('project');
    expect(result.json).toBe(true);
  });
});

// ── convertSemanticResults ────────────────────────────────────────────────────

describe('convertSemanticResults', () => {
  it('maps SearchResult fields to FormattedSearchResult in preview mode', () => {
    const raw = makeSearchResult();
    const results = convertSemanticResults([raw], 'preview');

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('mem-a1b2c3d4');
    expect(results[0].score).toBe(0.92);
    expect(results[0].source).toBe('memory_bank/decisions.jsonl');
    expect(results[0].scope).toBe('project');
    expect(results[0].type).toBe('decision');
    expect(results[0].tags).toEqual(['auth', 'jwt']);
    expect(results[0].timestamp).toBe(1741564800000);
  });

  it('truncates text at 200 chars in preview mode', () => {
    const longText = 'A'.repeat(300);
    const raw = makeSearchResult({ text: longText });
    const results = convertSemanticResults([raw], 'preview');
    expect(results[0].text.length).toBeLessThanOrEqual(203); // 200 + '...'
    expect(results[0].text.endsWith('...')).toBe(true);
  });

  it('preserves full text in full mode', () => {
    const longText = 'A'.repeat(300);
    const raw = makeSearchResult({ text: longText });
    const results = convertSemanticResults([raw], 'full');
    expect(results[0].text.length).toBe(300);
  });

  it('returns empty array for empty input', () => {
    expect(convertSemanticResults([], 'preview')).toEqual([]);
  });
});

// ── formatIndexOutput ─────────────────────────────────────────────────────────

describe('formatIndexOutput', () => {
  it('outputs one line per result with score and ID', () => {
    const results = [makeFormattedResult()];
    const output = formatIndexOutput(results);

    expect(output).toContain('mem-a1b2c3d4');
    expect(output).toContain('[0.92]');
  });

  it('numbers each result starting from 1', () => {
    const results = [makeFormattedResult(), makeFormattedResult({ id: 'mem-second', score: 0.85 })];
    const output = formatIndexOutput(results);
    expect(output).toContain('1.');
    expect(output).toContain('2.');
  });

  it('returns no-match message for empty results', () => {
    expect(formatIndexOutput([])).toBe('No matching memories found.');
  });
});

// ── formatPreviewOutput ───────────────────────────────────────────────────────

describe('formatPreviewOutput', () => {
  it('includes query, provider, and latency in header', () => {
    const results = [makeFormattedResult()];
    const output = formatPreviewOutput(results, 'authentication flow', 'ollama', 142);

    expect(output).toContain('Memory Search: "authentication flow"');
    expect(output).toContain('Provider: ollama');
    expect(output).toContain('Latency: 142ms');
    expect(output).toContain('Results: 1');
  });

  it('shows scope, type, and date for each result', () => {
    const results = [makeFormattedResult()];
    const output = formatPreviewOutput(results, 'auth', 'ollama', 50);

    expect(output).toContain('Scope: project');
    expect(output).toContain('Type: decision');
    // timestamp 1741564800000 = 2025-03-10
    expect(output).toContain('2025-03-10');
  });

  it('shows the score for each result', () => {
    const results = [makeFormattedResult({ score: 0.875 })];
    const output = formatPreviewOutput(results, 'auth', 'ollama', 50);
    expect(output).toContain('[0.88]');
  });

  it('returns no-match message for empty results', () => {
    expect(formatPreviewOutput([], 'auth', 'ollama', 10)).toBe('No matching memories found.');
  });
});

// ── formatFullOutput ──────────────────────────────────────────────────────────

describe('formatFullOutput', () => {
  it('includes header with query and provider', () => {
    const results = [makeFormattedResult()];
    const output = formatFullOutput(results, 'auth', 'openai', 200);

    expect(output).toContain('Memory Search: "auth"');
    expect(output).toContain('Provider: openai');
  });

  it('includes tags when present', () => {
    const results = [makeFormattedResult({ tags: ['auth', 'jwt'] })];
    const output = formatFullOutput(results, 'auth', 'ollama', 100);
    expect(output).toContain('Tags: auth, jwt');
  });

  it('includes source path', () => {
    const results = [makeFormattedResult({ source: 'memory_bank/decisions.jsonl' })];
    const output = formatFullOutput(results, 'auth', 'ollama', 100);
    expect(output).toContain('Source: memory_bank/decisions.jsonl');
  });

  it('does not truncate text', () => {
    const longText = 'A'.repeat(500);
    const results = [makeFormattedResult({ text: longText })];
    const output = formatFullOutput(results, 'auth', 'ollama', 100);
    // The text is embedded in the output — check it contains 500 A's
    expect(output).toContain('A'.repeat(500));
  });

  it('returns no-match message for empty results', () => {
    expect(formatFullOutput([], 'auth', 'ollama', 10)).toBe('No matching memories found.');
  });
});

// ── formatJsonOutput ──────────────────────────────────────────────────────────

describe('formatJsonOutput', () => {
  it('produces valid JSON', () => {
    const raw = makeSearchResult();
    const output = formatJsonOutput('auth', 'ollama', 'nomic-embed-text', 142, [raw]);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('includes required top-level fields', () => {
    const raw = makeSearchResult();
    const parsed = JSON.parse(formatJsonOutput('auth', 'ollama', 'nomic-embed-text', 142, [raw]));

    expect(parsed).toHaveProperty('query', 'auth');
    expect(parsed).toHaveProperty('provider', 'ollama');
    expect(parsed).toHaveProperty('model', 'nomic-embed-text');
    expect(parsed).toHaveProperty('latency_ms', 142);
    expect(parsed).toHaveProperty('results');
    expect(Array.isArray(parsed.results)).toBe(true);
  });

  it('includes required result fields', () => {
    const raw = makeSearchResult();
    const parsed = JSON.parse(formatJsonOutput('auth', 'ollama', 'nomic-embed-text', 142, [raw]));

    const result = parsed.results[0];
    expect(result).toHaveProperty('id', 'mem-a1b2c3d4');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('metadata');
    expect(result.metadata).toHaveProperty('source');
    expect(result.metadata).toHaveProperty('scope');
    expect(result.metadata).toHaveProperty('type');
    expect(result.metadata).toHaveProperty('tags');
    expect(result.metadata).toHaveProperty('timestamp');
  });

  it('produces empty results array when no matches', () => {
    const parsed = JSON.parse(formatJsonOutput('auth', 'keyword', 'tfidf', 5, []));
    expect(parsed.results).toHaveLength(0);
  });
});

// ── runKeywordSearch ──────────────────────────────────────────────────────────

describe('runKeywordSearch', () => {
  it('returns empty array when no knowledge exists', () => {
    const results = runKeywordSearch('auth', 5, 'preview', undefined, TEST_DIR);
    expect(results).toEqual([]);
  });

  it('returns matched entries from knowledge files', () => {
    writeKnowledgeEntry({
      id: 'know-1',
      type: 'decision',
      content: 'Use JWT RS256 for authentication tokens',
      created_at: new Date().toISOString(),
      weight: 0.8,
      tags: ['auth', 'jwt'],
    });

    const results = runKeywordSearch('authentication JWT', 5, 'preview', undefined, TEST_DIR);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('know-1');
  });

  it('respects top-k limit', () => {
    for (let i = 0; i < 10; i++) {
      writeKnowledgeEntry({
        id: `entry-${i}`,
        type: 'fact',
        content: `Authentication pattern number ${i} with token handling`,
        created_at: new Date().toISOString(),
        weight: 0.5,
        tags: ['auth'],
      });
    }

    const results = runKeywordSearch('authentication token', 3, 'preview', undefined, TEST_DIR);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('normalises scores to [0, 1]', () => {
    writeKnowledgeEntry({
      id: 'score-test',
      type: 'fact',
      content: 'Authentication flow for login',
      created_at: new Date().toISOString(),
      weight: 0.5,
      tags: [],
    });

    const results = runKeywordSearch('authentication', 5, 'preview', undefined, TEST_DIR);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });
});

// ── executeMemorySearch (integration) ─────────────────────────────────────────

describe('executeMemorySearch', () => {
  it('returns usage help when query is empty', async () => {
    const session = makeSession();
    const result = await executeMemorySearch('', session);
    expect(result).toContain('Usage:');
  });

  it('falls back to keyword search and shows warning when embeddings are unavailable', async () => {
    // Mock runSemanticSearch via module — we mock the EmbeddingService to throw
    const { EmbeddingUnavailableError } = await import('../core/embedding-service.js');
    const { VectorStore } = await import('../core/vector-store.js');

    // Patch VectorStore.prototype.initialize to throw EmbeddingUnavailableError
    const initSpy = vi.spyOn(VectorStore.prototype, 'initialize').mockRejectedValue(
      new EmbeddingUnavailableError({ ollama: 'unavailable', openai: 'no key' }),
    );

    writeKnowledgeEntry({
      id: 'fallback-entry',
      type: 'decision',
      content: 'Authentication uses JWT with RS256',
      created_at: new Date().toISOString(),
      weight: 0.7,
      tags: ['auth'],
    });

    const session = makeSession();
    const result = await executeMemorySearch('authentication', session);

    expect(result).toContain('Warning: ChromaDB unavailable, using keyword search');
    initSpy.mockRestore();
  });

  it('returns "No matching memories found." when vector store is empty and embeddings unavailable', async () => {
    const { EmbeddingUnavailableError } = await import('../core/embedding-service.js');
    const { VectorStore } = await import('../core/vector-store.js');

    const initSpy = vi.spyOn(VectorStore.prototype, 'initialize').mockRejectedValue(
      new EmbeddingUnavailableError({ ollama: 'unavailable', openai: 'no key' }),
    );

    const session = makeSession();
    const result = await executeMemorySearch('quantum computing', session);

    // Knowledge dir is empty — keyword search returns no results
    expect(result).toContain('No matching memories found.');
    initSpy.mockRestore();
  });

  it('returns JSON output for --json flag with fallback path', async () => {
    const { EmbeddingUnavailableError } = await import('../core/embedding-service.js');
    const { VectorStore } = await import('../core/vector-store.js');

    const initSpy = vi.spyOn(VectorStore.prototype, 'initialize').mockRejectedValue(
      new EmbeddingUnavailableError({ ollama: 'unavailable', openai: 'no key' }),
    );

    const session = makeSession();
    const result = await executeMemorySearch('auth --json', session);

    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('query', 'auth');
    expect(parsed).toHaveProperty('results');
    initSpy.mockRestore();
  });

  it('returns index mode output when --mode index is specified', async () => {
    const { EmbeddingUnavailableError } = await import('../core/embedding-service.js');
    const { VectorStore } = await import('../core/vector-store.js');

    const initSpy = vi.spyOn(VectorStore.prototype, 'initialize').mockRejectedValue(
      new EmbeddingUnavailableError({ ollama: 'unavailable', openai: 'no key' }),
    );

    writeKnowledgeEntry({
      id: 'index-mode-entry',
      type: 'decision',
      content: 'Authentication token validation logic',
      created_at: new Date().toISOString(),
      weight: 0.6,
      tags: ['auth'],
    });

    const session = makeSession();
    const result = await executeMemorySearch('authentication --mode index', session);

    // Index mode should show compact lines, not the full header
    expect(result).toContain('index-mode-entry');
    initSpy.mockRestore();
  });

  it('uses semantic search when vector store returns results', async () => {
    const { VectorStore } = await import('../core/vector-store.js');

    const mockResult = makeSearchResult();
    const initSpy = vi.spyOn(VectorStore.prototype, 'initialize').mockResolvedValue(undefined);
    const searchSpy = vi.spyOn(VectorStore.prototype, 'search').mockResolvedValue([mockResult]);

    // Also mock EmbeddingService.getActiveProvider for header info
    const { EmbeddingService } = await import('../core/embedding-service.js');
    const getActiveSpy = vi.spyOn(EmbeddingService.prototype, 'getActiveProvider').mockResolvedValue({
      name: 'ollama',
      dimensions: 768,
      embed: async () => [],
      embedBatch: async () => [],
      isAvailable: async () => true,
    });

    const session = makeSession();
    const result = await executeMemorySearch('"authentication flow"', session);

    expect(result).toContain('Memory Search: "authentication flow"');
    expect(result).toContain('Provider: ollama');
    // Preview mode shows title text, not the raw ID
    expect(result).toContain('The login flow uses RS256 JWT');

    initSpy.mockRestore();
    searchSpy.mockRestore();
    getActiveSpy.mockRestore();
  });
});
