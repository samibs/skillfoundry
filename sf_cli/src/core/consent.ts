// Telemetry consent management — handles opt-in/opt-out for telemetry collection.
// Reads/writes the [telemetry] section in .skillfoundry/config.toml.
// Non-interactive environments default to opted_out (GDPR requirement).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { getLogger } from '../utils/logger.js';

const SF_DIR = '.skillfoundry';
const CONFIG_FILE = join(SF_DIR, 'config.toml');

export type ConsentStatus = 'opted_in' | 'opted_out' | 'pending';

interface TelemetrySection {
  consent: ConsentStatus;
  consent_date: string;
  consent_version: number;
}

// In-memory cache to avoid repeated filesystem reads within the same process
let cachedConsent: { workDir: string; status: ConsentStatus } | null = null;

/**
 * Get the current telemetry consent status.
 * Reads the [telemetry] section from .skillfoundry/config.toml.
 * Returns 'pending' if the section or consent field is missing.
 *
 * @param workDir - Project root directory
 * @returns 'opted_in' | 'opted_out' | 'pending'
 */
export function getConsentStatus(workDir: string): ConsentStatus {
  if (cachedConsent && cachedConsent.workDir === workDir) {
    return cachedConsent.status;
  }

  const configPath = join(workDir, CONFIG_FILE);

  if (!existsSync(configPath)) {
    return 'pending';
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const telemetrySection = parseTelemetrySection(content);

    if (!telemetrySection || !telemetrySection.consent) {
      return 'pending';
    }

    const status = telemetrySection.consent;
    if (status !== 'opted_in' && status !== 'opted_out') {
      return 'pending';
    }

    cachedConsent = { workDir, status };
    return status;
  } catch {
    return 'pending';
  }
}

/**
 * Set telemetry consent choice.
 * Writes/updates the [telemetry] section in .skillfoundry/config.toml.
 * Creates the config file and directory if they don't exist.
 *
 * @param workDir - Project root directory
 * @param choice - 'opted_in' or 'opted_out'
 */
export function setConsent(workDir: string, choice: 'opted_in' | 'opted_out'): void {
  // Runtime validation — prevent TOML injection
  if (choice !== 'opted_in' && choice !== 'opted_out') {
    throw new Error(`Invalid consent choice: ${String(choice)}`);
  }

  const log = getLogger();
  const sfDir = join(workDir, SF_DIR);
  const configPath = join(workDir, CONFIG_FILE);

  if (!existsSync(sfDir)) {
    mkdirSync(sfDir, { recursive: true });
  }

  let content = '';
  if (existsSync(configPath)) {
    content = readFileSync(configPath, 'utf-8');
  }

  const telemetryBlock = [
    '',
    '[telemetry]',
    `consent = "${choice}"`,
    `consent_date = "${new Date().toISOString()}"`,
    'consent_version = 1',
  ].join('\n');

  // Remove existing [telemetry] section if present
  const updatedContent = removeTelemetrySection(content);
  const finalContent = updatedContent.trimEnd() + '\n' + telemetryBlock + '\n';

  writeFileSync(configPath, finalContent);

  // Update cache
  cachedConsent = { workDir, status: choice };

  log.info('consent', 'consent_updated', { choice, workDir });
}

/**
 * Prompt the user for telemetry consent.
 * Returns early if consent has already been given.
 * Non-interactive environments (no TTY) default to 'opted_out'.
 *
 * @param workDir - Project root directory
 * @returns The consent choice
 */
export async function promptConsent(workDir: string): Promise<ConsentStatus> {
  const currentStatus = getConsentStatus(workDir);
  if (currentStatus !== 'pending') {
    return currentStatus;
  }

  // Non-interactive environments default to opted_out (GDPR requirement)
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    setConsent(workDir, 'opted_out');
    return 'opted_out';
  }

  const message = [
    '',
    '  SkillFoundry Telemetry Consent',
    '  ──────────────────────────────────────────────────',
    '  SkillFoundry can collect anonymous usage metrics to',
    '  help improve quality gates and pipeline performance.',
    '',
    '  What we collect:',
    '    - Event types (forge runs, gate results)',
    '    - Timestamps and durations',
    '    - Pass/fail status and finding counts',
    '    - Token usage and cost',
    '',
    '  What we DO NOT collect:',
    '    - No source code or file contents',
    '    - No file paths or personal information',
    '    - No API keys or credentials',
    '',
    '  All data is stored locally in .skillfoundry/telemetry.jsonl',
    '  and is never transmitted without your consent.',
    '',
    '  You can change this anytime with: sf consent --opt-out',
    '  Full policy: docs/PRIVACY.md',
    '',
  ].join('\n');

  process.stdout.write(message);

  const answer = await askQuestion('  Enable telemetry? [y/N]: ');
  const choice: 'opted_in' | 'opted_out' = answer.trim().toLowerCase() === 'y' ? 'opted_in' : 'opted_out';

  setConsent(workDir, choice);
  return choice;
}

/**
 * Clear the in-memory consent cache. Used for testing.
 */
export function clearConsentCache(): void {
  cachedConsent = null;
}

// ── Internal Helpers ──────────────────────────────────────────

/**
 * Parse the [telemetry] section from a TOML config string.
 * Uses simple regex-based parsing to avoid additional dependencies.
 */
function parseTelemetrySection(content: string): TelemetrySection | null {
  const sectionMatch = content.match(/\[telemetry\]\s*\n([\s\S]*?)(?=\n\[|$)/);
  if (!sectionMatch) {
    return null;
  }

  const sectionBody = sectionMatch[1];
  const consent = extractTomlString(sectionBody, 'consent');
  const consentDate = extractTomlString(sectionBody, 'consent_date');
  const consentVersion = extractTomlNumber(sectionBody, 'consent_version');

  if (!consent) {
    return null;
  }

  return {
    consent: consent as ConsentStatus,
    consent_date: consentDate || '',
    consent_version: consentVersion ?? 1,
  };
}

/**
 * Extract a quoted string value from a TOML section body.
 */
function extractTomlString(body: string, key: string): string | null {
  const match = body.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'));
  return match ? match[1] : null;
}

/**
 * Extract a numeric value from a TOML section body.
 */
function extractTomlNumber(body: string, key: string): number | null {
  const match = body.match(new RegExp(`^${key}\\s*=\\s*(\\d+)`, 'm'));
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Remove the [telemetry] section from TOML content.
 */
function removeTelemetrySection(content: string): string {
  return content.replace(/\n?\[telemetry\]\s*\n[\s\S]*?(?=\n\[|$)/, '');
}

/**
 * Ask a question via readline and return the answer.
 */
function askQuestion(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
