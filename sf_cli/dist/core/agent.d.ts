import type { SfConfig, SfPolicy, RunnerResult, MessageType, AgentMessage } from '../types.js';
import type { ToolDefinition } from './tools.js';
import { type ToolCategory } from './agent-registry.js';
import { AgentMessageBus, type SubscriberFn, type UnsubscribeFn } from './agent-message-bus.js';
export type AgentStatus = 'idle' | 'running' | 'delegating' | 'completed' | 'failed' | 'aborted' | 'budget_exceeded';
export interface AgentProgress {
    current: number;
    total: number;
    label: string;
}
export interface AgentDecision {
    timestamp: string;
    decision: string;
    reasoning: string;
}
export interface AgentState {
    status: AgentStatus;
    progress: AgentProgress;
    decisions: AgentDecision[];
    blockers: string[];
    artifacts: string[];
    childAgents: Array<{
        name: string;
        status: AgentStatus;
        taskSummary: string;
    }>;
}
export interface AgentResult {
    status: 'completed' | 'failed' | 'aborted' | 'budget_exceeded';
    output: string;
    decisions: AgentDecision[];
    artifacts: string[];
    tokenUsage: {
        input: number;
        output: number;
        cost: number;
    };
    childResults: Map<string, AgentResult>;
    durationMs: number;
}
export interface AgentContext {
    workDir: string;
    config: SfConfig;
    policy: SfPolicy;
    parentAgent: Agent | null;
    budgetUsd: number;
    abortSignal: {
        aborted: boolean;
    };
    delegationDepth: number;
    /**
     * Optional task identifier. Populated by AgentPool when a task is dispatched.
     * Used by AgentLogger to correlate structured log entries to a specific pool task.
     */
    taskId?: string;
    /**
     * Optional correlation ID. Propagated from parent to child agents via delegate()
     * so all log entries in a delegation chain share the same correlation ID.
     */
    correlationId?: string;
}
export type AgentEventType = 'started' | 'progress' | 'decision' | 'delegated' | 'tool_called' | 'tool_completed' | 'completed' | 'failed' | 'aborted';
export interface AgentEvent {
    type: AgentEventType;
    agentName: string;
    timestamp: string;
    data?: Record<string, unknown>;
}
export type AgentEventListener = (event: AgentEvent) => void;
export declare abstract class Agent {
    readonly name: string;
    readonly displayName: string;
    readonly toolCategory: ToolCategory;
    /**
     * The message bus this agent is connected to.
     * Defaults to the process-level singleton (AgentMessageBus.global()).
     * Pass a custom instance in tests for isolation.
     */
    readonly bus: AgentMessageBus;
    protected state: AgentState;
    protected context: AgentContext | null;
    private listeners;
    private startTime;
    private totalTokensIn;
    private totalTokensOut;
    private totalCost;
    private childResults;
    constructor(name: string, displayName: string, toolCategory: ToolCategory, bus?: AgentMessageBus);
    execute(task: string, context: AgentContext): Promise<AgentResult>;
    getState(): AgentState;
    abort(): void;
    on(event: AgentEventType, listener: AgentEventListener): void;
    off(event: AgentEventType, listener: AgentEventListener): void;
    protected emit(type: AgentEventType, data?: Record<string, unknown>): void;
    /**
     * Publish a message to the agent message bus.
     * Automatically sets `sender` to this agent's name and fills `id` and `timestamp`.
     *
     * @param type - The MessageType for topic routing.
     * @param payload - Arbitrary structured payload for the message.
     * @param recipient - Target agent ID. Defaults to '*' (broadcast).
     * @param correlationId - Optional correlation ID. Generated if omitted.
     */
    protected publishMessage(type: MessageType, payload: Record<string, unknown>, recipient?: string, correlationId?: string): AgentMessage;
    /**
     * Subscribe to messages on the bus.
     * The subscription is scoped to `type` and uses the shared bus instance.
     *
     * @param type - The MessageType to listen for, or '*' for all types.
     * @param handler - Invoked with each matching message envelope.
     * @returns An unsubscribe function to remove the listener.
     */
    protected subscribeMessage(type: MessageType | '*', handler: SubscriberFn): UnsubscribeFn;
    protected delegate(childAgent: Agent, task: string, budgetFraction?: number): Promise<AgentResult>;
    /**
     * Subclasses implement this to define their autonomous behavior.
     * The base class handles lifecycle, budget, and delegation.
     */
    protected abstract run(task: string, context: AgentContext): Promise<AgentResult>;
    /**
     * Run the AI agentic loop with the agent's system prompt and tools.
     * This is the primary way agents interact with the LLM.
     */
    protected runLoop(systemPrompt: string, userMessage: string, context: AgentContext, options?: {
        maxTurns?: number;
    }): Promise<RunnerResult>;
    protected getTools(): ToolDefinition[];
    protected addDecision(decision: string, reasoning: string): void;
    protected addArtifact(filePath: string): void;
    protected setProgress(current: number, total: number, label: string): void;
    protected getRemainingBudget(): number;
    protected buildResult(status: AgentResult['status'], output: string): AgentResult;
    private createInitialState;
}
export declare class ImplementerAgent extends Agent {
    private readonly role;
    private readonly focus;
    constructor(name: string, displayName: string, toolCategory: ToolCategory, role: string, focus: string);
    protected run(task: string, context: AgentContext): Promise<AgentResult>;
    private buildSystemPrompt;
}
export declare class ReviewerAgent extends Agent {
    private readonly role;
    constructor(name: string, displayName: string, role: string);
    protected run(task: string, context: AgentContext): Promise<AgentResult>;
}
export declare class OperatorAgent extends Agent {
    private readonly role;
    constructor(name: string, displayName: string, toolCategory: ToolCategory, role: string);
    protected run(task: string, context: AgentContext): Promise<AgentResult>;
}
export declare class AdvisorAgent extends Agent {
    private readonly role;
    private readonly domain;
    constructor(name: string, displayName: string, role: string, domain: string);
    protected run(task: string, context: AgentContext): Promise<AgentResult>;
}
export interface AgentFactoryDefinition {
    name: string;
    displayName: string;
    toolCategory: ToolCategory;
    archetype: 'implementer' | 'reviewer' | 'operator' | 'advisor';
    role: string;
    focus?: string;
    domain?: string;
}
export declare function createAgent(def: AgentFactoryDefinition): Agent;
