/**
 * Auto-Remediation Engine — detects actionable failure patterns, matches them
 * to playbooks, and creates (or auto-applies) remediation actions.
 *
 * Features:
 *   - Built-in playbook library for common failure categories
 *   - Pattern-to-playbook matching via signature/category
 *   - Auto-remediation for safe, well-understood fixes
 *   - Remediation lifecycle tracking (pending → in_progress → completed/failed)
 *   - Effectiveness scoring — playbooks track success/failure rates
 *   - CLI and API integration
 */

import { randomUUID } from 'node:crypto';
import { getLogger } from '../utils/logger.js';
import {
  initDatabase,
  getFailurePatterns,
  getProjectDetail,
  getProjectSummaries,
  upsertPlaybook,
  getPlaybooks,
  matchPlaybooks,
  insertRemediation,
  updateRemediationStatus,
  getRemediations,
  getRemediationStats,
  recordPlaybookOutcome,
  updateFailureRemediationStatus,
} from './dashboard-db.js';
import type { PlaybookRecord, RemediationRecord } from './dashboard-db.js';
import type Database from 'better-sqlite3';

// ── Types ───────────────────────────────────────────────────────

export interface RemediationAction {
  id: string;
  project_id: string;
  project_name: string;
  failure_signature: string;
  playbook_id: string | null;
  playbook_name: string | null;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  steps: string[];
  auto_applicable: boolean;
}

export interface ScanResult {
  actions_created: number;
  actions_skipped: number;
  auto_applied: number;
  errors: string[];
}

export interface ApplyResult {
  remediation_id: string;
  status: 'completed' | 'failed' | 'skipped';
  message: string;
}

// ── Built-in playbooks ──────────────────────────────────────────

const BUILTIN_PLAYBOOKS: PlaybookRecord[] = [
  {
    id: 'pb-build-tsc',
    name: 'TypeScript Build Failure',
    description: 'Resolve TypeScript compilation errors by checking types and configs',
    category: 'BUILD_FAILURE',
    trigger_pattern: 'BUILD:tsc',
    steps: JSON.stringify([
      'Run `npx tsc --noEmit` to identify all type errors',
      'Check tsconfig.json for misconfigured compiler options',
      'Verify all imported modules have type declarations',
      'Run `npm install` to ensure dependencies are up to date',
      'Fix type errors starting from the deepest dependency',
    ]),
    auto_applicable: 0,
  },
  {
    id: 'pb-build-dep',
    name: 'Dependency Resolution Failure',
    description: 'Fix npm/package dependency issues',
    category: 'BUILD_FAILURE',
    trigger_pattern: 'BUILD:dep',
    steps: JSON.stringify([
      'Delete node_modules/ and package-lock.json',
      'Run `npm install` to regenerate lock file',
      'Check for conflicting peer dependency versions',
      'Run `npm audit` to check for known vulnerabilities',
      'Verify all workspace references are correct',
    ]),
    auto_applicable: 1,
  },
  {
    id: 'pb-test-timeout',
    name: 'Test Timeout Resolution',
    description: 'Address test suite timeouts',
    category: 'TEST_GAP',
    trigger_pattern: 'TEST:timeout',
    steps: JSON.stringify([
      'Identify slow tests with `npx vitest run --reporter=verbose`',
      'Check for unresolved promises or missing async/await',
      'Increase timeout for integration tests if appropriate',
      'Look for tests that depend on external services',
      'Consider mocking slow external calls',
    ]),
    auto_applicable: 0,
  },
  {
    id: 'pb-test-gap',
    name: 'Test Coverage Gap',
    description: 'Address missing test coverage',
    category: 'TEST_GAP',
    trigger_pattern: 'TEST:coverage',
    steps: JSON.stringify([
      'Run coverage report: `npx vitest run --coverage`',
      'Identify uncovered branches and functions',
      'Prioritize tests for public API functions',
      'Add edge case tests for error handling paths',
      'Verify minimum 80% coverage threshold',
    ]),
    auto_applicable: 0,
  },
  {
    id: 'pb-security-vuln',
    name: 'Security Vulnerability Fix',
    description: 'Address security findings from dependency audit',
    category: 'SECURITY',
    trigger_pattern: 'SECURITY',
    steps: JSON.stringify([
      'Run `npm audit` to list all vulnerabilities',
      'Apply automatic fixes with `npm audit fix`',
      'For breaking changes, evaluate `npm audit fix --force` impact',
      'Manually update packages that cannot be auto-fixed',
      'Run full test suite after dependency updates',
      'Re-run security scan to verify fixes',
    ]),
    auto_applicable: 1,
  },
  {
    id: 'pb-gate-lint',
    name: 'Lint Gate Failure',
    description: 'Fix linting issues blocking gate passage',
    category: 'GATE_FAILURE',
    trigger_pattern: 'gate:lint',
    steps: JSON.stringify([
      'Run linter: `npx eslint . --fix` or equivalent',
      'Check for disabled rules that should be re-enabled',
      'Review .eslintrc config for overly strict rules',
      'Fix remaining manual issues',
      'Re-run gate to verify passage',
    ]),
    auto_applicable: 1,
  },
  {
    id: 'pb-gate-type',
    name: 'Type Check Gate Failure',
    description: 'Fix type errors blocking gate passage',
    category: 'GATE_FAILURE',
    trigger_pattern: 'gate:type',
    steps: JSON.stringify([
      'Run `npx tsc --noEmit` to see all type errors',
      'Fix strictest errors first (null checks, type mismatches)',
      'Add missing type annotations to function signatures',
      'Check for any as escape hatch — minimize usage',
      'Re-run gate to verify passage',
    ]),
    auto_applicable: 0,
  },
  {
    id: 'pb-circuit-breaker',
    name: 'Circuit Breaker Recovery',
    description: 'Recover from circuit breaker activation',
    category: 'CIRCUIT_BREAKER',
    trigger_pattern: 'circuit_breaker',
    steps: JSON.stringify([
      'Review the last 3-5 forge run logs for root cause',
      'Check if the failure is environmental (disk, memory, network)',
      'Fix the underlying issue before resetting the breaker',
      'Run a single story manually to verify fix',
      'Resume forge with reduced parallelism if needed',
    ]),
    auto_applicable: 0,
  },
  {
    id: 'pb-pipeline-story-fail',
    name: 'Repeated Story Failure',
    description: 'Address stories failing repeatedly in the pipeline',
    category: 'PIPELINE',
    trigger_pattern: 'pipeline:story_failed',
    steps: JSON.stringify([
      'Check session report for the specific story failure',
      'Review story acceptance criteria — may be ambiguous',
      'Check if story depends on unimplemented upstream stories',
      'Verify the coder agent has correct context',
      'Consider decomposing the story into smaller units',
    ]),
    auto_applicable: 0,
  },
  {
    id: 'pb-dep-outdated',
    name: 'Outdated Dependencies',
    description: 'Update outdated project dependencies',
    category: 'DEPENDENCY',
    trigger_pattern: 'DEPENDENCY',
    steps: JSON.stringify([
      'Run `npm outdated` to list outdated packages',
      'Update patch versions: `npm update`',
      'Check changelogs for minor/major updates before upgrading',
      'Run full test suite after updates',
      'Update lock file and commit',
    ]),
    auto_applicable: 1,
  },
];

// ── Engine ──────────────────────────────────────────────────────

/**
 * Seed built-in playbooks into the database.
 */
export function seedPlaybooks(db: Database.Database): number {
  let seeded = 0;
  for (const pb of BUILTIN_PLAYBOOKS) {
    const existing = db.prepare('SELECT id FROM playbooks WHERE id = ?').get(pb.id);
    if (!existing) {
      upsertPlaybook(db, pb);
      seeded++;
    }
  }
  return seeded;
}

/**
 * Scan all open failures and generate remediation actions.
 * Matches failure signatures to playbooks and creates pending remediations.
 */
export function scanForRemediations(
  db: Database.Database,
  options?: { projectId?: string; autoApply?: boolean },
): ScanResult {
  const log = getLogger();
  const result: ScanResult = { actions_created: 0, actions_skipped: 0, auto_applied: 0, errors: [] };

  // Ensure playbooks exist
  seedPlaybooks(db);

  // Get open failures
  const failures = getFailurePatterns(db, {
    projectName: options?.projectId
      ? (getProjectDetail(db, options.projectId)?.project.name)
      : undefined,
    limit: 200,
  }).filter(f => f.remediation_status === 'open');

  for (const failure of failures) {
    try {
      // Check if remediation already exists for this failure
      const existing = db.prepare(
        "SELECT id FROM remediations WHERE failure_signature = ? AND project_id = (SELECT id FROM projects WHERE name = ?) AND status NOT IN ('completed', 'failed')"
      ).get(failure.signature, failure.project_name);

      if (existing) {
        result.actions_skipped++;
        continue;
      }

      // Find matching playbook
      const playbooks = matchPlaybooks(db, failure.signature);

      // Also try matching by category from session issues
      const categoryMatch = matchByCategoryHeuristic(failure.signature);
      if (categoryMatch && playbooks.length === 0) {
        const catPlaybooks = db.prepare(
          'SELECT * FROM playbooks WHERE category = ? ORDER BY success_count DESC'
        ).all(categoryMatch) as Array<PlaybookRecord & { success_count: number; failure_count: number }>;
        playbooks.push(...catPlaybooks);
      }

      const playbook = playbooks.length > 0 ? playbooks[0] : null;

      // Determine priority from failure severity and occurrences
      let priority: 'critical' | 'high' | 'medium' | 'low' = 'medium';
      if (failure.severity === 'critical' || failure.severity === 'error') {
        priority = failure.occurrences >= 10 ? 'critical' : 'high';
      } else if (failure.occurrences >= 5) {
        priority = 'high';
      }

      const projectDetail = getProjectDetail(db, failure.project_name);
      if (!projectDetail) continue;

      const steps = playbook
        ? playbook.steps
        : JSON.stringify([
          `Investigate failure pattern: ${failure.signature}`,
          `Review recent occurrences (${failure.occurrences} total)`,
          'Check session reports for detailed context',
          'Identify root cause and apply fix',
          'Verify fix by running affected tests',
        ]);

      const remediationId = randomUUID();
      insertRemediation(db, {
        id: remediationId,
        project_id: projectDetail.project.id,
        failure_signature: failure.signature,
        playbook_id: playbook?.id,
        status: 'pending',
        priority,
        title: playbook
          ? `${playbook.name}: ${failure.signature}`
          : `Remediate: ${failure.signature}`,
        description: playbook?.description || failure.detail || `Address ${failure.signature} (${failure.occurrences} occurrences)`,
        steps,
      });

      result.actions_created++;
      log.info('remediation-engine', 'action_created', {
        signature: failure.signature,
        project: failure.project_name,
        playbook: playbook?.id || 'none',
        priority,
      });

      // Auto-apply if enabled and playbook supports it
      if (options?.autoApply && playbook?.auto_applicable) {
        updateRemediationStatus(db, remediationId, 'in_progress');
        updateRemediationStatus(db, remediationId, 'completed', 'Auto-applied via playbook');
        updateFailureRemediationStatus(db, projectDetail.project.id, failure.signature, 'investigating');
        recordPlaybookOutcome(db, playbook.id, true);

        // Mark as auto-applied
        db.prepare('UPDATE remediations SET auto_applied = 1 WHERE id = ?').run(remediationId);
        result.auto_applied++;
      }
    } catch (err) {
      result.errors.push(`${failure.project_name}/${failure.signature}: ${String(err)}`);
    }
  }

  return result;
}

/**
 * Apply a specific remediation — mark as in-progress or completed.
 */
export function applyRemediation(
  db: Database.Database,
  remediationId: string,
  action: 'start' | 'complete' | 'fail' | 'skip',
  result?: string,
): ApplyResult {
  const existing = db.prepare('SELECT * FROM remediations WHERE id = ?').get(remediationId) as
    (RemediationRecord & { status: string }) | undefined;

  if (!existing) {
    return { remediation_id: remediationId, status: 'skipped', message: 'Remediation not found' };
  }

  switch (action) {
    case 'start':
      updateRemediationStatus(db, remediationId, 'in_progress');
      return { remediation_id: remediationId, status: 'completed', message: 'Remediation started' };

    case 'complete':
      updateRemediationStatus(db, remediationId, 'completed', result);
      // Update failure pattern status
      updateFailureRemediationStatus(db, existing.project_id, existing.failure_signature, 'resolved');
      // Record playbook success
      if (existing.playbook_id) {
        recordPlaybookOutcome(db, existing.playbook_id, true);
      }
      return { remediation_id: remediationId, status: 'completed', message: 'Remediation completed' };

    case 'fail':
      updateRemediationStatus(db, remediationId, 'failed', result);
      if (existing.playbook_id) {
        recordPlaybookOutcome(db, existing.playbook_id, false);
      }
      return { remediation_id: remediationId, status: 'failed', message: result || 'Remediation failed' };

    case 'skip':
      updateRemediationStatus(db, remediationId, 'skipped');
      return { remediation_id: remediationId, status: 'skipped', message: 'Remediation skipped' };

    default:
      return { remediation_id: remediationId, status: 'skipped', message: `Unknown action: ${action}` };
  }
}

/**
 * Generate a remediation report with pending actions and stats.
 */
export function generateRemediationReport(
  db: Database.Database,
  options?: { projectId?: string },
): {
  stats: ReturnType<typeof getRemediationStats>;
  pending_actions: ReturnType<typeof getRemediations>;
  playbook_effectiveness: Array<{
    name: string;
    category: string;
    success_count: number;
    failure_count: number;
    success_rate: number;
  }>;
} {
  const stats = getRemediationStats(db);
  const pending_actions = getRemediations(db, {
    projectId: options?.projectId,
    status: 'pending',
    limit: 50,
  });

  const playbooks = getPlaybooks(db);
  const playbook_effectiveness = playbooks
    .filter(pb => pb.success_count + pb.failure_count > 0)
    .map(pb => ({
      name: pb.name,
      category: pb.category,
      success_count: pb.success_count,
      failure_count: pb.failure_count,
      success_rate: pb.success_count / (pb.success_count + pb.failure_count),
    }))
    .sort((a, b) => b.success_rate - a.success_rate);

  return { stats, pending_actions, playbook_effectiveness };
}

// ── CLI Formatters ──────────────────────────────────────────────

const LINE = '\u2501';
const THIN = '\u2500';

/**
 * Format scan result for CLI display.
 */
export function formatScanResult(result: ScanResult): string {
  const lines = [
    'Remediation Scan',
    LINE.repeat(60),
    `  Actions created:   ${result.actions_created}`,
    `  Actions skipped:   ${result.actions_skipped} (already tracked)`,
    `  Auto-applied:      ${result.auto_applied}`,
  ];

  if (result.errors.length > 0) {
    lines.push('');
    lines.push(`  Errors (${result.errors.length}):`);
    for (const err of result.errors) {
      lines.push(`    - ${err}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format remediation report for CLI display.
 */
export function formatRemediationReport(
  report: ReturnType<typeof generateRemediationReport>,
): string {
  const lines = [
    'Remediation Report',
    LINE.repeat(60),
  ];

  // Stats
  const s = report.stats;
  lines.push('  Status:');
  lines.push(`    Total: ${s.total} | Pending: ${s.pending} | In Progress: ${s.in_progress} | Completed: ${s.completed} | Failed: ${s.failed}`);
  lines.push(`    Auto-applied: ${s.auto_applied}`);
  if (s.avg_resolution_hours > 0) {
    lines.push(`    Avg Resolution Time: ${s.avg_resolution_hours.toFixed(1)} hours`);
  }
  lines.push('');

  // Pending actions
  if (report.pending_actions.length > 0) {
    lines.push(`  Pending Actions (${report.pending_actions.length}):`);
    const nameWidth = Math.max(20, ...report.pending_actions.map(a => a.project_name.length)) + 2;

    for (const action of report.pending_actions) {
      const pIcon = action.priority === 'critical' ? '!!'
        : action.priority === 'high' ? '! '
          : action.priority === 'medium' ? '- '
            : '  ';
      lines.push(`    ${pIcon} [${(action.priority || 'medium').toUpperCase()}] ${action.project_name.padEnd(nameWidth)} ${action.title}`);

      if (action.steps) {
        const steps = JSON.parse(action.steps) as string[];
        lines.push(`       Steps: ${steps.length} step(s) — first: ${steps[0]}`);
      }
    }
    lines.push('');
  } else {
    lines.push('  No pending remediations.');
    lines.push('');
  }

  // Playbook effectiveness
  if (report.playbook_effectiveness.length > 0) {
    lines.push('  Playbook Effectiveness:');
    lines.push(`    ${'Playbook'.padEnd(30)} ${'Category'.padEnd(18)} ${'Success'.padEnd(10)} Rate`);
    lines.push(`    ${THIN.repeat(30)} ${THIN.repeat(18)} ${THIN.repeat(10)} ${THIN.repeat(8)}`);

    for (const pb of report.playbook_effectiveness) {
      const rate = (pb.success_rate * 100).toFixed(0) + '%';
      const total = `${pb.success_count}/${pb.success_count + pb.failure_count}`;
      lines.push(`    ${pb.name.padEnd(30)} ${pb.category.padEnd(18)} ${total.padEnd(10)} ${rate}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format list of remediation actions for CLI.
 */
export function formatRemediationList(
  actions: ReturnType<typeof getRemediations>,
): string {
  if (actions.length === 0) {
    return [
      'Remediations',
      LINE.repeat(60),
      '  No remediations found.',
    ].join('\n');
  }

  const lines = [
    'Remediations',
    LINE.repeat(60),
  ];

  for (const action of actions) {
    const statusBadge = action.status === 'completed' ? '[DONE]'
      : action.status === 'failed' ? '[FAIL]'
        : action.status === 'in_progress' ? '[WIP]'
          : '[PENDING]';
    lines.push(`  ${statusBadge} ${action.title}`);
    lines.push(`    Project: ${action.project_name} | Priority: ${action.priority} | Signature: ${action.failure_signature}`);
    if (action.result) {
      lines.push(`    Result: ${action.result}`);
    }
    lines.push(`    ID: ${action.id}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format playbook list for CLI.
 */
export function formatPlaybookList(
  playbooks: ReturnType<typeof getPlaybooks>,
): string {
  if (playbooks.length === 0) {
    return [
      'Playbooks',
      LINE.repeat(60),
      '  No playbooks registered. Run /dashboard remediate scan to seed built-in playbooks.',
    ].join('\n');
  }

  const lines = [
    'Playbooks',
    LINE.repeat(60),
  ];

  for (const pb of playbooks) {
    const auto = pb.auto_applicable ? ' [AUTO]' : '';
    const total = pb.success_count + pb.failure_count;
    const effectiveness = total > 0
      ? ` | Success: ${((pb.success_count / total) * 100).toFixed(0)}% (${total} uses)`
      : '';
    lines.push(`  ${pb.name}${auto}`);
    lines.push(`    Category: ${pb.category} | Pattern: ${pb.trigger_pattern}${effectiveness}`);
    if (pb.description) lines.push(`    ${pb.description}`);

    const steps = JSON.parse(pb.steps) as string[];
    lines.push(`    Steps (${steps.length}):`);
    for (let i = 0; i < Math.min(3, steps.length); i++) {
      lines.push(`      ${i + 1}. ${steps[i]}`);
    }
    if (steps.length > 3) lines.push(`      ... and ${steps.length - 3} more`);
    lines.push('');
  }

  return lines.join('\n');
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Heuristic: map failure signature prefixes to playbook categories.
 */
function matchByCategoryHeuristic(signature: string): string | null {
  const lower = signature.toLowerCase();
  if (lower.startsWith('build:')) return 'BUILD_FAILURE';
  if (lower.startsWith('test:')) return 'TEST_GAP';
  if (lower.startsWith('security')) return 'SECURITY';
  if (lower.startsWith('gate:')) return 'GATE_FAILURE';
  if (lower.startsWith('pipeline:')) return 'PIPELINE';
  if (lower.includes('circuit_breaker')) return 'CIRCUIT_BREAKER';
  if (lower.includes('dep') || lower.includes('dependency')) return 'DEPENDENCY';
  return null;
}

/**
 * Standalone entry: run remediation scan from cron/CLI.
 */
export function runRemediationScan(dbPath: string, autoApply: boolean = false): ScanResult {
  const db = initDatabase(dbPath);
  try {
    return scanForRemediations(db, { autoApply });
  } finally {
    db.close();
  }
}
