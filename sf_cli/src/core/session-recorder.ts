// Session Recorder — captures issues, anomalies, and remediation actions during pipeline runs.
// Hooks into pipeline callbacks to build a structured issue report alongside the run bundle.
// Produces both JSON (machine-readable) and markdown (human-readable) reports.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  PipelineCallbacks,
  PipelineResult,
  MicroGateResult,
  FinisherCheckResult,
} from '../types.js';

// ── Types ──────────────────────────────────────────────────────

export type IssueSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type IssueCategory =
  | 'BLOCKER'          // Systemic failures that prevent progress
  | 'TEST_GAP'         // Missing or inadequate tests
  | 'BUILD_FAILURE'    // Compilation / build errors
  | 'SECURITY'         // Security vulnerabilities
  | 'QUALITY'          // Code quality issues
  | 'ANOMALY'          // Contradictions between status and evidence
  | 'CIRCUIT_BREAKER'  // Pipeline halted due to repeated failures
  | 'DEPENDENCY'       // Dependency resolution / installation problems
  | 'GATE_FAILURE';    // Quality gate failures

export interface SessionIssue {
  id: string;
  severity: IssueSeverity;
  category: IssueCategory;
  title: string;
  detail: string;
  story?: string;
  phase: string;
  occurredAt: string;
  remediation: string;
  relatedIssues: string[];
}

export interface SessionAnomaly {
  id: string;
  type: string;
  description: string;
  evidence: string[];
  detectedAt: string;
}

export interface SessionReport {
  runId: string;
  startedAt: string;
  completedAt: string;
  issues: SessionIssue[];
  anomalies: SessionAnomaly[];
  errorPatterns: ErrorPattern[];
  summary: SessionSummary;
}

export interface ErrorPattern {
  signature: string;
  occurrences: number;
  stories: string[];
  firstSeen: string;
  likelyRootCause: string;
}

export interface SessionSummary {
  totalIssues: number;
  bySeverity: Record<IssueSeverity, number>;
  byCategory: Record<string, number>;
  blockers: number;
  anomalies: number;
  storiesWithIssues: number;
  topRemediations: string[];
}

// ── Session Recorder ───────────────────────────────────────────

export class SessionRecorder {
  private runId: string;
  private startedAt: string;
  private issues: SessionIssue[] = [];
  private anomalies: SessionAnomaly[] = [];
  private errorSignatures: Map<string, ErrorPattern> = new Map();

  // Tracking state for anomaly detection
  private currentPhase = '';
  private currentStory = '';
  private storyResults: Map<string, { passed: boolean; cost: number }> = new Map();
  private gateResults: Map<string, { status: string; detail?: string }> = new Map();
  private storiesTotal = 0;
  private storiesCompleted = 0;
  private storiesFailed = 0;
  private buildBaselineHealthy = true;
  private testsFoundCount = 0;

  constructor(runId: string) {
    this.runId = runId;
    this.startedAt = new Date().toISOString();
  }

  // ── Issue recording ──

  addIssue(
    severity: IssueSeverity,
    category: IssueCategory,
    title: string,
    detail: string,
    remediation: string,
    opts?: { story?: string; relatedIssues?: string[] },
  ): string {
    const id = `issue-${randomUUID().slice(0, 8)}`;
    this.issues.push({
      id,
      severity,
      category,
      title,
      detail,
      story: opts?.story || this.currentStory || undefined,
      phase: this.currentPhase,
      occurredAt: new Date().toISOString(),
      remediation,
      relatedIssues: opts?.relatedIssues || [],
    });
    return id;
  }

  addAnomaly(type: string, description: string, evidence: string[]): string {
    const id = `anomaly-${randomUUID().slice(0, 8)}`;
    this.anomalies.push({
      id,
      type,
      description,
      evidence,
      detectedAt: new Date().toISOString(),
    });
    return id;
  }

  trackErrorPattern(signature: string, story: string, likelyRootCause: string): void {
    const existing = this.errorSignatures.get(signature);
    if (existing) {
      existing.occurrences++;
      if (!existing.stories.includes(story)) {
        existing.stories.push(story);
      }
    } else {
      this.errorSignatures.set(signature, {
        signature,
        occurrences: 1,
        stories: [story],
        firstSeen: new Date().toISOString(),
        likelyRootCause,
      });
    }
  }

  // ── Pipeline callback integration ──

  createCallbacks(): PipelineCallbacks {
    return {
      onPhaseStart: (phase, detail) => {
        this.currentPhase = phase;
        // Detect dependency/build issues mentioned in phase detail
        if (detail && /Can't resolve|Cannot find module|Module not found/i.test(detail)) {
          this.addIssue('CRITICAL', 'DEPENDENCY', `Dependency issue detected in ${phase}`,
            detail, 'Check package.json, run npm install, verify import paths and workspace root');
        }
      },

      onPhaseComplete: (phase, status) => {
        if (status === 'failed') {
          // Don't add generic phase failures — specific issues are tracked elsewhere
          // But detect anomalies: phase failed but no issues recorded for it
          const phaseIssues = this.issues.filter((i) => i.phase === phase);
          if (phaseIssues.length === 0) {
            this.addAnomaly('UNDIAGNOSED_FAILURE',
              `Phase ${phase} failed but no specific issues were recorded`,
              [`Phase: ${phase}`, `Status: ${status}`]);
          }
        }
      },

      onStoryStart: (story, index, total) => {
        this.currentStory = story;
        this.storiesTotal = total;
      },

      onStoryComplete: (story, passed, cost) => {
        this.storyResults.set(story, { passed, cost });
        if (passed) {
          this.storiesCompleted++;
        } else {
          this.storiesFailed++;
        }
      },

      onGateResult: (tier, status, detail) => {
        this.gateResults.set(`${this.currentStory || 'global'}:${tier}`, { status, detail });

        // Track specific gate failures
        if (status === 'fail') {
          this.handleGateFailure(tier, status, detail);
        }

        // Track build baseline
        if (tier === 'BUILD_BASELINE' && status === 'warn') {
          this.buildBaselineHealthy = false;
          this.addIssue('HIGH', 'BUILD_FAILURE',
            'Project does not build cleanly before FORGE',
            detail || 'Pre-existing build failures detected',
            'Fix existing build errors before running the pipeline. Check: tsconfig.json, package.json dependencies, import paths.');
        }

        // Track circuit breaker
        if (tier === 'CIRCUIT_BREAKER' && status === 'fail') {
          this.addIssue('CRITICAL', 'CIRCUIT_BREAKER',
            'Pipeline halted — repeated systemic failure',
            detail || 'Consecutive stories failed with the same error pattern',
            'This is a systemic blocker. Do NOT retry individual stories. Instead: ' +
            '1) Identify the root cause from the error pattern below. ' +
            '2) Fix the underlying infrastructure/dependency issue. ' +
            '3) Verify the project builds cleanly (npm run build / npx tsc). ' +
            '4) Re-run /forge.');
        }

        // Track test existence
        if (tier === 'TEST_EXIST') {
          if (status === 'pass') {
            this.testsFoundCount++;
          } else if (status === 'fail') {
            this.addIssue('HIGH', 'TEST_GAP',
              `No test files created for ${this.currentStory}`,
              detail || 'Story was implemented without any test files',
              'Tester remediation was triggered. If this keeps happening, check: ' +
              '1) Story includes test files in "Files Affected" section. ' +
              '2) STORY_EXECUTION_PROMPT test requirements are being followed. ' +
              '3) The test framework is configured (vitest/jest/pytest).');
          }
        }
      },

      onMicroGateResult: (mgResult) => {
        if (mgResult.verdict === 'FAIL' && !mgResult.skippedDueToError) {
          this.handleMicroGateFailure(mgResult);
        }
        if (mgResult.skippedDueToError) {
          this.addIssue('MEDIUM', 'ANOMALY',
            `Micro-gate ${mgResult.gate} skipped due to provider error`,
            `Agent: ${mgResult.agent}, Error prevented review`,
            'Check provider configuration and API key. The micro-gate review was skipped, ' +
            'meaning quality issues may have been missed.',
            { story: this.currentStory });
        }
      },

      onFinisherCheck: (checkResult) => {
        if (checkResult.status === 'error') {
          this.addIssue('LOW', 'QUALITY',
            `Finisher check "${checkResult.check}" errored`,
            checkResult.detail,
            'Review the check output and fix manually.',
          );
        }
      },
    };
  }

  // ── Gate failure handlers ──

  private handleGateFailure(tier: string, _status: string, detail?: string): void {
    const d = detail || '';

    switch (tier) {
      case 'T1':
        this.addIssue('HIGH', 'QUALITY',
          'Banned patterns detected (T1)',
          d,
          'Remove all banned patterns: TODO, FIXME, HACK, PLACEHOLDER, STUB, etc. ' +
          'Run: grep -rn "TODO\\|FIXME\\|PLACEHOLDER" --exclude-dir=node_modules');
        break;

      case 'T2':
        this.addIssue('HIGH', 'BUILD_FAILURE',
          'Type check failed (T2)',
          d.slice(0, 500),
          this.classifyBuildError(d),
          { story: this.currentStory });
        break;

      case 'T3': {
        const isVacuousPass = d.includes('vacuous pass') || d.includes('0 test files');
        this.addIssue(isVacuousPass ? 'CRITICAL' : 'HIGH', 'TEST_GAP',
          isVacuousPass ? 'Zero test files in project (T3 vacuous pass)' : 'Tests failed (T3)',
          d.slice(0, 500),
          isVacuousPass
            ? 'No test files exist for implemented stories. This is a mandatory requirement. ' +
              'Create test files matching your source files (*.test.ts, *.spec.ts, test_*.py).'
            : 'Fix failing tests. Run the test suite locally to see full output.');
        break;
      }

      case 'T4':
        this.addIssue('HIGH', 'SECURITY',
          'Security scan detected issues (T4)',
          d.slice(0, 500),
          'Review and fix security issues: hardcoded secrets, missing input validation, ' +
          'SQL injection, XSS vulnerabilities.');
        break;

      case 'T5':
        this.addIssue('HIGH', 'BUILD_FAILURE',
          'Build failed (T5)',
          d.slice(0, 500),
          this.classifyBuildError(d),
          { story: this.currentStory });
        break;

      default:
        if (tier !== 'BUILD_BASELINE' && tier !== 'CIRCUIT_BREAKER' && tier !== 'TEST_EXIST') {
          this.addIssue('MEDIUM', 'GATE_FAILURE',
            `Gate ${tier} failed`,
            d.slice(0, 500),
            'Review the gate failure details and fix the underlying issue.');
        }
    }
  }

  private handleMicroGateFailure(mgResult: MicroGateResult): void {
    const findingsSummary = mgResult.findings
      .slice(0, 5)
      .map((f) => `[${f.severity}] ${f.description}${f.location ? ` (${f.location})` : ''}`)
      .join('\n');

    const remediationMap: Record<string, string> = {
      MG0: 'Rewrite acceptance criteria to be objectively verifiable. Remove subjective language.',
      MG1: 'Fix security findings: validate inputs, escape outputs, check auth/authz.',
      'MG1.5': 'Add test documentation: @test-suite headers, GIVEN/WHEN/THEN comments, WHY annotations.',
      MG2: 'Fix standards violations: add docs to public methods, remove magic numbers, fix naming.',
      MG3: 'Review cross-story advisory: check for inconsistencies, circular deps, layer violations.',
    };

    this.addIssue(
      mgResult.findings.some((f) => f.severity === 'CRITICAL') ? 'CRITICAL' : 'HIGH',
      mgResult.gate === 'MG1' ? 'SECURITY' : 'QUALITY',
      `${mgResult.gate} (${mgResult.agent}) — ${mgResult.summary || 'FAIL'}`,
      findingsSummary,
      remediationMap[mgResult.gate] || 'Review and fix the reported findings.',
      { story: this.currentStory },
    );
  }

  private classifyBuildError(detail: string): string {
    if (/Can't resolve|Cannot find module|Module not found/i.test(detail)) {
      return 'Dependency resolution failure. Check: ' +
        '1) Is the module installed? (npm install / pip install) ' +
        '2) Is the import path correct? (not relative into node_modules) ' +
        '3) Is the build running from the correct directory? ' +
        '4) Is there a workspace/monorepo root issue?';
    }
    if (/TS\d{4}:/i.test(detail)) {
      return 'TypeScript type errors. Run `npx tsc --noEmit` to see all errors. ' +
        'Fix type mismatches, missing properties, and incorrect imports.';
    }
    if (/SyntaxError|Unexpected token/i.test(detail)) {
      return 'Syntax error in source code. Check the file and line number in the error output.';
    }
    return 'Build error. Run the build command locally to see full output and fix the issues.';
  }

  // ── Anomaly detection (run after pipeline completes) ──

  detectAnomalies(result: PipelineResult): void {
    // Anomaly: Stories "completed" but zero tests found
    if (result.storiesCompleted > 0 && this.testsFoundCount === 0) {
      this.addAnomaly('ZERO_TESTS_WITH_COMPLETIONS',
        `${result.storiesCompleted} stories completed but zero test files were created`,
        [
          `Stories completed: ${result.storiesCompleted}`,
          `Test files found: 0`,
          'This means no story produced any test files despite the test existence gate.',
        ]);
      this.addIssue('CRITICAL', 'TEST_GAP',
        `${result.storiesCompleted} stories completed with zero test files`,
        'The pipeline completed stories but no test files were created for any of them.',
        'This is a systemic failure. Check: ' +
        '1) Is the test framework configured? (package.json test script, vitest.config.ts) ' +
        '2) Are test files being created in a git-tracked location? ' +
        '3) Is STORY_EXECUTION_PROMPT being followed?');
    }

    // Anomaly: Gate verdict PASS but multiple stories failed
    if (result.gateVerdict === 'PASS' && result.storiesFailed > 0) {
      this.addAnomaly('PASS_WITH_FAILURES',
        `Gate verdict is PASS but ${result.storiesFailed} stories failed`,
        [
          `Gate verdict: ${result.gateVerdict}`,
          `Stories failed: ${result.storiesFailed}`,
          `Stories completed: ${result.storiesCompleted}`,
        ]);
    }

    // Anomaly: Pipeline completed but build baseline was unhealthy
    if (!this.buildBaselineHealthy && result.storiesCompleted > 0) {
      this.addAnomaly('COMPLETED_ON_BROKEN_BUILD',
        'Stories completed but the project had pre-existing build failures',
        [
          'Build baseline was unhealthy before FORGE started.',
          `Stories completed: ${result.storiesCompleted}`,
          'Some completions may be on broken foundations.',
        ]);
    }

    // Anomaly: All stories completed but TEMPER phase failed
    if (result.storiesCompleted > 0 && result.storiesFailed === 0) {
      const temperPhase = result.phases.find((p) => p.name === 'TEMPER');
      if (temperPhase?.status === 'failed') {
        this.addAnomaly('ALL_PASSED_BUT_TEMPER_FAILED',
          'All stories passed individually but TEMPER quality gates failed',
          [
            `Stories: ${result.storiesCompleted}/${result.storiesTotal} completed`,
            `TEMPER verdict: FAIL`,
            'Individual story completion does not guarantee project-level quality.',
          ]);
      }
    }

    // Anomaly: High cost with low completion
    if (result.storiesCompleted === 0 && result.totalCostUsd > 1.0) {
      this.addAnomaly('HIGH_COST_ZERO_COMPLETION',
        `$${result.totalCostUsd.toFixed(2)} spent but zero stories completed`,
        [
          `Total cost: $${result.totalCostUsd.toFixed(2)}`,
          `Stories completed: 0`,
          `Stories failed: ${result.storiesFailed}`,
          'Check if the agent is looping on unsolvable problems.',
        ]);
    }

    // Anomaly: Micro-gates all skipped due to errors
    if (result.microGateSummary) {
      const totalSkipped = result.microGateSummary.totalRun -
        result.microGateSummary.totalPassed -
        result.microGateSummary.totalFailed -
        result.microGateSummary.totalWarned;
      if (totalSkipped > 0 && totalSkipped === result.microGateSummary.totalRun) {
        this.addAnomaly('ALL_MICROGATES_SKIPPED',
          'All micro-gate reviews were skipped (likely provider error)',
          [
            `Total micro-gates: ${result.microGateSummary.totalRun}`,
            `All skipped: ${totalSkipped}`,
            'No AI-powered quality review was performed.',
          ]);
      }
    }

    // Correlate error patterns into issues
    for (const [, pattern] of this.errorSignatures) {
      if (pattern.occurrences >= 2) {
        this.addIssue('CRITICAL', 'BLOCKER',
          `Recurring error pattern across ${pattern.occurrences} stories`,
          `Pattern: ${pattern.signature}\nStories affected: ${pattern.stories.join(', ')}`,
          pattern.likelyRootCause,
        );
      }
    }
  }

  // ── Report generation ──

  generateReport(): SessionReport {
    const summary = this.buildSummary();
    return {
      runId: this.runId,
      startedAt: this.startedAt,
      completedAt: new Date().toISOString(),
      issues: this.issues,
      anomalies: this.anomalies,
      errorPatterns: Array.from(this.errorSignatures.values()),
      summary,
    };
  }

  private buildSummary(): SessionSummary {
    const bySeverity: Record<IssueSeverity, number> = {
      CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0,
    };
    const byCategory: Record<string, number> = {};
    const storiesWithIssues = new Set<string>();

    for (const issue of this.issues) {
      bySeverity[issue.severity]++;
      byCategory[issue.category] = (byCategory[issue.category] || 0) + 1;
      if (issue.story) storiesWithIssues.add(issue.story);
    }

    // Top remediations: unique, sorted by severity (CRITICAL first)
    const severityOrder: Record<IssueSeverity, number> = {
      CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4,
    };
    const topRemediations = [...new Map(
      this.issues
        .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
        .map((i) => [i.remediation, i] as const)
    ).values()]
      .slice(0, 5)
      .map((i) => `[${i.severity}] ${i.title}: ${i.remediation}`);

    return {
      totalIssues: this.issues.length,
      bySeverity,
      byCategory,
      blockers: this.issues.filter((i) =>
        i.category === 'BLOCKER' || i.category === 'CIRCUIT_BREAKER',
      ).length,
      anomalies: this.anomalies.length,
      storiesWithIssues: storiesWithIssues.size,
      topRemediations,
    };
  }

  // ── Persistence ──

  writeReport(workDir: string): { jsonPath: string; mdPath: string } {
    const report = this.generateReport();
    const runsDir = join(workDir, '.skillfoundry', 'runs');
    if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });

    const jsonPath = join(runsDir, `${this.runId}-issues.json`);
    writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');

    const mdPath = join(runsDir, `${this.runId}-issues.md`);
    writeFileSync(mdPath, this.formatMarkdown(report), 'utf-8');

    return { jsonPath, mdPath };
  }

  private formatMarkdown(report: SessionReport): string {
    const lines: string[] = [];
    const s = report.summary;

    lines.push(`# Session Issues Report`);
    lines.push('');
    lines.push(`**Run:** ${report.runId}`);
    lines.push(`**Started:** ${report.startedAt}`);
    lines.push(`**Completed:** ${report.completedAt}`);
    lines.push('');

    // Summary
    lines.push(`## Summary`);
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Issues | ${s.totalIssues} |`);
    lines.push(`| Blockers | ${s.blockers} |`);
    lines.push(`| Anomalies | ${s.anomalies} |`);
    lines.push(`| Stories with Issues | ${s.storiesWithIssues} |`);
    lines.push(`| CRITICAL | ${s.bySeverity.CRITICAL} |`);
    lines.push(`| HIGH | ${s.bySeverity.HIGH} |`);
    lines.push(`| MEDIUM | ${s.bySeverity.MEDIUM} |`);
    lines.push(`| LOW | ${s.bySeverity.LOW} |`);
    lines.push('');

    // Top remediations
    if (s.topRemediations.length > 0) {
      lines.push(`## Top Remediations`);
      lines.push('');
      for (const r of s.topRemediations) {
        lines.push(`1. ${r}`);
      }
      lines.push('');
    }

    // Blockers first
    const blockers = report.issues.filter((i) =>
      i.severity === 'CRITICAL' || i.category === 'BLOCKER' || i.category === 'CIRCUIT_BREAKER',
    );
    if (blockers.length > 0) {
      lines.push(`## Blockers`);
      lines.push('');
      for (const issue of blockers) {
        lines.push(`### ${issue.title}`);
        lines.push('');
        lines.push(`- **Severity:** ${issue.severity}`);
        lines.push(`- **Category:** ${issue.category}`);
        if (issue.story) lines.push(`- **Story:** ${issue.story}`);
        lines.push(`- **Phase:** ${issue.phase}`);
        lines.push(`- **When:** ${issue.occurredAt}`);
        lines.push('');
        lines.push('**Detail:**');
        lines.push('```');
        lines.push(issue.detail);
        lines.push('```');
        lines.push('');
        lines.push(`**Remediation:** ${issue.remediation}`);
        lines.push('');
      }
    }

    // Other issues
    const nonBlockers = report.issues.filter((i) =>
      i.severity !== 'CRITICAL' && i.category !== 'BLOCKER' && i.category !== 'CIRCUIT_BREAKER',
    );
    if (nonBlockers.length > 0) {
      lines.push(`## Other Issues`);
      lines.push('');
      lines.push(`| Severity | Category | Title | Story | Remediation |`);
      lines.push(`|----------|----------|-------|-------|-------------|`);
      for (const issue of nonBlockers) {
        const story = issue.story || '-';
        const remediation = issue.remediation.slice(0, 80) + (issue.remediation.length > 80 ? '...' : '');
        lines.push(`| ${issue.severity} | ${issue.category} | ${issue.title} | ${story} | ${remediation} |`);
      }
      lines.push('');
    }

    // Anomalies
    if (report.anomalies.length > 0) {
      lines.push(`## Anomalies`);
      lines.push('');
      for (const anomaly of report.anomalies) {
        lines.push(`### ${anomaly.type}`);
        lines.push('');
        lines.push(anomaly.description);
        lines.push('');
        lines.push('Evidence:');
        for (const e of anomaly.evidence) {
          lines.push(`- ${e}`);
        }
        lines.push('');
      }
    }

    // Error patterns
    if (report.errorPatterns.length > 0) {
      lines.push(`## Recurring Error Patterns`);
      lines.push('');
      for (const pattern of report.errorPatterns) {
        lines.push(`### Pattern: ${pattern.signature.slice(0, 100)}`);
        lines.push('');
        lines.push(`- **Occurrences:** ${pattern.occurrences}`);
        lines.push(`- **Stories affected:** ${pattern.stories.join(', ')}`);
        lines.push(`- **First seen:** ${pattern.firstSeen}`);
        lines.push(`- **Likely root cause:** ${pattern.likelyRootCause}`);
        lines.push('');
      }
    }

    // Clean run
    if (report.issues.length === 0 && report.anomalies.length === 0) {
      lines.push(`## Result`);
      lines.push('');
      lines.push('Clean run — no issues or anomalies detected.');
      lines.push('');
    }

    return lines.join('\n');
  }

  // ── Accessors ──

  getIssues(): readonly SessionIssue[] {
    return this.issues;
  }

  getAnomalies(): readonly SessionAnomaly[] {
    return this.anomalies;
  }

  getIssueCount(): number {
    return this.issues.length;
  }

  getBlockerCount(): number {
    return this.issues.filter((i) =>
      i.severity === 'CRITICAL' || i.category === 'BLOCKER' || i.category === 'CIRCUIT_BREAKER',
    ).length;
  }
}
