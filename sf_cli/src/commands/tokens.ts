/**
 * Tokens CLI command — analyze and compress context to reduce token costs.
 */

import type { SlashCommand, SessionContext } from '../types.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  analyzeTokens,
  compressContext,
  formatAnalysisReport,
  formatCompressReport,
  getAllCompressionStrategies,
} from '../core/token-optimizer.js';
import type { CompressionStrategy } from '../core/token-optimizer.js';

const LINE = '\u2501';

export const tokensCommand: SlashCommand = {
  name: 'tokens',
  description: 'Analyze and compress context to reduce token costs',
  usage: '/tokens analyze <file> | /tokens compress <file> [--strategies s1,s2]',
  async execute(args: string, session: SessionContext): Promise<string> {
    const parts = args.trim().split(/\s+/).filter(Boolean);
    const flags: Record<string, string> = {};
    let subcommand = '';
    let target = '';

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
      } else if (!target) {
        target = parts[i];
      }
    }

    switch (subcommand) {
      case 'analyze': {
        if (!target) return '  Usage: /tokens analyze <file>';
        const filePath = resolve(session?.workDir || process.cwd(), target);
        if (!existsSync(filePath)) return `  File not found: ${filePath}`;
        const content = readFileSync(filePath, 'utf-8');
        return formatAnalysisReport(analyzeTokens(content));
      }

      case 'compress': {
        if (!target) return '  Usage: /tokens compress <file> [--strategies s1,s2] [--max-tokens N]';
        const filePath = resolve(session?.workDir || process.cwd(), target);
        if (!existsSync(filePath)) return `  File not found: ${filePath}`;
        const content = readFileSync(filePath, 'utf-8');

        const strategies = flags.strategies
          ? flags.strategies.split(',') as CompressionStrategy[]
          : undefined;
        const maxTokens = flags['max-tokens'] ? parseInt(flags['max-tokens'], 10) : undefined;

        const result = compressContext(content, { strategies, maxTokens });
        let output = formatCompressReport(result);

        if (flags.write === 'true' && result.totalSaved > 0) {
          writeFileSync(filePath, result.compressed, 'utf-8');
          output += `  Written compressed output to: ${filePath}\n`;
        }

        return output;
      }

      case 'strategies':
      case 'list': {
        const strats = getAllCompressionStrategies();
        const lines = [
          'Token Compression Strategies',
          LINE.repeat(60),
          '',
        ];
        for (const s of strats) {
          lines.push(`  ${s.id.padEnd(22)} ${s.description}`);
        }
        lines.push('');
        return lines.join('\n');
      }

      case 'help':
      case '':
        return [
          'Token Optimizer — Reduce context costs',
          LINE.repeat(60),
          '',
          '  Usage:',
          '    /tokens analyze <file>                    Token breakdown by section',
          '    /tokens compress <file>                   Compress with all strategies',
          '    /tokens compress <file> --strategies s1,s2  Specific strategies',
          '    /tokens compress <file> --max-tokens 4000   Compress until under target',
          '    /tokens compress <file> --write            Write compressed output',
          '    /tokens list                              List compression strategies',
          '',
          '  Strategies: strip-markdown, collapse-repeats, strip-comments,',
          '              truncate-files, dedup-instructions, compact-tables',
          '',
        ].join('\n');

      default:
        return `  Unknown subcommand "${subcommand}". Run /tokens help.`;
    }
  },
};
