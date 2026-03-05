// Pipeline execution engine — the real Forge.
// Chains: discover PRDs → validate → generate stories → execute stories → gates → report.
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runAgentLoop } from './ai-runner.js';
import { runAllGates, runSingleGate } from './gates.js';
import { runPostStoryGates, runPreTemperGate, formatFindingsForFixer } from './micro-gates.js';
import { runFinisher } from './finisher.js';
import { ALL_TOOLS } from './tools.js';
const RUNS_DIR = '.skillfoundry/runs';
const MAX_FIXER_ATTEMPTS = 2;
export function scanPRDs(workDir) {
    const genesisDir = join(workDir, 'genesis');
    if (!existsSync(genesisDir))
        return [];
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
export function scanStories(workDir) {
    const storiesDir = join(workDir, 'docs', 'stories');
    if (!existsSync(storiesDir))
        return [];
    return readdirSync(storiesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => {
        const storyDir = join(storiesDir, d.name);
        const storyFiles = readdirSync(storyDir).filter((f) => f.startsWith('STORY-') && f.endsWith('.md'));
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
// ── Story generation system prompt ─────────────────────────────
const STORY_GENERATION_PROMPT = `You are a senior software architect decomposing a PRD into implementation stories.

RULES:
- Each story must be self-contained: a developer needs no external context beyond the story.
- Stories are ordered by dependency: foundational work first, features second, integration last.
- Each story has: title, description, acceptance criteria, technical approach, and files affected.
- Output stories separated by "---STORY---" markers for reliable parsing.

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

## Technical Approach
<how to implement, including file paths and patterns>

## Files Affected
- <file path>: <what changes>
---STORY---

Number stories sequentially starting at 001. Be specific about file paths and code patterns.`;
// ── Story execution system prompt ──────────────────────────────
const STORY_EXECUTION_PROMPT = `You are a senior software engineer implementing a story from a PRD.

RULES:
- Read the codebase first to understand existing patterns before writing code.
- Implement the story requirements exactly as specified.
- Write real, production-ready code — no placeholders, TODOs, or stubs.
- Run tests after implementation to verify correctness.
- Follow existing code conventions (naming, structure, patterns).

You have tools to read files, write files, search the codebase, and execute shell commands.
Implement the story below completely.`;
const FIXER_PROMPT = `You are a senior engineer fixing quality gate violations.
The previous implementation triggered the following gate failures.
Fix ALL violations — do not introduce new issues. Keep changes minimal and targeted.`;
// ── Pipeline execution ─────────────────────────────────────────
function makePhase(name) {
    return { name, status: 'pending', durationMs: 0 };
}
export async function runPipeline(options) {
    const { config, policy, workDir, prdFilter, callbacks } = options;
    const runId = `forge-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const pipelineStart = Date.now();
    const phases = [
        makePhase('IGNITE'),
        makePhase('PLAN'),
        makePhase('FORGE'),
        makePhase('TEMPER'),
        makePhase('INSPECT'),
        makePhase('DEBRIEF'),
        makePhase('FINISH'),
    ];
    let totalCostUsd = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const storyExecutions = {};
    let gateVerdict = 'UNKNOWN';
    let gateSummary = null;
    const allMicroGateResults = [];
    function updatePhase(name, status, durationMs, detail) {
        const phase = phases.find((p) => p.name === name);
        if (phase) {
            phase.status = status;
            phase.durationMs = durationMs;
            if (detail)
                phase.detail = detail;
        }
    }
    // ── Phase 1: IGNITE ────────────────────────────────────
    callbacks?.onPhaseStart?.('IGNITE', 'Validating PRDs');
    const igniteStart = Date.now();
    let prds = scanPRDs(workDir);
    if (prdFilter) {
        prds = prds.filter((p) => p.file === prdFilter || p.file.includes(prdFilter));
    }
    if (prds.length === 0) {
        updatePhase('IGNITE', 'failed', Date.now() - igniteStart, 'No PRDs found in genesis/');
        callbacks?.onPhaseComplete?.('IGNITE', 'failed');
        return buildResult(runId, phases, storyExecutions, gateVerdict, totalCostUsd, totalInputTokens, totalOutputTokens, pipelineStart, prds, workDir);
    }
    updatePhase('IGNITE', 'passed', Date.now() - igniteStart, `${prds.length} PRD(s) validated`);
    callbacks?.onPhaseComplete?.('IGNITE', 'passed');
    // ── Phase 2: PLAN ──────────────────────────────────────
    callbacks?.onPhaseStart?.('PLAN', 'Checking for existing stories');
    const planStart = Date.now();
    const allStoryFiles = [];
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
        const storyMessages = [
            {
                role: 'user',
                content: `Here is the PRD to decompose into implementation stories:\n\n${prd.content}`,
            },
        ];
        const storyResult = await runAgentLoop(storyMessages, {
            config,
            policy,
            systemPrompt: STORY_GENERATION_PROMPT,
            tools: [], // No tools needed for story generation
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
            const normalizedContent = block.replace(/^(#\s+)STORY-\d+/m, `$1STORY-${numStr}`);
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
    callbacks?.onPhaseComplete?.('PLAN', 'passed');
    // ── Phase 3: FORGE ─────────────────────────────────────
    // Filter to only pending stories — skip already-completed ones
    const pendingStoryFiles = allStoryFiles.filter((s) => !s.alreadyDone);
    const skippedCount = allStoryFiles.length - pendingStoryFiles.length;
    const forgeDetail = skippedCount > 0
        ? `Implementing ${pendingStoryFiles.length} stories (${skippedCount} already done, skipped)`
        : `Implementing ${pendingStoryFiles.length} stories`;
    callbacks?.onPhaseStart?.('FORGE', forgeDetail);
    const forgeStart = Date.now();
    let storiesCompleted = skippedCount; // Count already-done as completed
    let storiesFailed = 0;
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
        const { storyFile, storyPath } = pendingStoryFiles[i];
        callbacks?.onStoryStart?.(storyFile, i, pendingStoryFiles.length);
        const storyContent = readFileSync(storyPath, 'utf-8');
        const execution = {
            storyFile,
            status: 'running',
            turnCount: 0,
            costUsd: 0,
            fixerAttempts: 0,
        };
        storyExecutions[storyFile] = execution;
        // Execute the story
        const storyMessages = [
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
        // ── Micro-gates: post-story AI review (MG1 security, MG2 standards) ──
        const mgResults = await runPostStoryGates(storyFile, storyContent, {
            config, policy, workDir,
        });
        execution.microGateResults = mgResults;
        for (const mgr of mgResults) {
            allMicroGateResults.push(mgr);
            execution.costUsd += mgr.costUsd;
            totalCostUsd += mgr.costUsd;
            callbacks?.onMicroGateResult?.(mgr);
        }
        // Quick T1 gate check after story implementation
        const t1Result = runSingleGate('T1', workDir, '.');
        callbacks?.onGateResult?.('T1', t1Result.status);
        const mgFailed = mgResults.some((r) => r.verdict === 'FAIL');
        if (t1Result.status === 'fail' || mgFailed) {
            // Fixer loop: attempt to fix T1 violations and/or micro-gate failures
            let fixed = false;
            for (let attempt = 0; attempt < MAX_FIXER_ATTEMPTS && !fixed; attempt++) {
                execution.fixerAttempts++;
                const microGateFindings = formatFindingsForFixer(mgResults);
                const fixerDetail = [
                    t1Result.status === 'fail' ? `T1 gate violations:\n${t1Result.detail}` : '',
                    microGateFindings || '',
                ].filter(Boolean).join('\n\n');
                const fixerMessages = [
                    {
                        role: 'user',
                        content: `${FIXER_PROMPT}\n\n${fixerDetail}\n\nFix all issues in the codebase.`,
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
                // Re-check T1
                const recheck = runSingleGate('T1', workDir, '.');
                if (recheck.status !== 'fail') {
                    fixed = true;
                }
            }
            if (!fixed) {
                execution.status = 'failed';
                storiesFailed++;
                callbacks?.onStoryComplete?.(storyFile, false, execution.costUsd);
                continue;
            }
        }
        execution.status = 'completed';
        storiesCompleted++;
        callbacks?.onStoryComplete?.(storyFile, true, execution.costUsd);
    }
    const forgeStatus = storiesFailed === 0 ? 'passed' : (storiesCompleted > 0 ? 'passed' : 'failed');
    updatePhase('FORGE', forgeStatus, Date.now() - forgeStart, `${storiesCompleted}/${allStoryFiles.length} stories completed`);
    callbacks?.onPhaseComplete?.('FORGE', forgeStatus);
    // ── Pre-TEMPER: Cross-story review (MG3 — advisory only) ──
    const completedStoryFiles = Object.entries(storyExecutions)
        .filter(([, ex]) => ex.status === 'completed')
        .map(([file]) => file);
    let preTemperResult = null;
    if (completedStoryFiles.length > 0) {
        preTemperResult = await runPreTemperGate(completedStoryFiles, {
            config, policy, workDir,
        });
        allMicroGateResults.push(preTemperResult);
        totalCostUsd += preTemperResult.costUsd;
        callbacks?.onMicroGateResult?.(preTemperResult);
    }
    // ── Phase 4: TEMPER ────────────────────────────────────
    callbacks?.onPhaseStart?.('TEMPER', 'Running quality gates T1-T6');
    const temperStart = Date.now();
    gateSummary = await runAllGates({
        workDir,
        target: '.',
        onGateComplete: (result) => {
            callbacks?.onGateResult?.(result.tier, result.status);
        },
    });
    gateVerdict = gateSummary.verdict;
    const temperStatus = gateSummary.verdict === 'FAIL' ? 'failed' : (gateSummary.verdict === 'WARN' ? 'passed' : 'passed');
    updatePhase('TEMPER', temperStatus, Date.now() - temperStart, `${gateSummary.verdict} | ${gateSummary.passed}P ${gateSummary.failed}F ${gateSummary.warned}W`);
    callbacks?.onPhaseComplete?.('TEMPER', temperStatus);
    // ── Phase 5: INSPECT ───────────────────────────────────
    callbacks?.onPhaseStart?.('INSPECT', 'Security review');
    const inspectStart = Date.now();
    const secGate = gateSummary.gates.find((g) => g.tier === 'T4');
    const inspectStatus = secGate
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
    const result = buildResult(runId, phases, storyExecutions, gateVerdict, totalCostUsd, totalInputTokens, totalOutputTokens, pipelineStart, prds, workDir);
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
    if (!existsSync(runsDir))
        mkdirSync(runsDir, { recursive: true });
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
    updatePhase('DEBRIEF', 'passed', Date.now() - debriefStart, `Run saved: ${RUNS_DIR}/${runId}.json`);
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
    return result;
}
// ── Helpers ────────────────────────────────────────────────────
function buildResult(runId, phases, storyExecutions, gateVerdict, totalCostUsd, totalInputTokens, totalOutputTokens, pipelineStart, prds, _workDir) {
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
//# sourceMappingURL=pipeline.js.map