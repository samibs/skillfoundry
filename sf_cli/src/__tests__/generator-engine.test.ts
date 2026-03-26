import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateUuid,
  generateSecret,
  generateApiKey,
  generatePassword,
  generateHash,
  generateHmac,
  generateKeyPair,
  generateJwt,
  decodeJwt,
  generateWebhookSecret,
  generateTotpSecret,
  generateEnvFile,
  getEnvTemplates,
  autoGenerateSecrets,
  formatJwtResult,
  formatKeyPairResult,
  formatAutoGenerateResult,
} from '../core/generator-engine.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'gen-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── UUID ────────────────────────────────────────────────────────

describe('generateUuid', () => {
  it('returns valid UUID v4 format', () => {
    const uuid = generateUuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('generates unique values', () => {
    const a = generateUuid();
    const b = generateUuid();
    expect(a).not.toBe(b);
  });
});

// ── Secret ──────────────────────────────────────────────────────

describe('generateSecret', () => {
  it('generates hex secret of specified length', () => {
    expect(generateSecret(32, 'hex')).toHaveLength(32);
    expect(generateSecret(64, 'hex')).toHaveLength(64);
  });

  it('generates base64 secret', () => {
    const secret = generateSecret(32, 'base64');
    expect(secret.length).toBeLessThanOrEqual(32);
  });

  it('generates unique values', () => {
    expect(generateSecret()).not.toBe(generateSecret());
  });
});

// ── API Key ─────────────────────────────────────────────────────

describe('generateApiKey', () => {
  it('has default sk_ prefix', () => {
    expect(generateApiKey()).toMatch(/^sk_/);
  });

  it('uses custom prefix', () => {
    expect(generateApiKey('pk')).toMatch(/^pk_/);
  });

  it('is long enough for security', () => {
    expect(generateApiKey().length).toBeGreaterThan(20);
  });
});

// ── Password ────────────────────────────────────────────────────

describe('generatePassword', () => {
  it('generates password of specified length', () => {
    expect(generatePassword(16)).toHaveLength(16);
    expect(generatePassword(64)).toHaveLength(64);
  });

  it('includes special characters by default', () => {
    // Generate several and check at least one has specials
    const passwords = Array.from({ length: 10 }, () => generatePassword(32));
    const hasSpecial = passwords.some((p) => /[!@#$%^&*()\-_=+\[\]{}|;:,.<>?]/.test(p));
    expect(hasSpecial).toBe(true);
  });

  it('can exclude special characters', () => {
    const password = generatePassword(100, false);
    expect(password).toMatch(/^[a-zA-Z0-9]+$/);
  });

  it('contains mixed case and digits', () => {
    const password = generatePassword(32);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[0-9]/);
  });
});

// ── Hash ────────────────────────────────────────────────────────

describe('generateHash', () => {
  it('generates SHA256 by default', () => {
    const hash = generateHash('hello');
    expect(hash).toHaveLength(64); // SHA256 = 64 hex chars
  });

  it('generates SHA512', () => {
    const hash = generateHash('hello', 'sha512');
    expect(hash).toHaveLength(128);
  });

  it('generates scrypt hash with salt', () => {
    const hash = generateHash('hello', 'scrypt');
    expect(hash).toContain(':');
    const [salt, derived] = hash.split(':');
    expect(salt.length).toBe(32); // 16 bytes hex
    expect(derived.length).toBe(128); // 64 bytes hex
  });

  it('is deterministic for same input (SHA)', () => {
    expect(generateHash('test')).toBe(generateHash('test'));
  });

  it('scrypt produces different salts each time', () => {
    expect(generateHash('test', 'scrypt')).not.toBe(generateHash('test', 'scrypt'));
  });
});

// ── HMAC ────────────────────────────────────────────────────────

describe('generateHmac', () => {
  it('produces consistent HMAC for same input', () => {
    const hmac1 = generateHmac('data', 'secret');
    const hmac2 = generateHmac('data', 'secret');
    expect(hmac1).toBe(hmac2);
  });

  it('produces different HMAC for different secrets', () => {
    expect(generateHmac('data', 'secret1')).not.toBe(generateHmac('data', 'secret2'));
  });

  it('produces 64-char hex for SHA256', () => {
    expect(generateHmac('data', 'key', 'sha256')).toHaveLength(64);
  });
});

// ── Key Pair ────────────────────────────────────────────────────

describe('generateKeyPair', () => {
  it('generates RS256 key pair', () => {
    const result = generateKeyPair('RS256');
    expect(result.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(result.privateKey).toContain('BEGIN PRIVATE KEY');
    expect(result.algorithm).toBe('RS256');
  });

  it('generates ES256 key pair', () => {
    const result = generateKeyPair('ES256');
    expect(result.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(result.privateKey).toContain('BEGIN PRIVATE KEY');
  });

  it('writes files when outputDir provided', () => {
    const dir = join(tmpDir, 'keys');
    const result = generateKeyPair('RS256', dir);
    expect(result.publicKeyFile).toBeDefined();
    expect(existsSync(result.publicKeyFile!)).toBe(true);
    expect(existsSync(result.privateKeyFile!)).toBe(true);
  });
});

// ── JWT ─────────────────────────────────────────────────────────

describe('generateJwt', () => {
  it('generates valid HS256 JWT', () => {
    const result = generateJwt({ algorithm: 'HS256', secret: 'test-secret', subject: 'user1' });
    expect(result.token.split('.')).toHaveLength(3);
    expect(result.header.alg).toBe('HS256');
    expect(result.payload.sub).toBe('user1');
  });

  it('generates RS256 JWT with auto-generated key', () => {
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const result = generateJwt({ algorithm: 'RS256', subject: 'api-client' });
      expect(result.token.split('.')).toHaveLength(3);
      expect(result.header.alg).toBe('RS256');
      expect(result.keyFile).toBeDefined();
    } finally {
      process.chdir(origCwd);
    }
  });

  it('includes custom claims', () => {
    const result = generateJwt({
      algorithm: 'HS256',
      secret: 'key',
      claims: { scope: 'read write', tier: 'premium' },
    });
    expect(result.payload.scope).toBe('read write');
    expect(result.payload.tier).toBe('premium');
  });

  it('sets expiry correctly', () => {
    const result = generateJwt({ algorithm: 'HS256', secret: 'key', expiresIn: '1h' });
    const exp = result.payload.exp as number;
    const iat = result.payload.iat as number;
    expect(exp - iat).toBe(3600);
  });

  it('includes role and tenant', () => {
    const result = generateJwt({ algorithm: 'HS256', secret: 'key', role: 'admin', tenant: 'acme' });
    expect(result.payload.role).toBe('admin');
    expect(result.payload.tenant).toBe('acme');
  });
});

describe('decodeJwt', () => {
  it('decodes a valid JWT', () => {
    const { token } = generateJwt({ algorithm: 'HS256', secret: 'key', subject: 'test' });
    const decoded = decodeJwt(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.header.alg).toBe('HS256');
    expect(decoded!.payload.sub).toBe('test');
  });

  it('returns null for invalid token', () => {
    expect(decodeJwt('not.a.jwt.token.at.all')).toBeNull();
    expect(decodeJwt('invalid')).toBeNull();
  });
});

// ── Webhook Secret ──────────────────────────────────────────────

describe('generateWebhookSecret', () => {
  it('has whsec_ prefix', () => {
    expect(generateWebhookSecret()).toMatch(/^whsec_/);
  });
});

// ── TOTP ────────────────────────────────────────────────────────

describe('generateTotpSecret', () => {
  it('returns secret and URI', () => {
    const result = generateTotpSecret();
    expect(result.secret.length).toBeGreaterThan(0);
    expect(result.uri).toContain('otpauth://totp/');
  });
});

// ── .env Generator ──────────────────────────────────────────────

describe('generateEnvFile', () => {
  it('generates api template', () => {
    const { content } = generateEnvFile('api');
    expect(content).toContain('PORT=3000');
    expect(content).toContain('JWT_SECRET=');
    // JWT_SECRET should be auto-filled (not empty)
    const match = content.match(/JWT_SECRET=(\S+)/);
    expect(match?.[1]?.length).toBeGreaterThan(10);
  });

  it('generates fullstack template', () => {
    const { content } = generateEnvFile('fullstack');
    expect(content).toContain('DATABASE_URL');
    expect(content).toContain('REDIS_URL');
  });

  it('writes to file when path provided', () => {
    const outPath = join(tmpDir, '.env');
    generateEnvFile('minimal', outPath);
    expect(existsSync(outPath)).toBe(true);
    const content = readFileSync(outPath, 'utf-8');
    expect(content).toContain('SECRET_KEY=');
  });

  it('handles unknown template', () => {
    const { content } = generateEnvFile('nonexistent');
    expect(content).toContain('Unknown template');
  });
});

describe('getEnvTemplates', () => {
  it('returns available templates', () => {
    const templates = getEnvTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(3);
    expect(templates.some((t) => t.name === 'api')).toBe(true);
  });
});

// ── Auto-Generate Secrets ───────────────────────────────────────

describe('autoGenerateSecrets', () => {
  it('fills empty secrets in .env', () => {
    writeFileSync(join(tmpDir, '.env'), 'PORT=3000\nJWT_SECRET=\nAPI_KEY=\n');
    const result = autoGenerateSecrets(tmpDir);
    expect(result.generated.length).toBeGreaterThan(0);

    const env = readFileSync(join(tmpDir, '.env'), 'utf-8');
    const jwtMatch = env.match(/JWT_SECRET=(\S+)/);
    expect(jwtMatch?.[1]?.length).toBeGreaterThan(10);
  });

  it('creates .env from .env.example', () => {
    writeFileSync(join(tmpDir, '.env.example'), 'PORT=3000\nSESSION_SECRET=\n');
    const result = autoGenerateSecrets(tmpDir);
    expect(result.generated.some((g) => g.includes('.env.example'))).toBe(true);
    expect(existsSync(join(tmpDir, '.env'))).toBe(true);
  });

  it('does not overwrite existing non-empty secrets', () => {
    writeFileSync(join(tmpDir, '.env'), 'JWT_SECRET=my-existing-secret\n');
    autoGenerateSecrets(tmpDir);
    const env = readFileSync(join(tmpDir, '.env'), 'utf-8');
    expect(env).toContain('JWT_SECRET=my-existing-secret');
  });

  it('reports when nothing to generate', () => {
    const result = autoGenerateSecrets(tmpDir);
    expect(result.skipped.length).toBeGreaterThan(0);
  });

  it('generates JWT keypair when project uses JWT', () => {
    writeFileSync(join(tmpDir, 'package.json'), '{"dependencies":{"jsonwebtoken":"^9.0.0"}}');
    writeFileSync(join(tmpDir, '.env'), 'PORT=3000\n');
    const result = autoGenerateSecrets(tmpDir);
    expect(result.generated.some((g) => g.includes('RS256'))).toBe(true);
    expect(existsSync(join(tmpDir, '.keys', 'rs256-private.pem'))).toBe(true);
  });
});

// ── Formatting ──────────────────────────────────────────────────

describe('formatJwtResult', () => {
  it('includes token and payload', () => {
    const result = generateJwt({ algorithm: 'HS256', secret: 'key', subject: 'test' });
    const output = formatJwtResult(result);
    expect(output).toContain('JWT Token Generated');
    expect(output).toContain('test');
  });
});

describe('formatKeyPairResult', () => {
  it('shows file paths when saved', () => {
    const dir = join(tmpDir, 'keys');
    const result = generateKeyPair('RS256', dir);
    const output = formatKeyPairResult(result);
    expect(output).toContain('RS256');
    expect(output).toContain('.pem');
  });
});

describe('formatAutoGenerateResult', () => {
  it('shows generated and skipped', () => {
    const output = formatAutoGenerateResult({ generated: ['JWT_SECRET'], skipped: ['no .env'] });
    expect(output).toContain('JWT_SECRET');
    expect(output).toContain('no .env');
  });
});
