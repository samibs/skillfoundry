import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  generatePrimer,
  formatRelativeAge,
  estimateTokens,
  truncate,
  shortID,
} from '../core/context-primer.js';

const TEST_DIR = join(process.cwd(), '_test_primer_workdir');
const KNOWLEDGE_DIR = join(TEST_DIR, 'memory_bank', 'knowledge');

function writeEntry(file: string, entry: Record<string, unknown>): void {
  const filePath = join(KNOWLEDGE_DIR, file);
  const line = JSON.stringify(entry) + '\n';
  writeFileSync(filePath, (existsSync(filePath) ? '' : '') + line, { flag: 'a' });
}

function makeEntry(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: `test-${Math.random().toString(36).slice(2, 10)}`,
    type: 'fact',
    content: 'Test knowledge entry',
    created_at: new Date().toISOString(),
    weight: 0.5,
    tags: ['test'],
    ...overrides,
  };
}

beforeEach(() => {
  mkdirSync(KNOWLEDGE_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// ── Primer Generation ───────────────────────────────────────────

describe('generatePrimer', () => {
  it('returns empty message when no knowledge dir exists', () => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    const result = generatePrimer(TEST_DIR);
    expect(result.markdown).toContain('Empty');
    expect(result.totalEntries).toBe(0);
  });

  it('returns empty message when files exist but are empty', () => {
    writeFileSync(join(KNOWLEDGE_DIR, 'facts.jsonl'), '');
    const result = generatePrimer(TEST_DIR);
    expect(result.markdown).toContain('Empty');
    expect(result.totalEntries).toBe(0);
  });

  it('generates primer with type counts', () => {
    writeEntry('facts.jsonl', makeEntry({ type: 'fact', content: 'Fact one' }));
    writeEntry('facts.jsonl', makeEntry({ type: 'fact', content: 'Fact two' }));
    writeEntry('decisions.jsonl', makeEntry({ type: 'decision', content: 'Decision one' }));

    const result = generatePrimer(TEST_DIR);
    expect(result.totalEntries).toBe(3);
    expect(result.markdown).toContain('3 entries');
    expect(result.markdown).toContain('| fact | 2 |');
    expect(result.markdown).toContain('| decision | 1 |');
  });

  it('shows top entries by weight', () => {
    writeEntry('facts.jsonl', makeEntry({ id: 'high-weight-id', type: 'fact', content: 'High weight entry', weight: 0.95 }));
    writeEntry('facts.jsonl', makeEntry({ type: 'fact', content: 'Low weight entry', weight: 0.1 }));

    const result = generatePrimer(TEST_DIR);
    expect(result.markdown).toContain('Highest Weight');
    expect(result.markdown).toContain('high-wei');
    expect(result.markdown).toContain('0.9');
  });

  it('shows most recent entries', () => {
    writeEntry('facts.jsonl', makeEntry({
      id: 'recent-entry-id',
      content: 'Very recent entry',
      created_at: new Date().toISOString(),
    }));

    const result = generatePrimer(TEST_DIR);
    expect(result.markdown).toContain('Most Recent');
    expect(result.markdown).toContain('today');
  });

  it('shows staleness warning for old entries', () => {
    const oldDate = new Date(Date.now() - 15 * 86400000).toISOString(); // 15 days ago
    writeEntry('facts.jsonl', makeEntry({ created_at: oldDate }));

    const result = generatePrimer(TEST_DIR);
    expect(result.isStale).toBe(true);
    expect(result.markdown).toContain('Stale');
  });

  it('does not show staleness warning for recent entries', () => {
    writeEntry('facts.jsonl', makeEntry({ created_at: new Date().toISOString() }));

    const result = generatePrimer(TEST_DIR);
    expect(result.isStale).toBe(false);
    expect(result.markdown).not.toContain('Stale');
  });

  it('skips malformed JSONL lines gracefully', () => {
    writeFileSync(join(KNOWLEDGE_DIR, 'facts.jsonl'), '{"id":"ok","type":"fact","content":"good","created_at":"2026-01-01T00:00:00Z","weight":0.5}\nnot valid json\n');

    const result = generatePrimer(TEST_DIR);
    expect(result.totalEntries).toBe(1);
  });

  it('estimates primer tokens within budget', () => {
    // Write 20 entries to ensure primer stays under 800 tokens
    for (let i = 0; i < 20; i++) {
      writeEntry('facts.jsonl', makeEntry({
        id: `entry-${i}-padded`,
        content: `Knowledge entry number ${i} with some medium-length content about the project`,
        weight: 0.3 + (i * 0.03),
      }));
    }

    const result = generatePrimer(TEST_DIR);
    expect(result.estimatedTokens).toBeLessThan(800);
  });
});

// ── Helper functions ────────────────────────────────────────────

describe('formatRelativeAge', () => {
  it('returns "today" for current date', () => {
    expect(formatRelativeAge(new Date().toISOString())).toBe('today');
  });

  it('returns "1d ago" for yesterday', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    expect(formatRelativeAge(yesterday)).toBe('1d ago');
  });

  it('returns days for <7 days', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    expect(formatRelativeAge(threeDaysAgo)).toBe('3d ago');
  });

  it('returns weeks for 7-29 days', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    expect(formatRelativeAge(twoWeeksAgo)).toBe('2w ago');
  });

  it('returns months for 30+ days', () => {
    const twoMonthsAgo = new Date(Date.now() - 65 * 86400000).toISOString();
    expect(formatRelativeAge(twoMonthsAgo)).toBe('2mo ago');
  });

  it('returns "unknown" for invalid dates', () => {
    expect(formatRelativeAge('not-a-date')).toBe('unknown');
  });
});

describe('estimateTokens', () => {
  it('divides char count by 4', () => {
    expect(estimateTokens(100)).toBe(25);
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(3)).toBe(1); // ceil
  });
});

describe('truncate', () => {
  it('returns full text if under limit', () => {
    expect(truncate('short text', 50)).toBe('short text');
  });

  it('truncates with ellipsis', () => {
    const long = 'a'.repeat(100);
    const result = truncate(long, 20);
    expect(result.length).toBe(20);
    expect(result.endsWith('...')).toBe(true);
  });

  it('handles empty/null', () => {
    expect(truncate('', 10)).toBe('');
  });

  it('replaces newlines with spaces', () => {
    expect(truncate('line1\nline2\nline3', 50)).toBe('line1 line2 line3');
  });
});

describe('shortID', () => {
  it('returns first 8 chars', () => {
    expect(shortID('abcdef12-3456-7890-abcd-ef1234567890')).toBe('abcdef12');
  });

  it('handles empty/null', () => {
    expect(shortID('')).toBe('???');
  });
});
