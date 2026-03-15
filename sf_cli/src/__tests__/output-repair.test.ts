import { describe, it, expect } from 'vitest';
import { repairJSON, repairCodeBlocks, repairLLMOutput, isValidJSON, withTemperatureDecay } from '../core/output-repair.js';

describe('repairJSON', () => {
  it('returns unchanged valid JSON', () => {
    const input = '{"key": "value", "arr": [1, 2]}';
    const result = repairJSON(input);
    expect(result.wasRepaired).toBe(false);
    expect(result.repaired).toBe(input);
  });

  it('closes unclosed brace', () => {
    const result = repairJSON('{"key": "value"');
    expect(result.repaired).toBe('{"key": "value"}');
    expect(result.fixes).toContain('Closed 1 unclosed brace(s)');
  });

  it('closes unclosed bracket', () => {
    const result = repairJSON('[1, 2, 3');
    expect(result.repaired).toBe('[1, 2, 3]');
    expect(result.fixes).toContain('Closed 1 unclosed bracket(s)');
  });

  it('closes nested unclosed structures', () => {
    const result = repairJSON('{"items": [{"name": "test"');
    expect(result.repaired).toBe('{"items": [{"name": "test"}]}');
    expect(result.wasRepaired).toBe(true);
  });

  it('removes trailing commas before }', () => {
    const result = repairJSON('{"a": 1, "b": 2,}');
    expect(result.repaired).toBe('{"a": 1, "b": 2}');
    expect(result.fixes.some((f) => f.includes('trailing comma'))).toBe(true);
  });

  it('removes trailing commas before ]', () => {
    const result = repairJSON('[1, 2, 3,]');
    expect(result.repaired).toBe('[1, 2, 3]');
  });

  it('strips markdown json fences', () => {
    const result = repairJSON('```json\n{"key": "value"}\n```');
    expect(result.repaired).toBe('{"key": "value"}');
    expect(result.fixes.some((f) => f.includes('fence'))).toBe(true);
  });

  it('closes unclosed markdown json fence', () => {
    const result = repairJSON('```json\n{"key": "val"');
    expect(result.repaired).toContain('"key": "val"');
    expect(result.wasRepaired).toBe(true);
  });

  it('closes unclosed string literal', () => {
    const result = repairJSON('{"key": "truncated value');
    expect(result.repaired).toBe('{"key": "truncated value"}');
    expect(result.fixes.some((f) => f.includes('string literal'))).toBe(true);
  });

  it('handles empty input', () => {
    const result = repairJSON('');
    expect(result.wasRepaired).toBe(false);
  });

  it('does not modify content between delimiters', () => {
    const inner = '"hello world 123 special chars !@#$%"';
    const result = repairJSON(`{"msg": ${inner}`);
    expect(result.repaired).toContain(inner);
  });

  it('handles deeply nested truncation', () => {
    const result = repairJSON('{"a": {"b": {"c": [1, 2');
    expect(result.repaired).toBe('{"a": {"b": {"c": [1, 2]}}}');
  });
});

describe('repairCodeBlocks', () => {
  it('returns unchanged when all fences closed', () => {
    const input = '```typescript\nconst x = 1;\n```';
    const result = repairCodeBlocks(input);
    expect(result.wasRepaired).toBe(false);
    expect(result.repaired).toBe(input);
  });

  it('closes unclosed code fence', () => {
    const input = '```typescript\nconst x = 1;';
    const result = repairCodeBlocks(input);
    expect(result.repaired).toBe(input + '\n```');
    expect(result.fixes.some((f) => f.includes('Closed unclosed code block'))).toBe(true);
  });

  it('handles multiple complete blocks', () => {
    const input = '```js\nfoo();\n```\n\n```py\nbar()\n```';
    const result = repairCodeBlocks(input);
    expect(result.wasRepaired).toBe(false);
  });

  it('closes when odd number of fences', () => {
    const input = '```\nblock1\n```\n```\nblock2 truncated';
    const result = repairCodeBlocks(input);
    expect(result.wasRepaired).toBe(true);
    expect(result.repaired.endsWith('```')).toBe(true);
  });

  it('handles no fences at all', () => {
    const result = repairCodeBlocks('plain text no fences');
    expect(result.wasRepaired).toBe(false);
  });
});

describe('repairLLMOutput', () => {
  it('repairs JSON-looking output', () => {
    const result = repairLLMOutput('{"key": "val"');
    expect(result.repaired).toBe('{"key": "val"}');
    expect(result.wasRepaired).toBe(true);
  });

  it('repairs code blocks in non-JSON output', () => {
    const result = repairLLMOutput('Here is code:\n```ts\nconst x = 1;');
    expect(result.wasRepaired).toBe(true);
    expect(result.repaired).toContain('```');
  });

  it('does not touch clean output', () => {
    const input = 'This is plain text with no issues.';
    const result = repairLLMOutput(input);
    expect(result.wasRepaired).toBe(false);
    expect(result.repaired).toBe(input);
  });

  it('applies both JSON and code block repairs when needed', () => {
    const input = '```json\n{"items": [1, 2';
    const result = repairLLMOutput(input);
    expect(result.wasRepaired).toBe(true);
    expect(result.fixes.length).toBeGreaterThanOrEqual(1);
  });

  it('handles array-style JSON', () => {
    const result = repairLLMOutput('[{"id": 1}, {"id": 2');
    expect(result.repaired).toBe('[{"id": 1}, {"id": 2}]');
  });
});

describe('isValidJSON', () => {
  it('returns true for valid JSON object', () => {
    expect(isValidJSON('{"key": "value"}')).toBe(true);
  });

  it('returns true for valid JSON array', () => {
    expect(isValidJSON('[1, 2, 3]')).toBe(true);
  });

  it('returns false for truncated JSON', () => {
    expect(isValidJSON('{"key": "val')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidJSON('')).toBe(false);
  });
});

describe('withTemperatureDecay', () => {
  it('returns immediately on valid output at first temperature', async () => {
    const result = await withTemperatureDecay({
      callLLM: async () => '{"valid": true}',
    });
    expect(result.attempt).toBe(1);
    expect(result.repaired).toBe(false);
    expect(result.output).toBe('{"valid": true}');
  });

  it('repairs truncated JSON without retrying', async () => {
    const result = await withTemperatureDecay({
      callLLM: async () => '{"key": "val"',
    });
    expect(result.attempt).toBe(1);
    expect(result.repaired).toBe(true);
    expect(result.output).toBe('{"key": "val"}');
  });

  it('retries with lower temperature when repair fails validation', async () => {
    let callCount = 0;
    const result = await withTemperatureDecay({
      callLLM: async (temp) => {
        callCount++;
        if (temp === 0.7) return 'garbage not json';
        return '{"fixed": true}';
      },
    });
    expect(callCount).toBe(2);
    expect(result.temperature).toBe(0.4);
    expect(result.repaired).toBe(false);
  });

  it('uses custom validator', async () => {
    const result = await withTemperatureDecay({
      callLLM: async () => 'custom-valid-output',
      validate: (output) => output.startsWith('custom'),
    });
    expect(result.output).toBe('custom-valid-output');
    expect(result.attempt).toBe(1);
  });

  it('returns best repair when all attempts fail validation', async () => {
    const result = await withTemperatureDecay({
      callLLM: async () => '{"partial": true',
      validate: () => false, // always reject
    });
    // Should return the repaired version as best effort
    expect(result.output).toBe('{"partial": true}');
    expect(result.repaired).toBe(true);
  });

  it('throws when no output produced at all', async () => {
    await expect(
      withTemperatureDecay({
        callLLM: async () => { throw new Error('LLM down'); },
        attemptRepair: false,
      }),
    ).rejects.toThrow('Temperature decay exhausted');
  });

  it('respects custom temperature sequence', async () => {
    const temps: number[] = [];
    await withTemperatureDecay({
      callLLM: async (temp) => {
        temps.push(temp);
        if (temp === 0.05) return '{"ok": true}';
        return 'invalid';
      },
      temperatures: [0.9, 0.5, 0.05],
    });
    expect(temps).toEqual([0.9, 0.5, 0.05]);
  });
});
