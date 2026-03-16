import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getCurrentVersion, compareSemver, upgradeCommand } from '../commands/upgrade.js';
import type { SessionContext, SfConfig, SfPolicy, SfState } from '../types.js';

// Suppress logger file I/O during tests
vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock child_process to avoid real npm calls
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

// Mock team-config to avoid filesystem coupling
vi.mock('../core/team-config.js', () => ({
  loadTeamConfig: vi.fn(() => null),
}));

function makeSession(workDir: string): SessionContext {
  return {
    workDir,
    config: {} as SfConfig,
    policy: {} as SfPolicy,
    state: {} as SfState,
    messages: [],
    permissionMode: 'auto',
    activeAgent: null,
    activeTeam: null,
    addMessage: vi.fn(),
    setState: vi.fn(),
    setActiveAgent: vi.fn(),
    setActiveTeam: vi.fn(),
  };
}

describe('Upgrade Command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sf-upgrade-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ── getCurrentVersion ──────────────────────────────────────────────────────

  it('getCurrentVersion reads from .version file', () => {
    writeFileSync(join(tempDir, '.version'), '2.0.55\n');
    const version = getCurrentVersion(tempDir);
    expect(version).toBe('2.0.55');
  });

  it('getCurrentVersion falls back to package.json', () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.5.3' }));
    const version = getCurrentVersion(tempDir);
    expect(version).toBe('1.5.3');
  });

  it('getCurrentVersion returns 0.0.0 when both missing', () => {
    const version = getCurrentVersion(tempDir);
    expect(version).toBe('0.0.0');
  });

  it('getCurrentVersion prefers .version over package.json', () => {
    writeFileSync(join(tempDir, '.version'), '3.0.0\n');
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    const version = getCurrentVersion(tempDir);
    expect(version).toBe('3.0.0');
  });

  it('getCurrentVersion returns 0.0.0 when package.json has no version', () => {
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'no-version' }));
    const version = getCurrentVersion(tempDir);
    expect(version).toBe('0.0.0');
  });

  // ── compareSemver ──────────────────────────────────────────────────────────

  it('compareSemver returns 0 for equal versions', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('2.5.10', '2.5.10')).toBe(0);
  });

  it('compareSemver returns -1 when a < b', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
    expect(compareSemver('1.0.0', '1.1.0')).toBe(-1);
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1);
  });

  it('compareSemver returns 1 when a > b', () => {
    expect(compareSemver('2.0.0', '1.0.0')).toBe(1);
    expect(compareSemver('1.1.0', '1.0.0')).toBe(1);
    expect(compareSemver('1.0.1', '1.0.0')).toBe(1);
  });

  it('compareSemver handles different patch versions', () => {
    expect(compareSemver('2.0.40', '2.0.55')).toBe(-1);
    expect(compareSemver('2.0.55', '2.0.40')).toBe(1);
    expect(compareSemver('2.0.55', '2.0.55')).toBe(0);
  });

  // ── upgradeCommand.execute ─────────────────────────────────────────────────

  it('command --check shows available update when newer version exists', async () => {
    writeFileSync(join(tempDir, '.version'), '2.0.40\n');
    const session = makeSession(tempDir);

    // Mock checkLatestVersion by mocking execFileSync to return a version
    const { execFileSync } = await import('node:child_process');
    const mockExec = vi.mocked(execFileSync);
    mockExec.mockImplementation((cmd, args) => {
      if (cmd === 'npm' && Array.isArray(args) && args.includes('view')) {
        return '2.0.55\n';
      }
      return '';
    });

    const output = await upgradeCommand.execute('--check', session);
    expect(output).toContain('Current version: 2.0.40');
    expect(output).toContain('Latest (npm):    2.0.55');
    expect(output).toContain('Update available: 2.0.40');
    expect(output).toContain('2.0.55');
  });

  it('command shows up-to-date message when already at latest', async () => {
    writeFileSync(join(tempDir, '.version'), '2.0.55\n');
    const session = makeSession(tempDir);

    const { execFileSync } = await import('node:child_process');
    const mockExec = vi.mocked(execFileSync);
    mockExec.mockImplementation((cmd, args) => {
      if (cmd === 'npm' && Array.isArray(args) && args.includes('view')) {
        return '2.0.55\n';
      }
      return '';
    });

    const output = await upgradeCommand.execute('--check', session);
    expect(output).toContain('Already up to date');
    expect(output).toContain('2.0.55');
  });

  it('command shows offline message when npm check fails', async () => {
    writeFileSync(join(tempDir, '.version'), '2.0.40\n');
    const session = makeSession(tempDir);

    const { execFileSync } = await import('node:child_process');
    const mockExec = vi.mocked(execFileSync);
    mockExec.mockImplementation(() => {
      throw new Error('network error');
    });

    const output = await upgradeCommand.execute('--check', session);
    expect(output).toContain('Unable to check');
  });
});
