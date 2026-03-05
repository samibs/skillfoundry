// Micro-gates — lightweight single-turn AI reviews at pipeline handoff points.
// MG1: Security review (post-coder, per-story)
// MG2: Standards review (post-coder, per-story)
// MG3: Cross-story review (pre-TEMPER, advisory)
import { runAgentLoop } from './ai-runner.js';
import { getAgentSystemPrompt, TOOL_SETS } from './agent-registry.js';
const MG1_SECURITY = {
    gate: 'MG1',
    agent: 'security',
    prompt: `Review the changes made for this story. Check for:
- Security vulnerabilities (OWASP Top 10)
- Missing input validation or sanitization
- Hardcoded secrets, API keys, or credentials
- Insecure authentication or authorization patterns
- SQL injection, XSS, or CSRF vulnerabilities
- Sensitive data exposure in logs or responses

Respond in this EXACT format:
VERDICT: PASS | FAIL | WARN
FINDINGS:
- [SEVERITY] Description (file:line)
SUMMARY: One-line summary`,
    maxTurns: 3,
};
const MG2_STANDARDS = {
    gate: 'MG2',
    agent: 'standards',
    prompt: `Review the code written for this story. Check for:
- Missing documentation on public methods/exports
- Magic numbers or uncommented complex logic
- Inconsistent naming conventions
- Missing error handling
- Code that violates project conventions in CLAUDE.md
- Placeholder patterns (TODO, FIXME, HACK, STUB)

Respond in this EXACT format:
VERDICT: PASS | FAIL | WARN
FINDINGS:
- [SEVERITY] Description (file:line)
SUMMARY: One-line summary`,
    maxTurns: 3,
};
const MG3_REVIEW = {
    gate: 'MG3',
    agent: 'review',
    prompt: `Review all changes made across all stories in this pipeline run. Check for:
- Cross-story inconsistencies (conflicting patterns, duplicate code)
- Architectural issues (circular dependencies, layer violations)
- Integration problems between stories
- Missing shared types or interfaces
- Inconsistent error handling patterns across modules

Respond in this EXACT format:
VERDICT: PASS | FAIL | WARN
FINDINGS:
- [SEVERITY] Description (file:line)
SUMMARY: One-line summary`,
    maxTurns: 3,
};
// ── Response parsing ──────────────────────────────────────────
export function parseMicroGateResponse(content) {
    let verdict = 'WARN';
    const findings = [];
    let summary = '';
    // Parse VERDICT line (flexible: "VERDICT: WARN", "**VERDICT:** WARN", etc.)
    const verdictMatch = content.match(/\*?\*?VERDICT\*?\*?:?\s*(PASS|FAIL|WARN)/mi);
    if (verdictMatch) {
        verdict = verdictMatch[1];
    }
    // Parse FINDINGS section — try strict format first, then loose
    let findingsBlock = '';
    const strictMatch = content.match(/FINDINGS:\s*\n([\s\S]*?)(?=\n\s*SUMMARY:)/mi);
    if (strictMatch) {
        findingsBlock = strictMatch[1];
    }
    else {
        // Loose: grab everything between FINDINGS: and the end (or SUMMARY:)
        const looseMatch = content.match(/FINDINGS:\s*\n([\s\S]*?)$/mi);
        if (looseMatch) {
            // Strip trailing SUMMARY line if present
            findingsBlock = looseMatch[1].replace(/^SUMMARY:.*$/mi, '').trim();
        }
    }
    if (findingsBlock) {
        // Match lines starting with -, *, or numbered lists
        const findingLines = findingsBlock.split('\n').filter((l) => /^\s*[-*•]\s|^\s*\d+[.)]\s/.test(l));
        for (const line of findingLines) {
            const cleaned = line.replace(/^\s*[-*•]\s*/, '').replace(/^\s*\d+[.)]\s*/, '').trim();
            if (!cleaned)
                continue;
            // Try to extract [SEVERITY] Description (file:line)
            const parsed = cleaned.match(/^\[?(CRITICAL|HIGH|MEDIUM|LOW|INFO)\]?\s*(.+?)(?:\(([^)]+)\))?\s*$/i);
            if (parsed) {
                findings.push({
                    severity: parsed[1].toUpperCase(),
                    description: parsed[2].trim(),
                    location: parsed[3]?.trim(),
                });
            }
            else {
                // Fallback: treat entire line as MEDIUM finding
                findings.push({
                    severity: 'MEDIUM',
                    description: cleaned,
                });
            }
        }
    }
    // Parse SUMMARY line
    const summaryMatch = content.match(/\*?\*?SUMMARY\*?\*?:?\s*(.+)/mi);
    if (summaryMatch) {
        summary = summaryMatch[1].trim();
    }
    // Fallback summary: if no SUMMARY line but we have findings, generate one
    if (!summary && findings.length > 0) {
        const critical = findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH').length;
        const total = findings.length;
        summary = critical > 0
            ? `${critical} critical/high issue${critical > 1 ? 's' : ''} found (${total} total)`
            : `${total} issue${total > 1 ? 's' : ''} found`;
    }
    // Fallback summary from content: if still no summary, extract first meaningful sentence
    if (!summary && content.length > 0) {
        const firstLine = content.split('\n').find((l) => l.trim().length > 10 && !l.match(/^(VERDICT|FINDINGS|SUMMARY)/i));
        if (firstLine) {
            summary = firstLine.trim().slice(0, 120);
        }
    }
    // Safety override: PASS with CRITICAL/HIGH findings → FAIL
    if (verdict === 'PASS' &&
        findings.some((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH')) {
        verdict = 'FAIL';
    }
    return { verdict, findings, summary };
}
// ── Gate runners ──────────────────────────────────────────────
async function runSingleMicroGate(mgConfig, storyContext, options) {
    const start = Date.now();
    const basePrompt = getAgentSystemPrompt(mgConfig.agent);
    const systemPrompt = `${basePrompt}\n\n${mgConfig.prompt}`;
    const messages = [
        {
            role: 'user',
            content: storyContext,
        },
    ];
    const result = await runAgentLoop(messages, {
        config: options.config,
        policy: options.policy,
        systemPrompt,
        tools: TOOL_SETS.REVIEW,
        maxTurns: mgConfig.maxTurns,
        workDir: options.workDir,
    });
    // Detect provider errors — runAgentLoop catches connection/auth failures
    // and returns the error as content. Don't parse these as gate verdicts.
    const isProviderError = /^(Provider error|Network error|Authentication error|Model not available|Quota\/billing error|SSL\/Certificate error|Budget exceeded|Connection error)/i.test(result.content);
    if (isProviderError) {
        return {
            gate: mgConfig.gate,
            agent: mgConfig.agent,
            verdict: 'WARN',
            findings: [],
            summary: result.content.split('\n')[0].slice(0, 120),
            costUsd: result.totalCostUsd,
            turnCount: result.turnCount,
            durationMs: Date.now() - start,
            skippedDueToError: true,
        };
    }
    const parsed = parseMicroGateResponse(result.content);
    return {
        gate: mgConfig.gate,
        agent: mgConfig.agent,
        verdict: parsed.verdict,
        findings: parsed.findings,
        summary: parsed.summary,
        costUsd: result.totalCostUsd,
        turnCount: result.turnCount,
        durationMs: Date.now() - start,
    };
}
/**
 * Run post-story micro-gates (MG1 security + MG2 standards).
 * Called after each story implementation, before the T1 gate.
 */
export async function runPostStoryGates(storyFile, storyContent, options) {
    const storyContext = `Story being reviewed: ${storyFile}\n\n` +
        `Story content:\n${storyContent}\n\n` +
        `Review the code changes for this story in the project working directory. Use the tools to inspect the relevant files.`;
    const results = [];
    const mg1 = await runSingleMicroGate(MG1_SECURITY, storyContext, options);
    results.push(mg1);
    const mg2 = await runSingleMicroGate(MG2_STANDARDS, storyContext, options);
    results.push(mg2);
    return results;
}
/**
 * Run pre-TEMPER cross-story review gate (MG3).
 * Called once after all stories complete, before T1-T6.
 * Advisory only — findings are warnings, not blockers.
 */
export async function runPreTemperGate(completedStories, options) {
    const storyContext = `This pipeline implemented ${completedStories.length} stories:\n` +
        completedStories.map((s) => `- ${s}`).join('\n') +
        `\n\nReview all changes across these stories for cross-cutting issues. Use the tools to inspect the codebase.`;
    return runSingleMicroGate(MG3_REVIEW, storyContext, options);
}
/**
 * Format micro-gate findings as text for the fixer prompt.
 * Only includes FAIL/WARN gates — PASS gates are omitted.
 */
export function formatFindingsForFixer(results) {
    const actionable = results.filter((r) => r.verdict !== 'PASS');
    if (actionable.length === 0)
        return '';
    const lines = ['Micro-gate findings to address:'];
    for (const r of actionable) {
        lines.push(`\n[${r.gate}] ${r.agent} — ${r.verdict}`);
        for (const f of r.findings) {
            const loc = f.location ? ` (${f.location})` : '';
            lines.push(`  - [${f.severity}] ${f.description}${loc}`);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=micro-gates.js.map