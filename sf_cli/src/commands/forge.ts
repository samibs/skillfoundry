import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SlashCommand, SessionContext } from '../types.js';
import { runAllGates } from '../core/gates.js';

function scanPRDs(workDir: string): Array<{ file: string; title: string; status: string }> {
  const genesisDir = join(workDir, 'genesis');
  if (!existsSync(genesisDir)) return [];

  return readdirSync(genesisDir)
    .filter((f) => f.endsWith('.md') && f !== 'TEMPLATE.md' && !f.startsWith('TEMPLATES'))
    .map((f) => {
      const content = readFileSync(join(genesisDir, f), 'utf-8');
      const titleMatch = content.match(/^#\s+(.+)/m);
      const statusMatch = content.match(/status:\s*(\w+)/i);
      return {
        file: f,
        title: titleMatch?.[1] || f,
        status: statusMatch?.[1] || 'UNKNOWN',
      };
    });
}

function scanStories(workDir: string): Array<{ prd: string; stories: string[]; completed: number }> {
  const storiesDir = join(workDir, 'docs', 'stories');
  if (!existsSync(storiesDir)) return [];

  return readdirSync(storiesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const storyDir = join(storiesDir, d.name);
      const storyFiles = readdirSync(storyDir).filter((f) =>
        f.startsWith('STORY-') && f.endsWith('.md'),
      );

      let completed = 0;
      for (const sf of storyFiles) {
        const content = readFileSync(join(storyDir, sf), 'utf-8');
        if (content.match(/status:\s*(DONE|COMPLETED|IMPLEMENTED)/i)) {
          completed++;
        }
      }

      return {
        prd: d.name,
        stories: storyFiles,
        completed,
      };
    });
}

function formatGateLine(tier: string, name: string, status: string, detail: string): string {
  const icon = status === 'pass' ? 'v' : status === 'fail' ? 'x' : status === 'warn' ? '!' : '-';
  return `  ${tier} [${icon}] ${name}${detail ? ': ' + detail.split('\n')[0].slice(0, 60) : ''}`;
}

export const forgeCommand: SlashCommand = {
  name: 'forge',
  description: 'Full pipeline: validate PRDs, check stories, run quality gates',
  usage: '/forge [prd-file]',
  execute: async (args: string, session: SessionContext): Promise<string> => {
    const lines: string[] = [
      '',
      'The Forge',
      '==============================',
      '',
    ];

    // Phase 1: IGNITE — Scan PRDs
    lines.push('Phase 1 (Ignite): PRD Validation');
    lines.push('------------------------------');

    const prds = scanPRDs(session.workDir);
    if (prds.length === 0) {
      lines.push('  No PRDs found in genesis/');
      lines.push('  Create one with: /plan <task description>');
      lines.push('');
    } else {
      for (const prd of prds) {
        const icon = prd.status === 'APPROVED' ? 'v' : prd.status === 'DRAFT' ? '~' : '?';
        lines.push(`  [${icon}] ${prd.title} (${prd.status})`);
      }
      lines.push(`  Total: ${prds.length} PRDs`);
      lines.push('');
    }

    // Phase 2: FORGE — Check Stories
    lines.push('Phase 2 (Forge): Story Status');
    lines.push('------------------------------');

    const storyGroups = scanStories(session.workDir);
    if (storyGroups.length === 0) {
      lines.push('  No stories found in docs/stories/');
      lines.push('');
    } else {
      let totalStories = 0;
      let totalCompleted = 0;
      for (const group of storyGroups) {
        totalStories += group.stories.length;
        totalCompleted += group.completed;
        lines.push(`  ${group.prd}: ${group.completed}/${group.stories.length} stories done`);
      }
      lines.push(`  Total: ${totalCompleted}/${totalStories} stories completed`);
      lines.push('');
    }

    // Phase 3: TEMPER — Quality Gates
    lines.push('Phase 3 (Temper): Quality Gates');
    lines.push('------------------------------');

    const gateSummary = await runAllGates({
      workDir: session.workDir,
      target: '.',
    });

    for (const gate of gateSummary.gates) {
      lines.push(formatGateLine(gate.tier, gate.name, gate.status, gate.status !== 'pass' && gate.status !== 'skip' ? gate.detail : ''));
    }

    lines.push(`  VERDICT: ${gateSummary.verdict} | ${gateSummary.passed}P ${gateSummary.failed}F ${gateSummary.warned}W ${gateSummary.skipped}S`);
    lines.push('');

    // Phase 4: INSPECT — Security (T4 already ran as part of gates)
    lines.push('Phase 4 (Inspect): Security');
    lines.push('------------------------------');
    const secGate = gateSummary.gates.find((g) => g.tier === 'T4');
    if (secGate) {
      lines.push(`  ${secGate.status === 'pass' ? '[v] Clean' : secGate.status === 'warn' ? '[!] Warnings found' : '[x] Issues found'}`);
      if (secGate.status !== 'pass' && secGate.detail) {
        lines.push(`  ${secGate.detail.split('\n')[0].slice(0, 80)}`);
      }
    } else {
      lines.push('  [-] Skipped');
    }
    lines.push('');

    // Phase 5: Summary
    lines.push('Phase 5 (Debrief): Summary');
    lines.push('------------------------------');
    lines.push(`  PRDs:       ${prds.length} found`);

    const totalStories = storyGroups.reduce((s, g) => s + g.stories.length, 0);
    const doneStories = storyGroups.reduce((s, g) => s + g.completed, 0);
    lines.push(`  Stories:    ${doneStories}/${totalStories} completed`);
    lines.push(`  Gates:      ${gateSummary.verdict}`);
    lines.push(`  Security:   ${secGate?.status === 'pass' ? 'clean' : secGate?.status || 'unknown'}`);
    lines.push('');

    // Overall status
    const overallPass = gateSummary.verdict !== 'FAIL';
    lines.push('==============================');
    lines.push(overallPass
      ? '  Status: FORGED — Pipeline passing'
      : '  Status: BLOCKED — Fix failures before proceeding',
    );

    session.setState({
      current_state: overallPass ? 'COMPLETED' : 'FAILED',
    });

    return lines.join('\n');
  },
};
