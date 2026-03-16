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
import type { TeamConfig, GateThresholds } from '../types.js';
export declare class TeamConfigError extends Error {
    readonly field?: string | undefined;
    constructor(message: string, field?: string | undefined);
}
/**
 * Load and validate the team config from the project root.
 * Returns null if no team config file exists (single-developer mode).
 */
export declare function loadTeamConfig(workDir: string, configPath?: string): TeamConfig | null;
/**
 * Merge team config gate thresholds with defaults.
 * Team config values override defaults.
 */
export declare function mergeGateThresholds(teamGates?: GateThresholds): Required<GateThresholds>;
/**
 * Check if a model is approved by the team config.
 * Returns true if no approved_models list is set (no restriction).
 */
export declare function isModelApproved(model: string, teamConfig: TeamConfig | null): boolean;
