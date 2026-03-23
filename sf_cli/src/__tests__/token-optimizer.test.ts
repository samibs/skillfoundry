import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  stripMarkdownOverhead,
  collapseRepeatedPatterns,
  stripCodeComments,
  truncateFileContents,
  deduplicateInstructions,
  compactTables,
  analyzeTokens,
  compressContext,
  formatAnalysisReport,
  formatCompressReport,
  getAllCompressionStrategies,
} from '../core/token-optimizer.js';

describe('estimateTokens', () => {
  it('returns ~286 tokens for 1000 chars', () => {
    expect(estimateTokens('a'.repeat(1000))).toBe(286);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('stripMarkdownOverhead', () => {
  it('converts headers to bold', () => {
    expect(stripMarkdownOverhead('## Hello World')).toContain('**Hello World**');
  });

  it('removes horizontal rules', () => {
    expect(stripMarkdownOverhead('text\n---\nmore')).not.toContain('---');
  });

  it('preserves code blocks', () => {
    const input = '```ts\nconst x = 1;\n```';
    expect(stripMarkdownOverhead(input)).toContain('const x = 1');
  });

  it('handles nested formatting', () => {
    const input = '### **Bold** heading';
    const result = stripMarkdownOverhead(input);
    expect(result).toContain('Bold');
  });

  it('collapses multiple blank lines', () => {
    const result = stripMarkdownOverhead('a\n\n\n\n\nb');
    expect(result).toBe('a\n\nb');
  });
});

describe('collapseRepeatedPatterns', () => {
  it('collapses 3+ identical lines', () => {
    const input = 'ERROR: failed\nERROR: failed\nERROR: failed\nERROR: failed';
    const result = collapseRepeatedPatterns(input);
    expect(result).toContain('4x');
    expect(result).toContain('ERROR: failed');
  });

  it('collapses lines with different timestamps', () => {
    const input = '2026-01-01T10:00:00 error\n2026-01-01T10:01:00 error\n2026-01-01T10:02:00 error';
    const result = collapseRepeatedPatterns(input);
    expect(result).toContain('3x');
  });

  it('preserves non-repeated content', () => {
    const input = 'line a\nline b\nline c';
    expect(collapseRepeatedPatterns(input)).toBe(input);
  });

  it('does not collapse fewer than 3 repeats', () => {
    const input = 'same\nsame';
    const result = collapseRepeatedPatterns(input);
    expect(result).not.toContain('x');
  });
});

describe('stripCodeComments', () => {
  it('removes single-line comments', () => {
    const result = stripCodeComments('const x = 1; // comment\nconst y = 2;');
    expect(result).not.toContain('// comment');
    expect(result).toContain('const x = 1;');
  });

  it('removes multi-line comments', () => {
    const result = stripCodeComments('/* block\ncomment */\ncode');
    expect(result).toContain('code');
    expect(result).not.toContain('block');
  });

  it('preserves JSDoc comments', () => {
    const input = '/** @param x */\nfunction f() {}';
    expect(stripCodeComments(input)).toContain('/** @param x */');
  });

  it('preserves URLs with //', () => {
    const input = 'const url = "https://example.com";';
    expect(stripCodeComments(input)).toContain('https://example.com');
  });

  it('handles empty input', () => {
    expect(stripCodeComments('')).toBe('');
  });
});

describe('truncateFileContents', () => {
  it('truncates long code blocks', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
    const input = '```ts\n' + lines.join('\n') + '\n```';
    const result = truncateFileContents(input);
    expect(result).toContain('[...');
    expect(result).toContain('truncated');
  });

  it('preserves short code blocks', () => {
    const input = '```ts\nconst x = 1;\n```';
    expect(truncateFileContents(input)).toBe(input);
  });

  it('includes line count in marker', () => {
    const lines = Array.from({ length: 80 }, (_, i) => `line ${i}`);
    const input = '```\n' + lines.join('\n') + '\n```';
    const result = truncateFileContents(input);
    expect(result).toMatch(/\d+ lines truncated/);
  });

  it('handles multiple code blocks', () => {
    const long = '```\n' + Array.from({ length: 60 }, () => 'x').join('\n') + '\n```';
    const input = long + '\ntext\n' + long;
    const result = truncateFileContents(input);
    const matches = result.match(/truncated/g);
    expect(matches?.length).toBe(2);
  });
});

describe('deduplicateInstructions', () => {
  it('removes duplicate sentences', () => {
    const input = 'Validate all inputs. Check for errors. Validate all inputs.';
    const result = deduplicateInstructions(input);
    const count = (result.match(/Validate all inputs/g) || []).length;
    expect(count).toBe(1);
  });

  it('keeps first occurrence', () => {
    const input = 'First sentence. Duplicate here. Second part. Duplicate here.';
    const result = deduplicateInstructions(input);
    expect(result).toContain('First sentence');
    expect(result).toContain('Duplicate here');
  });

  it('handles case-insensitive duplicates', () => {
    const input = 'Always validate inputs carefully. always validate inputs carefully.';
    const result = deduplicateInstructions(input);
    expect(result.match(/validate/gi)?.length).toBeLessThanOrEqual(1);
  });

  it('preserves unique sentences', () => {
    const input = 'First unique. Second unique. Third unique.';
    expect(deduplicateInstructions(input)).toBe(input);
  });
});

describe('compactTables', () => {
  it('converts simple table', () => {
    const input = '| Name | Value |\n| --- | --- |\n| foo | bar |';
    const result = compactTables(input);
    expect(result).toContain('Name: foo');
    expect(result).toContain('Value: bar');
  });

  it('handles multi-row tables', () => {
    const input = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |';
    const result = compactTables(input);
    expect(result).toContain('A: 1');
    expect(result).toContain('A: 3');
  });

  it('preserves non-table content', () => {
    const input = 'Regular text here.';
    expect(compactTables(input)).toBe(input);
  });
});

describe('analyzeTokens', () => {
  it('returns breakdown by section', () => {
    const input = '## Section A\nContent A\n## Section B\nContent B with more text';
    const analysis = analyzeTokens(input);
    expect(analysis.breakdown.length).toBeGreaterThanOrEqual(2);
  });

  it('includes suggestions for large sections', () => {
    const big = 'x '.repeat(5000);
    const input = '## Big Section\n' + big + '\n## Small\nhi';
    const analysis = analyzeTokens(input);
    expect(analysis.suggestions.length).toBeGreaterThan(0);
  });

  it('estimates cost', () => {
    const analysis = analyzeTokens('hello world');
    expect(analysis.estimatedCostUsd).toBeGreaterThan(0);
  });
});

describe('compressContext', () => {
  it('applies all strategies by default', () => {
    const input = '## Header\n---\ntext\ntext\ntext\n// comment\ncode';
    const result = compressContext(input);
    expect(result.compressedTokens).toBeLessThanOrEqual(result.originalTokens);
  });

  it('respects strategy filter', () => {
    const input = '## Header\nContent here';
    const result = compressContext(input, { strategies: ['strip-markdown'] });
    expect(result.strategiesApplied.every(s => s.strategy === 'strip-markdown')).toBe(true);
  });

  it('reports savings per strategy', () => {
    const input = '## Big Header\n---\nSome content\n---\nMore content';
    const result = compressContext(input);
    for (const s of result.strategiesApplied) {
      expect(s.savedTokens).toBeGreaterThan(0);
    }
  });

  it('handles already-compact text', () => {
    const result = compressContext('hi');
    expect(result.strategiesApplied).toHaveLength(0);
  });
});

describe('getAllCompressionStrategies', () => {
  it('returns 6 strategies', () => {
    expect(getAllCompressionStrategies()).toHaveLength(6);
  });
});

describe('formatAnalysisReport', () => {
  it('includes token counts', () => {
    const report = formatAnalysisReport(analyzeTokens('hello world test'));
    expect(report).toContain('Total tokens');
  });
});

describe('formatCompressReport', () => {
  it('shows savings percentage', () => {
    const input = '## Header\n---\nContent\n---\nMore';
    const result = compressContext(input);
    const report = formatCompressReport(result);
    expect(report).toContain('%');
  });
});
