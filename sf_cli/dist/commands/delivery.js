/**
 * /delivery — Delivery Efficiency.
 *
 * Operator surface for the risk-based execution layer: classify a task's delivery budget,
 * pick the narrowest sufficient test scope, reuse validation that is still provably valid,
 * and decide objectively when a task is finished.
 *
 * Usage:
 *   /delivery status                        Settings and mission summary
 *   /delivery budget "<task text>" [--files a,b] [--override HIGH]
 *   /delivery policy <LOW|MEDIUM|HIGH>      Execution policy for a budget
 *   /delivery scope --budget MEDIUM [--files a,b] [--dependents 20] [--gate]
 *   /delivery check --kind test --command "npm test" [--files a,b]
 *   /delivery evidence [list|clear]
 *   /delivery context                       Shared mission facts and handoffs
 *   /delivery gate                          Integration-gate plan from recorded handoffs
 *   /delivery complete --budget MEDIUM ...  Stop-condition verdict
 *   /delivery efficiency                    Per-task efficiency report
 */
import { assignBudget, executionPolicy, chooseTestScope, shouldRunValidation, checkCompletion, loadDeliverySettings, escalateBudget, } from '../core/delivery.js';
import { isDeliveryBudgetLevel, DELIVERY_BUDGETS, } from '../core/delivery-budget.js';
import { isTestScope, TEST_SCOPES } from '../core/delivery-policy.js';
import { loadEvidenceStore, clearEvidence, activeClaims, isValidationKind, VALIDATION_KINDS, } from '../core/delivery-evidence.js';
import { summarizeContext, listHandoffs } from '../core/delivery-context.js';
import { planIntegrationGate, describeIntegrationPlan } from '../core/delivery-integration.js';
import { buildEfficiencyReport, formatEfficiencyReport } from '../core/delivery-metrics.js';
import { planTask, detectChangedFiles } from '../core/delivery-runner.js';
import { measureImpact, describeImpact } from '../core/delivery-impact.js';
import { isGitRepo, topLevel } from '../core/mission-git.js';
/** Parse `sub "quoted text" --flag value --other=value --bool`. */
function parseArgs(raw) {
    const tokens = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m;
    while ((m = re.exec(raw)) !== null)
        tokens.push(m[1] ?? m[2] ?? m[3]);
    const positional = [];
    const flags = {};
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (!t.startsWith('--')) {
            positional.push(t);
            continue;
        }
        const body = t.slice(2);
        if (body.includes('=')) {
            const idx = body.indexOf('=');
            flags[body.slice(0, idx)] = body.slice(idx + 1);
            continue;
        }
        const next = tokens[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
            flags[body] = next;
            i++;
        }
        else
            flags[body] = true;
    }
    return { positional, flags };
}
function flagString(flags, name) {
    const v = flags[name];
    return typeof v === 'string' ? v : undefined;
}
function flagList(flags, name) {
    const v = flagString(flags, name);
    return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
}
function flagBool(flags, name) {
    return flags[name] === true || flags[name] === 'true';
}
// ── Output helpers ────────────────────────────────────────────────────────────
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const ok = (s) => `${GREEN}✓${RESET} ${s}`;
const bad = (s) => `${RED}✗${RESET} ${s}`;
const warn = (s) => `${YELLOW}⚠${RESET} ${s}`;
const head = (s) => `\n  ${BOLD}${s}${RESET}\n  ${'─'.repeat(s.length)}`;
function budgetColor(level) {
    if (level === 'HIGH')
        return `${RED}${level}${RESET}`;
    if (level === 'MEDIUM')
        return `${YELLOW}${level}${RESET}`;
    return `${GREEN}${level}${RESET}`;
}
function requireBudgetFlag(flags) {
    const raw = flagString(flags, 'budget');
    if (!raw)
        throw new Error(`--budget is required. One of: ${DELIVERY_BUDGETS.join(', ')}`);
    const upper = raw.toUpperCase();
    if (!isDeliveryBudgetLevel(upper)) {
        throw new Error(`Unknown budget "${raw}". One of: ${DELIVERY_BUDGETS.join(', ')}`);
    }
    return upper;
}
// ── Handlers ──────────────────────────────────────────────────────────────────
function handleStatus(workDir) {
    const s = loadDeliverySettings(workDir);
    const summary = summarizeContext(workDir, 'default');
    const store = loadEvidenceStore(workDir);
    const lines = [head('Delivery Efficiency')];
    lines.push(`  Enabled:                 ${s.enabled ? ok('yes') : warn('no — full validation everywhere')}`);
    lines.push(`  Default budget:          ${budgetColor(s.default_budget)}`);
    lines.push(`  Evidence reuse:          ${s.evidence_reuse ? 'on' : 'off'}`);
    lines.push(`  Validation dedup:        ${s.validation_deduplication ? 'on' : 'off'}`);
    lines.push(`  Test scope policy:       ${s.test_scope_policy}`);
    lines.push(`  Stop when proven:        ${s.stop_when_proven ? 'on' : 'off'}`);
    lines.push('');
    lines.push(`  Evidence entries:        ${Object.keys(store.entries).length}`);
    lines.push(`  Validations in flight:   ${activeClaims(workDir).length}`);
    lines.push(`  Mission facts:           ${summary.authoritative} authoritative, ${summary.inferred} inferred, ${summary.assumptions} assumption(s), ${summary.invalidated} invalidated`);
    lines.push(`  Worker handoffs:         ${summary.handoffs}`);
    if (summary.stale)
        lines.push(`  ${warn('Shared context predates the current tree — facts may be stale.')}`);
    lines.push('');
    return lines.join('\n');
}
function handleBudget(workDir, args) {
    const text = args.positional.slice(1).join(' ');
    const files = flagList(args.flags, 'files');
    if (!text && files.length === 0) {
        throw new Error('Usage: /delivery budget "<task text>" [--files a.ts,b.ts] [--override LOW|MEDIUM|HIGH]');
    }
    const overrideRaw = flagString(args.flags, 'override');
    const override = overrideRaw?.toUpperCase();
    if (override && !isDeliveryBudgetLevel(override)) {
        throw new Error(`Unknown override "${overrideRaw}". One of: ${DELIVERY_BUDGETS.join(', ')}`);
    }
    const budget = assignBudget(workDir, {
        text: text || undefined,
        changedFiles: files.length > 0 ? files : undefined,
        override: override,
        allowUnsafeOverride: flagBool(args.flags, 'allow-unsafe-override'),
    });
    const policy = executionPolicy(budget.level);
    const lines = [head('Delivery budget')];
    lines.push(`  Level:      ${budgetColor(budget.level)}${budget.overridden ? ' (overridden)' : ''}`);
    lines.push(`  Source:     ${budget.source}`);
    lines.push(`  Reason:     ${budget.reason}`);
    if (budget.safetyCritical) {
        lines.push(`  ${bad('Safety-critical — required checks cannot be skipped or downgraded.')}`);
    }
    if (budget.signals.length > 0) {
        lines.push('');
        lines.push(`  ${BOLD}Signals${RESET}`);
        for (const sig of budget.signals.slice(0, 8))
            lines.push(`    ${DIM}·${RESET} ${sig}`);
    }
    lines.push('');
    lines.push(`  ${BOLD}Execution policy${RESET}`);
    for (const step of policy.steps) {
        lines.push(`    ${step.conditional ? DIM + '○' + RESET : '·'} ${step.id.padEnd(22)} ${step.description}`);
    }
    lines.push('');
    lines.push(`  Base test scope:            ${policy.baseTestScope}`);
    lines.push(`  Repo-wide at worker level:  ${policy.allowRepoWideAtWorker ? 'permitted' : 'deferred to the integration gate'}`);
    lines.push('');
    return lines.join('\n');
}
function handlePolicy(args) {
    const raw = args.positional[1];
    if (!raw)
        throw new Error(`Usage: /delivery policy <${DELIVERY_BUDGETS.join('|')}>`);
    const level = raw.toUpperCase();
    if (!isDeliveryBudgetLevel(level)) {
        throw new Error(`Unknown budget "${raw}". One of: ${DELIVERY_BUDGETS.join(', ')}`);
    }
    const policy = executionPolicy(level);
    const lines = [head(`Execution policy — ${level}`)];
    for (const step of policy.steps) {
        lines.push(`  ${step.conditional ? DIM + '○' + RESET : '·'} ${step.id.padEnd(22)} ${step.description}`);
    }
    lines.push('');
    lines.push(`  Base test scope:      ${policy.baseTestScope}`);
    lines.push(`  Requires plan:        ${policy.requiresPlan}`);
    lines.push(`  Security checks:      ${policy.requiresSecurityChecks ? 'mandatory' : 'not required'}`);
    lines.push(`  Acceptance check:     ${policy.requiresAcceptanceVerification}`);
    lines.push(`  Regression pass:      ${policy.requiresRegression}`);
    lines.push('');
    return lines.join('\n');
}
function handleScope(workDir, args) {
    const budget = requireBudgetFlag(args.flags);
    const overrideRaw = flagString(args.flags, 'override');
    if (overrideRaw && !isTestScope(overrideRaw)) {
        throw new Error(`Unknown scope "${overrideRaw}". One of: ${TEST_SCOPES.join(', ')}`);
    }
    const dependentsRaw = flagString(args.flags, 'dependents');
    const dependentCount = dependentsRaw ? parseInt(dependentsRaw, 10) : 0;
    const decision = chooseTestScope(workDir, {
        budget,
        changedFiles: flagList(args.flags, 'files'),
        acceptanceCriteria: flagList(args.flags, 'ac'),
        override: overrideRaw,
        dependents: Number.isFinite(dependentCount)
            ? Array.from({ length: Math.max(0, dependentCount) }, (_, i) => `dependent-${i}`)
            : [],
        isIntegrationGate: flagBool(args.flags, 'gate'),
    });
    const lines = [head('Test scope')];
    lines.push(`  Scope: ${BOLD}${decision.scope}${RESET}`);
    if (decision.overrideRefused)
        lines.push(`  ${bad('Override refused — see reasons below.')}`);
    lines.push('');
    lines.push(`  ${BOLD}Why${RESET}`);
    for (const r of decision.reasons)
        lines.push(`    ${DIM}·${RESET} ${r}`);
    if (decision.avoided.length > 0) {
        lines.push('');
        lines.push(`  ${BOLD}Not run${RESET}`);
        for (const a of decision.avoided)
            lines.push(`    ${DIM}·${RESET} ${a.scope}: ${a.why}`);
    }
    lines.push('');
    return lines.join('\n');
}
function handleCheck(workDir, args) {
    const kindRaw = flagString(args.flags, 'kind');
    const command = flagString(args.flags, 'command');
    if (!kindRaw || !command) {
        throw new Error(`Usage: /delivery check --kind <${VALIDATION_KINDS.slice(0, 4).join('|')}|…> --command "npm test" [--files a,b] [--scope targeted]`);
    }
    if (!isValidationKind(kindRaw)) {
        throw new Error(`Unknown validation kind "${kindRaw}". One of: ${VALIDATION_KINDS.join(', ')}`);
    }
    const scopeRaw = flagString(args.flags, 'scope');
    if (scopeRaw && !isTestScope(scopeRaw)) {
        throw new Error(`Unknown scope "${scopeRaw}". One of: ${TEST_SCOPES.join(', ')}`);
    }
    const decision = shouldRunValidation(workDir, {
        kind: kindRaw,
        command,
        scope: scopeRaw,
        changedFiles: flagList(args.flags, 'files'),
    }, flagString(args.flags, 'owner') ?? 'cli');
    const icon = decision.action === 'REUSE' ? ok('') :
        decision.action === 'RUN' ? `${DIM}▸${RESET}` :
            decision.action === 'WAIT' ? warn('') : bad('');
    const lines = [head(`Validation — ${kindRaw}`)];
    lines.push(`  Command: ${command}`);
    lines.push(`  ${icon} ${BOLD}${decision.action}${RESET} — ${decision.reason}`);
    if (decision.evidence) {
        const e = decision.evidence;
        lines.push('');
        lines.push(`  Prior run: ${e.result} at ${e.createdAt}`);
        lines.push(`  Produced by: ${e.producedBy}${e.producedByAgent ? ` (${e.producedByAgent})` : ''}`);
        if (e.durationSeconds !== undefined)
            lines.push(`  Duration: ${e.durationSeconds}s`);
        lines.push(`  Scoped files: ${Object.keys(e.fileHashes).length || 'repository-wide'}`);
    }
    lines.push('');
    return lines.join('\n');
}
function handleEvidence(workDir, args) {
    const action = args.positional[1] ?? 'list';
    if (action === 'clear') {
        clearEvidence(workDir);
        return `\n  ${ok('Evidence store cleared. Every validation will run again.')}\n`;
    }
    const store = loadEvidenceStore(workDir);
    const entries = Object.values(store.entries);
    const lines = [head(`Evidence (${entries.length})`)];
    if (entries.length === 0) {
        lines.push(`  ${DIM}No validation evidence recorded yet.${RESET}`);
    }
    else {
        lines.push(`  ${DIM}${'KIND'.padEnd(20)}${'RESULT'.padEnd(8)}${'SCOPE'.padEnd(13)}${'FILES'.padEnd(7)}COMMAND${RESET}`);
        for (const e of entries) {
            const files = Object.keys(e.fileHashes).length;
            lines.push(`  ${e.kind.padEnd(20)}${e.result.padEnd(8)}${(e.scope ?? '—').padEnd(13)}${String(files || 'repo').padEnd(7)}${e.command.slice(0, 50)}`);
        }
    }
    const claims = activeClaims(workDir);
    if (claims.length > 0) {
        lines.push('');
        lines.push(`  ${BOLD}In flight${RESET}`);
        for (const c of claims)
            lines.push(`    ${DIM}·${RESET} ${c.key} held by ${c.owner} since ${c.at}`);
    }
    lines.push('');
    return lines.join('\n');
}
function handleContext(workDir, args) {
    const mission = flagString(args.flags, 'mission') ?? 'default';
    const summary = summarizeContext(workDir, mission);
    const handoffs = listHandoffs(workDir, mission);
    const lines = [head(`Mission context — ${summary.mission}`)];
    lines.push(`  Base commit:    ${summary.baseCommit?.slice(0, 12) ?? DIM + 'unknown' + RESET}`);
    lines.push(`  Authoritative:  ${summary.authoritative}`);
    lines.push(`  Inferred:       ${summary.inferred}`);
    lines.push(`  Assumptions:    ${summary.assumptions}`);
    lines.push(`  Invalidated:    ${summary.invalidated}`);
    lines.push(`  Evidence reused / generated: ${summary.evidenceReused} / ${summary.evidenceGenerated}`);
    if (summary.stale)
        lines.push(`  ${warn('Context predates the current tree.')}`);
    if (handoffs.length > 0) {
        lines.push('');
        lines.push(`  ${BOLD}Handoffs (${handoffs.length})${RESET}`);
        for (const h of handoffs) {
            lines.push(`    ${h.taskId.padEnd(16)} ${h.budget.padEnd(7)} ${h.validationScope.padEnd(12)} ` +
                `${h.changedFiles.length} file(s), reused ${h.evidenceReused.length}` +
                (h.unresolvedGaps.length > 0 ? `, ${h.unresolvedGaps.length} gap(s)` : ''));
        }
    }
    lines.push('');
    return lines.join('\n');
}
function handleGate(workDir, args) {
    const mission = flagString(args.flags, 'mission') ?? 'default';
    const handoffs = listHandoffs(workDir, mission);
    if (handoffs.length === 0) {
        return `\n  ${warn('No worker handoffs recorded — nothing to integrate.')}\n`;
    }
    const plan = planIntegrationGate(workDir, {
        handoffs,
        requiredValidations: [],
        integrationChangedFiles: flagList(args.flags, 'integration-files'),
        mission,
    });
    const lines = [head('Integration gate plan')];
    for (const line of describeIntegrationPlan(plan))
        lines.push(`  ${line}`);
    if (plan.untrustedHandoffs.length > 0) {
        lines.push('');
        lines.push(`  ${BOLD}Handoffs to re-prove${RESET}`);
        for (const v of plan.untrustedHandoffs) {
            lines.push(`    ${bad(v.taskId)}`);
            for (const p of v.problems)
                lines.push(`      ${DIM}·${RESET} ${p}`);
        }
    }
    if (plan.deduplicated.length > 0) {
        lines.push('');
        lines.push(`  ${BOLD}Worker runs not repeated${RESET}`);
        for (const d of plan.deduplicated)
            lines.push(`    ${ok(`${d.taskId} (${d.scope})`)} ${DIM}${d.why}${RESET}`);
    }
    lines.push('');
    return lines.join('\n');
}
function handleComplete(workDir, args) {
    const budget = requireBudgetFlag(args.flags);
    const scopeRaw = flagString(args.flags, 'passed-at');
    if (scopeRaw && !isTestScope(scopeRaw)) {
        throw new Error(`Unknown scope "${scopeRaw}". One of: ${TEST_SCOPES.join(', ')}`);
    }
    const requiredRaw = flagString(args.flags, 'required-scope');
    if (requiredRaw && !isTestScope(requiredRaw)) {
        throw new Error(`Unknown scope "${requiredRaw}". One of: ${TEST_SCOPES.join(', ')}`);
    }
    const verdict = checkCompletion(workDir, {
        budget,
        implementationComplete: flagBool(args.flags, 'implemented'),
        acceptanceCriteriaProven: Number(flagString(args.flags, 'ac-proven') ?? '0') || 0,
        acceptanceCriteriaTotal: Number(flagString(args.flags, 'ac-total') ?? '0') || 0,
        validationPassedAtScope: scopeRaw,
        requiredScope: requiredRaw ?? executionPolicy(budget).baseTestScope,
        blockers: flagList(args.flags, 'blockers'),
        diffInspected: flagBool(args.flags, 'diff-inspected'),
        evidenceRecorded: flagBool(args.flags, 'evidence-recorded'),
        securityChecksRun: flagBool(args.flags, 'security-checked'),
    });
    const lines = [head(`Delivery completion — ${budget}`)];
    for (const c of verdict.criteria) {
        if (!c.applicable) {
            lines.push(`  ${DIM}○ ${c.id.padEnd(24)} not applicable at ${budget}${RESET}`);
            continue;
        }
        lines.push(`  ${c.met ? ok('') : bad('')} ${c.id.padEnd(24)} ${c.detail}`);
    }
    lines.push('');
    if (verdict.complete) {
        lines.push(`  ${ok(`${BOLD}DELIVERY COMPLETE${RESET}`)}`);
        for (const g of verdict.stopGuidance)
            lines.push(`    ${DIM}·${RESET} ${g}`);
    }
    else {
        lines.push(`  ${bad(`${BOLD}NOT COMPLETE${RESET}`)}`);
        for (const o of verdict.outstanding)
            lines.push(`    ${RED}·${RESET} ${o}`);
    }
    lines.push('');
    return lines.join('\n');
}
function handleEfficiency(workDir, args) {
    const mission = flagString(args.flags, 'mission') ?? 'default';
    const report = buildEfficiencyReport(workDir, mission);
    if (flagBool(args.flags, 'json'))
        return JSON.stringify(report, null, 2);
    const lines = [head('Delivery efficiency')];
    for (const line of formatEfficiencyReport(report))
        lines.push(`  ${line}`);
    lines.push('');
    return lines.join('\n');
}
function handleEscalate(workDir, args) {
    const from = requireBudgetFlag(args.flags);
    const toRaw = flagString(args.flags, 'to');
    if (!toRaw)
        throw new Error('Usage: /delivery escalate --budget LOW --to MEDIUM --reason "..." --evidence "..."');
    const to = toRaw.toUpperCase();
    if (!isDeliveryBudgetLevel(to)) {
        throw new Error(`Unknown budget "${toRaw}". One of: ${DELIVERY_BUDGETS.join(', ')}`);
    }
    const current = assignBudget(workDir, { text: '', defaultLevel: from });
    const result = escalateBudget({ ...current, level: from }, to, flagString(args.flags, 'reason') ?? '', flagList(args.flags, 'evidence'));
    const lines = [head('Budget escalation')];
    if (result.applied) {
        lines.push(`  ${ok(`${from} → ${budgetColor(result.budget.level)}`)}`);
        lines.push(`  Reason: ${result.budget.reason}`);
    }
    else {
        lines.push(`  ${bad(result.refusedReason ?? 'Refused')}`);
    }
    lines.push('');
    return lines.join('\n');
}
function handlePlan(workDir, args) {
    const taskId = args.positional[1] ?? 'task';
    const overrideRaw = flagString(args.flags, 'override');
    const override = overrideRaw?.toUpperCase();
    if (override && !isDeliveryBudgetLevel(override)) {
        throw new Error(`Unknown budget "${overrideRaw}". One of: ${DELIVERY_BUDGETS.join(', ')}`);
    }
    const scopeRaw = flagString(args.flags, 'scope');
    if (scopeRaw && !isTestScope(scopeRaw)) {
        throw new Error(`Unknown scope "${scopeRaw}". One of: ${TEST_SCOPES.join(', ')}`);
    }
    const plan = planTask(workDir, {
        taskId,
        text: flagString(args.flags, 'text'),
        baseRef: flagString(args.flags, 'base'),
        budgetOverride: override,
        scopeOverride: scopeRaw,
        acceptanceCriteria: flagList(args.flags, 'ac'),
        skipImpact: flagBool(args.flags, 'no-impact'),
    });
    const lines = [head(`Task plan — ${plan.taskId}`)];
    lines.push(`  Budget:         ${budgetColor(plan.budget.level)}${plan.budget.safetyCritical ? ` ${RED}[safety-critical]${RESET}` : ''}`);
    lines.push(`  Reason:         ${plan.budget.reason}`);
    lines.push(`  Test scope:     ${BOLD}${plan.scope}${RESET}`);
    lines.push(`  Base commit:    ${plan.baseCommit?.slice(0, 12) ?? DIM + 'unknown' + RESET}`);
    lines.push(`  Changed files:  ${plan.changedFiles.length}`);
    for (const f of plan.changedFiles.slice(0, 12))
        lines.push(`    ${DIM}·${RESET} ${f}`);
    if (plan.changedFiles.length > 12)
        lines.push(`    ${DIM}… +${plan.changedFiles.length - 12} more${RESET}`);
    lines.push('');
    lines.push(`  ${BOLD}Impact${RESET}`);
    lines.push(`    ${plan.impactSummary}`);
    lines.push('');
    lines.push(`  ${BOLD}Why this scope${RESET}`);
    for (const r of plan.scopeReasons)
        lines.push(`    ${DIM}·${RESET} ${r}`);
    lines.push('');
    return lines.join('\n');
}
function handleImpact(workDir, args) {
    const explicit = flagList(args.flags, 'files');
    const changed = explicit.length > 0 ? explicit : detectChangedFiles(workDir, flagString(args.flags, 'base'));
    if (changed.length === 0) {
        return `\n  ${warn('No changed files detected. Pass --files a.ts,b.ts or --base <ref>.')}\n`;
    }
    const depthRaw = flagString(args.flags, 'depth');
    const impact = measureImpact(workDir, changed, {
        depth: depthRaw ? parseInt(depthRaw, 10) : undefined,
        force: flagBool(args.flags, 'rebuild'),
    });
    const lines = [head('Change impact')];
    lines.push(`  ${describeImpact(impact)}`);
    lines.push('');
    lines.push(`  ${BOLD}Changed (${impact.changedFiles.length})${RESET}`);
    for (const f of impact.changedFiles.slice(0, 15))
        lines.push(`    ${DIM}·${RESET} ${f}`);
    lines.push('');
    lines.push(`  ${BOLD}Dependents (${impact.dependents.length})${RESET}`);
    if (impact.dependents.length === 0) {
        lines.push(`    ${DIM}none — the change does not reach other modules${RESET}`);
    }
    for (const f of impact.dependents.slice(0, 25))
        lines.push(`    ${DIM}·${RESET} ${f}`);
    if (impact.dependents.length > 25)
        lines.push(`    ${DIM}… +${impact.dependents.length - 25} more${RESET}`);
    if (impact.unresolvedImports > 0) {
        lines.push('');
        lines.push(`  ${warn(`${impact.unresolvedImports} unresolved import(s) — fan-out is a lower bound, so widen rather than narrow.`)}`);
    }
    lines.push('');
    return lines.join('\n');
}
function usage() {
    return [
        head('Delivery Efficiency'),
        '  Do not perform more engineering activity than is necessary to prove the change correct.',
        '',
        `  ${BOLD}Classify and plan${RESET}`,
        '    /delivery budget "<task text>" [--files a,b] [--override HIGH]',
        '    /delivery policy <LOW|MEDIUM|HIGH>',
        '    /delivery scope --budget MEDIUM [--files a,b] [--dependents 20] [--gate]',
        '    /delivery plan <TASK-ID> [--text "..."] [--base <ref>] [--override HIGH]',
        '    /delivery impact [--files a,b] [--base <ref>] [--depth 3] [--rebuild]',
        '    /delivery escalate --budget LOW --to MEDIUM --reason "..." --evidence "..."',
        '',
        `  ${BOLD}Evidence and deduplication${RESET}`,
        '    /delivery check --kind test --command "npm test" [--files a,b] [--owner w1]',
        '    /delivery evidence [list|clear]',
        '',
        `  ${BOLD}Multi-agent${RESET}`,
        '    /delivery context [--mission m]',
        '    /delivery gate [--integration-files a,b]',
        '',
        `  ${BOLD}Completion and measurement${RESET}`,
        '    /delivery complete --budget MEDIUM --implemented --diff-inspected …',
        '    /delivery efficiency [--json]',
        '    /delivery status',
        '',
        `  ${DIM}A shorter execution is not automatically better.${RESET}`,
        `  ${DIM}A longer execution is not automatically safer.${RESET}`,
        '',
    ].join('\n');
}
// ── Command ───────────────────────────────────────────────────────────────────
export const deliveryCommand = {
    name: 'delivery',
    description: 'Delivery efficiency — budgets, scoped validation, evidence reuse, stop conditions',
    usage: '/delivery <status|plan|impact|budget|policy|scope|check|evidence|context|gate|complete|efficiency|escalate>',
    execute: async (rawArgs, session) => {
        const args = parseArgs(rawArgs);
        const sub = args.positional[0] ?? 'status';
        // The evidence store and shared context belong to the repository, not to whichever
        // package directory the session sits in.
        const workDir = topLevel(session.workDir) ?? session.workDir;
        try {
            // Evidence validity is anchored to git state; without a repository nothing is provable.
            const needsGit = !['policy', 'help'].includes(sub);
            if (needsGit && !isGitRepo(workDir)) {
                return `\n  ${bad('Not a git repository.')}\n  ${DIM}Evidence validity is anchored to repository state, so it needs git.${RESET}\n`;
            }
            switch (sub) {
                case 'status': return handleStatus(workDir);
                case 'plan': return handlePlan(workDir, args);
                case 'impact': return handleImpact(workDir, args);
                case 'budget': return handleBudget(workDir, args);
                case 'policy': return handlePolicy(args);
                case 'scope': return handleScope(workDir, args);
                case 'check': return handleCheck(workDir, args);
                case 'evidence': return handleEvidence(workDir, args);
                case 'context': return handleContext(workDir, args);
                case 'gate': return handleGate(workDir, args);
                case 'complete': return handleComplete(workDir, args);
                case 'efficiency': return handleEfficiency(workDir, args);
                case 'escalate': return handleEscalate(workDir, args);
                case 'help': return usage();
                default:
                    return `\n  ${bad(`Unknown subcommand "${sub}"`)}\n${usage()}`;
            }
        }
        catch (err) {
            return `\n  ${bad(err instanceof Error ? err.message : String(err))}\n`;
        }
    },
};
//# sourceMappingURL=delivery.js.map