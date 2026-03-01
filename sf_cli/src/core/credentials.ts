// Global credential storage for SkillFoundry CLI.
// Stores API keys in ~/.config/skillfoundry/credentials.toml (XDG-compliant).
// Credentials are injected into process.env at startup so SDK constructors auto-discover them.

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  chmodSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import TOML from '@iarna/toml';

const CREDENTIALS_DIR = join(homedir(), '.config', 'skillfoundry');
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, 'credentials.toml');

/**
 * Maps provider TOML fields to environment variable names.
 * The SDK constructors read these env vars automatically.
 */
export const PROVIDER_ENV_MAPPING: Record<string, Record<string, string>> = {
  anthropic: {
    api_key: 'ANTHROPIC_API_KEY',
    auth_token: 'ANTHROPIC_AUTH_TOKEN',
  },
  openai: {
    api_key: 'OPENAI_API_KEY',
  },
  xai: {
    api_key: 'XAI_API_KEY',
  },
  gemini: {
    api_key: 'GOOGLE_API_KEY',
  },
  ollama: {
    base_url: 'OLLAMA_BASE_URL',
  },
  lmstudio: {
    base_url: 'LMSTUDIO_BASE_URL',
  },
};

/**
 * URLs where users can obtain API keys for each provider.
 */
export const PROVIDER_KEY_URLS: Record<string, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  xai: 'https://console.x.ai/',
  gemini: 'https://aistudio.google.com/apikey',
  ollama: 'https://ollama.com/download',
  lmstudio: 'https://lmstudio.ai/docs',
};

export interface ProviderCredentials {
  api_key?: string;
  auth_token?: string;
  base_url?: string;
}

export type CredentialStore = Record<string, ProviderCredentials>;

/**
 * Ensure the credentials directory exists with secure permissions.
 */
function ensureCredentialsDir(): void {
  if (!existsSync(CREDENTIALS_DIR)) {
    mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Load credentials from ~/.config/skillfoundry/credentials.toml.
 * Returns empty store if file does not exist.
 */
export function loadCredentials(): CredentialStore {
  if (!existsSync(CREDENTIALS_FILE)) {
    return {};
  }
  try {
    const stats = statSync(CREDENTIALS_FILE);
    if (process.platform !== 'win32') {
      const mode = stats.mode & 0o777;
      if (mode !== 0o600) {
        console.warn(
          `Warning: ${CREDENTIALS_FILE} has permissions ${mode.toString(8)}, expected 600. ` +
            `Run: chmod 600 "${CREDENTIALS_FILE}"`,
        );
      }
    }
  } catch {
    // Stat failed — proceed anyway
  }
  const raw = readFileSync(CREDENTIALS_FILE, 'utf-8');
  const parsed = TOML.parse(raw);
  return parsed as unknown as CredentialStore;
}

/**
 * Save credentials to disk with secure permissions (0o600).
 */
export function saveCredentials(store: CredentialStore): void {
  ensureCredentialsDir();
  writeFileSync(
    CREDENTIALS_FILE,
    TOML.stringify(store as unknown as TOML.JsonMap),
    { mode: 0o600 },
  );
  // Enforce permissions after write (some OSes ignore mode in writeFileSync)
  try {
    chmodSync(CREDENTIALS_FILE, 0o600);
  } catch {
    // Windows does not support Unix permissions — ignore
  }
}

/**
 * Set a credential for a specific provider. Merges with existing entries.
 */
export function setCredential(
  provider: string,
  field: string,
  value: string,
): void {
  const store = loadCredentials();
  if (!store[provider]) {
    store[provider] = {};
  }
  (store[provider] as Record<string, string>)[field] = value;
  saveCredentials(store);
}

/**
 * Remove all credentials for a provider.
 */
export function removeCredential(provider: string): void {
  const store = loadCredentials();
  delete store[provider];
  saveCredentials(store);
}

/**
 * Inject stored credentials into process.env so SDK constructors work.
 * Does NOT overwrite existing env vars — env vars always take precedence.
 */
export function injectCredentials(): void {
  let store: CredentialStore;
  try {
    store = loadCredentials();
  } catch {
    return; // Credential file missing or corrupt — skip silently
  }
  for (const [provider, creds] of Object.entries(store)) {
    const mapping = PROVIDER_ENV_MAPPING[provider];
    if (!mapping) continue;
    for (const [field, envVar] of Object.entries(mapping)) {
      const value = (creds as Record<string, string>)[field];
      if (value && !process.env[envVar]) {
        process.env[envVar] = value;
      }
    }
  }
}

/**
 * Returns the path to the credentials file (for display in messages).
 */
export function getCredentialsPath(): string {
  return CREDENTIALS_FILE;
}

/**
 * Check if any provider has credentials available (env or stored).
 */
export function hasAnyCredentials(): boolean {
  // Check env vars
  for (const mapping of Object.values(PROVIDER_ENV_MAPPING)) {
    for (const envVar of Object.values(mapping)) {
      if (process.env[envVar]) return true;
    }
  }
  // Check stored credentials
  try {
    const store = loadCredentials();
    for (const creds of Object.values(store)) {
      for (const val of Object.values(creds as Record<string, string>)) {
        if (val) return true;
      }
    }
  } catch {
    // Ignore read errors
  }
  return false;
}
