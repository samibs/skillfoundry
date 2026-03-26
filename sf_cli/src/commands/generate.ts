/**
 * Generate CLI command — local generation of JWT, keys, secrets, passwords, etc.
 */

import type { SlashCommand, SessionContext } from '../types.js';
import { resolve } from 'node:path';
import {
  generateJwt,
  decodeJwt,
  generateKeyPair,
  generateApiKey,
  generateUuid,
  generatePassword,
  generateSecret,
  generateHash,
  generateHmac,
  generateWebhookSecret,
  generateTotpSecret,
  generateEnvFile,
  getEnvTemplates,
  autoGenerateSecrets,
  formatJwtResult,
  formatKeyPairResult,
  formatAutoGenerateResult,
} from '../core/generator-engine.js';

const LINE = '\u2501';

export const generateCommand: SlashCommand = {
  name: 'generate',
  description: 'Generate JWT tokens, API keys, passwords, certificates, .env files, and more — locally, no external services',
  usage: '/generate jwt [--sub X --role Y --exp 24h] | /generate apikey | /generate uuid | /generate password | /generate env [template]',
  async execute(args: string, session: SessionContext): Promise<string> {
    const parts = args.trim().split(/\s+/).filter(Boolean);
    const flags: Record<string, string> = {};
    let subcommand = '';
    const positional: string[] = [];

    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith('--')) {
        const key = parts[i].slice(2);
        if (i + 1 < parts.length && !parts[i + 1].startsWith('--')) {
          flags[key] = parts[i + 1];
          i++;
        } else {
          flags[key] = 'true';
        }
      } else if (!subcommand) {
        subcommand = parts[i];
      } else {
        positional.push(parts[i]);
      }
    }

    switch (subcommand) {
      case 'jwt': {
        if (flags.decode) {
          const decoded = decodeJwt(flags.decode);
          if (!decoded) return '  Invalid JWT token.';
          return [
            'JWT Decoded',
            LINE.repeat(60),
            `  Header:  ${JSON.stringify(decoded.header)}`,
            `  Payload: ${JSON.stringify(decoded.payload, null, 2)}`,
            '',
          ].join('\n');
        }

        const claims: Record<string, unknown> = {};
        if (flags.claims) {
          try { Object.assign(claims, JSON.parse(flags.claims)); } catch { /* ignore */ }
        }

        const result = generateJwt({
          algorithm: (flags.alg || flags.algorithm || 'HS256') as any,
          secret: flags.secret,
          subject: flags.sub || flags.subject,
          role: flags.role,
          tenant: flags.tenant,
          claims,
          expiresIn: flags.exp || flags.expires || '24h',
        });
        return formatJwtResult(result);
      }

      case 'keypair': {
        const alg = (flags.alg || flags.algorithm || 'RS256') as 'RS256' | 'ES256';
        const outputDir = flags.output || flags.dir || '.keys';
        const result = generateKeyPair(alg, resolve(session?.workDir || process.cwd(), outputDir));
        return formatKeyPairResult(result);
      }

      case 'apikey':
      case 'api-key': {
        const prefix = flags.prefix || 'sk';
        const count = parseInt(flags.count || '1', 10);
        const keys = Array.from({ length: count }, () => generateApiKey(prefix));
        return keys.map((k) => `  ${k}`).join('\n') + '\n';
      }

      case 'uuid': {
        const count = parseInt(flags.count || '1', 10);
        const uuids = Array.from({ length: count }, () => generateUuid());
        return uuids.map((u) => `  ${u}`).join('\n') + '\n';
      }

      case 'password':
      case 'pass': {
        const length = parseInt(flags.length || '32', 10);
        const special = flags.special !== 'false' && flags['no-special'] !== 'true';
        const count = parseInt(flags.count || '1', 10);
        const passwords = Array.from({ length: count }, () => generatePassword(length, special));
        return passwords.map((p) => `  ${p}`).join('\n') + '\n';
      }

      case 'secret': {
        const length = parseInt(flags.length || '64', 10);
        const encoding = (flags.encoding || 'hex') as 'hex' | 'base64' | 'base64url';
        return `  ${generateSecret(length, encoding)}\n`;
      }

      case 'hash': {
        const input = positional[0] || flags.input || '';
        if (!input) return '  Usage: /generate hash <input> [--algo sha256|sha512|scrypt]';
        const algo = (flags.algo || flags.algorithm || 'sha256') as 'sha256' | 'sha512' | 'scrypt';
        return `  ${generateHash(input, algo)}\n`;
      }

      case 'hmac': {
        const data = flags.data || positional[0] || '';
        const secret = flags.secret || '';
        if (!data || !secret) return '  Usage: /generate hmac --data <data> --secret <secret>';
        const algo = (flags.algo || 'sha256') as 'sha256' | 'sha512';
        return `  ${generateHmac(data, secret, algo)}\n`;
      }

      case 'webhook':
      case 'webhook-secret':
        return `  ${generateWebhookSecret()}\n`;

      case 'totp': {
        const result = generateTotpSecret();
        return [
          'TOTP Secret Generated',
          LINE.repeat(60),
          `  Secret: ${result.secret}`,
          `  URI:    ${result.uri}`,
          `  ${result.qrText}`,
          '',
        ].join('\n');
      }

      case 'env': {
        const template = positional[0] || flags.template || 'api';
        if (template === 'list') {
          const templates = getEnvTemplates();
          const lines = ['Available .env Templates', LINE.repeat(60), ''];
          for (const t of templates) {
            lines.push(`  ${t.name.padEnd(15)} ${t.title} (${t.varCount} vars)`);
            lines.push(`    ${t.description}`);
          }
          lines.push('');
          return lines.join('\n');
        }

        const outputPath = flags.output || '.env';
        const result = generateEnvFile(template, resolve(session?.workDir || process.cwd(), outputPath));
        return [
          `.env Generated (${template} template)`,
          LINE.repeat(60),
          `  Written to: ${result.path || 'stdout'}`,
          '',
          result.content,
        ].join('\n');
      }

      case 'auto': {
        const projectPath = resolve(session?.workDir || process.cwd(), positional[0] || '.');
        const result = autoGenerateSecrets(projectPath);
        return formatAutoGenerateResult(result);
      }

      case 'help':
      case '':
        return [
          'Generator — Local secret & artifact generation',
          LINE.repeat(60),
          '',
          '  Tokens & Auth:',
          '    /generate jwt [--sub X --role Y --exp 24h --alg RS256]',
          '    /generate jwt --decode <token>',
          '    /generate keypair [--alg RS256|ES256 --dir .keys]',
          '    /generate apikey [--prefix sk --count 5]',
          '    /generate totp',
          '',
          '  Secrets & Passwords:',
          '    /generate secret [--length 64 --encoding hex|base64]',
          '    /generate password [--length 32 --no-special]',
          '    /generate webhook-secret',
          '    /generate uuid [--count 10]',
          '',
          '  Hashing:',
          '    /generate hash <input> [--algo sha256|sha512|scrypt]',
          '    /generate hmac --data <data> --secret <key>',
          '',
          '  Environment:',
          '    /generate env [api|fullstack|minimal]',
          '    /generate env list',
          '    /generate auto                     Auto-fill empty secrets in .env',
          '',
          '  All generation is local — no secrets leave your machine.',
          '',
        ].join('\n');

      default:
        return `  Unknown generator "${subcommand}". Run /generate help.`;
    }
  },
};
