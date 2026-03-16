// Real Autonomous Agent System
// Provides Agent base class, 4 archetype classes, state machine,
// delegation, budget partitioning, and event emitter.
// Wraps ai-runner.ts as the execution engine.
import { TOOL_SETS } from './agent-registry.js';
import { runAgentLoop } from './ai-runner.js';
import { getLogger } from '../utils/logger.js';
import { AgentMessageBus } from './agent-message-bus.js';
import { AgentLogger } from './agent-logger.js';
import { randomUUID } from 'node:crypto';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_DELEGATION_DEPTH = 3;
// ---------------------------------------------------------------------------
// Agent Base Class
// ---------------------------------------------------------------------------
export class Agent {
    name;
    displayName;
    toolCategory;
    /**
     * The message bus this agent is connected to.
     * Defaults to the process-level singleton (AgentMessageBus.global()).
     * Pass a custom instance in tests for isolation.
     */
    bus;
    state;
    context = null;
    listeners = new Map();
    startTime = 0;
    totalTokensIn = 0;
    totalTokensOut = 0;
    totalCost = 0;
    childResults = new Map();
    constructor(name, displayName, toolCategory, bus) {
        this.name = name;
        this.displayName = displayName;
        this.toolCategory = toolCategory;
        this.bus = bus ?? AgentMessageBus.global();
        this.state = this.createInitialState();
    }
    // ── Public API ──────────────────────────────────────────────────────
    async execute(task, context) {
        this.context = context;
        this.startTime = Date.now();
        this.totalTokensIn = 0;
        this.totalTokensOut = 0;
        this.totalCost = 0;
        this.childResults = new Map();
        this.state = this.createInitialState();
        // Resolve taskId and correlationId for structured logging — use context values
        // when provided (set by AgentPool), otherwise generate stable IDs for this execution.
        const taskId = context.taskId ?? randomUUID();
        const correlationId = context.correlationId ?? randomUUID();
        const agentLogger = new AgentLogger(this.name, taskId, correlationId, context.workDir);
        // Budget check
        if (context.budgetUsd <= 0) {
            this.state.status = 'budget_exceeded';
            return this.buildResult('budget_exceeded', 'No budget allocated');
        }
        // Delegation depth check
        if (context.delegationDepth > MAX_DELEGATION_DEPTH) {
            this.state.status = 'failed';
            return this.buildResult('failed', `Max delegation depth (${MAX_DELEGATION_DEPTH}) exceeded`);
        }
        this.state.status = 'running';
        this.emit('started', { task: task.slice(0, 200) });
        const log = getLogger();
        log.info('runner', 'agent_execute', { agent: this.name, task: task.slice(0, 100) });
        agentLogger.start();
        try {
            // Check abort signal
            if (context.abortSignal.aborted) {
                this.state.status = 'aborted';
                agentLogger.abort('Aborted before execution');
                return this.buildResult('aborted', 'Aborted before execution');
            }
            const result = await this.run(task, context);
            // Log based on outcome
            if (result.status === 'aborted') {
                agentLogger.abort('Agent run returned aborted status');
            }
            else if (result.status === 'budget_exceeded') {
                agentLogger.fail(new Error('Budget exceeded'));
            }
            else if (result.status === 'failed') {
                agentLogger.fail(new Error(result.output));
            }
            else {
                agentLogger.complete({ status: result.status, durationMs: result.durationMs });
            }
            return result;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.state.status = 'failed';
            this.state.blockers.push(message);
            log.error('runner', 'agent_failed', { agent: this.name, error: message });
            this.emit('failed', { error: message });
            agentLogger.fail(err instanceof Error ? err : new Error(message));
            return this.buildResult('failed', message);
        }
    }
    getState() {
        return { ...this.state };
    }
    abort() {
        if (this.context) {
            this.context.abortSignal.aborted = true;
        }
        this.state.status = 'aborted';
        this.emit('aborted');
    }
    // ── Event System ────────────────────────────────────────────────────
    on(event, listener) {
        const existing = this.listeners.get(event) || [];
        existing.push(listener);
        this.listeners.set(event, existing);
    }
    off(event, listener) {
        const existing = this.listeners.get(event) || [];
        this.listeners.set(event, existing.filter((l) => l !== listener));
    }
    emit(type, data) {
        const event = {
            type,
            agentName: this.name,
            timestamp: new Date().toISOString(),
            data,
        };
        const listeners = this.listeners.get(type) || [];
        for (const listener of listeners) {
            try {
                listener(event);
            }
            catch {
                // Listener errors don't break agent execution
            }
        }
    }
    // ── Message Bus Convenience API ──────────────────────────────────────
    /**
     * Publish a message to the agent message bus.
     * Automatically sets `sender` to this agent's name and fills `id` and `timestamp`.
     *
     * @param type - The MessageType for topic routing.
     * @param payload - Arbitrary structured payload for the message.
     * @param recipient - Target agent ID. Defaults to '*' (broadcast).
     * @param correlationId - Optional correlation ID. Generated if omitted.
     */
    publishMessage(type, payload, recipient = '*', correlationId) {
        const message = AgentMessageBus.buildMessage(this.name, recipient, type, payload, correlationId);
        this.bus.publish(message);
        return message;
    }
    /**
     * Subscribe to messages on the bus.
     * The subscription is scoped to `type` and uses the shared bus instance.
     *
     * @param type - The MessageType to listen for, or '*' for all types.
     * @param handler - Invoked with each matching message envelope.
     * @returns An unsubscribe function to remove the listener.
     */
    subscribeMessage(type, handler) {
        return this.bus.subscribe(type, handler);
    }
    // ── Delegation ──────────────────────────────────────────────────────
    async delegate(childAgent, task, budgetFraction = 0.3) {
        if (!this.context) {
            throw new Error('Cannot delegate without execution context');
        }
        const allocatedBudget = Math.min(this.context.budgetUsd * budgetFraction, this.getRemainingBudget());
        if (allocatedBudget <= 0) {
            return {
                status: 'budget_exceeded',
                output: 'No budget remaining for delegation',
                decisions: [],
                artifacts: [],
                tokenUsage: { input: 0, output: 0, cost: 0 },
                childResults: new Map(),
                durationMs: 0,
            };
        }
        this.state.status = 'delegating';
        this.state.childAgents.push({
            name: childAgent.name,
            status: 'running',
            taskSummary: task.slice(0, 100),
        });
        this.emit('delegated', { child: childAgent.name, task: task.slice(0, 200) });
        // Forward event listeners to child
        for (const [eventType, listeners] of this.listeners) {
            for (const listener of listeners) {
                childAgent.on(eventType, listener);
            }
        }
        const childContext = {
            ...this.context,
            parentAgent: this,
            budgetUsd: allocatedBudget,
            delegationDepth: this.context.delegationDepth + 1,
            abortSignal: { aborted: this.context.abortSignal.aborted },
            // Propagate correlation ID so all agents in this delegation chain share it
            correlationId: this.context.correlationId,
            // Child gets a new taskId since it is a distinct execution unit
            taskId: randomUUID(),
        };
        const result = await childAgent.execute(task, childContext);
        // Track child results
        this.childResults.set(childAgent.name, result);
        this.totalTokensIn += result.tokenUsage.input;
        this.totalTokensOut += result.tokenUsage.output;
        this.totalCost += result.tokenUsage.cost;
        // Update child status in state
        const childEntry = this.state.childAgents.find((c) => c.name === childAgent.name);
        if (childEntry) {
            childEntry.status = result.status === 'completed' ? 'completed' : 'failed';
        }
        // Merge artifacts
        this.state.artifacts.push(...result.artifacts);
        this.state.status = 'running';
        return result;
    }
    /**
     * Run the AI agentic loop with the agent's system prompt and tools.
     * This is the primary way agents interact with the LLM.
     */
    async runLoop(systemPrompt, userMessage, context, options) {
        const tools = this.getTools();
        const result = await runAgentLoop([{ role: 'user', content: userMessage }], {
            config: context.config,
            policy: context.policy,
            systemPrompt,
            tools,
            maxTurns: options?.maxTurns ?? 25,
            workDir: context.workDir,
            abortSignal: context.abortSignal,
        }, {
            onToolStart: (tc) => {
                this.emit('tool_called', { tool: tc.name, input: tc.input });
            },
            onToolComplete: (tc, tr) => {
                this.emit('tool_completed', { tool: tc.name, isError: tr.isError });
            },
            onTurnComplete: (_turn, tokens) => {
                this.totalTokensIn += tokens.input;
                this.totalTokensOut += tokens.output;
                this.totalCost += tokens.cost;
                this.emit('progress', { turn: _turn, cost: this.totalCost });
            },
        });
        return result;
    }
    getTools() {
        return TOOL_SETS[this.toolCategory];
    }
    addDecision(decision, reasoning) {
        const entry = {
            timestamp: new Date().toISOString(),
            decision,
            reasoning,
        };
        this.state.decisions.push(entry);
        this.emit('decision', { decision, reasoning });
    }
    addArtifact(filePath) {
        if (!this.state.artifacts.includes(filePath)) {
            this.state.artifacts.push(filePath);
        }
    }
    setProgress(current, total, label) {
        this.state.progress = { current, total, label };
        this.emit('progress', { current, total, label });
    }
    getRemainingBudget() {
        if (!this.context)
            return 0;
        return Math.max(0, this.context.budgetUsd - this.totalCost);
    }
    buildResult(status, output) {
        const durationMs = Date.now() - this.startTime;
        if (status === 'completed') {
            this.state.status = 'completed';
            this.emit('completed', { durationMs, cost: this.totalCost });
        }
        return {
            status,
            output,
            decisions: [...this.state.decisions],
            artifacts: [...this.state.artifacts],
            tokenUsage: {
                input: this.totalTokensIn,
                output: this.totalTokensOut,
                cost: this.totalCost,
            },
            childResults: new Map(this.childResults),
            durationMs,
        };
    }
    createInitialState() {
        return {
            status: 'idle',
            progress: { current: 0, total: 0, label: '' },
            decisions: [],
            blockers: [],
            artifacts: [],
            childAgents: [],
        };
    }
}
// ---------------------------------------------------------------------------
// Archetype: ImplementerAgent — writes code, runs tools, produces artifacts
// ---------------------------------------------------------------------------
export class ImplementerAgent extends Agent {
    role;
    focus;
    constructor(name, displayName, toolCategory, role, focus) {
        super(name, displayName, toolCategory);
        this.role = role;
        this.focus = focus;
    }
    async run(task, context) {
        const systemPrompt = this.buildSystemPrompt();
        const result = await this.runLoop(systemPrompt, task, context);
        if (result.aborted) {
            return this.buildResult('aborted', result.content);
        }
        return this.buildResult('completed', result.content);
    }
    buildSystemPrompt() {
        return `You are ${this.displayName}, a SkillFoundry autonomous agent. ${this.role}. Focus: ${this.focus}. Follow project CLAUDE.md standards. Be direct, no fluff. Report files you create or modify.`;
    }
}
// ---------------------------------------------------------------------------
// Archetype: ReviewerAgent — reads code, produces findings (never writes)
// ---------------------------------------------------------------------------
export class ReviewerAgent extends Agent {
    role;
    constructor(name, displayName, role) {
        super(name, displayName, 'REVIEW');
        this.role = role;
    }
    async run(task, context) {
        const systemPrompt = `You are ${this.displayName}, a SkillFoundry autonomous agent. ${this.role}. Analyze code in the current project. Report findings with file paths and line numbers. Do NOT modify files. Be specific, cite evidence.`;
        const result = await this.runLoop(systemPrompt, task, context);
        if (result.aborted) {
            return this.buildResult('aborted', result.content);
        }
        return this.buildResult('completed', result.content);
    }
}
// ---------------------------------------------------------------------------
// Archetype: OperatorAgent — runs diagnostics, produces reports
// ---------------------------------------------------------------------------
export class OperatorAgent extends Agent {
    role;
    constructor(name, displayName, toolCategory, role) {
        super(name, displayName, toolCategory);
        this.role = role;
    }
    async run(task, context) {
        const systemPrompt = `You are ${this.displayName}, a SkillFoundry autonomous agent. ${this.role}. Run diagnostics and report results. Do NOT modify source files. Use bash for commands, read/glob for inspection.`;
        const result = await this.runLoop(systemPrompt, task, context);
        if (result.aborted) {
            return this.buildResult('aborted', result.content);
        }
        return this.buildResult('completed', result.content);
    }
}
// ---------------------------------------------------------------------------
// Archetype: AdvisorAgent — answers questions (no tool access)
// ---------------------------------------------------------------------------
export class AdvisorAgent extends Agent {
    role;
    domain;
    constructor(name, displayName, role, domain) {
        super(name, displayName, 'NONE');
        this.role = role;
        this.domain = domain;
    }
    async run(task, context) {
        const systemPrompt = `You are ${this.displayName}, a SkillFoundry autonomous agent. ${this.role}. Answer questions about ${this.domain}. You have no file access in this mode. Be concise and reference project standards when relevant.`;
        const result = await this.runLoop(systemPrompt, task, context);
        if (result.aborted) {
            return this.buildResult('aborted', result.content);
        }
        return this.buildResult('completed', result.content);
    }
}
export function createAgent(def) {
    switch (def.archetype) {
        case 'implementer':
            return new ImplementerAgent(def.name, def.displayName, def.toolCategory, def.role, def.focus || '');
        case 'reviewer':
            return new ReviewerAgent(def.name, def.displayName, def.role);
        case 'operator':
            return new OperatorAgent(def.name, def.displayName, def.toolCategory, def.role);
        case 'advisor':
            return new AdvisorAgent(def.name, def.displayName, def.role, def.domain || '');
        default:
            return new ImplementerAgent(def.name, def.displayName, def.toolCategory, def.role, def.focus || '');
    }
}
//# sourceMappingURL=agent.js.map