// Task complexity classifier — keyword-based routing for local-first cost optimization.
// Classifies prompts as "simple" or "complex" to route between local (free) and cloud (paid) models.
// No LLM call is used for classification — purely keyword-based for zero-cost, zero-latency routing.
//
// Implements FR-005 through FR-008 of the local-first-development PRD.
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
    if (hasSimple && !hasComplex) {
        return {
            complexity: 'simple',
            confidence: 'high',
            matchedKeywords: simpleMatches,
        };
    }
    if (hasComplex && !hasSimple) {
        return {
            complexity: 'complex',
            confidence: 'high',
            matchedKeywords: complexMatches,
        };
    }
    if (hasSimple && hasComplex) {
        // Both matched — complex wins (safer)
        return {
            complexity: 'complex',
            confidence: 'medium',
            matchedKeywords: [...complexMatches, ...simpleMatches],
        };
    }
    // No keywords matched — default to complex (cloud is safer for unknown tasks)
    return {
        complexity: 'complex',
        confidence: 'low',
        matchedKeywords: [],
    };
}
/**
 * Select which provider/model to use based on task complexity and routing config.
 *
 * When route_local_first is enabled:
 * - Simple tasks → local provider (if healthy)
 * - Complex tasks → cloud provider
 * - If local is unhealthy → cloud for everything
 *
 * When route_local_first is disabled:
 * - Always use the configured provider (no routing)
 */
export function selectProvider(prompt, config) {
    if (!config.routeLocalFirst) {
        return {
            provider: config.cloudProvider,
            model: config.cloudModel,
            reason: 'Local-first routing disabled',
            complexity: 'complex',
            savedLocally: false,
        };
    }
    const classification = classifyTask(prompt);
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
//# sourceMappingURL=task-classifier.js.map