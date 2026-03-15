import type { SfConfig, SfPolicy, RunnerResult } from '../types.js';
import type { ToolDefinition } from './tools.js';
import { type ToolCategory } from './agent-registry.js';
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
    protected state: AgentState;
    protected context: AgentContext | null;
    private listeners;
    private startTime;
    private totalTokensIn;
    private totalTokensOut;
    private totalCost;
    private childResults;
    constructor(name: string, displayName: string, toolCategory: ToolCategory);
    execute(task: string, context: AgentContext): Promise<AgentResult>;
    getState(): AgentState;
    abort(): void;
    on(event: AgentEventType, listener: AgentEventListener): void;
    off(event: AgentEventType, listener: AgentEventListener): void;
    protected emit(type: AgentEventType, data?: Record<string, unknown>): void;
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
