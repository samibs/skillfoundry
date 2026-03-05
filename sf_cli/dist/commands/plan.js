import { randomUUID } from 'node:crypto';
import { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createProvider } from '../core/provider.js';
import { redactText } from '../core/redact.js';
const PLANS_DIR = join('.skillfoundry', 'plans');
const PLAN_SYSTEM_PROMPT = `You are SkillFoundry AI, a senior software architect creating an implementation plan.

RULES:
- This is a READ-ONLY planning phase. Do NOT create, modify, or delete any files.
- Analyze the codebase and produce a structured plan.
- Break the task into concrete, ordered steps.
- For each step: describe what changes are needed, which files are affected, and why.
- Identify risks and dependencies between steps.
- Be specific about file paths, function names, and code patterns.

OUTPUT FORMAT:
## Plan: <short title>

### Summary
<1-3 sentence overview>

### Steps
1. **<step title>**
   - Files: <file list>
   - Changes: <what to do>
   - Why: <rationale>

2. **<step title>**
   ...

### Risks
- <risk and mitigation>

### Estimated Scope
- Files to create: <count>
- Files to modify: <count>
- Tests needed: <yes/no>
`;
function scanGenesis(workDir) {
    const genesisDir = join(workDir, 'genesis');
    if (!existsSync(genesisDir))
        return '';
    const files = readdirSync(genesisDir).filter((f) => f.endsWith('.md') && f !== 'TEMPLATE.md' && !f.startsWith('TEMPLATES'));
    if (files.length === 0)
        return '';
    const prdSummaries = files.map((f) => {
        const content = readFileSync(join(genesisDir, f), 'utf-8');
        const titleMatch = content.match(/^#\s+(.+)/m);
        const statusMatch = content.match(/status:\s*(\w+)/i);
        return `- ${f}: ${titleMatch?.[1] || 'Untitled'} (${statusMatch?.[1] || 'unknown'})`;
    });
    return `\n\nAvailable PRDs in genesis/:\n${prdSummaries.join('\n')}`;
}
export const planCommand = {
    name: 'plan',
    description: 'Create a read-only implementation plan',
    usage: '/plan <task description>',
    execute: async (args, session) => {
        if (!args.trim()) {
            return 'Usage: /plan <task description>\nExample: /plan add dark mode to the dashboard';
        }
        const planId = `plan-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const plansDir = join(session.workDir, PLANS_DIR);
        if (!existsSync(plansDir)) {
            mkdirSync(plansDir, { recursive: true });
        }
        // Update state to GENERATING
        session.setState({ current_state: 'GENERATING_STORIES', last_plan_id: planId });
        session.addMessage({ role: 'system', content: `Planning: "${args}" (${planId})` });
        try {
            const provider = createProvider(session.config.provider);
            const genesisContext = scanGenesis(session.workDir);
            const systemPrompt = PLAN_SYSTEM_PROMPT + genesisContext;
            const messages = [
                { role: 'user', content: `Create an implementation plan for: ${args}` },
            ];
            let planContent = '';
            const result = await provider.stream(messages, { model: session.config.model, systemPrompt }, (chunk, done) => {
                if (!done) {
                    planContent += chunk;
                }
            });
            const redacted = redactText(planContent, session.policy.redact);
            // Save plan to file
            const planFile = join(plansDir, `${planId}.md`);
            const planDoc = [
                `# Plan: ${planId}`,
                ``,
                `**Task:** ${args}`,
                `**Created:** ${new Date().toISOString()}`,
                `**Provider:** ${session.config.provider}:${session.config.model}`,
                `**Tokens:** ${result.inputTokens} in / ${result.outputTokens} out`,
                `**Cost:** $${result.costUsd.toFixed(4)}`,
                ``,
                `---`,
                ``,
                redacted,
            ].join('\n');
            writeFileSync(planFile, planDoc, 'utf-8');
            // Update state
            session.setState({ current_state: 'VALIDATED', last_plan_id: planId });
            // Add the plan as an assistant message
            session.addMessage({
                role: 'assistant',
                content: redacted,
                metadata: {
                    provider: session.config.provider,
                    model: session.config.model,
                    inputTokens: result.inputTokens,
                    outputTokens: result.outputTokens,
                    costUsd: result.costUsd,
                },
            });
            return `Plan saved: ${planFile}\nRun /apply ${planId} to execute.`;
        }
        catch (err) {
            session.setState({ current_state: 'FAILED' });
            const message = err instanceof Error ? err.message : String(err);
            return `Plan failed: ${message}`;
        }
    },
};
//# sourceMappingURL=plan.js.map