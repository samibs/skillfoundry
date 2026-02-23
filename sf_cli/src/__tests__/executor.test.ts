import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeTool } from '../core/executor.js';
import type { SfPolicy } from '../types.js';

const TEST_DIR = join(tmpdir(), 'sf-executor-test-' + Date.now());

const ALLOW_ALL_POLICY: SfPolicy = {
  allow_shell: true,
  allow_network: false,
  allow_paths: ['.'],
  redact: false,
};

const DENY_SHELL_POLICY: SfPolicy = {
  allow_shell: false,
  allow_network: false,
  allow_paths: ['.'],
  redact: false,
};

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(join(TEST_DIR, 'hello.txt'), 'line one\nline two\nline three\n');
  mkdirSync(join(TEST_DIR, 'sub'), { recursive: true });
  writeFileSync(join(TEST_DIR, 'sub', 'data.json'), '{"key": "value"}');
  writeFileSync(join(TEST_DIR, 'code.ts'), 'const x = 1;\nconst y = 2;\nexport { x, y };\n');
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('executeTool — bash', () => {
  it('should execute a simple command', () => {
    const result = executeTool('bash', { command: 'echo hello' }, { workDir: TEST_DIR, policy: ALLOW_ALL_POLICY });
    expect(result.isError).toBe(false);
    expect(result.output.trim()).toBe('hello');
  });

  it('should return error when shell is disabled', () => {
    const result = executeTool('bash', { command: 'echo hello' }, { workDir: TEST_DIR, policy: DENY_SHELL_POLICY });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('disabled by policy');
  });

  it('should capture command failures', () => {
    const result = executeTool('bash', { command: 'false' }, { workDir: TEST_DIR, policy: ALLOW_ALL_POLICY });
    expect(result.isError).toBe(true);
  });
});

describe('executeTool — read', () => {
  it('should read a file with line numbers', () => {
    const result = executeTool('read', { file_path: 'hello.txt' }, { workDir: TEST_DIR, policy: ALLOW_ALL_POLICY });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('line one');
    expect(result.output).toContain('line two');
    // Line numbers present
    expect(result.output).toMatch(/\d+\s+line one/);
  });

  it('should handle file not found', () => {
    const result = executeTool('read', { file_path: 'nonexistent.txt' }, { workDir: TEST_DIR, policy: ALLOW_ALL_POLICY });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('not found');
  });

  it('should support offset and limit', () => {
    const result = executeTool('read', { file_path: 'hello.txt', offset: 2, limit: 1 }, { workDir: TEST_DIR, policy: ALLOW_ALL_POLICY });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('line two');
    expect(result.output).not.toContain('line one');
  });

  it('should reject directories', () => {
    const result = executeTool('read', { file_path: 'sub' }, { workDir: TEST_DIR, policy: ALLOW_ALL_POLICY });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Cannot read directory');
  });
});

describe('executeTool — write', () => {
  it('should write a new file', () => {
    const result = executeTool('write', { file_path: 'new.txt', content: 'hello world' }, { workDir: TEST_DIR, policy: ALLOW_ALL_POLICY });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('11 bytes');
    expect(readFileSync(join(TEST_DIR, 'new.txt'), 'utf-8')).toBe('hello world');
  });

  it('should create parent directories', () => {
    const result = executeTool('write', { file_path: 'deep/nested/file.txt', content: 'deep' }, { workDir: TEST_DIR, policy: ALLOW_ALL_POLICY });
    expect(result.isError).toBe(false);
    expect(existsSync(join(TEST_DIR, 'deep', 'nested', 'file.txt'))).toBe(true);
  });
});

describe('executeTool — glob', () => {
  it('should find files matching pattern', () => {
    const result = executeTool('glob', { pattern: '*.txt' }, { workDir: TEST_DIR, policy: ALLOW_ALL_POLICY });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('hello.txt');
  });

  it('should find files recursively', () => {
    const result = executeTool('glob', { pattern: '**/*.json' }, { workDir: TEST_DIR, policy: ALLOW_ALL_POLICY });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('data.json');
  });

  it('should handle no matches', () => {
    const result = executeTool('glob', { pattern: '*.xyz' }, { workDir: TEST_DIR, policy: ALLOW_ALL_POLICY });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('No files matching');
  });
});

describe('executeTool — grep', () => {
  it('should find pattern in files', () => {
    const result = executeTool('grep', { pattern: 'const' }, { workDir: TEST_DIR, policy: ALLOW_ALL_POLICY });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('const');
  });

  it('should handle no matches', () => {
    const result = executeTool('grep', { pattern: 'zzz_nonexistent_zzz' }, { workDir: TEST_DIR, policy: ALLOW_ALL_POLICY });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('No matches');
  });
});

describe('executeTool — unknown', () => {
  it('should return error for unknown tool', () => {
    const result = executeTool('unknown', {}, { workDir: TEST_DIR, policy: ALLOW_ALL_POLICY });
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Unknown tool');
  });
});
