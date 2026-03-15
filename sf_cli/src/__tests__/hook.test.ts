import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hookCommand } from '../commands/hook.js';
import type { SessionContext, SfConfig, SfPolicy, SfState, Message } from '../types.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const TEST_DIR = join(process.cwd(), '.test-hook-' + process.pid);

function createSession(): SessionContext {
  return {
    config: {} as SfConfig,
    policy: {} as SfPolicy,
    state: {} as SfState,
    messages: [] as Message[],
    permissionMode: 'auto' as any,
    workDir: TEST_DIR,
    activeAgent: null,
    activeTeam: null,
    addMessage: vi.fn(),
    setState: vi.fn(),
    setActiveAgent: vi.fn(),
    setActiveTeam: vi.fn(),
  };
}

beforeEach(() => {
  mkdirSync(join(TEST_DIR, '.git', 'hooks'), { recursive: true });
  mkdirSync(join(TEST_DIR, '.skillfoundry'), { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('hookCommand', () => {
  it('has correct metadata', () => {
    expect(hookCommand.name).toBe('hook');
    expect(hookCommand.description).toBeTruthy();
  });

  it('shows status when no hooks installed', async () => {
    const result = await hookCommand.execute('status', createSession());
    expect(result).toContain('Hook Status');
    expect(result).toContain('not installed');
  });

  it('installs hooks with default config', async () => {
    const result = await hookCommand.execute('install', createSession());
    expect(result).toContain('Git Hooks Installed');
    expect(result).toContain('pre-commit');
    expect(result).toContain('pre-push');

    // Verify hook files exist
    expect(existsSync(join(TEST_DIR, '.git', 'hooks', 'pre-commit'))).toBe(true);
    expect(existsSync(join(TEST_DIR, '.git', 'hooks', 'pre-push'))).toBe(true);

    // Verify hook content
    const preCommit = readFileSync(join(TEST_DIR, '.git', 'hooks', 'pre-commit'), 'utf-8');
    expect(preCommit).toContain('SkillFoundry');
    expect(preCommit).toContain('t0');
    expect(preCommit).toContain('t1');
  });

  it('creates default hooks.toml config', async () => {
    rmSync(join(TEST_DIR, '.skillfoundry'), { recursive: true, force: true });
    await hookCommand.execute('install', createSession());
    expect(existsSync(join(TEST_DIR, '.skillfoundry', 'hooks.toml'))).toBe(true);
  });

  it('backs up existing hooks', async () => {
    const existingHook = '#!/bin/sh\necho "existing hook"\n';
    writeFileSync(join(TEST_DIR, '.git', 'hooks', 'pre-commit'), existingHook);

    await hookCommand.execute('install', createSession());

    expect(existsSync(join(TEST_DIR, '.git', 'hooks', 'pre-commit.bak'))).toBe(true);
    const backup = readFileSync(join(TEST_DIR, '.git', 'hooks', 'pre-commit.bak'), 'utf-8');
    expect(backup).toBe(existingHook);
  });

  it('uninstalls hooks', async () => {
    // Install first
    await hookCommand.execute('install', createSession());
    expect(existsSync(join(TEST_DIR, '.git', 'hooks', 'pre-commit'))).toBe(true);

    // Uninstall
    const result = await hookCommand.execute('uninstall', createSession());
    expect(result).toContain('Hooks Removed');
    expect(existsSync(join(TEST_DIR, '.git', 'hooks', 'pre-commit'))).toBe(false);
  });

  it('restores backup on uninstall', async () => {
    const existingHook = '#!/bin/sh\necho "existing"\n';
    writeFileSync(join(TEST_DIR, '.git', 'hooks', 'pre-commit'), existingHook);

    await hookCommand.execute('install', createSession());
    await hookCommand.execute('uninstall', createSession());

    const restored = readFileSync(join(TEST_DIR, '.git', 'hooks', 'pre-commit'), 'utf-8');
    expect(restored).toBe(existingHook);
  });

  it('fails gracefully when not a git repo', async () => {
    rmSync(join(TEST_DIR, '.git'), { recursive: true, force: true });
    const result = await hookCommand.execute('install', createSession());
    expect(result).toContain('Not a git repository');
  });

  it('shows SF status for installed hooks', async () => {
    await hookCommand.execute('install', createSession());
    const result = await hookCommand.execute('status', createSession());
    expect(result).toContain('SkillFoundry');
  });

  it('respects custom hooks.toml config', async () => {
    writeFileSync(join(TEST_DIR, '.skillfoundry', 'hooks.toml'), `
[hooks]
enabled = true

[hooks.pre-commit]
gates = ["t0"]
fail_action = "warn"
timeout_seconds = 5

[hooks.pre-push]
gates = ["t4"]
fail_action = "block"
timeout_seconds = 30
`);

    await hookCommand.execute('install', createSession());
    const preCommit = readFileSync(join(TEST_DIR, '.git', 'hooks', 'pre-commit'), 'utf-8');
    expect(preCommit).toContain('t0');
    expect(preCommit).not.toContain('t1'); // Only t0 configured

    const prePush = readFileSync(join(TEST_DIR, '.git', 'hooks', 'pre-push'), 'utf-8');
    expect(prePush).toContain('t4');
  });

  it('reports no hooks to remove when none installed', async () => {
    const result = await hookCommand.execute('uninstall', createSession());
    expect(result).toContain('No SkillFoundry hooks found');
  });
});
