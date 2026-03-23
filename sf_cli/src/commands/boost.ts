/**
 * Boost CLI command — fast code transforms without LLM.
 */

import type { SlashCommand, SessionContext } from '../types.js';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  boostCode,
  boostFile,
  formatBoostReport,
  formatTransformList,
  getTransformList,
} from '../core/code-booster.js';
import type { TransformId } from '../core/code-booster.js';

const LINE = '\u2501';

export const boostCommand: SlashCommand = {
  name: 'boost',
  description: 'Fast code transforms without LLM (var→const, add types, wrap async, etc.)',
  usage: '/boost <file> [--dry-run] [--transforms t1,t2] [--all] | /boost list',
  async execute(args: string, session: SessionContext): Promise<string> {
    const parts = args.trim().split(/\s+/).filter(Boolean);
    const flags: Record<string, string> = {};
    let target = '';

    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith('--')) {
        const key = parts[i].slice(2);
        if (key === 'dry-run' || key === 'all') {
          flags[key] = 'true';
        } else if (i + 1 < parts.length && !parts[i + 1].startsWith('--')) {
          flags[key] = parts[i + 1];
          i++;
        }
      } else if (!target) {
        target = parts[i];
      }
    }

    if (target === 'list' || target === 'strategies') {
      return formatTransformList();
    }

    if (target === 'help' || !target) {
      return [
        'Code Booster — Fast transforms without LLM',
        LINE.repeat(60),
        '',
        '  Usage:',
        '    /boost <file>                       Detect and apply transforms',
        '    /boost <file> --dry-run             Show what would change',
        '    /boost <file> --transforms t1,t2    Apply specific transforms',
        '    /boost list                         List available transforms',
        '',
        '  Transforms: var-to-const, add-types, wrap-async, add-export, require-to-import, add-jsdoc',
        '',
      ].join('\n');
    }

    const filePath = resolve(session?.workDir || process.cwd(), target);
    if (!existsSync(filePath)) {
      return `  File not found: ${filePath}`;
    }

    const transforms = flags.transforms
      ? flags.transforms.split(',') as TransformId[]
      : undefined;
    const dryRun = flags['dry-run'] === 'true';

    const result = boostFile(filePath, { transforms, dryRun });

    if (!dryRun && result.totalChanges > 0) {
      writeFileSync(filePath, result.transformedCode, 'utf-8');
    }

    let output = formatBoostReport(result);
    if (!dryRun && result.totalChanges > 0) {
      output += `  Written to: ${filePath}\n`;
    } else if (dryRun) {
      output += '  (dry run — no files changed)\n';
    }

    return output;
  },
};
