/**
 * STORY-009: sf upgrade — Version Pinning & Upgrade
 *
 * Checks for available updates and applies them.
 * Respects team config version pins.
 *
 * Usage:
 *   sf upgrade --check     Show available updates (dry-run)
 *   sf upgrade --latest    Upgrade to latest version
 *   sf upgrade             Upgrade to pinned version (from team config)
 */
import type { SlashCommand } from '../types.js';
/**
 * Get the current framework version from .version file.
 */
export declare function getCurrentVersion(workDir: string): string;
/**
 * Check npm registry for latest version.
 */
export declare function checkLatestVersion(): string | null;
/**
 * Compare two semver strings. Returns -1, 0, or 1.
 */
export declare function compareSemver(a: string, b: string): number;
export declare const upgradeCommand: SlashCommand;
