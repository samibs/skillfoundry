import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkPolicy, formatPolicyResult } from '../core/policy-engine.js';
import type { PolicyCheckResult } from '../core/policy-engine.js';

// Suppress logger file I/O during tests
vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function writeTeamConfig(dir: string, config: Record<string, unknown>): void {
  writeFileSync(join(dir, 'skillfoundry.team.json'), JSON.stringify(config));
}

function writeProjectConfig(dir: string, overrides: Record<string, unknown> = {}): void {
  const configDir = join(dir, '.skillfoundry');
  mkdirSync(configDir, { recursive: true });
  // Write a minimal TOML config — loadConfig parses TOML
  const defaults: Record<string, unknown> = {
    provider: 'anthropic',
    engine: 'api',
    model: 'claude-sonnet-4-20250514',
    fallback_provider: 'openai',
    fallback_engine: 'broker',
    monthly_budget_usd: 50,
    run_budget_usd: 2,
    memory_sync_enabled: false,
    memory_sync_remote: 'origin',
    route_local_first: false,
    local_provider: 'ollama',
    local_model: 'llama3.1',
    context_window: 0,
    log_level: 'info',
    ...overrides,
  };
  // Build TOML manually for simple flat keys
  const lines = Object.entries(defaults).map(([k, v]) => {
    if (typeof v === 'string') return `${k} = "${v}"`;
    if (typeof v === 'boolean') return `${k} = ${v}`;
    return `${k} = ${v}`;
  });
  writeFileSync(join(configDir, 'config.toml'), lines.join('\n'));
}

describe('Policy Engine', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sf-policy-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ── checkPolicy ──────────────────────────────────────────────────────────

  it('returns passed=true when no team config exists', () => {
    const result = checkPolicy(tempDir);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.team_org).toBe('none');
    expect(result.team_version).toBe('none');
  });

  it('returns passed=true when all checks pass', () => {
    writeTeamConfig(tempDir, {
      version: '1.0.0',
      org: 'test-org',
      approved_models: ['claude-sonnet-4-20250514', 'gpt-4'],
    });
    writeProjectConfig(tempDir, { model: 'claude-sonnet-4-20250514' });

    const result = checkPolicy(tempDir);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.team_org).toBe('test-org');
    expect(result.team_version).toBe('1.0.0');
  });

  it('fails when model not in approved_models', () => {
    writeTeamConfig(tempDir, {
      version: '1.0.0',
      org: 'strict-org',
      approved_models: ['gpt-4', 'gpt-4o'],
    });
    writeProjectConfig(tempDir, { model: 'claude-sonnet-4-20250514' });

    const result = checkPolicy(tempDir);
    expect(result.passed).toBe(false);

    const modelViolation = result.violations.find((v) => v.rule === 'approved_models');
    expect(modelViolation).toBeDefined();
    expect(modelViolation!.severity).toBe('error');
    expect(modelViolation!.field).toBe('model');
    expect(modelViolation!.actual).toBe('claude-sonnet-4-20250514');
  });

  it('warns when memory_sync disabled but team requires it', () => {
    writeTeamConfig(tempDir, {
      version: '1.0.0',
      org: 'sync-org',
      memory: { remote: 'git@github.com:team/memory.git', auto_sync: true },
    });
    writeProjectConfig(tempDir, { memory_sync_enabled: false });

    const result = checkPolicy(tempDir);
    // warnings don't cause failure
    expect(result.passed).toBe(true);

    const syncViolation = result.violations.find((v) => v.rule === 'memory_sync');
    expect(syncViolation).toBeDefined();
    expect(syncViolation!.severity).toBe('warning');
    expect(syncViolation!.field).toBe('memory_sync_enabled');
    expect(syncViolation!.expected).toBe('true');
    expect(syncViolation!.actual).toBe('false');
  });

  it('warns when skill version does not match pin', () => {
    writeTeamConfig(tempDir, {
      version: '1.0.0',
      org: 'pinned-org',
      skills: { version: '2.0.55' },
    });
    writeProjectConfig(tempDir);

    const result = checkPolicy(tempDir, '2.0.40');
    expect(result.passed).toBe(true); // warning only

    const versionViolation = result.violations.find((v) => v.rule === 'skill_version_pin');
    expect(versionViolation).toBeDefined();
    expect(versionViolation!.severity).toBe('warning');
    expect(versionViolation!.expected).toBe('2.0.55');
    expect(versionViolation!.actual).toBe('2.0.40');
  });

  it('does not warn on skill version when version matches pin', () => {
    writeTeamConfig(tempDir, {
      version: '1.0.0',
      org: 'pinned-org',
      skills: { version: '2.0.55' },
    });
    writeProjectConfig(tempDir);

    const result = checkPolicy(tempDir, '2.0.55');
    const versionViolation = result.violations.find((v) => v.rule === 'skill_version_pin');
    expect(versionViolation).toBeUndefined();
  });

  it('detects multiple violations simultaneously', () => {
    writeTeamConfig(tempDir, {
      version: '1.0.0',
      org: 'strict-org',
      approved_models: ['gpt-4'],
      memory: { remote: 'git@github.com:team/memory.git', auto_sync: true },
      skills: { version: '3.0.0' },
    });
    writeProjectConfig(tempDir, {
      model: 'claude-sonnet-4-20250514',
      memory_sync_enabled: false,
    });

    const result = checkPolicy(tempDir, '2.0.40');
    expect(result.passed).toBe(false); // model error causes fail

    const rules = result.violations.map((v) => v.rule);
    expect(rules).toContain('approved_models');
    expect(rules).toContain('memory_sync');
    expect(rules).toContain('skill_version_pin');
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });

  it('passes with prefix-matched model (startsWith)', () => {
    writeTeamConfig(tempDir, {
      version: '1.0.0',
      org: 'prefix-org',
      approved_models: ['claude-sonnet'],
    });
    writeProjectConfig(tempDir, { model: 'claude-sonnet-4-20250514' });

    const result = checkPolicy(tempDir);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('sets checked_at to a valid ISO timestamp', () => {
    const result = checkPolicy(tempDir);
    expect(result.checked_at).toBeDefined();
    const parsed = Date.parse(result.checked_at);
    expect(isNaN(parsed)).toBe(false);
  });

  it('skips model check when approved_models list is empty', () => {
    writeTeamConfig(tempDir, {
      version: '1.0.0',
      org: 'open-org',
      approved_models: [],
    });
    writeProjectConfig(tempDir, { model: 'any-model-at-all' });

    const result = checkPolicy(tempDir);
    const modelViolation = result.violations.find((v) => v.rule === 'approved_models');
    expect(modelViolation).toBeUndefined();
  });

  it('skips memory_sync check when team does not require auto_sync', () => {
    writeTeamConfig(tempDir, {
      version: '1.0.0',
      org: 'relaxed-org',
      memory: { remote: 'git@github.com:team/memory.git', auto_sync: false },
    });
    writeProjectConfig(tempDir, { memory_sync_enabled: false });

    const result = checkPolicy(tempDir);
    const syncViolation = result.violations.find((v) => v.rule === 'memory_sync');
    expect(syncViolation).toBeUndefined();
  });

  // ── formatPolicyResult ───────────────────────────────────────────────────

  it('formatPolicyResult shows "no team config" message when org is none', () => {
    const result: PolicyCheckResult = {
      passed: true,
      violations: [],
      team_org: 'none',
      team_version: 'none',
      checked_at: new Date().toISOString(),
    };

    const output = formatPolicyResult(result);
    expect(output).toContain('No team config found');
    expect(output).toContain('policy check skipped');
  });

  it('formatPolicyResult shows violations with severity icons', () => {
    const result: PolicyCheckResult = {
      passed: false,
      violations: [
        {
          rule: 'approved_models',
          severity: 'error',
          message: 'Model "bad-model" is not on the approved list',
          field: 'model',
          expected: 'gpt-4',
          actual: 'bad-model',
        },
        {
          rule: 'memory_sync',
          severity: 'warning',
          message: 'Memory sync is disabled',
          field: 'memory_sync_enabled',
          expected: 'true',
          actual: 'false',
        },
      ],
      team_org: 'test-org',
      team_version: '1.0.0',
      checked_at: new Date().toISOString(),
    };

    const output = formatPolicyResult(result);
    expect(output).toContain('Team: test-org (v1.0.0)');
    expect(output).toContain('[approved_models]');
    expect(output).toContain('[memory_sync]');
    expect(output).toContain('Expected: gpt-4');
    expect(output).toContain('Actual:   bad-model');
    expect(output).toContain('Policy check: FAIL');
  });

  it('formatPolicyResult shows PASS when no violations', () => {
    const result: PolicyCheckResult = {
      passed: true,
      violations: [],
      team_org: 'happy-org',
      team_version: '2.0.0',
      checked_at: new Date().toISOString(),
    };

    const output = formatPolicyResult(result);
    expect(output).toContain('Team: happy-org (v2.0.0)');
    expect(output).toContain('All policy checks passed');
    expect(output).toContain('Policy check: PASS');
  });

  it('formatPolicyResult shows all violation details', () => {
    const result: PolicyCheckResult = {
      passed: false,
      violations: [
        {
          rule: 'skill_version_pin',
          severity: 'warning',
          message: 'Team pins skills@3.0.0 but current version is 2.0.40',
          field: 'skills.version',
          expected: '3.0.0',
          actual: '2.0.40',
        },
      ],
      team_org: 'detail-org',
      team_version: '1.0.0',
      checked_at: new Date().toISOString(),
    };

    const output = formatPolicyResult(result);
    expect(output).toContain('[skill_version_pin]');
    expect(output).toContain('Expected: 3.0.0');
    expect(output).toContain('Actual:   2.0.40');
  });
});
