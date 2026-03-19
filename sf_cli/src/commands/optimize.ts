/**
 * Optimize CLI command — mutation-based skill prompt optimization.
 *
 * Usage:
 *   /optimize <skill-name> [--iterations N] [--time-budget S] [--apply] [--strategies s1,s2]
 *   /optimize list                 — List available mutation strategies
 *   /optimize history              — Show recent optimization experiments
 *   /optimize result <id>          — Show a specific experiment result
 */

import type { SlashCommand, SessionContext } from '../types.js';
import { resolve, join } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import {
  runExperiment,
  formatExperimentReport,
  formatStrategyList,
  parseSkillFile,
  reassembleSkillFile,
  persistExperiment,
  getRecentExperiments,
  getExperimentResults,
  getAllStrategies,
} from '../core/skill-optimizer.js';
import { initDatabase } from '../core/dashboard-db.js';

const LINE = '\u2501';
const DEFAULT_DB_PATH = 'data/dashboard.db';

function getDbPath(workDir: string): string {
  const { existsSync: ex } = require('node:fs');
  let dir = resolve(workDir);
  for (let i = 0; i < 10; i++) {
    if (ex(join(dir, '.project-registry'))) {
      return join(dir, DEFAULT_DB_PATH);
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return join(resolve(workDir), DEFAULT_DB_PATH);
}

function getFrameworkDir(workDir: string): string {
  const { existsSync: ex } = require('node:fs');
  let dir = resolve(workDir);
  for (let i = 0; i < 10; i++) {
    if (ex(join(dir, '.project-registry'))) {
      return dir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(workDir);
}

function findSkillFile(frameworkDir: string, skillName: string): string | null {
  const agentsDir = join(frameworkDir, 'agents');
  if (!existsSync(agentsDir)) return null;

  // Try exact match first
  const exact = join(agentsDir, `${skillName}.md`);
  if (existsSync(exact)) return exact;

  // Try common naming patterns
  const patterns = [
    `${skillName}.md`,
    `ruthless-${skillName}.md`,
    `${skillName}-specialist.md`,
    `${skillName}-orchestrator.md`,
  ];

  for (const p of patterns) {
    const path = join(agentsDir, p);
    if (existsSync(path)) return path;
  }

  // Search by command: frontmatter field
  const { readdirSync, readFileSync } = require('node:fs');
  try {
    const files = readdirSync(agentsDir) as string[];
    for (const f of files) {
      if (!f.endsWith('.md') || f.startsWith('_') || f.startsWith('INDEX')) continue;
      const content = readFileSync(join(agentsDir, f), 'utf-8') as string;
      const cmdMatch = content.match(/^command:\s*(.+)$/m);
      if (cmdMatch && cmdMatch[1].trim() === skillName) {
        return join(agentsDir, f);
      }
    }
  } catch {
    // ignore read errors
  }

  return null;
}

function parseArgs(args: string): {
  subcommand: string;
  skillName: string;
  flags: Record<string, string>;
} {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  const flags: Record<string, string> = {};
  let subcommand = '';
  let skillName = '';

  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('--')) {
      const key = parts[i].slice(2);
      if (key === 'apply' || key === 'json' || key === 'dry-run') {
        flags[key] = 'true';
      } else if (i + 1 < parts.length && !parts[i + 1].startsWith('--')) {
        flags[key] = parts[i + 1];
        i++;
      } else {
        flags[key] = 'true';
      }
    } else if (!subcommand) {
      subcommand = parts[i];
    } else if (!skillName) {
      skillName = parts[i];
    }
  }

  return { subcommand, skillName, flags };
}

export const optimizeCommand: SlashCommand = {
  name: 'optimize',
  description: 'Mutation-based skill prompt optimization (autoresearch pattern)',
  usage: '/optimize <skill-name> [--iterations N] [--time-budget S] [--apply] [--strategies s1,s2]',
  async execute(args: string, session: SessionContext): Promise<string> {
    const workDir = session?.workDir || process.cwd();
    const frameworkDir = getFrameworkDir(workDir);
    const dbPath = getDbPath(workDir);
    const { subcommand, skillName, flags } = parseArgs(args);

    switch (subcommand) {
      case 'list':
      case 'strategies':
        return formatStrategyList();

      case 'history': {
        const db = initDatabase(dbPath);
        try {
          const experiments = getRecentExperiments(db, 20);
          if (experiments.length === 0) return '  No optimization experiments found.';

          const lines = [
            'Optimization History',
            LINE.repeat(60),
            '',
            '  ID        Skill                  Score     Improvement  Status',
            '  ' + '\u2500'.repeat(56),
          ];

          for (const exp of experiments) {
            const id = exp.id.slice(0, 8);
            const skill = (exp.skill_name || '').padEnd(22).slice(0, 22);
            const score = (exp.best_score?.toFixed(3) || '0.000').padEnd(9);
            const impr = exp.improvement_pct >= 0
              ? `+${exp.improvement_pct.toFixed(1)}%`
              : `${exp.improvement_pct.toFixed(1)}%`;
            lines.push(`  ${id}  ${skill} ${score} ${impr.padEnd(12)} ${exp.status}`);
          }
          lines.push('');
          return lines.join('\n');
        } finally {
          db.close();
        }
      }

      case 'result': {
        if (!skillName) return '  Usage: /optimize result <experiment-id>';
        const db = initDatabase(dbPath);
        try {
          // Try prefix match
          const all = getRecentExperiments(db, 100);
          const match = all.find((e) => e.id.startsWith(skillName));
          if (!match) return `  Experiment "${skillName}" not found.`;

          const data = getExperimentResults(db, match.id);
          if (!data) return `  Experiment data not found.`;

          const lines = [
            `Experiment: ${data.experiment.id.slice(0, 8)} — ${data.experiment.skill_name}`,
            LINE.repeat(60),
            `  Status: ${data.experiment.status}`,
            `  Baseline: ${data.experiment.baseline_score?.toFixed(3)}`,
            `  Best:     ${data.experiment.best_score?.toFixed(3)} (+${data.experiment.improvement_pct?.toFixed(1)}%)`,
            `  Iterations: ${data.experiment.total_iterations}`,
            '',
          ];

          for (const iter of data.iterations) {
            const kept = iter.kept ? 'KEEP' : 'SKIP';
            lines.push(`  ${String(iter.iteration_number).padStart(2)}. ${iter.mutation_strategy.padEnd(25)} ${iter.composite_score.toFixed(3)} ${kept}`);
            if (iter.mutation_detail) {
              lines.push(`      ${iter.mutation_detail}`);
            }
          }
          lines.push('');
          return lines.join('\n');
        } finally {
          db.close();
        }
      }

      case 'help':
      case '':
        return [
          'Skill Optimizer — Autoresearch-inspired prompt mutation loop',
          LINE.repeat(60),
          '',
          '  Usage:',
          '    /optimize <skill-name>                     Run optimization (8 strategies x 2 cycles)',
          '    /optimize <skill-name> --iterations 20     Custom iteration count',
          '    /optimize <skill-name> --time-budget 60    Time limit in seconds',
          '    /optimize <skill-name> --apply             Write best prompt back to file',
          '    /optimize <skill-name> --strategies s1,s2  Use specific strategies only',
          '    /optimize list                             List mutation strategies',
          '    /optimize history                          Show recent experiments',
          '    /optimize result <id>                      Show experiment details',
          '',
          '  How it works:',
          '    1. Load skill prompt from agents/<name>.md',
          '    2. Evaluate baseline (6 structural quality gates)',
          '    3. Apply deterministic mutations (reorder, sharpen, prune, etc.)',
          '    4. Score each mutation: gate quality (70%) + efficiency (30%)',
          '    5. Keep improvements, revert regressions',
          '    6. Report results and optionally apply best prompt',
          '',
        ].join('\n');

      default: {
        // subcommand is the skill name
        const targetSkill = subcommand;
        const skillPath = findSkillFile(frameworkDir, targetSkill);

        if (!skillPath) {
          return `  Skill "${targetSkill}" not found in ${join(frameworkDir, 'agents/')}\n  Run /optimize list to see available strategies, or check the skill name.`;
        }

        const maxIterations = flags.iterations ? parseInt(flags.iterations, 10) : 16;
        const timeBudgetSec = flags['time-budget'] ? parseInt(flags['time-budget'], 10) : 120;
        const selectedStrategies = flags.strategies ? flags.strategies.split(',') : undefined;
        const applyResult = flags.apply === 'true';

        const result = runExperiment({
          skillPath,
          scenario: flags.scenario || 'default',
          maxIterations,
          timeBudgetMs: timeBudgetSec * 1000,
          strategies: selectedStrategies,
        });

        // Persist to DB
        try {
          const db = initDatabase(dbPath);
          try {
            persistExperiment(db, result, flags.scenario || 'structural optimization');
          } finally {
            db.close();
          }
        } catch {
          // DB persistence is non-critical
        }

        // Apply if requested
        if (applyResult && result.improvementPct > 0) {
          const skill = parseSkillFile(skillPath);
          skill.body = result.bestPrompt;
          writeFileSync(skillPath, reassembleSkillFile(skill), 'utf-8');
        }

        let output = formatExperimentReport(result);

        if (applyResult && result.improvementPct > 0) {
          output += `  Applied: Best prompt written to ${skillPath}\n`;
        } else if (applyResult && result.improvementPct <= 0) {
          output += `  No improvement found — original prompt unchanged.\n`;
        } else if (result.improvementPct > 0) {
          output += `  Run /optimize ${targetSkill} --apply to write the optimized prompt.\n`;
        }

        return output;
      }
    }
  },
};
