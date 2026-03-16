import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadTeamConfig,
  mergeGateThresholds,
  isModelApproved,
  TeamConfigError,
} from '../core/team-config.js';
import type { TeamConfig } from '../types.js';

// Suppress logger output during tests
vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function writeConfig(dir: string, data: unknown, filename = 'skillfoundry.team.json'): void {
  writeFileSync(join(dir, filename), JSON.stringify(data), 'utf-8');
}

function validConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { version: '1.0.0', org: 'acme-corp', ...overrides };
}

describe('Team Config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sf-team-cfg-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ── loadTeamConfig ──────────────────────────────────────────────────────────

  describe('loadTeamConfig', () => {
    it('returns null when no config file exists', () => {
      const result = loadTeamConfig(tempDir);
      expect(result).toBeNull();
    });

    it('loads and validates a valid minimal config', () => {
      writeConfig(tempDir, validConfig());
      const result = loadTeamConfig(tempDir);
      expect(result).not.toBeNull();
      expect(result!.version).toBe('1.0.0');
      expect(result!.org).toBe('acme-corp');
    });

    it('loads a fully-populated config', () => {
      writeConfig(tempDir, validConfig({
        gates: { t0_min_coverage: 80, t1_mode: 'warn' },
        banned_patterns: ['eval(', 'Function('],
        approved_models: ['claude-sonnet-4-20250514'],
        memory: { remote: 'https://github.com/acme/memory.git', branch: 'main', auto_sync: true },
        skills: { version: '2.0.0', lock_file: 'skills.lock' },
      }));
      const result = loadTeamConfig(tempDir);
      expect(result).not.toBeNull();
      expect(result!.gates!.t0_min_coverage).toBe(80);
      expect(result!.banned_patterns).toEqual(['eval(', 'Function(']);
      expect(result!.approved_models).toEqual(['claude-sonnet-4-20250514']);
      expect(result!.memory!.remote).toBe('https://github.com/acme/memory.git');
      expect(result!.memory!.branch).toBe('main');
      expect(result!.memory!.auto_sync).toBe(true);
      expect(result!.skills!.version).toBe('2.0.0');
      expect(result!.skills!.lock_file).toBe('skills.lock');
    });

    it('rejects invalid JSON', () => {
      writeFileSync(join(tempDir, 'skillfoundry.team.json'), '{not valid json}', 'utf-8');
      expect(() => loadTeamConfig(tempDir)).toThrow(TeamConfigError);
      expect(() => loadTeamConfig(tempDir)).toThrow(/Failed to parse team config/);
    });

    it('rejects non-object JSON (array)', () => {
      writeConfig(tempDir, [1, 2, 3]);
      expect(() => loadTeamConfig(tempDir)).toThrow('Team config must be a JSON object');
    });

    it('rejects missing required field: version', () => {
      writeConfig(tempDir, { org: 'acme' });
      expect(() => loadTeamConfig(tempDir)).toThrow(TeamConfigError);
      expect(() => loadTeamConfig(tempDir)).toThrow(/version/);
    });

    it('rejects missing required field: org', () => {
      writeConfig(tempDir, { version: '1.0.0' });
      expect(() => loadTeamConfig(tempDir)).toThrow(TeamConfigError);
      expect(() => loadTeamConfig(tempDir)).toThrow(/org/);
    });

    it('rejects invalid semver version', () => {
      writeConfig(tempDir, { version: 'v1.0', org: 'acme' });
      expect(() => loadTeamConfig(tempDir)).toThrow(/must be valid semver/);
    });

    it('rejects version with pre-release suffix', () => {
      writeConfig(tempDir, { version: '1.0.0-beta', org: 'acme' });
      expect(() => loadTeamConfig(tempDir)).toThrow(/must be valid semver/);
    });

    it('rejects org with unsafe characters', () => {
      writeConfig(tempDir, { version: '1.0.0', org: 'acme<script>' });
      expect(() => loadTeamConfig(tempDir)).toThrow(/unsafe characters/);
    });

    it('rejects empty org string', () => {
      writeConfig(tempDir, { version: '1.0.0', org: '' });
      expect(() => loadTeamConfig(tempDir)).toThrow(/must not be empty/);
    });

    it('rejects org exceeding max length', () => {
      writeConfig(tempDir, { version: '1.0.0', org: 'a'.repeat(101) });
      expect(() => loadTeamConfig(tempDir)).toThrow(/exceeds max length/);
    });

    // ── Gate thresholds ───────────────────────────────────────────────────────

    it('rejects gates that is not an object', () => {
      writeConfig(tempDir, validConfig({ gates: 'invalid' }));
      expect(() => loadTeamConfig(tempDir)).toThrow(/gates: expected object/);
    });

    it('rejects t0_min_coverage out of range', () => {
      writeConfig(tempDir, validConfig({ gates: { t0_min_coverage: 150 } }));
      expect(() => loadTeamConfig(tempDir)).toThrow(/t0_min_coverage.*0-100/);
    });

    it('rejects t0_min_coverage that is not a number', () => {
      writeConfig(tempDir, validConfig({ gates: { t0_min_coverage: '80' } }));
      expect(() => loadTeamConfig(tempDir)).toThrow(/t0_min_coverage.*0-100/);
    });

    it('rejects invalid t1_mode', () => {
      writeConfig(tempDir, validConfig({ gates: { t1_mode: 'lenient' } }));
      expect(() => loadTeamConfig(tempDir)).toThrow(/t1_mode.*"strict" or "warn"/);
    });

    it('rejects negative t3_min_test_files', () => {
      writeConfig(tempDir, validConfig({ gates: { t3_min_test_files: -1 } }));
      expect(() => loadTeamConfig(tempDir)).toThrow(/t3_min_test_files.*non-negative integer/);
    });

    it('rejects non-integer t3_min_test_files', () => {
      writeConfig(tempDir, validConfig({ gates: { t3_min_test_files: 1.5 } }));
      expect(() => loadTeamConfig(tempDir)).toThrow(/t3_min_test_files.*non-negative integer/);
    });

    it('rejects invalid t4_fail_severity', () => {
      writeConfig(tempDir, validConfig({ gates: { t4_fail_severity: 'low' } }));
      expect(() => loadTeamConfig(tempDir)).toThrow(/t4_fail_severity/);
    });

    it('rejects invalid t5_build', () => {
      writeConfig(tempDir, validConfig({ gates: { t5_build: 'maybe' } }));
      expect(() => loadTeamConfig(tempDir)).toThrow(/t5_build.*"required" or "optional"/);
    });

    // ── banned_patterns ───────────────────────────────────────────────────────

    it('rejects banned_patterns that is not an array', () => {
      writeConfig(tempDir, validConfig({ banned_patterns: 'eval(' }));
      expect(() => loadTeamConfig(tempDir)).toThrow(/banned_patterns: expected array/);
    });

    it('rejects banned_patterns exceeding max items', () => {
      const patterns = Array.from({ length: 501 }, (_, i) => `pattern-${i}`);
      writeConfig(tempDir, validConfig({ banned_patterns: patterns }));
      expect(() => loadTeamConfig(tempDir)).toThrow(/banned_patterns.*exceeds max items/);
    });

    it('rejects banned_patterns with non-string element', () => {
      writeConfig(tempDir, validConfig({ banned_patterns: ['valid', 42] }));
      expect(() => loadTeamConfig(tempDir)).toThrow(/banned_patterns\[1\].*expected string/);
    });

    // ── approved_models ───────────────────────────────────────────────────────

    it('rejects approved_models exceeding max items', () => {
      const models = Array.from({ length: 51 }, (_, i) => `model-${i}`);
      writeConfig(tempDir, validConfig({ approved_models: models }));
      expect(() => loadTeamConfig(tempDir)).toThrow(/approved_models.*exceeds max items/);
    });

    // ── memory config ─────────────────────────────────────────────────────────

    it('rejects memory that is not an object', () => {
      writeConfig(tempDir, validConfig({ memory: 'git@repo' }));
      expect(() => loadTeamConfig(tempDir)).toThrow(/memory: expected object/);
    });

    it('rejects memory with missing remote', () => {
      writeConfig(tempDir, validConfig({ memory: { branch: 'main' } }));
      expect(() => loadTeamConfig(tempDir)).toThrow(/memory.remote/);
    });

    // ── skills config ─────────────────────────────────────────────────────────

    it('rejects skills that is not an object', () => {
      writeConfig(tempDir, validConfig({ skills: '2.0.0' }));
      expect(() => loadTeamConfig(tempDir)).toThrow(/skills: expected object/);
    });

    it('rejects skills with invalid semver version', () => {
      writeConfig(tempDir, validConfig({ skills: { version: 'latest' } }));
      expect(() => loadTeamConfig(tempDir)).toThrow(/skills.version.*must be valid semver/);
    });

    // ── configPath handling ───────────────────────────────────────────────────

    it('loads from custom configPath', () => {
      writeConfig(tempDir, validConfig(), 'custom-team.json');
      const result = loadTeamConfig(tempDir, 'custom-team.json');
      expect(result).not.toBeNull();
      expect(result!.org).toBe('acme-corp');
    });

    it('throws when configPath file does not exist', () => {
      expect(() => loadTeamConfig(tempDir, 'missing.json')).toThrow(TeamConfigError);
      expect(() => loadTeamConfig(tempDir, 'missing.json')).toThrow(/file not found/);
    });

    it('rejects path traversal in configPath', () => {
      expect(() => loadTeamConfig(tempDir, '../../etc/passwd')).toThrow(TeamConfigError);
      expect(() => loadTeamConfig(tempDir, '../../etc/passwd')).toThrow(/path escapes project directory/);
    });
  });

  // ── mergeGateThresholds ─────────────────────────────────────────────────────

  describe('mergeGateThresholds', () => {
    it('returns all defaults when called with no argument', () => {
      const result = mergeGateThresholds();
      expect(result).toEqual({
        t0_min_coverage: 50,
        t1_mode: 'strict',
        t3_min_test_files: 1,
        t4_fail_severity: 'high',
        t5_build: 'required',
      });
    });

    it('returns all defaults when called with undefined', () => {
      const result = mergeGateThresholds(undefined);
      expect(result).toEqual({
        t0_min_coverage: 50,
        t1_mode: 'strict',
        t3_min_test_files: 1,
        t4_fail_severity: 'high',
        t5_build: 'required',
      });
    });

    it('returns all defaults when called with empty object', () => {
      const result = mergeGateThresholds({});
      expect(result.t0_min_coverage).toBe(50);
      expect(result.t1_mode).toBe('strict');
      expect(result.t5_build).toBe('required');
    });

    it('applies partial overrides, keeps other defaults', () => {
      const result = mergeGateThresholds({ t0_min_coverage: 90, t1_mode: 'warn' });
      expect(result.t0_min_coverage).toBe(90);
      expect(result.t1_mode).toBe('warn');
      expect(result.t3_min_test_files).toBe(1);
      expect(result.t4_fail_severity).toBe('high');
      expect(result.t5_build).toBe('required');
    });

    it('applies full overrides', () => {
      const result = mergeGateThresholds({
        t0_min_coverage: 100,
        t1_mode: 'warn',
        t3_min_test_files: 5,
        t4_fail_severity: 'critical',
        t5_build: 'optional',
      });
      expect(result.t0_min_coverage).toBe(100);
      expect(result.t1_mode).toBe('warn');
      expect(result.t3_min_test_files).toBe(5);
      expect(result.t4_fail_severity).toBe('critical');
      expect(result.t5_build).toBe('optional');
    });
  });

  // ── isModelApproved ─────────────────────────────────────────────────────────

  describe('isModelApproved', () => {
    it('returns true when teamConfig is null', () => {
      expect(isModelApproved('any-model', null)).toBe(true);
    });

    it('returns true when approved_models is not set', () => {
      const config: TeamConfig = { version: '1.0.0', org: 'acme' };
      expect(isModelApproved('any-model', config)).toBe(true);
    });

    it('returns true when approved_models is empty array', () => {
      const config: TeamConfig = { version: '1.0.0', org: 'acme', approved_models: [] };
      expect(isModelApproved('any-model', config)).toBe(true);
    });

    it('returns true for exact match', () => {
      const config: TeamConfig = {
        version: '1.0.0',
        org: 'acme',
        approved_models: ['claude-sonnet-4-20250514', 'gpt-4o'],
      };
      expect(isModelApproved('claude-sonnet-4-20250514', config)).toBe(true);
    });

    it('returns false for unapproved model', () => {
      const config: TeamConfig = {
        version: '1.0.0',
        org: 'acme',
        approved_models: ['claude-sonnet-4-20250514'],
      };
      expect(isModelApproved('gpt-4o', config)).toBe(false);
    });

    it('supports prefix matching', () => {
      const config: TeamConfig = {
        version: '1.0.0',
        org: 'acme',
        approved_models: ['claude-'],
      };
      expect(isModelApproved('claude-sonnet-4-20250514', config)).toBe(true);
      expect(isModelApproved('claude-opus-4-20250514', config)).toBe(true);
      expect(isModelApproved('gpt-4o', config)).toBe(false);
    });

    it('does not match partial model names in reverse', () => {
      const config: TeamConfig = {
        version: '1.0.0',
        org: 'acme',
        approved_models: ['claude-sonnet-4-20250514'],
      };
      // The approved model is longer than input — should not match
      expect(isModelApproved('claude', config)).toBe(false);
    });
  });

  // ── TeamConfigError ─────────────────────────────────────────────────────────

  describe('TeamConfigError', () => {
    it('has correct name and message', () => {
      const err = new TeamConfigError('bad field', 'version');
      expect(err.name).toBe('TeamConfigError');
      expect(err.message).toBe('bad field');
      expect(err.field).toBe('version');
      expect(err).toBeInstanceOf(Error);
    });

    it('works without field parameter', () => {
      const err = new TeamConfigError('generic error');
      expect(err.field).toBeUndefined();
    });
  });
});
