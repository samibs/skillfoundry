import type { SlashCommand, SessionContext, PipelineCallbacks, PipelineResult } from '../types.js';
import { runPipeline, scanPRDs, scanStories } from '../core/pipeline.js';
import { runAllGates } from '../core/gates.js';

// ── Dry-run: read-only scan (backward-compatible with pre-2.0.10) ──

async function runDryScan(session: SessionContext): Promise<string> {
  const lines: string[] = [
    '',
    'The Forge — Dry Run',
    '==============================',
    '',
  ];

  // Phase 1: Scan PRDs
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

  // Phase 2: Scan stories
  lines.push('Phase 2 (Plan): Story Status');
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

  // Phase 3: Quality gates
  lines.push('Phase 3 (Temper): Quality Gates');
  lines.push('------------------------------');

  const gateSummary = await runAllGates({
    workDir: session.workDir,
    target: '.',
  });

  for (const gate of gateSummary.gates) {
    const icon = gate.status === 'pass' ? 'v' : gate.status === 'fail' ? 'x' : gate.status === 'warn' ? '!' : '-';
    const detail = gate.status !== 'pass' && gate.status !== 'skip' && gate.detail
      ? ': ' + gate.detail.split('\n')[0].slice(0, 60)
      : '';
    lines.push(`  ${gate.tier} [${icon}] ${gate.name}${detail}`);
  }

  lines.push(`  VERDICT: ${gateSummary.verdict} | ${gateSummary.passed}P ${gateSummary.failed}F ${gateSummary.warned}W ${gateSummary.skipped}S`);
  lines.push('');

  // Phase 4: Security
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

  // Summary
  const overallPass = gateSummary.verdict !== 'FAIL';
  lines.push('==============================');
  lines.push(overallPass
    ? '  Status: FORGED — Pipeline passing (dry run, no changes made)'
    : '  Status: BLOCKED — Fix failures before running /forge',
  );

  return lines.join('\n');
}

// ── Pipeline result formatter ──────────────────────────────────

function formatPipelineResult(result: PipelineResult): string {
  const lines: string[] = [
    '',
    'The Forge — Complete',
    '==============================',
    '',
  ];

  for (const phase of result.phases) {
    const icon = phase.status === 'passed' ? 'v'
      : phase.status === 'failed' ? 'x'
      : phase.status === 'skipped' ? '-'
      : '?';
    const detail = phase.detail ? ` — ${phase.detail}` : '';
    const time = phase.durationMs > 0 ? ` (${(phase.durationMs / 1000).toFixed(1)}s)` : '';
    lines.push(`  [${icon}] ${phase.name}${detail}${time}`);
  }

  lines.push('');
  lines.push(`  Stories:    ${result.storiesCompleted}/${result.storiesTotal} completed`);
  if (result.storiesFailed > 0) {
    lines.push(`  Failed:     ${result.storiesFailed}`);
  }
  lines.push(`  Gates:      ${result.gateVerdict}`);
  lines.push(`  Cost:       $${result.totalCostUsd.toFixed(4)}`);
  lines.push(`  Tokens:     ${(result.totalTokens.input / 1000).toFixed(1)}k in / ${(result.totalTokens.output / 1000).toFixed(1)}k out`);
  lines.push(`  Duration:   ${(result.durationMs / 1000).toFixed(1)}s`);
  lines.push(`  Run:        ${result.runId}`);
  lines.push('');
  lines.push('==============================');

  const overallPass = result.storiesFailed === 0 && result.gateVerdict !== 'FAIL';
  lines.push(overallPass
    ? '  Status: FORGED — Ready for deployment'
    : '  Status: PARTIAL — Some stories or gates failed',
  );

  return lines.join('\n');
}

// ── The Forge command ──────────────────────────────────────────

export const forgeCommand: SlashCommand = {
  name: 'forge',
  description: 'Full pipeline: validate PRDs, generate stories, implement via AI, run quality gates',
  usage: '/forge [prd-file] [--dry-run]',
  execute: async (args: string, session: SessionContext): Promise<string> => {
    const dryRun = args.includes('--dry-run');
    const prdFilter = args.replace('--dry-run', '').trim() || undefined;

    // Dry-run: read-only scan (no AI, no execution)
    if (dryRun) {
      return runDryScan(session);
    }

    // Wire pipeline callbacks to session.addMessage() for real-time progress
    const callbacks: PipelineCallbacks = {
      onPhaseStart: (phase, detail) => {
        session.addMessage({
          role: 'system',
          content: `Phase: ${phase}${detail ? ' — ' + detail : ''}...`,
        });
      },
      onPhaseComplete: (phase, status) => {
        const icon = status === 'passed' ? '[v]' : status === 'failed' ? '[x]' : '[-]';
        session.addMessage({
          role: 'system',
          content: `  ${icon} ${phase}: ${status}`,
        });
      },
      onStoryStart: (story, idx, total) => {
        session.addMessage({
          role: 'system',
          content: `  Implementing ${story} (${idx + 1}/${total})...`,
        });
      },
      onStoryComplete: (story, passed, cost) => {
        const icon = passed ? '[v]' : '[x]';
        session.addMessage({
          role: 'system',
          content: `  ${icon} ${story} ($${cost.toFixed(4)})`,
        });
      },
      onGateResult: (tier, status) => {
        const icon = status === 'pass' ? 'v' : status === 'fail' ? 'x' : status === 'warn' ? '!' : '-';
        session.addMessage({
          role: 'system',
          content: `  ${tier} [${icon}]`,
        });
      },
    };

    session.setState({ current_state: 'EXECUTING_STORY' });

    const result = await runPipeline({
      config: session.config,
      policy: session.policy,
      workDir: session.workDir,
      prdFilter,
      callbacks,
    });

    session.setState({
      current_state: result.storiesFailed === 0 && result.gateVerdict !== 'FAIL' ? 'COMPLETED' : 'FAILED',
      last_run_id: result.runId,
    });

    return formatPipelineResult(result);
  },
};
