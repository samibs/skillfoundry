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

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { SlashCommand, SessionContext } from '../types.js';
import { loadTeamConfig } from '../core/team-config.js';
import { getLogger } from '../utils/logger.js';

// ── Version helpers ───────────────────────────────────────────────────────────

/**
 * Get the current framework version from .version file.
 */
export function getCurrentVersion(workDir: string): string {
  const versionFile = join(workDir, '.version');
  if (existsSync(versionFile)) {
    return readFileSync(versionFile, 'utf-8').trim();
  }
  // Fallback to package.json
  try {
    const pkg = JSON.parse(readFileSync(join(workDir, 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Check npm registry for latest version.
 */
export function checkLatestVersion(): string | null {
  try {
    const result = execFileSync('npm', ['view', 'skillfoundry', 'version'], {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Compare two semver strings. Returns -1, 0, or 1.
 */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

// ── Parse args ────────────────────────────────────────────────────────────────

function parseUpgradeArgs(args: string): {
  check: boolean;
  latest: boolean;
} {
  const parts = args.trim().split(/\s+/);
  return {
    check: parts.includes('--check'),
    latest: parts.includes('--latest'),
  };
}

// ── Command ───────────────────────────────────────────────────────────────────

export const upgradeCommand: SlashCommand = {
  name: 'upgrade',
  description: 'Check for and apply framework updates',
  usage: '/upgrade [--check] [--latest]',

  execute: async (args: string, session: SessionContext): Promise<string> => {
    const log = getLogger();
    const { check, latest } = parseUpgradeArgs(args);
    const currentVersion = getCurrentVersion(session.workDir);
    const teamConfig = loadTeamConfig(session.workDir);
    const pinnedVersion = teamConfig?.skills?.version;

    const lines: string[] = ['', '  SkillFoundry Upgrade', ''];
    lines.push(`  Current version: ${currentVersion}`);

    if (pinnedVersion) {
      lines.push(`  Team pinned:     ${pinnedVersion}`);
    }

    // Check latest from npm
    const latestVersion = checkLatestVersion();

    if (latestVersion) {
      lines.push(`  Latest (npm):    ${latestVersion}`);
    } else {
      lines.push('  Latest (npm):    Unable to check (offline?)');
    }

    lines.push('');

    // Determine target version
    let targetVersion: string | null = null;

    if (latest && latestVersion) {
      targetVersion = latestVersion;
    } else if (pinnedVersion) {
      targetVersion = pinnedVersion;
    } else if (latestVersion) {
      targetVersion = latestVersion;
    }

    if (!targetVersion) {
      lines.push('  No upgrade target available.');
      lines.push('');
      return lines.join('\n');
    }

    const comparison = compareSemver(currentVersion, targetVersion);

    if (comparison >= 0) {
      lines.push(`  Already up to date (${currentVersion})`);
      lines.push('');
      return lines.join('\n');
    }

    if (check) {
      lines.push(`  Update available: ${currentVersion} → ${targetVersion}`);
      lines.push('  Run \`sf upgrade\` to apply.');
      lines.push('');
      return lines.join('\n');
    }

    // Apply upgrade
    lines.push(`  Upgrading: ${currentVersion} → ${targetVersion}`);
    lines.push('');

    try {
      execFileSync('npm', ['install', '-g', `skillfoundry@${targetVersion}`], {
        encoding: 'utf-8',
        timeout: 60_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      lines.push('  \x1b[32m✓\x1b[0m Upgrade complete');
      log.info('upgrade', 'success', { from: currentVersion, to: targetVersion });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`  \x1b[31m✗\x1b[0m Upgrade failed: ${msg.slice(0, 200)}`);
      lines.push('  Try: npm install -g skillfoundry@latest');
      log.error('upgrade', 'failed', { error: msg.slice(0, 200) });
    }

    lines.push('');
    return lines.join('\n');
  },
};
