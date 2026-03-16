import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  getConsentStatus,
  setConsent,
  promptConsent,
  clearConsentCache,
} from '../core/consent.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const TEST_DIR = join(process.cwd(), '.test-consent-' + process.pid);
const SF_DIR = join(TEST_DIR, '.skillfoundry');
const CONFIG_PATH = join(SF_DIR, 'config.toml');

beforeEach(() => {
  clearConsentCache();
  mkdirSync(SF_DIR, { recursive: true });
});

afterEach(() => {
  clearConsentCache();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('getConsentStatus', () => {
  it('returns pending when config.toml does not exist', () => {
    rmSync(CONFIG_PATH, { force: true });
    const status = getConsentStatus(TEST_DIR);
    expect(status).toBe('pending');
  });

  it('returns pending when config.toml has no [telemetry] section', () => {
    writeFileSync(CONFIG_PATH, 'provider = "anthropic"\nmodel = "claude-sonnet-4-20250514"\n');
    const status = getConsentStatus(TEST_DIR);
    expect(status).toBe('pending');
  });

  it('returns pending when [telemetry] section has no consent field', () => {
    writeFileSync(CONFIG_PATH, 'provider = "anthropic"\n\n[telemetry]\nconsent_version = 1\n');
    const status = getConsentStatus(TEST_DIR);
    expect(status).toBe('pending');
  });

  it('returns opted_in when consent is set to opted_in', () => {
    writeFileSync(CONFIG_PATH, [
      'provider = "anthropic"',
      '',
      '[telemetry]',
      'consent = "opted_in"',
      'consent_date = "2026-03-16T10:00:00.000Z"',
      'consent_version = 1',
    ].join('\n'));
    const status = getConsentStatus(TEST_DIR);
    expect(status).toBe('opted_in');
  });

  it('returns opted_out when consent is set to opted_out', () => {
    writeFileSync(CONFIG_PATH, [
      'provider = "anthropic"',
      '',
      '[telemetry]',
      'consent = "opted_out"',
      'consent_date = "2026-03-16T10:00:00.000Z"',
      'consent_version = 1',
    ].join('\n'));
    const status = getConsentStatus(TEST_DIR);
    expect(status).toBe('opted_out');
  });

  it('returns pending for invalid consent value', () => {
    writeFileSync(CONFIG_PATH, [
      '[telemetry]',
      'consent = "maybe"',
    ].join('\n'));
    const status = getConsentStatus(TEST_DIR);
    expect(status).toBe('pending');
  });

  it('returns pending when .skillfoundry directory does not exist', () => {
    rmSync(SF_DIR, { recursive: true, force: true });
    const status = getConsentStatus(TEST_DIR);
    expect(status).toBe('pending');
  });
});

describe('setConsent', () => {
  it('writes consent to new config.toml', () => {
    rmSync(CONFIG_PATH, { force: true });
    setConsent(TEST_DIR, 'opted_in');

    const content = readFileSync(CONFIG_PATH, 'utf-8');
    expect(content).toContain('[telemetry]');
    expect(content).toContain('consent = "opted_in"');
    expect(content).toContain('consent_version = 1');
    expect(content).toMatch(/consent_date = "\d{4}-\d{2}-\d{2}T/);
  });

  it('appends telemetry section to existing config.toml', () => {
    writeFileSync(CONFIG_PATH, 'provider = "anthropic"\nmodel = "claude-sonnet-4-20250514"\n');
    setConsent(TEST_DIR, 'opted_out');

    const content = readFileSync(CONFIG_PATH, 'utf-8');
    expect(content).toContain('provider = "anthropic"');
    expect(content).toContain('[telemetry]');
    expect(content).toContain('consent = "opted_out"');
  });

  it('replaces existing telemetry section', () => {
    writeFileSync(CONFIG_PATH, [
      'provider = "anthropic"',
      '',
      '[telemetry]',
      'consent = "opted_out"',
      'consent_date = "2026-01-01T00:00:00.000Z"',
      'consent_version = 1',
    ].join('\n'));

    setConsent(TEST_DIR, 'opted_in');

    const content = readFileSync(CONFIG_PATH, 'utf-8');
    expect(content).toContain('consent = "opted_in"');
    // Should not have duplicate [telemetry] sections
    const sectionCount = (content.match(/\[telemetry\]/g) || []).length;
    expect(sectionCount).toBe(1);
  });

  it('creates .skillfoundry directory if missing', () => {
    rmSync(SF_DIR, { recursive: true, force: true });
    setConsent(TEST_DIR, 'opted_in');

    expect(existsSync(SF_DIR)).toBe(true);
    expect(existsSync(CONFIG_PATH)).toBe(true);
  });

  it('preserves other config sections when updating', () => {
    writeFileSync(CONFIG_PATH, [
      'provider = "xai"',
      'model = "grok-4"',
      'monthly_budget_usd = 50',
    ].join('\n'));

    setConsent(TEST_DIR, 'opted_in');

    const content = readFileSync(CONFIG_PATH, 'utf-8');
    expect(content).toContain('provider = "xai"');
    expect(content).toContain('model = "grok-4"');
    expect(content).toContain('consent = "opted_in"');
  });
});

describe('promptConsent', () => {
  it('returns early if already opted_in', async () => {
    writeFileSync(CONFIG_PATH, [
      '[telemetry]',
      'consent = "opted_in"',
      'consent_date = "2026-03-16T10:00:00.000Z"',
      'consent_version = 1',
    ].join('\n'));

    const result = await promptConsent(TEST_DIR);
    expect(result).toBe('opted_in');
  });

  it('returns early if already opted_out', async () => {
    writeFileSync(CONFIG_PATH, [
      '[telemetry]',
      'consent = "opted_out"',
      'consent_date = "2026-03-16T10:00:00.000Z"',
      'consent_version = 1',
    ].join('\n'));

    const result = await promptConsent(TEST_DIR);
    expect(result).toBe('opted_out');
  });

  it('defaults to opted_out in non-interactive environments', async () => {
    // process.stdin.isTTY is undefined in test environments (non-TTY)
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

    const result = await promptConsent(TEST_DIR);
    expect(result).toBe('opted_out');

    // Verify it was persisted
    const content = readFileSync(CONFIG_PATH, 'utf-8');
    expect(content).toContain('consent = "opted_out"');

    // Restore
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
  });
});

describe('consent caching', () => {
  it('caches consent status after first read', () => {
    writeFileSync(CONFIG_PATH, [
      '[telemetry]',
      'consent = "opted_in"',
      'consent_date = "2026-03-16T10:00:00.000Z"',
      'consent_version = 1',
    ].join('\n'));

    // First read - populates cache
    const status1 = getConsentStatus(TEST_DIR);
    expect(status1).toBe('opted_in');

    // Change file on disk
    writeFileSync(CONFIG_PATH, [
      '[telemetry]',
      'consent = "opted_out"',
      'consent_date = "2026-03-16T10:00:00.000Z"',
      'consent_version = 1',
    ].join('\n'));

    // Second read - should return cached value
    const status2 = getConsentStatus(TEST_DIR);
    expect(status2).toBe('opted_in');
  });

  it('cache is invalidated by clearConsentCache', () => {
    writeFileSync(CONFIG_PATH, [
      '[telemetry]',
      'consent = "opted_in"',
      'consent_date = "2026-03-16T10:00:00.000Z"',
      'consent_version = 1',
    ].join('\n'));

    getConsentStatus(TEST_DIR);

    // Change on disk
    writeFileSync(CONFIG_PATH, [
      '[telemetry]',
      'consent = "opted_out"',
      'consent_date = "2026-03-16T10:00:00.000Z"',
      'consent_version = 1',
    ].join('\n'));

    clearConsentCache();

    const status = getConsentStatus(TEST_DIR);
    expect(status).toBe('opted_out');
  });

  it('setConsent updates the cache', () => {
    writeFileSync(CONFIG_PATH, [
      '[telemetry]',
      'consent = "opted_out"',
      'consent_date = "2026-03-16T10:00:00.000Z"',
      'consent_version = 1',
    ].join('\n'));

    getConsentStatus(TEST_DIR); // populate cache with opted_out
    setConsent(TEST_DIR, 'opted_in'); // should update cache

    const status = getConsentStatus(TEST_DIR);
    expect(status).toBe('opted_in');
  });
});
