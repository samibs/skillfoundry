import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import TOML from '@iarna/toml';

// vi.hoisted runs before vi.mock hoisting, making FAKE_HOME available to the mock factory
const { FAKE_HOME } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require('node:os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('node:path');
  return { FAKE_HOME: path.join(os.tmpdir(), 'sf-cred-test-' + Date.now()) };
});

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: () => FAKE_HOME };
});

// Import after mock is set up
import {
  loadCredentials,
  saveCredentials,
  setCredential,
  removeCredential,
  injectCredentials,
  getCredentialsPath,
  hasAnyCredentials,
  PROVIDER_ENV_MAPPING,
  PROVIDER_KEY_URLS,
} from '../core/credentials.js';

import { runSetupNonInteractive } from '../commands/setup.js';

const CRED_DIR = join(FAKE_HOME, '.config', 'skillfoundry');
const CRED_FILE = join(CRED_DIR, 'credentials.toml');

// Save env vars so we can restore them
const ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'OPENAI_API_KEY',
  'XAI_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'OLLAMA_BASE_URL',
];

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  mkdirSync(FAKE_HOME, { recursive: true });
});

afterEach(() => {
  // Restore env
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
  rmSync(FAKE_HOME, { recursive: true, force: true });
});

describe('loadCredentials', () => {
  it('returns empty store when no file exists', () => {
    expect(loadCredentials()).toEqual({});
  });

  it('reads TOML credentials correctly', () => {
    mkdirSync(CRED_DIR, { recursive: true });
    writeFileSync(
      CRED_FILE,
      '[anthropic]\napi_key = "sk-ant-test"\n\n[openai]\napi_key = "sk-openai-test"\n',
    );
    const store = loadCredentials();
    expect(store.anthropic).toEqual({ api_key: 'sk-ant-test' });
    expect(store.openai).toEqual({ api_key: 'sk-openai-test' });
  });
});

describe('saveCredentials', () => {
  it('creates directory and file', () => {
    saveCredentials({ anthropic: { api_key: 'test-key' } });
    expect(existsSync(CRED_FILE)).toBe(true);
  });

  it('writes valid TOML', () => {
    saveCredentials({
      anthropic: { api_key: 'sk-ant-abc' },
      openai: { api_key: 'sk-oai-xyz' },
    });
    const raw = readFileSync(CRED_FILE, 'utf-8');
    const parsed = TOML.parse(raw) as Record<string, Record<string, string>>;
    expect(parsed.anthropic.api_key).toBe('sk-ant-abc');
    expect(parsed.openai.api_key).toBe('sk-oai-xyz');
  });

  it('sets file permissions to 0600 on non-Windows', () => {
    if (process.platform === 'win32') return;
    saveCredentials({ anthropic: { api_key: 'test' } });
    const stats = statSync(CRED_FILE);
    expect(stats.mode & 0o777).toBe(0o600);
  });
});

describe('setCredential', () => {
  it('adds a new provider entry', () => {
    setCredential('anthropic', 'api_key', 'sk-ant-new');
    const store = loadCredentials();
    expect(store.anthropic).toEqual({ api_key: 'sk-ant-new' });
  });

  it('merges with existing provider entries', () => {
    setCredential('anthropic', 'api_key', 'sk-ant-key');
    setCredential('anthropic', 'auth_token', 'bearer-token');
    const store = loadCredentials();
    expect(store.anthropic).toEqual({
      api_key: 'sk-ant-key',
      auth_token: 'bearer-token',
    });
  });
});

describe('removeCredential', () => {
  it('removes a provider section', () => {
    setCredential('anthropic', 'api_key', 'test');
    setCredential('openai', 'api_key', 'test');
    removeCredential('anthropic');
    const store = loadCredentials();
    expect(store.anthropic).toBeUndefined();
    expect(store.openai).toEqual({ api_key: 'test' });
  });

  it('is a no-op for nonexistent provider', () => {
    saveCredentials({ anthropic: { api_key: 'test' } });
    removeCredential('xai'); // does not exist
    const store = loadCredentials();
    expect(store.anthropic).toEqual({ api_key: 'test' });
  });
});

describe('injectCredentials', () => {
  it('sets env vars from stored credentials', () => {
    saveCredentials({ anthropic: { api_key: 'sk-ant-inject' } });
    injectCredentials();
    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-inject');
  });

  it('does not overwrite existing env vars', () => {
    process.env.ANTHROPIC_API_KEY = 'already-set';
    saveCredentials({ anthropic: { api_key: 'sk-ant-stored' } });
    injectCredentials();
    expect(process.env.ANTHROPIC_API_KEY).toBe('already-set');
  });

  it('handles missing credentials file gracefully', () => {
    // No file exists — should not throw
    expect(() => injectCredentials()).not.toThrow();
  });

  it('injects auth_token for anthropic', () => {
    saveCredentials({ anthropic: { auth_token: 'bearer-xyz' } });
    injectCredentials();
    expect(process.env.ANTHROPIC_AUTH_TOKEN).toBe('bearer-xyz');
  });
});

describe('getCredentialsPath', () => {
  it('returns path under home config dir', () => {
    const path = getCredentialsPath();
    expect(path).toContain('.config');
    expect(path).toContain('skillfoundry');
    expect(path).toContain('credentials.toml');
  });
});

describe('hasAnyCredentials', () => {
  it('returns false when nothing is configured', () => {
    expect(hasAnyCredentials()).toBe(false);
  });

  it('returns true when env var is set', () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    expect(hasAnyCredentials()).toBe(true);
  });

  it('returns true when stored credential exists', () => {
    saveCredentials({ openai: { api_key: 'sk-test' } });
    expect(hasAnyCredentials()).toBe(true);
  });
});

describe('PROVIDER_KEY_URLS', () => {
  it('has URLs for all non-ollama providers', () => {
    for (const provider of Object.keys(PROVIDER_ENV_MAPPING)) {
      expect(PROVIDER_KEY_URLS[provider]).toBeDefined();
    }
  });
});

describe('runSetupNonInteractive', () => {
  it('returns error when no provider specified', () => {
    const result = runSetupNonInteractive({});
    expect(result).toContain('--provider is required');
  });

  it('returns error for unknown provider', () => {
    const result = runSetupNonInteractive({ provider: 'doesnotexist' });
    expect(result).toContain('Unknown provider');
  });

  it('saves API key for valid provider', () => {
    const result = runSetupNonInteractive({
      provider: 'anthropic',
      key: 'sk-ant-setup-test',
    });
    expect(result).toContain('Saved api_key for anthropic');
    const store = loadCredentials();
    expect(store.anthropic).toEqual({ api_key: 'sk-ant-setup-test' });
  });

  it('saves auth_token for anthropic', () => {
    const result = runSetupNonInteractive({
      provider: 'anthropic',
      authToken: 'bearer-setup-test',
    });
    expect(result).toContain('Saved auth_token for anthropic');
    const store = loadCredentials();
    expect(store.anthropic).toEqual({ auth_token: 'bearer-setup-test' });
  });

  it('lists configured providers with --list', () => {
    setCredential('openai', 'api_key', 'sk-listed');
    const result = runSetupNonInteractive({ list: true });
    expect(result).toContain('openai');
    expect(result).toContain('stored credential');
  });

  it('removes credentials with --remove', () => {
    setCredential('anthropic', 'api_key', 'to-remove');
    const result = runSetupNonInteractive({
      provider: 'anthropic',
      remove: true,
    });
    expect(result).toContain('Removed credentials');
    const store = loadCredentials();
    expect(store.anthropic).toBeUndefined();
  });

  it('returns error when key is missing', () => {
    const result = runSetupNonInteractive({ provider: 'openai' });
    expect(result).toContain('--key is required');
    expect(result).toContain('platform.openai.com');
  });
});
