// Delivery Efficiency — the delivery budget.
//
// A delivery budget answers one question before implementation starts: *how much
// reasoning, validation, testing and review is this change worth?*
//
//   Agent effectiveness = accepted useful change / (elapsed time × compute × attention)
//
// The governing rule is that an agent should not perform more engineering activity than
// is necessary to prove the requested change correct. A shorter execution is not
// automatically better; a longer one is not automatically safer.
//
// Classification is deterministic — path patterns and keyword sets, no model call — so
// the same task always lands in the same budget and the reason is auditable. This mirrors
// `task-classifier.ts`, which routes on complexity; risk is a different axis, so the two
// are deliberately separate.
import { getLogger } from '../utils/logger.js';
// ── Levels ────────────────────────────────────────────────────────────────────
/** How much validation effort a change justifies. */
export const DELIVERY_BUDGETS = ['LOW', 'MEDIUM', 'HIGH'];
/** Runtime guard for the budget vocabulary. */
export function isDeliveryBudgetLevel(value) {
    return typeof value === 'string' && DELIVERY_BUDGETS.includes(value);
}
/** Ordering, so escalation and comparison are unambiguous. */
const RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 };
/** True when `a` demands at least as much validation as `b`. */
export function atLeast(a, b) {
    return RANK[a] >= RANK[b];
}
/** The higher of two budgets. */
export function maxBudget(a, b) {
    return RANK[a] >= RANK[b] ? a : b;
}
// ── Safety-critical signals (§19) ─────────────────────────────────────────────
/**
 * Path patterns that force HIGH.
 *
 * Optimization must never bypass required checks for authentication, authorization,
 * secrets, cryptography, destructive database changes, schema migrations, production
 * deployment, financial integrity or compliance controls. Matching is on the repo-relative
 * path, case-insensitively.
 */
const SAFETY_CRITICAL_PATHS = [
    { re: /(^|\/)(auth|authn|authz|authentication|authorization)(\/|\.|-|_)/i, label: 'authentication/authorization' },
    { re: /(^|\/)(security|crypto|cryptography|jwt|oauth|saml|oidc)(\/|\.|-|_)/i, label: 'security/cryptography' },
    { re: /(^|\/)(secrets?|credentials?|vault|keystore)(\/|\.|-|_)/i, label: 'secret handling' },
    { re: /(^|\/)migrations?(\/|$)/i, label: 'schema migration' },
    { re: /(^|\/)(payments?|billing|invoicing|ledger|accounting)(\/|\.|-|_)/i, label: 'financial integrity' },
    { re: /(^|\/)(terraform|helm|k8s|kubernetes|ansible|cloudformation)(\/|$)/i, label: 'production infrastructure' },
    { re: /(^|\/)(Dockerfile|docker-compose\.ya?ml|\.github\/workflows)(\/|$)/i, label: 'deployment pipeline' },
    { re: /(^|\/)(rbac|permissions?|policy|policies)(\/|\.|-|_)/i, label: 'access control' },
    { re: /\.(pem|key|p12|pfx|jks)$/i, label: 'key material' },
];
/**
 * Task-text keywords that force HIGH.
 *
 * Word-boundary matched so "reauthorize" does not silently escape and "authorization"
 * inside a longer sentence still matches.
 */
const SAFETY_CRITICAL_KEYWORDS = [
    { re: /\b(authenticat\w*|authoriz\w*|login|logout|session token|access token|refresh token)\b/i, label: 'authentication/authorization' },
    { re: /\b(encrypt\w*|decrypt\w*|cryptograph\w*|hashing algorithm|signing key|private key)\b/i, label: 'cryptography' },
    { re: /\b(secret|credential|api key|password)\b/i, label: 'secret handling' },
    { re: /\b(migration|migrate the (database|schema)|schema change|alter table|drop (table|column))\b/i, label: 'data migration' },
    { re: /\b(transaction|isolation level|deadlock|race condition|concurrenc\w*|thread safety|mutex|locking)\b/i, label: 'concurrency/transactions' },
    { re: /\b(deploy\w*|production release|rollout|infrastructure)\b/i, label: 'deployment' },
    { re: /\b(public api|breaking change|backward compat\w*|api compatibility)\b/i, label: 'public API compatibility' },
    { re: /\b(payment|billing|invoice|refund|financial|compliance|gdpr|pci|sox|hipaa)\b/i, label: 'financial/compliance' },
    { re: /\b(delete all|truncate|purge|destructive|drop database)\b/i, label: 'destructive operation' },
    { re: /\b(cross-system|distributed transaction|multi-tenant isolation)\b/i, label: 'cross-system architecture' },
];
// ── Low-risk signals ──────────────────────────────────────────────────────────
/** Paths whose change is presumptively low-risk, absent any safety-critical signal. */
const LOW_RISK_PATHS = [
    { re: /\.(css|scss|sass|less|styl)$/i, label: 'stylesheet' },
    { re: /\.(md|mdx|txt|rst|adoc)$/i, label: 'documentation' },
    { re: /(^|\/)(docs?|documentation)(\/|$)/i, label: 'documentation' },
    { re: /\.(svg|png|jpe?g|gif|webp|ico)$/i, label: 'static asset' },
    { re: /(^|\/)(README|CHANGELOG|LICENSE|CONTRIBUTING)/i, label: 'project document' },
    { re: /\.(json|ya?ml|toml)$/i, label: 'configuration' },
];
/** Task-text keywords suggesting a low-risk change. */
const LOW_RISK_KEYWORDS = [
    { re: /\b(typo|wording|copy change|spelling|grammar)\b/i, label: 'text change' },
    { re: /\b(css|styling|stylesheet|padding|margin|colou?r|font|spacing|alignment)\b/i, label: 'visual adjustment' },
    { re: /\b(rename|renaming)\b.*\b(field|property|variable|dto|model)\b/i, label: 'isolated rename' },
    { re: /\b(documentation|docstring|comment|readme|changelog)\b/i, label: 'documentation' },
    { re: /\b(log message|log line|logging text)\b/i, label: 'log text' },
];
/** Breadth at which a change stops being plausibly LOW. */
const LOW_MAX_FILES = 3;
/** Breadth at which a change is treated as broad enough to warrant MEDIUM at minimum. */
const MEDIUM_MIN_FILES = 10;
/** Collect safety-critical signals from paths and text. */
function safetyCriticalSignals(input) {
    const signals = new Set();
    for (const file of input.changedFiles ?? []) {
        for (const { re, label } of SAFETY_CRITICAL_PATHS) {
            if (re.test(file))
                signals.add(`path:${label} (${file})`);
        }
    }
    if (input.text) {
        for (const { re, label } of SAFETY_CRITICAL_KEYWORDS) {
            const m = input.text.match(re);
            if (m)
                signals.add(`keyword:${label} ("${m[0]}")`);
        }
    }
    return [...signals];
}
/** Collect low-risk signals from paths and text. */
function lowRiskSignals(input) {
    const signals = new Set();
    const files = input.changedFiles ?? [];
    // Every touched file must be low-risk; one source file makes the change not-trivial.
    if (files.length > 0 && files.every((f) => LOW_RISK_PATHS.some(({ re }) => re.test(f)))) {
        const labels = new Set(files.flatMap((f) => LOW_RISK_PATHS.filter(({ re }) => re.test(f)).map(({ label }) => label)));
        signals.add(`path:all touched files are ${[...labels].join('/')}`);
    }
    if (input.text) {
        for (const { re, label } of LOW_RISK_KEYWORDS) {
            const m = input.text.match(re);
            if (m)
                signals.add(`keyword:${label} ("${m[0]}")`);
        }
    }
    return [...signals];
}
/**
 * Assign a delivery budget deterministically.
 *
 * Evaluation order is fixed, and safety-critical signals are checked first so nothing can
 * mask them:
 *
 *   1. safety-critical path or keyword  → HIGH (an override cannot lower this)
 *   2. explicit override                → the requested level
 *   3. broad change (many files)        → at least MEDIUM
 *   4. low-risk signals, narrow change  → LOW
 *   5. otherwise                        → the default (MEDIUM)
 *
 * @returns The budget, with the matched signals and a reason recorded.
 */
export function classifyDeliveryBudget(input) {
    const now = new Date().toISOString();
    const defaultLevel = input.defaultLevel ?? 'MEDIUM';
    const critical = safetyCriticalSignals(input);
    const safetyCritical = critical.length > 0;
    // 1 + 2. Safety-critical work is HIGH, and an override may raise but not lower it.
    if (safetyCritical) {
        if (input.override && RANK[input.override] < RANK.HIGH && !input.allowUnsafeOverride) {
            getLogger().warn('delivery', 'unsafe_override_refused', {
                requested: input.override, signals: critical.length,
            });
            return {
                level: 'HIGH',
                reason: `Safety-critical change; the requested ${input.override} override was refused because ` +
                    `optimization must never bypass required checks here (${critical[0]}).`,
                source: 'SAFETY_CRITICAL_PATH',
                overridden: false,
                createdAt: now,
                escalations: [],
                safetyCritical: true,
                signals: critical,
            };
        }
        // With the opt-in, a deliberate downgrade is honored — that is the whole point of the
        // flag. Without an override, or with one that raises, HIGH stands.
        const level = input.override
            ? (input.allowUnsafeOverride ? input.override : maxBudget(input.override, 'HIGH'))
            : 'HIGH';
        const downgraded = input.allowUnsafeOverride && input.override && RANK[input.override] < RANK.HIGH;
        if (downgraded) {
            getLogger().warn('delivery', 'safety_critical_downgraded', {
                to: input.override, signals: critical.length,
            });
        }
        return {
            level,
            reason: downgraded
                ? `Safety-critical signals detected (${critical[0]}), but explicitly downgraded to ${input.override} via allowUnsafeOverride. Required checks are NOT guaranteed.`
                : `Safety-critical signals detected: ${critical.slice(0, 3).join('; ')}${critical.length > 3 ? ` (+${critical.length - 3} more)` : ''}.`,
            source: critical[0]?.startsWith('path:') ? 'SAFETY_CRITICAL_PATH' : 'SAFETY_CRITICAL_KEYWORD',
            overridden: Boolean(input.override),
            createdAt: now,
            escalations: [],
            safetyCritical: true,
            signals: critical,
        };
    }
    if (input.override) {
        return {
            level: input.override,
            reason: `Explicitly set to ${input.override} by the task or PRD.`,
            source: 'EXPLICIT_OVERRIDE',
            overridden: true,
            createdAt: now,
            escalations: [],
            safetyCritical: false,
            signals: [],
        };
    }
    const fileCount = input.changedFiles?.length ?? 0;
    const low = lowRiskSignals(input);
    // 3. A broad change is not LOW however benign each file looks.
    if (fileCount >= MEDIUM_MIN_FILES) {
        return {
            level: maxBudget('MEDIUM', defaultLevel === 'LOW' ? 'MEDIUM' : defaultLevel),
            reason: `Change spans ${fileCount} files — too broad to treat as low-risk.`,
            source: 'CHANGE_BREADTH',
            overridden: false,
            createdAt: now,
            escalations: [],
            safetyCritical: false,
            signals: [`breadth:${fileCount} files`],
        };
    }
    // 4. Low-risk, and narrow enough to prove cheaply.
    if (low.length > 0 && (fileCount === 0 || fileCount <= LOW_MAX_FILES)) {
        return {
            level: 'LOW',
            reason: `Low-risk change: ${low.slice(0, 2).join('; ')}.`,
            source: low[0].startsWith('path:') ? 'LOW_RISK_PATH' : 'LOW_RISK_KEYWORD',
            overridden: false,
            createdAt: now,
            escalations: [],
            safetyCritical: false,
            signals: low,
        };
    }
    // 5. Nothing decisive — the default carries the normal feature-work policy.
    return {
        level: defaultLevel,
        reason: `No low-risk or safety-critical signal matched; defaulting to ${defaultLevel}.`,
        source: 'DEFAULT',
        overridden: false,
        createdAt: now,
        escalations: [],
        safetyCritical: false,
        signals: [],
    };
}
/**
 * Raise a delivery budget on evidence (§9).
 *
 * A budget may be exceeded when the work turns out to be riskier than it looked — a
 * compile failure outside the touched area, a discovered auth dependency, a migration
 * that turns out to be required. It may never be *lowered* here: reducing validation
 * after the fact is how proven-necessary checks get skipped.
 *
 * @param to - The new level. Must be strictly higher than the current one.
 * @param reason - Why the original budget was insufficient.
 * @param evidence - Concrete evidence, e.g. a failing command or a discovered path.
 * @returns The updated budget, or the original with `refusedReason` when the escalation
 *          is not a raise or carries no evidence.
 */
export function escalateBudget(budget, to, reason, evidence) {
    if (RANK[to] <= RANK[budget.level]) {
        return {
            applied: false,
            budget,
            refusedReason: `Refused: ${to} does not raise the current ${budget.level} budget. ` +
                'A delivery budget is never lowered mid-task — that would skip validation already judged necessary.',
        };
    }
    if (evidence.length === 0) {
        return {
            applied: false,
            budget,
            refusedReason: 'Refused: escalation requires concrete evidence (a failing command, a discovered dependency, a scan result). ' +
                'Arbitrary escalation is the same waste the delivery budget exists to prevent.',
        };
    }
    const escalation = {
        from: budget.level,
        to,
        reason,
        evidence,
        at: new Date().toISOString(),
    };
    getLogger().info('delivery', 'budget_escalated', {
        from: budget.level, to, evidence: evidence.length,
    });
    return {
        applied: true,
        budget: {
            ...budget,
            level: to,
            reason: `Escalated from ${budget.level}: ${reason}`,
            source: 'ESCALATION',
            escalations: [...budget.escalations, escalation],
        },
    };
}
/**
 * Suggest an escalation from observed evidence, without applying it.
 *
 * Used by the policy engine and `$tester` when a narrower scope reveals broader impact.
 *
 * @param currentLevel - The budget in force.
 * @param observations - Free-text observations: failing output, newly discovered paths.
 * @returns The suggested level and the signals behind it, or null when nothing warrants a raise.
 */
export function suggestEscalation(currentLevel, observations) {
    const critical = safetyCriticalSignals({
        text: observations.failureOutput,
        changedFiles: observations.discoveredFiles,
    });
    if (critical.length > 0 && RANK[currentLevel] < RANK.HIGH) {
        return {
            to: 'HIGH',
            reason: 'Safety-sensitive impact discovered during execution',
            evidence: critical,
        };
    }
    // A failure outside the touched area means the change reaches further than assumed.
    const files = observations.discoveredFiles ?? [];
    if (currentLevel === 'LOW' && files.length > LOW_MAX_FILES) {
        return {
            to: 'MEDIUM',
            reason: `Impact reaches ${files.length} files, beyond the ${LOW_MAX_FILES}-file bound for LOW`,
            evidence: files.slice(0, 10).map((f) => `discovered:${f}`),
        };
    }
    return null;
}
/** One-line summary for logs and reports. */
export function describeBudget(budget) {
    const esc = budget.escalations.length > 0 ? ` (escalated ${budget.escalations.length}×)` : '';
    const safe = budget.safetyCritical ? ' [safety-critical]' : '';
    return `${budget.level}${esc}${safe} — ${budget.reason}`;
}
//# sourceMappingURL=delivery-budget.js.map