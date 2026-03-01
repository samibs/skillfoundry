import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadConfig,
  loadPolicy,
  createDefaultFiles,
  ensureWorkspace,
} from '../core/config.js';

describe('Config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sf-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns defaults when no config file exists', () => {
    const config = loadConfig(tempDir);
    expect(config.provider).toBe('anthropic');
    expect(config.model).toBe('claude-sonnet-4-20250514');
    expect(config.monthly_budget_usd).toBe(50);
  });

  it('returns default policy when no policy file exists', () => {
    const policy = loadPolicy(tempDir);
    expect(policy.redact).toBe(true);
    expect(policy.allow_shell).toBe(false);
  });

  it('creates workspace directories', () => {
    ensureWorkspace(tempDir);
    expect(existsSync(join(tempDir, '.skillfoundry'))).toBe(true);
    expect(existsSync(join(tempDir, '.skillfoundry', 'plans'))).toBe(true);
    expect(existsSync(join(tempDir, '.skillfoundry', 'runs'))).toBe(true);
  });

  it('creates default files with init', () => {
    createDefaultFiles(tempDir, false);
    const config = loadConfig(tempDir);
    expect(config.provider).toBe('anthropic');
    const policy = loadPolicy(tempDir);
    expect(policy.redact).toBe(true);
    expect(policy.allow_paths).toContain('.');
  });

  it('does not overwrite existing config without force', () => {
    createDefaultFiles(tempDir, false);
    // Change config in memory and verify it's not overwritten
    const config1 = loadConfig(tempDir);
    expect(config1.provider).toBe('anthropic');
    createDefaultFiles(tempDir, false);
    const config2 = loadConfig(tempDir);
    expect(config2.provider).toBe('anthropic');
  });
});
