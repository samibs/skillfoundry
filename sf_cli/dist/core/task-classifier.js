// Task complexity classifier — keyword-based routing for local-first cost optimization.
// Classifies prompts as "simple" or "complex" to route between local (free) and cloud (paid) models.
// No LLM call is used for classification — purely keyword-based for zero-cost, zero-latency routing.
//
// v2.0.57: Added jurisdiction guards, routing rules, quality-gate fallback.
// Implements FR-005 through FR-008 of the local-first-development PRD.
// Implements FR-001 through FR-006 of the jurisdiction-aware-model-routing PRD.
// ── Keyword Lists ───────────────────────────────────────────────────
const SIMPLE_KEYWORDS = [
    'document',
    'docstring',
    'comment',
    'explain',
    'format',
    'lint',
    'typo',
    'rename',
    'boilerplate',
    'template',
    'readme',
    'changelog',
    'summarize',
    'describe',
    'translate',
    'spell',
    'grammar',
    'prettify',
    'annotate',
    'header',
    'footer',
    'jsdoc',
    'javadoc',
    'tsdoc',
    'help',
    'what is',
    'what does',
    'how does',
];
const COMPLEX_KEYWORDS = [
    'architect',
    'security',
    'refactor',
    'migrate',
    'design',
    'performance',
    'test',
    'debug',
    'implement',
    'feature',
    'multi-file',
    'database',
    'schema',
    'api',
    'endpoint',
    'auth',
    'deploy',
    'pipeline',
    'ci/cd',
    'docker',
    'kubernetes',
    'optimize',
    'benchmark',
    'concurrency',
    'async',
    'fix bug',
    'investigate',
    'root cause',
    'vulnerability',
    'injection',
    'encryption',
];
// ── Task type keyword mapping (for routing rules) ───────────────────
const TASK_TYPE_KEYWORDS = {
    security: ['security', 'vulnerability', 'injection', 'encryption', 'owasp', 'xss', 'csrf', 'audit'],
    orchestration: ['pipeline', 'orchestrat', 'forge', 'workflow', 'deploy', 'ci/cd'],
    code_generation: ['implement', 'code', 'function', 'class', 'module', 'component', 'endpoint', 'api'],
    documentation: ['document', 'readme', 'changelog', 'docstring', 'jsdoc', 'explain', 'describe'],
    testing: ['test', 'spec', 'coverage', 'benchmark', 'assertion'],
};
/**
 * Classify a user prompt as simple or complex based on keyword matching.
 * Returns the classification, confidence level, and matched keywords.
 *
 * - If only simple keywords match → simple (high confidence)
 * - If only complex keywords match → complex (high confidence)
 * - If both match → complex (medium confidence, safety-first)
 * - If neither match → complex (low confidence, default to cloud)
 */
export function classifyTask(prompt) {
    const lower = prompt.toLowerCase();
    const simpleMatches = SIMPLE_KEYWORDS.filter((kw) => lower.includes(kw));
    const complexMatches = COMPLEX_KEYWORDS.filter((kw) => lower.includes(kw));
    const hasSimple = simpleMatches.length > 0;
    const hasComplex = complexMatches.length > 0;
    // Detect task type for routing rules
    const taskType = detectTaskType(lower);
    if (hasSimple && !hasComplex) {
        return {
            complexity: 'simple',
            confidence: 'high',
            matchedKeywords: simpleMatches,
            taskType,
        };
    }
    if (hasComplex && !hasSimple) {
        return {
            complexity: 'complex',
            confidence: 'high',
            matchedKeywords: complexMatches,
            taskType,
        };
    }
    if (hasSimple && hasComplex) {
        // Both matched — complex wins (safer)
        return {
            complexity: 'complex',
            confidence: 'medium',
            matchedKeywords: [...complexMatches, ...simpleMatches],
            taskType,
        };
    }
    // No keywords matched — default to complex (cloud is safer for unknown tasks)
    return {
        complexity: 'complex',
        confidence: 'low',
        matchedKeywords: [],
        taskType,
    };
}
/**
 * Detect the primary task type from prompt content.
 * Used to match against routing rules.
 */
function detectTaskType(lower) {
    let bestType;
    let bestCount = 0;
    for (const [type, keywords] of Object.entries(TASK_TYPE_KEYWORDS)) {
        const count = keywords.filter((kw) => lower.includes(kw)).length;
        if (count > bestCount) {
            bestCount = count;
            bestType = type;
        }
    }
    return bestType;
}
// ── Jurisdiction Error ──────────────────────────────────────────────
export class JurisdictionError extends Error {
    jurisdiction;
    taskType;
    complexity;
    constructor(jurisdiction, taskType, complexity) {
        super(`Jurisdiction "${jurisdiction}" blocks cloud routing for this task. ` +
            `Local model cannot handle ${complexity} task${taskType ? ` (type: ${taskType})` : ''}. ` +
            `Either lower task complexity, upgrade local model, or change data_jurisdiction to "none".`);
        this.jurisdiction = jurisdiction;
        this.taskType = taskType;
        this.complexity = complexity;
        this.name = 'JurisdictionError';
    }
}
/**
 * Select which provider/model to use based on task complexity, jurisdiction, and routing rules.
 *
 * Decision priority:
 * 1. Routing rules (explicit per-task-type overrides)
 * 2. Jurisdiction guards (block cloud if restricted)
 * 3. Complexity-based routing (simple→local, complex→cloud)
 */
export function selectProvider(prompt, config) {
    if (!config.routeLocalFirst) {
        // Check jurisdiction even when local-first is disabled
        const jurisdiction = config.dataJurisdiction || 'none';
        if (jurisdiction === 'strict') {
            return {
                provider: config.localProvider,
                model: config.localModel,
                reason: `Jurisdiction "strict": all tasks routed locally`,
                complexity: 'complex',
                savedLocally: true,
            };
        }
        return {
            provider: config.cloudProvider,
            model: config.cloudModel,
            reason: 'Local-first routing disabled',
            complexity: 'complex',
            savedLocally: false,
        };
    }
    const classification = classifyTask(prompt);
    const jurisdiction = config.dataJurisdiction || 'none';
    // ── Step 1: Check routing rules ──────────────────────────────────
    if (classification.taskType && config.routingRules) {
        const rule = config.routingRules[classification.taskType];
        if (rule === 'cloud') {
            // Rule says cloud — but jurisdiction may block it
            if (jurisdiction === 'strict') {
                throw new JurisdictionError(jurisdiction, classification.taskType, classification.complexity);
            }
            if (jurisdiction === 'eu') {
                // EU mode: warn but allow cloud for explicitly-ruled tasks
                return {
                    provider: config.cloudProvider,
                    model: config.cloudModel,
                    reason: `Rule: ${classification.taskType}=cloud (jurisdiction "eu": cloud allowed for explicit rules)`,
                    complexity: classification.complexity,
                    savedLocally: false,
                };
            }
            return {
                provider: config.cloudProvider,
                model: config.cloudModel,
                reason: `Rule: ${classification.taskType}=cloud`,
                complexity: classification.complexity,
                savedLocally: false,
            };
        }
        if (rule === 'local') {
            if (config.localHealthy) {
                return {
                    provider: config.localProvider,
                    model: config.localModel,
                    reason: `Rule: ${classification.taskType}=local`,
                    complexity: classification.complexity,
                    savedLocally: true,
                };
            }
            // Local forced by rule but unhealthy — jurisdiction determines fallback
            if (jurisdiction === 'strict') {
                throw new JurisdictionError(jurisdiction, classification.taskType, classification.complexity);
            }
            return {
                provider: config.cloudProvider,
                model: config.cloudModel,
                reason: `Rule: ${classification.taskType}=local but local offline — cloud fallback`,
                complexity: classification.complexity,
                savedLocally: false,
            };
        }
        // rule === 'auto' — fall through to classifier
    }
    // ── Step 2: Jurisdiction guards ──────────────────────────────────
    if (jurisdiction === 'strict') {
        // Never route to cloud
        return {
            provider: config.localProvider,
            model: config.localModel,
            reason: `Jurisdiction "strict": forced local (${classification.complexity} task)`,
            complexity: classification.complexity,
            savedLocally: true,
            jurisdictionBlocked: classification.complexity === 'complex',
        };
    }
    if (jurisdiction === 'eu') {
        if (classification.complexity === 'simple') {
            // Simple tasks: always local in EU mode
            if (config.localHealthy) {
                return {
                    provider: config.localProvider,
                    model: config.localModel,
                    reason: `Jurisdiction "eu": simple task routed locally`,
                    complexity: 'simple',
                    savedLocally: true,
                };
            }
            // Local unhealthy — block cloud for simple tasks in EU mode
            throw new JurisdictionError(jurisdiction, classification.taskType, classification.complexity);
        }
        // Complex tasks in EU mode: allow cloud with logged warning
        return {
            provider: config.cloudProvider,
            model: config.cloudModel,
            reason: `Jurisdiction "eu": complex task allowed to cloud (keywords: ${classification.matchedKeywords.slice(0, 3).join(', ') || 'none'})`,
            complexity: 'complex',
            savedLocally: false,
        };
    }
    // ── Step 3: Default complexity-based routing ─────────────────────
    if (classification.complexity === 'simple' && config.localHealthy) {
        return {
            provider: config.localProvider,
            model: config.localModel,
            reason: `Simple task (matched: ${classification.matchedKeywords.slice(0, 3).join(', ')})`,
            complexity: 'simple',
            savedLocally: true,
        };
    }
    if (classification.complexity === 'simple' && !config.localHealthy) {
        return {
            provider: config.cloudProvider,
            model: config.cloudModel,
            reason: 'Simple task but local provider is offline',
            complexity: 'simple',
            savedLocally: false,
        };
    }
    return {
        provider: config.cloudProvider,
        model: config.cloudModel,
        reason: `Complex task (matched: ${classification.matchedKeywords.slice(0, 3).join(', ') || 'none — default to cloud'})`,
        complexity: 'complex',
        savedLocally: false,
    };
}
const REFUSAL_PATTERNS = [
    /i (?:can'?t|cannot|won'?t|am unable to)/i,
    /as an ai/i,
    /i'?m (?:sorry|afraid)/i,
    /i (?:don'?t|do not) have (?:the ability|access)/i,
    /(?:not|beyond) (?:my|the) (?:scope|capability|ability)/i,
];
/**
 * Lightweight quality check for local model output.
 * No LLM calls — purely heuristic-based.
 *
 * Checks:
 * 1. Non-empty response
 * 2. No refusal patterns (model declined the task)
 * 3. Response length proportional to prompt complexity
 */
export function checkOutputQuality(prompt, response) {
    // Check 1: non-empty
    const trimmed = response.trim();
    if (!trimmed) {
        return { passed: false, reason: 'Empty response' };
    }
    // Check 2: refusal patterns
    // Only check the first 200 chars — refusals appear at the start
    const head = trimmed.slice(0, 200);
    for (const pattern of REFUSAL_PATTERNS) {
        if (pattern.test(head)) {
            return { passed: false, reason: `Refusal detected: ${head.slice(0, 80)}...` };
        }
    }
    // Check 3: response length proportionality
    // For code tasks (prompt mentions implement/function/code), expect substantial output
    const lower = prompt.toLowerCase();
    const isCodeTask = ['implement', 'function', 'code', 'class', 'module'].some((kw) => lower.includes(kw));
    if (isCodeTask && trimmed.length < 50) {
        return { passed: false, reason: `Code task but response only ${trimmed.length} chars` };
    }
    // Check 4: basic coherence — response should contain some alphanumeric content
    const alphaRatio = (trimmed.match(/[a-zA-Z0-9]/g) || []).length / trimmed.length;
    if (alphaRatio < 0.3) {
        return { passed: false, reason: `Low alphanumeric ratio (${(alphaRatio * 100).toFixed(0)}%)` };
    }
    return { passed: true, reason: 'Quality check passed' };
}
//# sourceMappingURL=task-classifier.js.map