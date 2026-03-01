import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import type { SlashCommand, SessionContext } from '../types.js';
import { runAllGates } from '../core/gates.js';
import type { GateRunSummary } from '../core/gates.js';

const PLANS_DIR = join('.skillfoundry', 'plans');
const RUNS_DIR = join('.skillfoundry', 'runs');

function getGitDiff(workDir: string): string {
  try {
    const staged = execSync('git diff --cached', { cwd: workDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const unstaged = execSync('git diff', { cwd: workDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return (staged + unstaged).trim();
  } catch {
    return '';
  }
}

function getChangedFiles(workDir: string): string[] {
  try {
    const output = execSync('git diff --name-only && git diff --cached --name-only', {
      cwd: workDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function formatGateSummary(summary: GateRunSummary): string {
  const lines = ['', '**Quality Gates (The Anvil)**', ''];
  for (const gate of summary.gates) {
    const icon = gate.status === 'pass' ? 'v' : gate.status === 'fail' ? 'x' : gate.status === 'warn' ? '!' : '-';
    const time = gate.durationMs > 0 ? ` (${(gate.durationMs / 1000).toFixed(1)}s)` : '';
    lines.push(`  ${gate.tier} [${icon}] ${gate.name}${time}`);
    if (gate.status === 'fail' && gate.detail) {
      const firstLine = gate.detail.split('\n')[0].slice(0, 80);
      lines.push(`       ${firstLine}`);
    }
  }
  lines.push('');
  lines.push(`  VERDICT: ${summary.verdict} | ${summary.passed}P ${summary.failed}F ${summary.warned}W ${summary.skipped}S | ${(summary.totalMs / 1000).toFixed(1)}s`);
  return lines.join('\n');
}

export const applyCommand: SlashCommand = {
  name: 'apply',
  description: 'Execute a plan with quality gate checks',
  usage: '/apply [plan-id]',
  execute: async (args: string, session: SessionContext): Promise<string> => {
    // Resolve plan ID
    const planId = args.trim() || session.state.last_plan_id;
    if (!planId) {
      return 'No plan to apply. Run /plan <task> first, or provide a plan ID: /apply <plan-id>';
    }

    const planFile = join(session.workDir, PLANS_DIR, `${planId}.md`);
    if (!existsSync(planFile)) {
      return `Plan not found: ${planFile}\nRun /plan <task> to create one.`;
    }

    const planContent = readFileSync(planFile, 'utf-8');
    const runId = `run-${Date.now()}-${randomUUID().slice(0, 8)}`;

    session.setState({
      current_state: 'EXECUTING_STORY',
      last_run_id: runId,
      last_plan_id: planId,
    });

    session.addMessage({
      role: 'system',
      content: `Applying plan ${planId} (run: ${runId})...`,
    });

    // Step 1: Pre-apply quality gates
    session.addMessage({ role: 'system', content: 'Running pre-apply quality gates...' });

    const preSummary = await runAllGates({
      workDir: session.workDir,
      target: '.',
    });

    const preGateOutput = formatGateSummary(preSummary);
    session.addMessage({ role: 'system', content: preGateOutput });

    if (preSummary.verdict === 'FAIL') {
      session.setState({ current_state: 'FAILED' });

      const runsDir = join(session.workDir, RUNS_DIR);
      if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });

      const runBundle = {
        run_id: runId,
        plan_id: planId,
        status: 'GATE_FAILURE',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        pre_gates: preSummary,
        post_gates: null,
        diff: null,
        files_changed: [],
      };
      writeFileSync(
        join(runsDir, `${runId}.json`),
        JSON.stringify(runBundle, null, 2),
      );

      return `Apply BLOCKED by quality gates. Fix the failures and try again.\nRun log: ${RUNS_DIR}/${runId}.json`;
    }

    // Step 2: Show plan summary and confirm
    const taskMatch = planContent.match(/\*\*Task:\*\*\s*(.+)/);
    const task = taskMatch?.[1] || 'unknown task';

    session.addMessage({
      role: 'system',
      content: `Pre-gates: ${preSummary.verdict}. Plan "${task}" ready for execution.\nThe AI will now implement the plan using available tools.`,
    });

    // Step 3: Execute via AI with tools (delegate to the stream hook)
    // The apply command returns the plan content so the caller can feed it to the AI
    session.setState({ current_state: 'EXECUTING_STORY' });

    // Step 4: Post-apply quality gates will run after AI completes
    // Store run metadata
    const runsDir = join(session.workDir, RUNS_DIR);
    if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });

    const diff = getGitDiff(session.workDir);
    const changedFiles = getChangedFiles(session.workDir);

    const runBundle = {
      run_id: runId,
      plan_id: planId,
      status: 'EXECUTING',
      started_at: new Date().toISOString(),
      completed_at: null,
      pre_gates: preSummary,
      post_gates: null,
      diff_summary: `${changedFiles.length} files changed`,
      files_changed: changedFiles,
    };

    writeFileSync(
      join(runsDir, `${runId}.json`),
      JSON.stringify(runBundle, null, 2),
    );

    // Return the plan content so the stream can execute it
    return [
      `Executing plan: ${planId}`,
      `Run ID: ${runId}`,
      '',
      'Instruct the AI to implement the plan. After implementation, run /gates to validate.',
      '',
      `Plan content available at: ${planFile}`,
    ].join('\n');
  },
};

export const gatesCommand: SlashCommand = {
  name: 'gates',
  description: 'Run T1-T6 quality gates on the current project',
  usage: '/gates [target]',
  execute: async (args: string, session: SessionContext): Promise<string> => {
    const target = args.trim() || '.';

    session.addMessage({ role: 'system', content: `Running quality gates on "${target}"...` });

    const summary = await runAllGates({
      workDir: session.workDir,
      target,
    });

    const output = formatGateSummary(summary);

    // If there's an active run, update it
    if (session.state.last_run_id) {
      const runFile = join(session.workDir, RUNS_DIR, `${session.state.last_run_id}.json`);
      if (existsSync(runFile)) {
        try {
          const runData = JSON.parse(readFileSync(runFile, 'utf-8'));
          runData.post_gates = summary;
          runData.completed_at = new Date().toISOString();
          runData.status = summary.verdict === 'FAIL' ? 'GATE_FAILURE' : 'COMPLETED';
          writeFileSync(runFile, JSON.stringify(runData, null, 2));
        } catch {
          // Non-critical — log write failure is ok
        }
      }

      session.setState({
        current_state: summary.verdict === 'FAIL' ? 'FAILED' : 'COMPLETED',
      });
    }

    return output;
  },
};
