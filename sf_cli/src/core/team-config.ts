/**
 * STORY-001: Team Config Loader
 *
 * Loads and validates `skillfoundry.team.json` from the project root.
 * Provides type-safe access to org-wide gate thresholds, banned patterns,
 * approved models, and shared memory configuration.
 *
 * File format: JSON (not TypeScript — avoids eval() and keeps it portable).
 * Location: `skillfoundry.team.json` at project root, or path from SfConfig.team_config.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { TeamConfig, GateThresholds } from '../types.js';
import { getLogger } from '../utils/logger.js';

// ── Validation constants ──────────────────────────────────────────────────────

const MAX_ORG_LENGTH = 100;
const MAX_BANNED_PATTERNS = 500;
const MAX_APPROVED_MODELS = 50;
const MAX_STRING_LENGTH = 1000;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const SAFE_STRING_RE = /^[\w\s.@/:_-]+$/;

// ── Validation helpers ────────────────────────────────────────────────────────

export class TeamConfigError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'TeamConfigError';
  }
}

function validateString(value: unknown, field: string, maxLen: number): string {
  if (typeof value !== 'string') {
    throw new TeamConfigError(`${field}: expected string, got ${typeof value}`, field);
  }
  if (value.length === 0) {
    throw new TeamConfigError(`${field}: must not be empty`, field);
  }
  if (value.length > maxLen) {
    throw new TeamConfigError(`${field}: exceeds max length ${maxLen} (got ${value.length})`, field);
  }
  return value;
}

function validateStringArray(value: unknown, field: string, maxItems: number): string[] {
  if (!Array.isArray(value)) {
    throw new TeamConfigError(`${field}: expected array, got ${typeof value}`, field);
  }
  if (value.length > maxItems) {
    throw new TeamConfigError(`${field}: exceeds max items ${maxItems} (got ${value.length})`, field);
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') {
      throw new TeamConfigError(`${field}[${i}]: expected string, got ${typeof value[i]}`, field);
    }
    if ((value[i] as string).length > MAX_STRING_LENGTH) {
      throw new TeamConfigError(`${field}[${i}]: exceeds max length ${MAX_STRING_LENGTH}`, field);
    }
  }
  return value as string[];
}

function validateGateThresholds(value: unknown): GateThresholds {
  if (typeof value !== 'object' || value === null) {
    throw new TeamConfigError('gates: expected object', 'gates');
  }
  const obj = value as Record<string, unknown>;
  const result: GateThresholds = {};

  if (obj.t0_min_coverage !== undefined) {
    const v = obj.t0_min_coverage;
    if (typeof v !== 'number' || v < 0 || v > 100) {
      throw new TeamConfigError('gates.t0_min_coverage: must be 0-100', 'gates.t0_min_coverage');
    }
    result.t0_min_coverage = v;
  }

  if (obj.t1_mode !== undefined) {
    if (obj.t1_mode !== 'strict' && obj.t1_mode !== 'warn') {
      throw new TeamConfigError('gates.t1_mode: must be "strict" or "warn"', 'gates.t1_mode');
    }
    result.t1_mode = obj.t1_mode;
  }

  if (obj.t3_min_test_files !== undefined) {
    const v = obj.t3_min_test_files;
    if (typeof v !== 'number' || v < 0 || !Number.isInteger(v)) {
      throw new TeamConfigError('gates.t3_min_test_files: must be non-negative integer', 'gates.t3_min_test_files');
    }
    result.t3_min_test_files = v;
  }

  if (obj.t4_fail_severity !== undefined) {
    if (!['critical', 'high', 'medium'].includes(obj.t4_fail_severity as string)) {
      throw new TeamConfigError('gates.t4_fail_severity: must be "critical", "high", or "medium"', 'gates.t4_fail_severity');
    }
    result.t4_fail_severity = obj.t4_fail_severity as 'critical' | 'high' | 'medium';
  }

  if (obj.t5_build !== undefined) {
    if (obj.t5_build !== 'required' && obj.t5_build !== 'optional') {
      throw new TeamConfigError('gates.t5_build: must be "required" or "optional"', 'gates.t5_build');
    }
    result.t5_build = obj.t5_build;
  }

  return result;
}

// ── Core loader ───────────────────────────────────────────────────────────────

const TEAM_CONFIG_FILES = ['skillfoundry.team.json'];

/**
 * Load and validate the team config from the project root.
 * Returns null if no team config file exists (single-developer mode).
 */
export function loadTeamConfig(workDir: string, configPath?: string): TeamConfig | null {
  const log = getLogger();
  const resolvedWorkDir = resolve(workDir);

  // Find config file
  let filePath: string | null = null;

  if (configPath) {
    const resolved = resolve(resolvedWorkDir, configPath);
    if (!resolved.startsWith(resolvedWorkDir)) {
      throw new TeamConfigError('team_config: path escapes project directory', 'team_config');
    }
    if (existsSync(resolved)) {
      filePath = resolved;
    } else {
      throw new TeamConfigError(`team_config: file not found — ${configPath}`, 'team_config');
    }
  } else {
    for (const name of TEAM_CONFIG_FILES) {
      const candidate = join(resolvedWorkDir, name);
      if (existsSync(candidate)) {
        filePath = candidate;
        break;
      }
    }
  }

  if (!filePath) {
    return null;
  }

  // Parse JSON
  let raw: unknown;
  try {
    const content = readFileSync(filePath, 'utf-8');
    raw = JSON.parse(content);
  } catch (err) {
    throw new TeamConfigError(
      `Failed to parse team config: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new TeamConfigError('Team config must be a JSON object');
  }

  const obj = raw as Record<string, unknown>;

  // Validate required fields
  const version = validateString(obj.version, 'version', 20);
  if (!SEMVER_RE.test(version)) {
    throw new TeamConfigError('version: must be valid semver (e.g., "1.0.0")', 'version');
  }

  const org = validateString(obj.org, 'org', MAX_ORG_LENGTH);
  if (!SAFE_STRING_RE.test(org)) {
    throw new TeamConfigError('org: contains unsafe characters', 'org');
  }

  const config: TeamConfig = { version, org };

  // Optional fields
  if (obj.gates !== undefined) {
    config.gates = validateGateThresholds(obj.gates);
  }

  if (obj.banned_patterns !== undefined) {
    config.banned_patterns = validateStringArray(obj.banned_patterns, 'banned_patterns', MAX_BANNED_PATTERNS);
  }

  if (obj.approved_models !== undefined) {
    config.approved_models = validateStringArray(obj.approved_models, 'approved_models', MAX_APPROVED_MODELS);
  }

  if (obj.memory !== undefined) {
    if (typeof obj.memory !== 'object' || obj.memory === null) {
      throw new TeamConfigError('memory: expected object', 'memory');
    }
    const mem = obj.memory as Record<string, unknown>;
    const remote = validateString(mem.remote, 'memory.remote', MAX_STRING_LENGTH);
    config.memory = {
      remote,
      branch: mem.branch !== undefined ? validateString(mem.branch, 'memory.branch', 100) : undefined,
      auto_sync: mem.auto_sync !== undefined ? Boolean(mem.auto_sync) : undefined,
    };
  }

  if (obj.skills !== undefined) {
    if (typeof obj.skills !== 'object' || obj.skills === null) {
      throw new TeamConfigError('skills: expected object', 'skills');
    }
    const sk = obj.skills as Record<string, unknown>;
    const skillVersion = validateString(sk.version, 'skills.version', 20);
    if (!SEMVER_RE.test(skillVersion)) {
      throw new TeamConfigError('skills.version: must be valid semver', 'skills.version');
    }
    config.skills = {
      version: skillVersion,
      lock_file: sk.lock_file !== undefined ? validateString(sk.lock_file, 'skills.lock_file', 200) : undefined,
    };
  }

  log.info('team-config', 'loaded', { org: config.org, version: config.version, file: filePath });
  return config;
}

/**
 * Merge team config gate thresholds with defaults.
 * Team config values override defaults.
 */
export function mergeGateThresholds(teamGates?: GateThresholds): Required<GateThresholds> {
  return {
    t0_min_coverage: teamGates?.t0_min_coverage ?? 50,
    t1_mode: teamGates?.t1_mode ?? 'strict',
    t3_min_test_files: teamGates?.t3_min_test_files ?? 1,
    t4_fail_severity: teamGates?.t4_fail_severity ?? 'high',
    t5_build: teamGates?.t5_build ?? 'required',
  };
}

/**
 * Check if a model is approved by the team config.
 * Returns true if no approved_models list is set (no restriction).
 */
export function isModelApproved(model: string, teamConfig: TeamConfig | null): boolean {
  if (!teamConfig?.approved_models || teamConfig.approved_models.length === 0) {
    return true;
  }
  return teamConfig.approved_models.some(
    (approved) => model === approved || model.startsWith(approved),
  );
}
