import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import TOML from '@iarna/toml';
import type { SfConfig, SfPolicy } from '../types.js';
import { AVAILABLE_PROVIDERS, detectAvailableProviders } from './provider.js';

const WORK_DIR = '.skillfoundry';
const CONFIG_FILE = join(WORK_DIR, 'config.toml');
const POLICY_FILE = join(WORK_DIR, 'policy.toml');

const DEFAULT_CONFIG: SfConfig = {
  provider: 'anthropic',
  engine: 'api',
  model: 'claude-sonnet-4-20250514',
  fallback_provider: 'openai',
  fallback_engine: 'broker',
  monthly_budget_usd: 50,
  run_budget_usd: 2,
  memory_sync_enabled: false,
  memory_sync_remote: 'origin',
};

const DEFAULT_POLICY: SfPolicy = {
  allow_shell: false,
  allow_network: false,
  allow_paths: ['.', 'memory_bank', '.skillfoundry', 'docs', 'genesis'],
  redact: true,
};

export function ensureWorkspace(workDir: string): void {
  const dirs = [WORK_DIR, join(WORK_DIR, 'plans'), join(WORK_DIR, 'runs')];
  for (const dir of dirs) {
    const full = join(workDir, dir);
    if (!existsSync(full)) {
      mkdirSync(full, { recursive: true });
    }
  }
}

export function loadConfig(workDir: string): SfConfig {
  let config: SfConfig;
  const path = join(workDir, CONFIG_FILE);
  if (!existsSync(path)) {
    config = { ...DEFAULT_CONFIG };
  } else {
    const raw = readFileSync(path, 'utf-8');
    const parsed = TOML.parse(raw);
    config = { ...DEFAULT_CONFIG, ...parsed } as unknown as SfConfig;
  }

  // Auto-select provider: if configured provider has no credentials, pick the first available one
  const available = detectAvailableProviders();
  if (!available.includes(config.provider) || config.provider === 'ollama') {
    const preferred = available.filter((p) => p !== 'ollama');
    if (preferred.length > 0) {
      const picked = preferred[0];
      const info = AVAILABLE_PROVIDERS[picked];
      if (info) {
        config.provider = picked;
        config.model = info.defaultModel;
      }
    }
  }

  return config;
}

export function loadPolicy(workDir: string): SfPolicy {
  const path = join(workDir, POLICY_FILE);
  if (!existsSync(path)) {
    return { ...DEFAULT_POLICY };
  }
  const raw = readFileSync(path, 'utf-8');
  const parsed = TOML.parse(raw);
  return { ...DEFAULT_POLICY, ...parsed } as unknown as SfPolicy;
}

export function saveConfig(workDir: string, config: SfConfig): void {
  ensureWorkspace(workDir);
  const path = join(workDir, CONFIG_FILE);
  writeFileSync(path, TOML.stringify(config as unknown as TOML.JsonMap));
}

export function createDefaultFiles(workDir: string, force: boolean): void {
  ensureWorkspace(workDir);
  const configPath = join(workDir, CONFIG_FILE);
  const policyPath = join(workDir, POLICY_FILE);
  if (!existsSync(configPath) || force) {
    writeFileSync(configPath, TOML.stringify(DEFAULT_CONFIG as unknown as TOML.JsonMap));
  }
  if (!existsSync(policyPath) || force) {
    writeFileSync(policyPath, TOML.stringify(DEFAULT_POLICY as unknown as TOML.JsonMap));
  }
}
