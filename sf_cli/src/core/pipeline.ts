// Pipeline execution engine — the real Forge.
// Chains: discover PRDs → validate → generate stories → execute stories → gates → report.

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runAgentLoop } from './ai-runner.js';
import { runAllGates, runSingleGate } from './gates.js';
import { runPostStoryGates, runPreTemperGate, runPreGenerationGate, runTestDocGate, formatFindingsForFixer } from './micro-gates.js';
import { runFinisher } from './finisher.js';
import { harvestRunMemory } from './memory-harvest.js';
import { SessionRecorder } from './session-recorder.js';
import type { GateRunSummary } from './gates.js';
import { ALL_TOOLS } from './tools.js';
import { getLogger } from '../utils/logger.js';
import type {
  PipelineOptions,
  PipelineResult,
  PipelinePhase,
  PipelinePhaseStatus,
  PipelineCallbacks,
  StoryExecution,
  AnthropicMessage,
  MicroGateResult,
  FinisherSummary,
} from '../types.js';

const RUNS_DIR = '.skillfoundry/runs';
const MAX_FIXER_ATTEMPTS = 2;
const MAX_TESTER_REMEDIATION_ATTEMPTS = 1;
const CONSECUTIVE_FAILURE_HALT_THRESHOLD = 2;
const ERROR_SIMILARITY_THRESHOLD = 0.6; // 60% word overlap = "same error"

// ── Test file existence check ──────────────────────────────────

const TEST_FILE_PATTERNS = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /^test_.*\.py$/,
  /.*_test\.go$/,
  /.*Tests?\.cs$/,
];

/**
 * Check if any test files were created/modified since the story started.
 * Uses git diff to detect new or modified test files in the working tree.
 * Falls back to scanning common test directories if not in a git repo.
 */
function checkTestFilesExist(workDir: string): { hasTests: boolean; testFiles: string[]; detail: string } {
  const log = getLogger();

  // Try git diff first — most reliable way to detect new test files
  try {
    const { ok, output } = runCommand('git diff --name-only HEAD 2>/dev/null || git diff --name-only --cached 2>/dev/null || true', workDir, 10_000);
    if (ok && output.trim()) {
      const changedFiles = output.trim().split('\n');
      const testFiles = changedFiles.filter((f) =>
        TEST_FILE_PATTERNS.some((p) => p.test(f.split('/').pop() || '')),
      );
      if (testFiles.length > 0) {
        return {
          hasTests: true,
          testFiles,
          detail: `${testFiles.length} test file(s) created/modified`,
        };
      }
    }
  } catch {
    log.debug('pipeline', 'test_check_git_failed', { msg: 'git diff failed, falling back to file scan' });
  }

  // Fallback: check for untracked test files
  try {
    const { ok, output } = runCommand('git ls-files --others --exclude-standard 2>/dev/null || true', workDir, 10_000);
    if (ok && output.trim()) {
      const untrackedFiles = output.trim().split('\n');
      const testFiles = untrackedFiles.filter((f) =>
        TEST_FILE_PATTERNS.some((p) => p.test(f.split('/').pop() || '')),
      );
      if (testFiles.length > 0) {
        return {
          hasTests: true,
          testFiles,
          detail: `${testFiles.length} new test file(s) detected`,
        };
      }
    }
  } catch {
    // Best effort
  }

  return {
    hasTests: false,
    testFiles: [],
    detail: 'No test files created or modified for this story',
  };
}

// ── Shell command runner (shared with gates.ts) ────────────────

function runCommand(cmd: string, cwd: string, timeoutMs: number = 30_000): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, output: output || '' };
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string };
    return { ok: false, output: (execErr.stdout || '') + (execErr.stderr || '') };
  }
}

// ── Error similarity detection (circuit breaker) ───────────────

/**
 * Extract a normalized error signature from build/compile output.
 * Strips file paths, line numbers, and variable parts to compare error *patterns*.
 * Returns the top N unique error messages as a fingerprint.
 */
function extractErrorSignature(output: string): string[] {
  const lines = output.split('\n')
    .map((l) => l.trim())
    .filter((l) => /error|Error|ERR|FAIL|Can't resolve|Cannot find|Module not found/i.test(l))
    .map((l) => l
      .replace(/\/[^\s:]+/g, '<PATH>')       // normalize file paths
      .replace(/:\d+:\d+/g, ':<LINE>')       // normalize line:col
      .replace(/\d+/g, '<N>')                // normalize numbers
      .trim()
    )
    .filter((l) => l.length > 10);

  // Deduplicate and take top 5 error patterns
  return [...new Set(lines)].slice(0, 5);
}

/**
 * Compare two error signatures. Returns similarity ratio (0-1).
 * High similarity means the same root cause is recurring.
 */
function errorSimilarity(sig1: string[], sig2: string[]): number {
  if (sig1.length === 0 || sig2.length === 0) return 0;
  const set1 = new Set(sig1);
  const overlap = sig2.filter((s) => set1.has(s)).length;
  return overlap / Math.max(sig1.length, sig2.length);
}

/**
 * Run a pre-FORGE build health baseline check.
 * If the project doesn't compile/build before we start, we need to know.
 */
function checkBuildHealth(workDir: string): { healthy: boolean; t2Detail: string; t5Detail: string } {
  const t2 = runSingleGate('T2', workDir, '.');
  const t5 = runSingleGate('T5', workDir, '.');
  return {
    healthy: t2.status !== 'fail' && t5.status !== 'fail',
    t2Detail: t2.status === 'fail' ? t2.detail : '',
    t5Detail: t5.status === 'fail' ? t5.detail : '',
  };
}

// ── PRD scanning (shared with forge.ts dry-run mode) ───────────

export interface PRDInfo {
  file: string;
  title: string;
  status: string;
  slug: string;
  content: string;
}

export function scanPRDs(workDir: string): PRDInfo[] {
  const genesisDir = join(workDir, 'genesis');
  if (!existsSync(genesisDir)) return [];

  return readdirSync(genesisDir)
    .filter((f) => f.endsWith('.md') && f !== 'TEMPLATE.md' && !f.startsWith('TEMPLATES'))
    .map((f) => {
      const content = readFileSync(join(genesisDir, f), 'utf-8');
      const titleMatch = content.match(/^#\s+(.+)/m);
      const statusMatch = content.match(/status:\s*(\w+)/i);
      const slug = basename(f, '.md')
        .replace(/^\d{4}-\d{2}-\d{2}-/, '')
        .replace(/[^a-z0-9-]/gi, '-')
        .toLowerCase();
      return {
        file: f,
        title: titleMatch?.[1] || f,
        status: statusMatch?.[1] || 'UNKNOWN',
        slug,
        content,
      };
    });
}

export function scanStories(workDir: string): Array<{ prd: string; stories: string[]; completed: number }> {
  const storiesDir = join(workDir, 'docs', 'stories');
  if (!existsSync(storiesDir)) return [];

  return readdirSync(storiesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const storyDir = join(storiesDir, d.name);
      const storyFiles = readdirSync(storyDir).filter(
        (f) => f.startsWith('STORY-') && f.endsWith('.md'),
      );

      let completed = 0;
      for (const sf of storyFiles) {
        const content = readFileSync(join(storyDir, sf), 'utf-8');
        if (content.match(/status:\s*(DONE|COMPLETED|IMPLEMENTED)/i)) {
          completed++;
        }
      }

      return { prd: d.name, stories: storyFiles, completed };
    });
}

// ── Story file status update (enables pipeline resume) ────────

function markStoryDone(storyPath: string): void {
  try {
    const content = readFileSync(storyPath, 'utf-8');
    const updated = content.replace(/^(status:\s*)PENDING/mi, '$1DONE');
    if (updated !== content) {
      writeFileSync(storyPath, updated, 'utf-8');
    }
  } catch {
    // Best-effort — don't crash the pipeline if we can't update the file
  }
}

// ── Story generation system prompt ─────────────────────────────

const STORY_GENERATION_PROMPT = `You are a senior software architect decomposing a PRD into implementation stories.

RULES:
- Each story must be self-contained: a developer needs no external context beyond the story.
- Stories are ordered by dependency: foundational work first, features second, integration last.
- Each story has: title, description, acceptance criteria, technical approach, and files affected.
- Output stories separated by "---STORY---" markers for reliable parsing.
- EVERY story MUST include test files in its "Files Affected" section. No story ships without tests.

OUTPUT FORMAT (repeat for each story):
---STORY---
# STORY-NNN: <title>

status: PENDING
depends_on: [list of STORY numbers this depends on, or empty]
blocks: [list of STORY numbers this blocks, or empty]

## Description
<what needs to be built>

## Acceptance Criteria
- [ ] <criterion 1>
- [ ] <criterion 2>

done_when:
- [ ] <objectively verifiable condition 1 — must be testable without human judgment>
- [ ] <objectively verifiable condition 2>

fail_when:
- [ ] <condition that indicates incorrect implementation>
- [ ] <edge case or error scenario that must be handled>

## Technical Approach
<how to implement, including file paths and patterns>

## Files Affected
- <file path>: <what changes>
- <test file path>: <what tests are added — MANDATORY: every story must list test files>

## Test Requirements
- Unit tests for all new functions/methods
- Integration tests for API endpoints (if applicable)
- Edge case tests for error paths and boundary conditions
---STORY---

IMPORTANT: Every done_when item must be objectively verifiable — no subjective language
like "works correctly", "looks good", or "handles edge cases properly".
Use concrete, measurable conditions that an automated test can verify.

IMPORTANT: Every story MUST include test files in "Files Affected". A story without test
deliverables is incomplete and will be rejected by the pipeline's test existence gate.

Number stories sequentially starting at 001. Be specific about file paths and code patterns.`;

// ── Story execution system prompt ──────────────────────────────

const STORY_EXECUTION_PROMPT = `You are a senior software engineer implementing a story from a PRD.

RULES:
- Read the codebase first to understand existing patterns before writing code.
- Implement the story requirements exactly as specified.
- Follow existing code conventions (naming, structure, patterns).
- WRITE TESTS for every module, function, and endpoint you create or modify.
- Run tests after implementation to verify they pass.

BLOCKER DETECTION (CRITICAL — do NOT ignore repeated failures):

If you encounter the same error more than twice, STOP and diagnose the root cause:
1. DO NOT keep trying the same fix. If an approach fails twice, it is wrong.
2. DO NOT work around build/dependency errors by continuing to other files.
3. Instead: isolate the failure, check dependency installation, verify import paths,
   check workspace/project root configuration, and verify the build runs from the correct directory.
4. If the error is a dependency resolution failure (e.g., "Can't resolve", "Module not found"):
   - Check package.json for the dependency
   - Check node_modules/ exists in the correct directory
   - Check import paths are correct (not relative paths into node_modules)
   - Check if the project has a monorepo/workspace structure that affects resolution
   - Run the build/dev command from the correct directory
5. Report blockers clearly: state what failed, what you tried, and what the root cause likely is.
   Do NOT report success when builds are failing.

TEST REQUIREMENTS (MANDATORY — the pipeline will reject stories without test files):

You MUST create test files for your implementation. This is a hard gate — stories without
tests will be marked FAILED and sent back for remediation.

- For each source file you create, create a corresponding test file:
  - TypeScript: \`*.test.ts\` or \`*.spec.ts\` alongside or in \`__tests__/\`
  - Python: \`test_*.py\` in a \`tests/\` directory
  - JavaScript: \`*.test.js\` or \`*.spec.js\`
- Tests must cover: happy path, error cases, edge cases, and input validation
- Tests must be runnable (import correctly, mock external dependencies)
- Tests must have descriptive names that explain what behavior they verify
- Add @test-suite and @story tags in test file headers for traceability

QUALITY STANDARDS (your code will be checked against these — violations cause failures):

1. ZERO TOLERANCE — NEVER use these patterns in production code:
   - TODO, FIXME, HACK, XXX, PLACEHOLDER, STUB, MOCK (in production code)
   - "COMING SOON", "NOT IMPLEMENTED", "WIP", "TEMPORARY"
   - NotImplementedError, NotImplementedException
   - Empty function bodies, pass without logic, throw new Error("Not implemented")
   - Lorem ipsum or any placeholder content
   - console.log("TODO") or debug placeholders

2. SECURITY — Every endpoint and function must:
   - Validate and sanitize ALL user input (no raw input in queries, templates, or responses)
   - Never hardcode secrets, API keys, passwords, or credentials
   - Use parameterized queries (never string concatenation for SQL/NoSQL)
   - Escape output to prevent XSS (never insert raw user input into HTML)
   - Include proper authentication and authorization checks on all protected routes
   - Never expose stack traces, internal paths, or sensitive data in error responses

3. ERROR HANDLING — Every function that can fail must:
   - Have proper try/catch or error handling (never silently fail)
   - Return appropriate HTTP status codes with meaningful error messages
   - Log errors with enough context for debugging

4. DOCUMENTATION — Every public function/method must have:
   - A description of what it does
   - Parameter types documented
   - Return type documented

5. CODE QUALITY:
   - No magic numbers or strings — use named constants
   - No commented-out code blocks
   - Consistent naming conventions throughout

You have tools to read files, write files, search the codebase, and execute shell commands.
Write REAL, PRODUCTION-READY code with REAL TESTS. Implement the story below completely.`;

const FIXER_PROMPT = `You are a senior engineer fixing quality gate violations.
The previous implementation triggered the following gate failures.
Fix ALL violations — do not introduce new issues. Keep changes minimal and targeted.`;

const TESTER_REMEDIATION_PROMPT = `You are a senior test engineer. The previous implementation created source files but NO test files.
This is a mandatory requirement — every story must ship with tests.

Your job:
1. Read the source files that were created/modified for this story.
2. Create corresponding test files with real, runnable tests.
3. Cover: happy path, error cases, edge cases, and input validation.
4. Follow the project's existing test patterns and framework.
5. Add @test-suite and @story header tags for traceability.
6. Run the tests to verify they pass.

DO NOT modify source code. ONLY create test files.`;

const POLISH_FIXER_PROMPT = `You are a senior engineer polishing code across an entire codebase.
The following quality issues were found across multiple stories/files.
Fix ALL violations — apply consistent patterns across the codebase.
For example: if input validation is missing in one controller, add it to ALL controllers.
If documentation is missing, add it to ALL public methods.
Keep changes targeted and minimal — fix the reported issues, don't refactor unrelated code.`;

// ── Pipeline execution ─────────────────────────────────────────

function makePhase(name: string): PipelinePhase {
  return { name, status: 'pending', durationMs: 0 };
}

export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { config, policy, workDir, prdFilter, callbacks: userCallbacks } = options;
  const runId = `forge-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const pipelineStart = Date.now();
  const log = getLogger();
  log.startRunLog(runId);
  log.cleanupOldLogs();

  // ── Session Recorder: tracks issues, anomalies, and remediation actions ──
  const recorder = new SessionRecorder(runId);
  const recorderCallbacks = recorder.createCallbacks();

  // Merge recorder callbacks with user callbacks so both receive events
  const callbacks: PipelineCallbacks = {
    onPhaseStart: (phase, detail) => {
      recorderCallbacks.onPhaseStart?.(phase, detail);
      userCallbacks?.onPhaseStart?.(phase, detail);
    },
    onPhaseComplete: (phase, status) => {
      recorderCallbacks.onPhaseComplete?.(phase, status);
      userCallbacks?.onPhaseComplete?.(phase, status);
    },
    onStoryStart: (story, index, total) => {
      recorderCallbacks.onStoryStart?.(story, index, total);
      userCallbacks?.onStoryStart?.(story, index, total);
    },
    onStoryComplete: (story, passed, cost) => {
      recorderCallbacks.onStoryComplete?.(story, passed, cost);
      userCallbacks?.onStoryComplete?.(story, passed, cost);
    },
    onGateResult: (tier, status, detail) => {
      recorderCallbacks.onGateResult?.(tier, status, detail);
      userCallbacks?.onGateResult?.(tier, status, detail);
    },
    onMicroGateResult: (result) => {
      recorderCallbacks.onMicroGateResult?.(result);
      userCallbacks?.onMicroGateResult?.(result);
    },
    onFinisherCheck: (result) => {
      recorderCallbacks.onFinisherCheck?.(result);
      userCallbacks?.onFinisherCheck?.(result);
    },
    requestPermission: userCallbacks?.requestPermission,
  };

  const phases: PipelinePhase[] = [
    makePhase('IGNITE'),
    makePhase('PLAN'),
    makePhase('FORGE'),
    makePhase('POLISH'),
    makePhase('TEMPER'),
    makePhase('INSPECT'),
    makePhase('DEBRIEF'),
    makePhase('FINISH'),
  ];

  let totalCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const storyExecutions: Record<string, StoryExecution> = {};
  let gateVerdict = 'UNKNOWN';
  let gateSummary: GateRunSummary | null = null;
  const allMicroGateResults: MicroGateResult[] = [];

  function updatePhase(name: string, status: PipelinePhaseStatus, durationMs: number, detail?: string) {
    const phase = phases.find((p) => p.name === name);
    if (phase) {
      phase.status = status;
      phase.durationMs = durationMs;
      if (detail) phase.detail = detail;
    }
  }

  // ── Phase 1: IGNITE ────────────────────────────────────

  log.info('pipeline', 'phase_start', { phase: 'IGNITE', detail: 'Validating PRDs' });
  callbacks?.onPhaseStart?.('IGNITE', 'Validating PRDs');
  const igniteStart = Date.now();

  let prds = scanPRDs(workDir);
  if (prdFilter) {
    prds = prds.filter((p) => p.file === prdFilter || p.file.includes(prdFilter));
  }

  if (prds.length === 0) {
    updatePhase('IGNITE', 'failed', Date.now() - igniteStart, 'No PRDs found in genesis/');
    log.error('pipeline', 'phase_failed', { phase: 'IGNITE', detail: 'No PRDs found in genesis/' });
    callbacks?.onPhaseComplete?.('IGNITE', 'failed');

    return buildResult(runId, phases, storyExecutions, gateVerdict, totalCostUsd, totalInputTokens, totalOutputTokens, pipelineStart, prds, workDir);
  }

  updatePhase('IGNITE', 'passed', Date.now() - igniteStart, `${prds.length} PRD(s) validated`);
  log.info('pipeline', 'phase_complete', { phase: 'IGNITE', status: 'passed', durationMs: Date.now() - igniteStart });
  callbacks?.onPhaseComplete?.('IGNITE', 'passed');

  // ── Phase 2: PLAN ──────────────────────────────────────

  log.info('pipeline', 'phase_start', { phase: 'PLAN', detail: 'Checking for existing stories' });
  callbacks?.onPhaseStart?.('PLAN', 'Checking for existing stories');
  const planStart = Date.now();

  const allStoryFiles: Array<{ prdSlug: string; storyFile: string; storyPath: string; alreadyDone: boolean }> = [];

  for (const prd of prds) {
    const storyDir = join(workDir, 'docs', 'stories', prd.slug);
    const existingStories = existsSync(storyDir)
      ? readdirSync(storyDir).filter((f) => f.startsWith('STORY-') && f.endsWith('.md'))
      : [];

    if (existingStories.length > 0) {
      // Reuse existing stories — check which ones are already completed
      for (const sf of existingStories.sort()) {
        const sfPath = join(storyDir, sf);
        const sfContent = readFileSync(sfPath, 'utf-8');
        const isDone = /status:\s*(DONE|COMPLETED|IMPLEMENTED)/i.test(sfContent);
        allStoryFiles.push({
          prdSlug: prd.slug,
          storyFile: sf,
          storyPath: sfPath,
          alreadyDone: isDone,
        });
      }
      const doneCount = allStoryFiles.filter((s) => s.prdSlug === prd.slug && s.alreadyDone).length;
      callbacks?.onPhaseStart?.('PLAN', `Found ${existingStories.length} existing stories for ${prd.slug} (${doneCount} already done)`);
      continue;
    }

    // No existing stories — generate via AI
    callbacks?.onPhaseStart?.('PLAN', `Generating stories for ${prd.slug}`);
    const storyMessages: AnthropicMessage[] = [
      {
        role: 'user',
        content: `Here is the PRD to decompose into implementation stories:\n\n${prd.content}`,
      },
    ];

    const storyResult = await runAgentLoop(storyMessages, {
      config,
      policy,
      systemPrompt: STORY_GENERATION_PROMPT,
      tools: [],  // No tools needed for story generation
      maxTurns: 1,
      workDir,
    });

    totalCostUsd += storyResult.totalCostUsd;
    totalInputTokens += storyResult.totalInputTokens;
    totalOutputTokens += storyResult.totalOutputTokens;

    // Parse stories from AI output
    const storyBlocks = storyResult.content
      .split(/---STORY---/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.includes('STORY-'));

    if (!existsSync(storyDir)) {
      mkdirSync(storyDir, { recursive: true });
    }

    // Write INDEX.md
    const indexContent = [
      `# Stories: ${prd.title}`,
      ``,
      `PRD: genesis/${prd.file}`,
      `Generated: ${new Date().toISOString()}`,
      `Total stories: ${storyBlocks.length}`,
      ``,
      `## Stories`,
      '',
      ...storyBlocks.map((_s, i) => {
        const numStr = String(i + 1).padStart(3, '0');
        const titleMatch = _s.match(/^#\s+STORY-\d+:\s*(.+)/m);
        return `- STORY-${numStr}: ${titleMatch?.[1] || 'Untitled'}`;
      }),
    ].join('\n');

    writeFileSync(join(storyDir, 'INDEX.md'), indexContent, 'utf-8');

    for (let i = 0; i < storyBlocks.length; i++) {
      const numStr = String(i + 1).padStart(3, '0');
      const block = storyBlocks[i];
      // Extract a slug from the story title
      const titleMatch = block.match(/^#\s+STORY-\d+:\s*(.+)/m);
      const titleSlug = (titleMatch?.[1] || 'task')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 40);

      const filename = `STORY-${numStr}-${titleSlug}.md`;
      const storyPath = join(storyDir, filename);

      // Normalize the story number in the content
      const normalizedContent = block.replace(
        /^(#\s+)STORY-\d+/m,
        `$1STORY-${numStr}`,
      );

      writeFileSync(storyPath, normalizedContent, 'utf-8');
      allStoryFiles.push({ prdSlug: prd.slug, storyFile: filename, storyPath, alreadyDone: false });
    }
  }

  if (allStoryFiles.length === 0) {
    updatePhase('PLAN', 'failed', Date.now() - planStart, 'No stories generated or found');
    callbacks?.onPhaseComplete?.('PLAN', 'failed');
    return buildResult(runId, phases, storyExecutions, gateVerdict, totalCostUsd, totalInputTokens, totalOutputTokens, pipelineStart, prds, workDir);
  }

  const doneStories = allStoryFiles.filter((s) => s.alreadyDone).length;
  const pendingStories = allStoryFiles.length - doneStories;
  const planDetail = doneStories > 0
    ? `${allStoryFiles.length} stories found (${doneStories} done, ${pendingStories} pending)`
    : `${allStoryFiles.length} stories ready`;
  updatePhase('PLAN', 'passed', Date.now() - planStart, planDetail);
  log.info('pipeline', 'phase_complete', { phase: 'PLAN', status: 'passed', durationMs: Date.now() - planStart, detail: planDetail });
  callbacks?.onPhaseComplete?.('PLAN', 'passed');

  // ── Phase 3: FORGE ─────────────────────────────────────

  // Filter to only pending stories — skip already-completed ones
  const pendingStoryFiles = allStoryFiles.filter((s) => !s.alreadyDone);
  const skippedCount = allStoryFiles.length - pendingStoryFiles.length;

  const forgeDetail = skippedCount > 0
    ? `Implementing ${pendingStoryFiles.length} stories (${skippedCount} already done, skipped)`
    : `Implementing ${pendingStoryFiles.length} stories`;
  log.info('pipeline', 'phase_start', { phase: 'FORGE', detail: forgeDetail });
  callbacks?.onPhaseStart?.('FORGE', forgeDetail);
  const forgeStart = Date.now();
  let storiesCompleted = skippedCount; // Count already-done as completed
  let storiesFailed = 0;

  // ── Pre-FORGE build health baseline ──
  // Record whether the project builds cleanly BEFORE we start implementing.
  // This lets us distinguish "story broke the build" from "build was already broken".
  const buildBaseline = checkBuildHealth(workDir);
  if (!buildBaseline.healthy) {
    log.warn('pipeline', 'build_baseline_unhealthy', {
      t2: buildBaseline.t2Detail.slice(0, 200),
      t5: buildBaseline.t5Detail.slice(0, 200),
    });
    callbacks?.onGateResult?.('BUILD_BASELINE', 'warn',
      `Project does not build cleanly before FORGE — pre-existing issues may affect stories`);
  }

  // ── Circuit breaker state: track consecutive failures with similar error patterns ──
  let consecutiveFailures = 0;
  let lastErrorSignature: string[] = [];
  let pipelineHalted = false;
  let haltReason = '';

  // Record skipped stories in execution log
  for (const skipped of allStoryFiles.filter((s) => s.alreadyDone)) {
    storyExecutions[skipped.storyFile] = {
      storyFile: skipped.storyFile,
      status: 'completed',
      turnCount: 0,
      costUsd: 0,
      fixerAttempts: 0,
    };
  }

  for (let i = 0; i < pendingStoryFiles.length; i++) {
    // ── Circuit breaker check: halt if repeated systemic failures ──
    if (pipelineHalted) {
      const { storyFile: haltedStory } = pendingStoryFiles[i];
      storyExecutions[haltedStory] = {
        storyFile: haltedStory,
        status: 'failed',
        turnCount: 0,
        costUsd: 0,
        fixerAttempts: 0,
      };
      storiesFailed++;
      log.warn('pipeline', 'story_skipped_circuit_breaker', { story: haltedStory, reason: haltReason });
      callbacks?.onStoryComplete?.(haltedStory, false, 0);
      continue;
    }
    const { storyFile, storyPath } = pendingStoryFiles[i];

    log.info('pipeline', 'story_start', { story: storyFile, index: i, total: pendingStoryFiles.length });
    callbacks?.onStoryStart?.(storyFile, i, pendingStoryFiles.length);

    const storyContent = readFileSync(storyPath, 'utf-8');

    const execution: StoryExecution = {
      storyFile,
      status: 'running',
      turnCount: 0,
      costUsd: 0,
      fixerAttempts: 0,
    };
    storyExecutions[storyFile] = execution;

    // ── MG0: Pre-generation AC validation ──
    const mg0Result = await runPreGenerationGate(storyFile, storyContent, {
      config, policy, workDir,
    });
    allMicroGateResults.push(mg0Result);
    totalCostUsd += mg0Result.costUsd;
    callbacks?.onMicroGateResult?.(mg0Result);

    if (mg0Result.verdict === 'FAIL') {
      log.warn('pipeline', 'mg0_fail', { story: storyFile, summary: mg0Result.summary });
      // MG0 FAIL is advisory — log the warning but continue with implementation.
      // The done_when items will still be checked by T0 gate in TEMPER phase.
    }

    // Execute the story
    const storyMessages: AnthropicMessage[] = [
      {
        role: 'user',
        content: `Implement the following story:\n\n${storyContent}`,
      },
    ];

    const storyRunnerResult = await runAgentLoop(storyMessages, {
      config,
      policy,
      systemPrompt: STORY_EXECUTION_PROMPT,
      tools: ALL_TOOLS,
      maxTurns: 25,
      workDir,
    }, {
      requestPermission: callbacks?.requestPermission,
    });

    execution.turnCount = storyRunnerResult.turnCount;
    execution.costUsd = storyRunnerResult.totalCostUsd;
    totalCostUsd += storyRunnerResult.totalCostUsd;
    totalInputTokens += storyRunnerResult.totalInputTokens;
    totalOutputTokens += storyRunnerResult.totalOutputTokens;

    // ── Smoke test: does the code compile and build? (T2 + T5) ──
    const t2Result = runSingleGate('T2', workDir, '.');
    const t5Result = runSingleGate('T5', workDir, '.');
    callbacks?.onGateResult?.('T2', t2Result.status, t2Result.detail);
    callbacks?.onGateResult?.('T5', t5Result.status, t5Result.detail);

    const compileFailed = t2Result.status === 'fail' || t5Result.status === 'fail';

    if (compileFailed) {
      // Fixer loop: fix compilation errors (max 2 attempts)
      let fixed = false;
      for (let attempt = 0; attempt < MAX_FIXER_ATTEMPTS && !fixed; attempt++) {
        execution.fixerAttempts++;

        const compileFindings = [
          t2Result.status === 'fail' ? `[T2] Type Check — FAIL\n  ${t2Result.detail}` : '',
          t5Result.status === 'fail' ? `[T5] Build — FAIL\n  ${t5Result.detail}` : '',
        ].filter(Boolean).join('\n\n');

        const fixerMessages: AnthropicMessage[] = [
          {
            role: 'user',
            content: `${FIXER_PROMPT}\n\n${compileFindings}\n\nFix all compilation and build errors. Focus on the reported issues.`,
          },
        ];

        const fixerResult = await runAgentLoop(fixerMessages, {
          config,
          policy,
          systemPrompt: FIXER_PROMPT,
          tools: ALL_TOOLS,
          maxTurns: 10,
          workDir,
        }, {
          requestPermission: callbacks?.requestPermission,
        });

        execution.costUsd += fixerResult.totalCostUsd;
        totalCostUsd += fixerResult.totalCostUsd;
        totalInputTokens += fixerResult.totalInputTokens;
        totalOutputTokens += fixerResult.totalOutputTokens;

        // Re-run T2/T5 to check if fixes worked
        const recheckT2 = runSingleGate('T2', workDir, '.');
        const recheckT5 = runSingleGate('T5', workDir, '.');

        if (recheckT2.status !== 'fail' && recheckT5.status !== 'fail') {
          fixed = true;
        }
      }

      if (!fixed) {
        execution.status = 'failed';
        storiesFailed++;
        log.error('pipeline', 'story_failed', { story: storyFile, cost: execution.costUsd, fixerAttempts: execution.fixerAttempts });
        callbacks?.onStoryComplete?.(storyFile, false, execution.costUsd);

        // ── Circuit breaker: detect repeated systemic failures ──
        const failOutput = [
          t2Result.status === 'fail' ? t2Result.detail : '',
          t5Result.status === 'fail' ? t5Result.detail : '',
        ].join('\n');
        const currentSignature = extractErrorSignature(failOutput);

        if (lastErrorSignature.length > 0 && errorSimilarity(currentSignature, lastErrorSignature) >= ERROR_SIMILARITY_THRESHOLD) {
          consecutiveFailures++;
        } else {
          consecutiveFailures = 1; // New error pattern — reset counter
        }
        lastErrorSignature = currentSignature;

        if (consecutiveFailures >= CONSECUTIVE_FAILURE_HALT_THRESHOLD) {
          pipelineHalted = true;
          haltReason = `Circuit breaker: ${consecutiveFailures} consecutive stories failed with the same error pattern. ` +
            `This indicates a systemic blocker (dependency resolution, workspace config, or infrastructure issue) ` +
            `that cannot be fixed per-story. Remaining stories skipped.\n` +
            `Error pattern: ${currentSignature.slice(0, 3).join(' | ')}`;
          log.error('pipeline', 'circuit_breaker_halt', {
            consecutiveFailures,
            errorPattern: currentSignature.slice(0, 3).join(' | '),
            storiesRemaining: pendingStoryFiles.length - i - 1,
          });
          callbacks?.onGateResult?.('CIRCUIT_BREAKER', 'fail', haltReason);
        }

        continue;
      }
    }

    // Story compilation passed — reset circuit breaker
    consecutiveFailures = 0;
    lastErrorSignature = [];

    // ── Test existence gate: verify test files were created ──
    const testCheck = checkTestFilesExist(workDir);
    if (!testCheck.hasTests) {
      log.warn('pipeline', 'no_test_files', { story: storyFile, detail: testCheck.detail });
      callbacks?.onGateResult?.('TEST_EXIST', 'fail', `No test files found for ${storyFile}`);

      // Trigger tester remediation — one attempt to create test files
      let testsCreated = false;
      for (let testerAttempt = 0; testerAttempt < MAX_TESTER_REMEDIATION_ATTEMPTS && !testsCreated; testerAttempt++) {
        log.info('pipeline', 'tester_remediation', { story: storyFile, attempt: testerAttempt + 1 });

        const testerMessages: AnthropicMessage[] = [
          {
            role: 'user',
            content: `${TESTER_REMEDIATION_PROMPT}\n\nStory being implemented:\n\n${storyContent}\n\n` +
              `Create test files for this story. The implementation is complete but has NO tests.`,
          },
        ];

        const testerResult = await runAgentLoop(testerMessages, {
          config,
          policy,
          systemPrompt: TESTER_REMEDIATION_PROMPT,
          tools: ALL_TOOLS,
          maxTurns: 15,
          workDir,
        }, {
          requestPermission: callbacks?.requestPermission,
        });

        execution.costUsd += testerResult.totalCostUsd;
        totalCostUsd += testerResult.totalCostUsd;
        totalInputTokens += testerResult.totalInputTokens;
        totalOutputTokens += testerResult.totalOutputTokens;

        // Re-check for test files
        const recheck = checkTestFilesExist(workDir);
        if (recheck.hasTests) {
          testsCreated = true;
          log.info('pipeline', 'tester_remediation_success', { story: storyFile, testFiles: recheck.testFiles.length });
          callbacks?.onGateResult?.('TEST_EXIST', 'pass', `Tester created ${recheck.testFiles.length} test file(s)`);

          // Re-run T2 to ensure test files compile
          const recheckT2 = runSingleGate('T2', workDir, '.');
          if (recheckT2.status === 'fail') {
            log.warn('pipeline', 'test_compile_fail', { story: storyFile, detail: recheckT2.detail.slice(0, 200) });
          }
        }
      }

      if (!testsCreated) {
        log.error('pipeline', 'no_tests_after_remediation', { story: storyFile });
        // Mark as completed but flag the missing tests — TEMPER T0 will catch this
        execution.testsMissing = true;
      }
    } else {
      log.info('pipeline', 'test_files_found', { story: storyFile, count: testCheck.testFiles.length });
      callbacks?.onGateResult?.('TEST_EXIST', 'pass', testCheck.detail);
    }

    // Story completed — T2/T5 pass. Quality review deferred to POLISH phase.
    execution.status = 'completed';
    storiesCompleted++;
    markStoryDone(storyPath);
    log.info('pipeline', 'story_complete', { story: storyFile, passed: true, cost: execution.costUsd, turns: execution.turnCount });
    callbacks?.onStoryComplete?.(storyFile, true, execution.costUsd);
  }

  const forgeStatus: PipelinePhaseStatus = pipelineHalted ? 'failed' : (storiesFailed === 0 ? 'passed' : (storiesCompleted > 0 ? 'passed' : 'failed'));
  const forgeStatusDetail = pipelineHalted
    ? `HALTED: ${storiesCompleted}/${allStoryFiles.length} stories completed — ${haltReason.split('\n')[0]}`
    : `${storiesCompleted}/${allStoryFiles.length} stories completed`;
  updatePhase('FORGE', forgeStatus, Date.now() - forgeStart, forgeStatusDetail);
  log.info('pipeline', 'phase_complete', { phase: 'FORGE', status: forgeStatus, durationMs: Date.now() - forgeStart });
  callbacks?.onPhaseComplete?.('FORGE', forgeStatus);

  // ── Phase 3b: POLISH ─────────────────────────────────────

  log.info('pipeline', 'phase_start', { phase: 'POLISH', detail: 'Running quality review on completed stories' });
  callbacks?.onPhaseStart?.('POLISH', 'Running quality review on completed stories');
  const polishStart = Date.now();

  // Run MG1 + MG2 on every story completed in this run
  const polishFindings: MicroGateResult[] = [];
  for (const { storyFile, storyPath } of allStoryFiles.filter((s) => !s.alreadyDone)) {
    if (storyExecutions[storyFile]?.status !== 'completed') continue;

    const storyContent = readFileSync(storyPath, 'utf-8');
    const mgResults = await runPostStoryGates(storyFile, storyContent, {
      config, policy, workDir,
    });
    for (const mgr of mgResults) {
      polishFindings.push(mgr);
      allMicroGateResults.push(mgr);
      totalCostUsd += mgr.costUsd;
      callbacks?.onMicroGateResult?.(mgr);
    }

    // ── MG1.5: Test documentation gate ──
    const mg15Result = await runTestDocGate(storyFile, storyContent, {
      config, policy, workDir,
    });
    polishFindings.push(mg15Result);
    allMicroGateResults.push(mg15Result);
    totalCostUsd += mg15Result.costUsd;
    callbacks?.onMicroGateResult?.(mg15Result);

    // MG1.5 FAIL → re-trigger tester (not fixer) to add intent documentation
    if (mg15Result.verdict === 'FAIL' && !mg15Result.skippedDueToError) {
      log.info('pipeline', 'mg15_retrigger_tester', { story: storyFile });
      const testDocFixMessages: AnthropicMessage[] = [
        {
          role: 'user',
          content: `The test documentation gate (MG1.5) FAILED for story: ${storyFile}\n\n` +
            `Findings:\n${mg15Result.findings.map((f) => `- [${f.severity}] ${f.description}${f.location ? ` (${f.location})` : ''}`).join('\n')}\n\n` +
            `Add intent documentation to ALL test files for this story:\n` +
            `1. Add @test-suite, @story, @rationale header comments\n` +
            `2. Add GIVEN/WHEN/THEN (or Arrange/Act/Assert) structure comments in each test body\n` +
            `3. Add WHY comments explaining what contract each test enforces\n\n` +
            `Story content:\n${storyContent}`,
        },
      ];

      const testerResult = await runAgentLoop(testDocFixMessages, {
        config,
        policy,
        systemPrompt: `You are a test documentation specialist. Add clear intent documentation to test files. Do NOT modify test logic — only add comments that explain WHY each test exists, what it proves, and what failure it prevents.`,
        tools: ALL_TOOLS,
        maxTurns: 10,
        workDir,
      }, {
        requestPermission: callbacks?.requestPermission,
      });

      totalCostUsd += testerResult.totalCostUsd;
      totalInputTokens += testerResult.totalInputTokens;
      totalOutputTokens += testerResult.totalOutputTokens;
    }

    storyExecutions[storyFile].microGateResults = [...mgResults, mg15Result];
  }

  // Aggregate findings — if any MG FAILs exist, run holistic fixer
  const hasMgFailures = polishFindings.some((r) => r.verdict === 'FAIL' && !r.skippedDueToError);

  if (hasMgFailures) {
    const allFindings = formatFindingsForFixer(polishFindings);
    const polishFixerMessages: AnthropicMessage[] = [
      {
        role: 'user',
        content: `${POLISH_FIXER_PROMPT}\n\n${allFindings}\n\nFix all issues across the codebase. Apply consistent patterns.`,
      },
    ];

    const fixerResult = await runAgentLoop(polishFixerMessages, {
      config,
      policy,
      systemPrompt: POLISH_FIXER_PROMPT,
      tools: ALL_TOOLS,
      maxTurns: 15,
      workDir,
    }, {
      requestPermission: callbacks?.requestPermission,
    });

    totalCostUsd += fixerResult.totalCostUsd;
    totalInputTokens += fixerResult.totalInputTokens;
    totalOutputTokens += fixerResult.totalOutputTokens;

    // Re-run MG on all completed stories to verify fixes
    for (const { storyFile, storyPath } of allStoryFiles.filter((s) => !s.alreadyDone)) {
      if (storyExecutions[storyFile]?.status !== 'completed') continue;
      const storyContent = readFileSync(storyPath, 'utf-8');
      const recheckMg = await runPostStoryGates(storyFile, storyContent, {
        config, policy, workDir,
      });
      storyExecutions[storyFile].microGateResults = recheckMg;
      for (const mgr of recheckMg) {
        allMicroGateResults.push(mgr);
        totalCostUsd += mgr.costUsd;
        callbacks?.onMicroGateResult?.(mgr);
      }
    }
  }

  const polishFails = polishFindings.filter((r) => r.verdict === 'FAIL').length;
  // POLISH failures don't block — TEMPER is the real gate
  updatePhase('POLISH', 'passed', Date.now() - polishStart,
    `${polishFindings.length} reviews, ${polishFails} issues${hasMgFailures ? ' (fixer applied)' : ''}`);
  log.info('pipeline', 'phase_complete', { phase: 'POLISH', status: 'passed', durationMs: Date.now() - polishStart });
  callbacks?.onPhaseComplete?.('POLISH', 'passed');

  // ── Pre-TEMPER: Cross-story review (MG3 — advisory only) ──
  const completedStoryFiles = Object.entries(storyExecutions)
    .filter(([, ex]) => ex.status === 'completed')
    .map(([file]) => file);

  let preTemperResult: MicroGateResult | null = null;
  if (completedStoryFiles.length > 0) {
    preTemperResult = await runPreTemperGate(completedStoryFiles, {
      config, policy, workDir,
    });
    allMicroGateResults.push(preTemperResult);
    totalCostUsd += preTemperResult.costUsd;
    callbacks?.onMicroGateResult?.(preTemperResult);
  }

  // ── Phase 4: TEMPER ────────────────────────────────────

  log.info('pipeline', 'phase_start', { phase: 'TEMPER', detail: 'Running quality gates T0-T6' });
  callbacks?.onPhaseStart?.('TEMPER', 'Running quality gates T0-T6');
  const temperStart = Date.now();

  gateSummary = await runAllGates({
    workDir,
    target: '.',
    onGateComplete: (result) => {
      callbacks?.onGateResult?.(result.tier, result.status, result.detail);
    },
  });

  gateVerdict = gateSummary.verdict;
  const temperStatus: PipelinePhaseStatus = gateSummary.verdict === 'FAIL' ? 'failed' : (gateSummary.verdict === 'WARN' ? 'passed' : 'passed');
  updatePhase('TEMPER', temperStatus, Date.now() - temperStart, `${gateSummary.verdict} | ${gateSummary.passed}P ${gateSummary.failed}F ${gateSummary.warned}W`);
  log.info('pipeline', 'phase_complete', { phase: 'TEMPER', status: temperStatus, durationMs: Date.now() - temperStart, verdict: gateSummary.verdict });
  callbacks?.onPhaseComplete?.('TEMPER', temperStatus);

  // ── Phase 5: INSPECT ───────────────────────────────────

  callbacks?.onPhaseStart?.('INSPECT', 'Security review');
  const inspectStart = Date.now();

  const secGate = gateSummary.gates.find((g) => g.tier === 'T4');
  const inspectStatus: PipelinePhaseStatus = secGate
    ? (secGate.status === 'fail' ? 'failed' : 'passed')
    : 'skipped';
  const inspectDetail = secGate
    ? (secGate.status === 'pass' ? 'Clean' : secGate.detail.split('\n')[0].slice(0, 80))
    : 'No security gate available';

  updatePhase('INSPECT', inspectStatus, Date.now() - inspectStart, inspectDetail);
  callbacks?.onPhaseComplete?.('INSPECT', inspectStatus);

  // ── Phase 6: DEBRIEF ───────────────────────────────────

  callbacks?.onPhaseStart?.('DEBRIEF', 'Persisting run metadata');
  const debriefStart = Date.now();

  const result = buildResult(
    runId, phases, storyExecutions, gateVerdict,
    totalCostUsd, totalInputTokens, totalOutputTokens,
    pipelineStart, prds, workDir,
  );

  // Attach micro-gate summary
  result.microGateSummary = {
    totalRun: allMicroGateResults.length,
    totalPassed: allMicroGateResults.filter((r) => r.verdict === 'PASS').length,
    totalFailed: allMicroGateResults.filter((r) => r.verdict === 'FAIL').length,
    totalWarned: allMicroGateResults.filter((r) => r.verdict === 'WARN').length,
    totalCostUsd: allMicroGateResults.reduce((sum, r) => sum + r.costUsd, 0),
    preTemperAdvisory: preTemperResult || undefined,
  };

  // Persist run to disk
  const runsDir = join(workDir, RUNS_DIR);
  if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });

  const runBundle = {
    run_id: runId,
    status: storiesFailed === 0 && gateVerdict !== 'FAIL' ? 'COMPLETED' : 'PARTIAL',
    started_at: new Date(pipelineStart).toISOString(),
    completed_at: new Date().toISOString(),
    prd_files: prds.map((p) => `genesis/${p.file}`),
    phases: phases.map((p) => ({ name: p.name, status: p.status, durationMs: p.durationMs, detail: p.detail })),
    stories: storyExecutions,
    gates: gateSummary ? {
      verdict: gateSummary.verdict,
      passed: gateSummary.passed,
      failed: gateSummary.failed,
      warned: gateSummary.warned,
      skipped: gateSummary.skipped,
    } : null,
    totalCostUsd,
    totalTokens: { input: totalInputTokens, output: totalOutputTokens },
    microGates: {
      total: allMicroGateResults.length,
      passed: allMicroGateResults.filter((r) => r.verdict === 'PASS').length,
      failed: allMicroGateResults.filter((r) => r.verdict === 'FAIL').length,
      warned: allMicroGateResults.filter((r) => r.verdict === 'WARN').length,
      totalCostUsd: allMicroGateResults.reduce((sum, r) => sum + r.costUsd, 0),
      preTemperAdvisory: preTemperResult
        ? { verdict: preTemperResult.verdict, summary: preTemperResult.summary }
        : null,
    },
  };

  writeFileSync(join(runsDir, `${runId}.json`), JSON.stringify(runBundle, null, 2), 'utf-8');

  // Harvest knowledge entries to memory_bank/knowledge/*.jsonl
  const harvestResult = harvestRunMemory({
    runId,
    workDir,
    storiesCompleted,
    storiesFailed,
    storiesTotal: allStoryFiles.length,
    totalCostUsd,
    gateVerdict,
    gateSummary: gateSummary
      ? { passed: gateSummary.passed, failed: gateSummary.failed, warned: gateSummary.warned }
      : null,
    storyExecutions,
    microGateResults: allMicroGateResults,
    prdFiles: prds.map((p) => `genesis/${p.file}`),
  });
  log.info('pipeline', 'memory_harvest', { entriesWritten: harvestResult.entriesWritten });

  // ── Session Recorder: detect anomalies and write issue report ──
  recorder.detectAnomalies(result);
  const issueReport = recorder.writeReport(workDir);
  const issueCount = recorder.getIssueCount();
  const blockerCount = recorder.getBlockerCount();
  log.info('pipeline', 'session_report', {
    issues: issueCount,
    blockers: blockerCount,
    anomalies: recorder.getAnomalies().length,
    reportPath: issueReport.mdPath,
  });

  const debriefDetail = issueCount > 0
    ? `Run saved: ${RUNS_DIR}/${runId}.json | ${harvestResult.entriesWritten} knowledge entries | ${issueCount} issues (${blockerCount} blockers) → ${basename(issueReport.mdPath)}`
    : `Run saved: ${RUNS_DIR}/${runId}.json | ${harvestResult.entriesWritten} knowledge entries | Clean run`;

  updatePhase('DEBRIEF', 'passed', Date.now() - debriefStart, debriefDetail);
  callbacks?.onPhaseComplete?.('DEBRIEF', 'passed');

  // ── Phase 7: FINISH ────────────────────────────────────

  callbacks?.onPhaseStart?.('FINISH', 'Running finisher checks');
  const finishStart = Date.now();

  const finisherSummary = await runFinisher({
    workDir,
    mode: 'fix',
    storiesCompleted,
    onCheck: (checkResult) => {
      callbacks?.onFinisherCheck?.(checkResult);
    },
  });

  result.finisherSummary = finisherSummary;

  // Attach session report summary
  result.sessionReport = {
    issues: issueCount,
    blockers: blockerCount,
    anomalies: recorder.getAnomalies().length,
    reportPath: issueReport.mdPath,
  };

  // Append finisher results to the run bundle
  const runBundlePath = join(runsDir, `${runId}.json`);
  if (existsSync(runBundlePath)) {
    const savedBundle = JSON.parse(readFileSync(runBundlePath, 'utf-8'));
    savedBundle.finisher = {
      totalChecks: finisherSummary.totalChecks,
      ok: finisherSummary.ok,
      drifted: finisherSummary.drifted,
      fixed: finisherSummary.fixed,
      errors: finisherSummary.errors,
      newVersion: finisherSummary.newVersion || null,
    };
    writeFileSync(runBundlePath, JSON.stringify(savedBundle, null, 2), 'utf-8');
  }

  const finishDetail = `${finisherSummary.ok} ok, ${finisherSummary.fixed} fixed, ${finisherSummary.drifted} drift${finisherSummary.newVersion ? ` → v${finisherSummary.newVersion}` : ''}`;
  updatePhase('FINISH', 'passed', Date.now() - finishStart, finishDetail);
  callbacks?.onPhaseComplete?.('FINISH', 'passed');

  log.info('pipeline', 'run_complete', {
    runId,
    stories: allStoryFiles.length,
    completed: storiesCompleted,
    failed: storiesFailed,
    cost: totalCostUsd,
    durationMs: Date.now() - pipelineStart,
  });

  return result;
}

// ── Helpers ────────────────────────────────────────────────────

function buildResult(
  runId: string,
  phases: PipelinePhase[],
  storyExecutions: Record<string, StoryExecution>,
  gateVerdict: string,
  totalCostUsd: number,
  totalInputTokens: number,
  totalOutputTokens: number,
  pipelineStart: number,
  prds: PRDInfo[],
  _workDir: string,
): PipelineResult {
  const stories = Object.values(storyExecutions);
  return {
    runId,
    phases: [...phases],
    storiesTotal: stories.length,
    storiesCompleted: stories.filter((s) => s.status === 'completed').length,
    storiesFailed: stories.filter((s) => s.status === 'failed').length,
    gateVerdict,
    totalCostUsd,
    totalTokens: { input: totalInputTokens, output: totalOutputTokens },
    durationMs: Date.now() - pipelineStart,
  };
}
