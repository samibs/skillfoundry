import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectBaseline, formatBaseline } from '../core/baseline-collector.js';
import type { BaselineSnapshot } from '../core/baseline-collector.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const TEST_DIR = join(process.cwd(), '.test-baseline-' + process.pid);
const SRC_DIR = join(TEST_DIR, 'src');

beforeEach(() => {
  mkdirSync(SRC_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('collectBaseline', () => {
  it('collects baseline from a directory with source files', async () => {
    writeFileSync(join(SRC_DIR, 'app.ts'), 'const x = 1;\nconst y = 2;\n');
    writeFileSync(join(SRC_DIR, 'utils.ts'), 'export function add(a: number, b: number) {\n  return a + b;\n}\n');
    writeFileSync(join(SRC_DIR, 'app.test.ts'), 'import { describe, it } from "vitest";\ndescribe("app", () => {});\n');

    const snapshot = await collectBaseline(TEST_DIR);

    expect(snapshot.file_count).toBe(3);
    expect(snapshot.test_file_count).toBe(1);
    expect(snapshot.primary_language).toBe('TypeScript');
    expect(snapshot.language_breakdown['TypeScript']).toBe(3);
    expect(snapshot.loc).toBeGreaterThan(0);
    expect(snapshot.timestamp).toBeTruthy();
    expect(snapshot.work_dir).toBe(TEST_DIR);
  });

  it('counts lines of code accurately (non-empty lines only)', async () => {
    // 3 non-empty lines
    writeFileSync(join(SRC_DIR, 'counter.ts'), 'line1\n\nline2\n\n\nline3\n');

    const snapshot = await collectBaseline(TEST_DIR);

    expect(snapshot.loc).toBe(3);
  });

  it('handles empty directory gracefully', async () => {
    const snapshot = await collectBaseline(TEST_DIR);

    expect(snapshot.file_count).toBe(0);
    expect(snapshot.test_file_count).toBe(0);
    expect(snapshot.loc).toBe(0);
    expect(snapshot.primary_language).toBe('Unknown');
    expect(snapshot.language_breakdown).toEqual({});
  });

  it('detects multiple languages', async () => {
    writeFileSync(join(SRC_DIR, 'app.ts'), 'const a = 1;\n');
    writeFileSync(join(SRC_DIR, 'script.js'), 'var b = 2;\n');
    writeFileSync(join(SRC_DIR, 'main.py'), 'x = 1\n');

    const snapshot = await collectBaseline(TEST_DIR);

    expect(snapshot.file_count).toBe(3);
    expect(snapshot.language_breakdown['TypeScript']).toBe(1);
    expect(snapshot.language_breakdown['JavaScript']).toBe(1);
    expect(snapshot.language_breakdown['Python']).toBe(1);
  });

  it('detects primary language by highest file count', async () => {
    writeFileSync(join(SRC_DIR, 'a.py'), 'x = 1\n');
    writeFileSync(join(SRC_DIR, 'b.py'), 'y = 2\n');
    writeFileSync(join(SRC_DIR, 'c.py'), 'z = 3\n');
    writeFileSync(join(SRC_DIR, 'app.ts'), 'const a = 1;\n');

    const snapshot = await collectBaseline(TEST_DIR);

    expect(snapshot.primary_language).toBe('Python');
  });

  it('detects test files with various patterns', async () => {
    writeFileSync(join(SRC_DIR, 'app.test.ts'), 'test\n');
    writeFileSync(join(SRC_DIR, 'app.spec.ts'), 'spec\n');
    writeFileSync(join(SRC_DIR, 'app.test.js'), 'test js\n');
    writeFileSync(join(SRC_DIR, 'test_utils.py'), 'test py\n');
    writeFileSync(join(SRC_DIR, 'utils_test.py'), 'test py 2\n');
    writeFileSync(join(SRC_DIR, 'AppTests.cs'), 'test cs\n');
    writeFileSync(join(SRC_DIR, 'not-a-test.ts'), 'regular file\n');

    const snapshot = await collectBaseline(TEST_DIR);

    expect(snapshot.test_file_count).toBe(6);
    expect(snapshot.file_count).toBe(7);
  });

  it('skips node_modules and .git directories', async () => {
    const nodeModules = join(TEST_DIR, 'node_modules', 'dep');
    const gitDir = join(TEST_DIR, '.git', 'objects');
    mkdirSync(nodeModules, { recursive: true });
    mkdirSync(gitDir, { recursive: true });
    writeFileSync(join(nodeModules, 'index.ts'), 'module code\n');
    writeFileSync(join(gitDir, 'pack.ts'), 'git object\n');
    writeFileSync(join(SRC_DIR, 'app.ts'), 'real code\n');

    const snapshot = await collectBaseline(TEST_DIR);

    expect(snapshot.file_count).toBe(1);
  });

  it('returns -1 for lint errors when eslint is not available', async () => {
    writeFileSync(join(SRC_DIR, 'app.ts'), 'const a = 1;\n');

    const snapshot = await collectBaseline(TEST_DIR);

    // In test environment, eslint is typically not available at the test dir level
    expect(snapshot.lint_error_count).toBe(-1);
  });

  it('returns -1 for type errors when tsconfig.json is absent', async () => {
    writeFileSync(join(SRC_DIR, 'app.ts'), 'const a = 1;\n');

    const snapshot = await collectBaseline(TEST_DIR);

    // No tsconfig.json in TEST_DIR
    expect(snapshot.type_error_count).toBe(-1);
  });

  it('handles nested source directories', async () => {
    const nested = join(SRC_DIR, 'core', 'utils');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(SRC_DIR, 'app.ts'), 'root\n');
    writeFileSync(join(SRC_DIR, 'core', 'engine.ts'), 'core\n');
    writeFileSync(join(nested, 'helpers.ts'), 'helpers\n');

    const snapshot = await collectBaseline(TEST_DIR);

    expect(snapshot.file_count).toBe(3);
    expect(snapshot.loc).toBe(3);
  });
});

describe('formatBaseline', () => {
  it('formats a baseline snapshot for console display', () => {
    const snapshot: BaselineSnapshot = {
      timestamp: '2026-03-16T12:00:00.000Z',
      work_dir: '/tmp/test',
      test_file_count: 5,
      lint_error_count: 3,
      type_error_count: 0,
      loc: 1500,
      file_count: 25,
      primary_language: 'TypeScript',
      language_breakdown: { TypeScript: 20, JavaScript: 5 },
    };

    const output = formatBaseline(snapshot);

    expect(output).toContain('Code Quality Baseline');
    expect(output).toContain('Source Files:     25');
    expect(output).toContain('Test Files:       5');
    expect(output).toContain('Lint Errors:      3');
    expect(output).toContain('Type Errors:      0');
    expect(output).toContain('Primary Language: TypeScript');
    expect(output).toContain('TypeScript: 20');
    expect(output).toContain('JavaScript: 5');
  });

  it('shows N/A for unavailable tools', () => {
    const snapshot: BaselineSnapshot = {
      timestamp: '2026-03-16T12:00:00.000Z',
      work_dir: '/tmp/test',
      test_file_count: 0,
      lint_error_count: -1,
      type_error_count: -1,
      loc: 0,
      file_count: 0,
      primary_language: 'Unknown',
      language_breakdown: {},
    };

    const output = formatBaseline(snapshot);

    expect(output).toContain('N/A (eslint not available)');
    expect(output).toContain('N/A (tsc not available)');
    expect(output).toContain('No source files found');
  });
});
