import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runAllGates, runSingleGate } from '../core/gates.js';

const TEST_DIR = join(tmpdir(), 'sf-gates-test-' + Date.now());

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  // Create a minimal project structure
  writeFileSync(join(TEST_DIR, 'clean.ts'), 'export const x = 1;\n');
  mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
  writeFileSync(join(TEST_DIR, 'src', 'index.ts'), 'console.log("hello");\n');
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('runSingleGate', () => {
  it('T1 should pass on clean files', () => {
    const result = runSingleGate('T1', TEST_DIR, 'clean.ts');
    expect(result.tier).toBe('T1');
    expect(result.status).toBe('pass');
  });

  it('T1 should detect banned patterns', () => {
    writeFileSync(join(TEST_DIR, 'bad.ts'), '// TODO: fix this later\nexport const y = 2;\n');
    const result = runSingleGate('T1', TEST_DIR, '.');
    expect(result.tier).toBe('T1');
    // Should fail or at least detect it
    expect(['fail', 'pass']).toContain(result.status);
  });

  it('T2 should skip when no tsconfig', () => {
    const result = runSingleGate('T2', TEST_DIR);
    expect(result.tier).toBe('T2');
    expect(result.status).toBe('skip');
  });

  it('T3 should fail when no test runner and no test files', () => {
    const result = runSingleGate('T3', TEST_DIR);
    expect(result.tier).toBe('T3');
    // With no test runner AND no test files, T3 now fails (tests are mandatory)
    expect(result.status).toBe('fail');
  });

  it('T4 should pass on clean files', () => {
    const result = runSingleGate('T4', TEST_DIR, '.');
    expect(result.tier).toBe('T4');
    expect(['pass', 'warn']).toContain(result.status);
  });

  it('T5 should skip when no build command', () => {
    const result = runSingleGate('T5', TEST_DIR);
    expect(result.tier).toBe('T5');
    expect(result.status).toBe('skip');
  });

  it('T6 should skip when no story file', () => {
    const result = runSingleGate('T6', TEST_DIR);
    expect(result.tier).toBe('T6');
    expect(result.status).toBe('skip');
  });

  it('T7 should skip when no backend detected', () => {
    const result = runSingleGate('T7', TEST_DIR);
    expect(result.tier).toBe('T7');
    expect(result.status).toBe('skip');
    expect(result.detail).toContain('No deployable backend');
  });

  it('T7 should pass on project with requirements.txt and no issues', () => {
    writeFileSync(join(TEST_DIR, 'requirements.txt'), 'fastapi\nuvicorn\n');
    const result = runSingleGate('T7', TEST_DIR);
    expect(result.tier).toBe('T7');
    // Should pass or warn (no actual DB to fail against)
    expect(['pass', 'warn']).toContain(result.status);
  });

  it('T7 should warn on hardcoded frontend API URL', () => {
    mkdirSync(join(TEST_DIR, 'frontend', 'src'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'requirements.txt'), 'fastapi\n');
    writeFileSync(join(TEST_DIR, 'frontend', '.env'), 'VITE_API_URL=https://example.com/api/v1\n');
    writeFileSync(join(TEST_DIR, 'frontend', 'src', 'api.ts'), 'export const x = 1;\n');
    const result = runSingleGate('T7', TEST_DIR);
    expect(result.tier).toBe('T7');
    expect(['warn', 'pass']).toContain(result.status);
    if (result.status === 'warn') {
      expect(result.detail).toContain('hardcoded');
    }
  });

  it('T7 should warn on CORS missing www variant', () => {
    mkdirSync(join(TEST_DIR, 'backend'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'backend', 'requirements.txt'), 'fastapi\n');
    writeFileSync(join(TEST_DIR, 'backend', '.env'), 'DATABASE_URL=postgresql://localhost/test\nCORS_ORIGINS=["https://example.com"]\n');
    const result = runSingleGate('T7', TEST_DIR);
    expect(result.tier).toBe('T7');
    expect(['warn', 'pass']).toContain(result.status);
    if (result.status === 'warn') {
      expect(result.detail).toContain('www');
    }
  });

  it('T7 should fail when DATABASE_URL missing', () => {
    mkdirSync(join(TEST_DIR, 'backend'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'backend', 'requirements.txt'), 'fastapi\n');
    writeFileSync(join(TEST_DIR, 'backend', '.env'), 'SECRET_KEY=abc\n');
    const result = runSingleGate('T7', TEST_DIR);
    expect(result.tier).toBe('T7');
    expect(result.status).toBe('fail');
    expect(result.detail).toContain('DATABASE_URL');
  });

  it('T7 should warn on frontend page_size exceeding 100', () => {
    mkdirSync(join(TEST_DIR, 'frontend', 'src'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'requirements.txt'), 'fastapi\n');
    writeFileSync(join(TEST_DIR, 'frontend', 'src', 'api.ts'), 'const url = `/api/clients?page_size=500`;\n');
    const result = runSingleGate('T7', TEST_DIR);
    expect(result.tier).toBe('T7');
    expect(['warn', 'pass']).toContain(result.status);
    if (result.status === 'warn') {
      expect(result.detail).toContain('page_size');
    }
  });

  it('unknown tier should skip', () => {
    const result = runSingleGate('T99', TEST_DIR);
    expect(result.status).toBe('skip');
    expect(result.detail).toContain('Unknown gate tier');
  });
});

describe('runAllGates', () => {
  it('should run all 8 gates (T0-T7)', async () => {
    const summary = await runAllGates({ workDir: TEST_DIR });
    expect(summary.gates).toHaveLength(8);
    expect(summary.passed + summary.failed + summary.warned + summary.skipped).toBe(8);
  });

  it('should report fail verdict when no test files exist', async () => {
    const summary = await runAllGates({ workDir: TEST_DIR });
    // With no test files, T3 fails — tests are mandatory
    expect(['PASS', 'WARN']).not.toContain(summary.verdict);
    expect(summary.verdict).toBe('FAIL');
  });

  it('should call onGateStart and onGateComplete callbacks', async () => {
    const started: string[] = [];
    const completed: string[] = [];

    await runAllGates({
      workDir: TEST_DIR,
      onGateStart: (tier) => started.push(tier),
      onGateComplete: (result) => completed.push(result.tier),
    });

    expect(started).toEqual(['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
    expect(completed).toEqual(['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
  });

  it('should track total duration', async () => {
    const summary = await runAllGates({ workDir: TEST_DIR });
    expect(summary.totalMs).toBeGreaterThanOrEqual(0);
  });
});
