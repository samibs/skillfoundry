/**
 * Domain CLI command — Industry Knowledge Pack management and queries.
 */

import type { SlashCommand, SessionContext } from '../types.js';
import { resolve, join } from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  listInstalledPacks,
  searchRules,
  explainTopic,
  getRuleById,
  loadMatrix,
  validateFile,
  generateDomainPrd,
  formatPackList,
  formatExplainResponse,
  formatSearchResults,
  formatViolations,
  formatMatrixData,
} from '../core/domain-engine.js';

const LINE = '\u2501';

function getFrameworkDir(workDir: string): string {
  const { existsSync: ex } = require('node:fs');
  let dir = resolve(workDir);
  for (let i = 0; i < 10; i++) {
    if (ex(join(dir, '.project-registry'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(workDir);
}

export const domainCommand: SlashCommand = {
  name: 'domain',
  description: 'Industry Knowledge Engine — query, validate, and generate from domain packs',
  usage: '/domain explain <topic> | /domain validate <file> --pack <name> | /domain list | /domain search <query>',
  async execute(args: string, session: SessionContext): Promise<string> {
    const workDir = session?.workDir || process.cwd();
    const frameworkDir = getFrameworkDir(workDir);
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
      case 'list':
      case 'ls':
        return formatPackList(listInstalledPacks(frameworkDir));

      case 'info': {
        const packName = positional[0];
        if (!packName) return '  Usage: /domain info <pack-name>';
        const packs = listInstalledPacks(frameworkDir);
        const pack = packs.find((p) => p.metadata.name === packName);
        if (!pack) return `  Pack "${packName}" not found. Run /domain list to see installed packs.`;

        const lines = [
          `Pack: ${pack.metadata.name} v${pack.metadata.version}`,
          LINE.repeat(60),
          `  Title:        ${pack.metadata.title}`,
          `  Description:  ${pack.metadata.description}`,
          `  Jurisdiction: ${pack.metadata.jurisdiction.join(', ')}`,
          `  Industries:   ${pack.metadata.industries.join(', ')}`,
          `  Rules:        ${pack.ruleCount}`,
          `  Matrices:     ${pack.matrixCount}`,
          `  Examples:     ${pack.exampleCount}`,
          `  Last Updated: ${pack.metadata.last_updated}`,
          `  Path:         ${pack.path}`,
          '',
          `  ${pack.metadata.disclaimer}`,
          '',
        ];
        return lines.join('\n');
      }

      case 'explain': {
        const topic = positional.join(' ');
        if (!topic) return '  Usage: /domain explain <topic>';
        return formatExplainResponse(explainTopic(frameworkDir, topic));
      }

      case 'search': {
        const query = positional.join(' ');
        if (!query) return '  Usage: /domain search <keywords>';
        return formatSearchResults(searchRules(frameworkDir, query, flags.pack));
      }

      case 'cite': {
        const ruleId = positional[0];
        if (!ruleId) return '  Usage: /domain cite <rule-id>';
        const result = getRuleById(frameworkDir, ruleId);
        if (!result) return `  Rule "${ruleId}" not found.`;

        const r = result.rule;
        return [
          `Rule: ${r.id}`,
          LINE.repeat(60),
          `  Title:       ${r.title}`,
          `  Pack:        ${result.pack}`,
          `  Rule:        ${r.rule}`,
          `  Details:     ${r.details}`,
          `  Source:      ${r.source}`,
          `  URL:         ${r.source_url}`,
          `  Confidence:  ${r.confidence}`,
          `  Effective:   ${r.effective_date}`,
          `  Verified:    ${r.last_verified}`,
          `  Jurisdiction: ${r.jurisdiction}`,
          `  Tags:        ${r.tags.join(', ')}`,
          r.exceptions.length > 0 ? `  Exceptions:\n${r.exceptions.map((e) => `    - ${e}`).join('\n')}` : '',
          r.formula ? `  Formula:     ${r.formula}` : '',
          '',
        ].filter(Boolean).join('\n');
      }

      case 'matrix': {
        const query = positional.join(' ');
        if (!query) return '  Usage: /domain matrix <matrix-name> [--pack name]';
        const packs = listInstalledPacks(frameworkDir);
        for (const pack of packs) {
          if (flags.pack && pack.metadata.name !== flags.pack) continue;
          const matrix = loadMatrix(pack.path, query);
          if (matrix) return formatMatrixData(matrix);
        }
        return `  Matrix "${query}" not found. Check available packs with /domain list.`;
      }

      case 'validate': {
        const filePath = positional[0];
        if (!filePath) return '  Usage: /domain validate <file> --pack <name>';
        const packName = flags.pack;
        if (!packName) return '  Usage: /domain validate <file> --pack <name>';
        const fullPath = resolve(workDir, filePath);
        if (!existsSync(fullPath)) return `  File not found: ${fullPath}`;
        return formatViolations(validateFile(frameworkDir, fullPath, packName));
      }

      case 'prd': {
        const description = positional.join(' ');
        if (!description) return '  Usage: /domain prd <description>';
        const prd = generateDomainPrd(frameworkDir, description);
        const date = new Date().toISOString().slice(0, 10);
        const slug = description.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
        const prdPath = join(frameworkDir, 'genesis', `${date}-${slug}.md`);
        mkdirSync(join(frameworkDir, 'genesis'), { recursive: true });
        writeFileSync(prdPath, prd, 'utf-8');
        return `  Domain-aware PRD generated: ${prdPath}\n  Run /go to implement.\n`;
      }

      case 'help':
      case '':
        return [
          'Industry Knowledge Engine',
          LINE.repeat(60),
          '',
          '  Usage:',
          '    /domain list                             List installed packs',
          '    /domain info <pack>                      Pack details',
          '    /domain explain <topic>                  Query domain knowledge',
          '    /domain search <keywords>                Search across all packs',
          '    /domain cite <rule-id>                   Full citation for a rule',
          '    /domain matrix <name> [--pack name]      Get structured data table',
          '    /domain validate <file> --pack <name>    Validate code against pack rules',
          '    /domain prd <description>                Generate domain-aware PRD',
          '',
          '  Packs are stored in packs/<name>/ with rules.jsonl, reference.md, matrices/',
          '',
        ].join('\n');

      default:
        // Treat as explain if not a known subcommand
        const topic = [subcommand, ...positional].join(' ');
        return formatExplainResponse(explainTopic(frameworkDir, topic));
    }
  },
};
