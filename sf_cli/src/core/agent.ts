// Real Autonomous Agent System
// Provides Agent base class, 4 archetype classes, state machine,
// delegation, budget partitioning, and event emitter.
// Wraps ai-runner.ts as the execution engine.

import type {
  SfConfig,
  SfPolicy,
  ToolCall,
  ToolResult,
  RunnerResult,
  MessageType,
  AgentMessage,
} from '../types.js';
import type { ToolDefinition } from './tools.js';
import { TOOL_SETS, type ToolCategory } from './agent-registry.js';
import { runAgentLoop } from './ai-runner.js';
import { getLogger } from '../utils/logger.js';
import { AgentMessageBus, type SubscriberFn, type UnsubscribeFn } from './agent-message-bus.js';
import { AgentLogger } from './agent-logger.js';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Agent State Machine
// ---------------------------------------------------------------------------

export type AgentStatus =
  | 'idle'
  | 'running'
  | 'delegating'
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'budget_exceeded';

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
  childAgents: Array<{ name: string; status: AgentStatus; taskSummary: string }>;
}

// ---------------------------------------------------------------------------
// Agent Result
// ---------------------------------------------------------------------------

export interface AgentResult {
  status: 'completed' | 'failed' | 'aborted' | 'budget_exceeded';
  output: string;
  decisions: AgentDecision[];
  artifacts: string[];
  tokenUsage: { input: number; output: number; cost: number };
  childResults: Map<string, AgentResult>;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Agent Context
// ---------------------------------------------------------------------------

export interface AgentContext {
  workDir: string;
  config: SfConfig;
  policy: SfPolicy;
  parentAgent: Agent | null;
  budgetUsd: number;
  abortSignal: { aborted: boolean };
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

// ---------------------------------------------------------------------------
// Agent Events
// ---------------------------------------------------------------------------

export type AgentEventType =
  | 'started'
  | 'progress'
  | 'decision'
  | 'delegated'
  | 'tool_called'
  | 'tool_completed'
  | 'completed'
  | 'failed'
  | 'aborted';

export interface AgentEvent {
  type: AgentEventType;
  agentName: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export type AgentEventListener = (event: AgentEvent) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DELEGATION_DEPTH = 3;

// ---------------------------------------------------------------------------
// Agent Base Class
// ---------------------------------------------------------------------------

export abstract class Agent {
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
  protected context: AgentContext | null = null;
  private listeners: Map<AgentEventType, AgentEventListener[]> = new Map();
  private startTime = 0;
  private totalTokensIn = 0;
  private totalTokensOut = 0;
  private totalCost = 0;
  private childResults: Map<string, AgentResult> = new Map();

  constructor(name: string, displayName: string, toolCategory: ToolCategory, bus?: AgentMessageBus) {
    this.name = name;
    this.displayName = displayName;
    this.toolCategory = toolCategory;
    this.bus = bus ?? AgentMessageBus.global();
    this.state = this.createInitialState();
  }

  // ── Public API ──────────────────────────────────────────────────────

  async execute(task: string, context: AgentContext): Promise<AgentResult> {
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
      } else if (result.status === 'budget_exceeded') {
        agentLogger.fail(new Error('Budget exceeded'));
      } else if (result.status === 'failed') {
        agentLogger.fail(new Error(result.output));
      } else {
        agentLogger.complete({ status: result.status, durationMs: result.durationMs });
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.state.status = 'failed';
      this.state.blockers.push(message);
      log.error('runner', 'agent_failed', { agent: this.name, error: message });
      this.emit('failed', { error: message });
      agentLogger.fail(err instanceof Error ? err : new Error(message));
      return this.buildResult('failed', message);
    }
  }

  getState(): AgentState {
    return { ...this.state };
  }

  abort(): void {
    if (this.context) {
      this.context.abortSignal.aborted = true;
    }
    this.state.status = 'aborted';
    this.emit('aborted');
  }

  // ── Event System ────────────────────────────────────────────────────

  on(event: AgentEventType, listener: AgentEventListener): void {
    const existing = this.listeners.get(event) || [];
    existing.push(listener);
    this.listeners.set(event, existing);
  }

  off(event: AgentEventType, listener: AgentEventListener): void {
    const existing = this.listeners.get(event) || [];
    this.listeners.set(event, existing.filter((l) => l !== listener));
  }

  protected emit(type: AgentEventType, data?: Record<string, unknown>): void {
    const event: AgentEvent = {
      type,
      agentName: this.name,
      timestamp: new Date().toISOString(),
      data,
    };
    const listeners = this.listeners.get(type) || [];
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
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
  protected publishMessage(
    type: MessageType,
    payload: Record<string, unknown>,
    recipient = '*',
    correlationId?: string,
  ): AgentMessage {
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
  protected subscribeMessage(type: MessageType | '*', handler: SubscriberFn): UnsubscribeFn {
    return this.bus.subscribe(type, handler);
  }

  // ── Delegation ──────────────────────────────────────────────────────

  protected async delegate(
    childAgent: Agent,
    task: string,
    budgetFraction: number = 0.3,
  ): Promise<AgentResult> {
    if (!this.context) {
      throw new Error('Cannot delegate without execution context');
    }

    const allocatedBudget = Math.min(
      this.context.budgetUsd * budgetFraction,
      this.getRemainingBudget(),
    );

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

    const childContext: AgentContext = {
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

  // ── Protected Execution ─────────────────────────────────────────────

  /**
   * Subclasses implement this to define their autonomous behavior.
   * The base class handles lifecycle, budget, and delegation.
   */
  protected abstract run(task: string, context: AgentContext): Promise<AgentResult>;

  /**
   * Run the AI agentic loop with the agent's system prompt and tools.
   * This is the primary way agents interact with the LLM.
   */
  protected async runLoop(
    systemPrompt: string,
    userMessage: string,
    context: AgentContext,
    options?: { maxTurns?: number },
  ): Promise<RunnerResult> {
    const tools = this.getTools();
    const result = await runAgentLoop(
      [{ role: 'user', content: userMessage }],
      {
        config: context.config,
        policy: context.policy,
        systemPrompt,
        tools,
        maxTurns: options?.maxTurns ?? 25,
        workDir: context.workDir,
        abortSignal: context.abortSignal,
      },
      {
        onToolStart: (tc: ToolCall) => {
          this.emit('tool_called', { tool: tc.name, input: tc.input });
        },
        onToolComplete: (tc: ToolCall, tr: ToolResult) => {
          this.emit('tool_completed', { tool: tc.name, isError: tr.isError });
        },
        onTurnComplete: (_turn: number, tokens: { input: number; output: number; cost: number }) => {
          this.totalTokensIn += tokens.input;
          this.totalTokensOut += tokens.output;
          this.totalCost += tokens.cost;
          this.emit('progress', { turn: _turn, cost: this.totalCost });
        },
      },
    );

    return result;
  }

  protected getTools(): ToolDefinition[] {
    return TOOL_SETS[this.toolCategory];
  }

  protected addDecision(decision: string, reasoning: string): void {
    const entry: AgentDecision = {
      timestamp: new Date().toISOString(),
      decision,
      reasoning,
    };
    this.state.decisions.push(entry);
    this.emit('decision', { decision, reasoning });
  }

  protected addArtifact(filePath: string): void {
    if (!this.state.artifacts.includes(filePath)) {
      this.state.artifacts.push(filePath);
    }
  }

  protected setProgress(current: number, total: number, label: string): void {
    this.state.progress = { current, total, label };
    this.emit('progress', { current, total, label });
  }

  protected getRemainingBudget(): number {
    if (!this.context) return 0;
    return Math.max(0, this.context.budgetUsd - this.totalCost);
  }

  protected buildResult(
    status: AgentResult['status'],
    output: string,
  ): AgentResult {
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

  private createInitialState(): AgentState {
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
  private readonly role: string;
  private readonly focus: string;

  constructor(
    name: string,
    displayName: string,
    toolCategory: ToolCategory,
    role: string,
    focus: string,
  ) {
    super(name, displayName, toolCategory);
    this.role = role;
    this.focus = focus;
  }

  protected async run(task: string, context: AgentContext): Promise<AgentResult> {
    const systemPrompt = this.buildSystemPrompt();
    const result = await this.runLoop(systemPrompt, task, context);

    if (result.aborted) {
      return this.buildResult('aborted', result.content);
    }

    return this.buildResult('completed', result.content);
  }

  private buildSystemPrompt(): string {
    return `You are ${this.displayName}, a SkillFoundry autonomous agent. ${this.role}. Focus: ${this.focus}. Follow project CLAUDE.md standards. Be direct, no fluff. Report files you create or modify.`;
  }
}

// ---------------------------------------------------------------------------
// Archetype: ReviewerAgent — reads code, produces findings (never writes)
// ---------------------------------------------------------------------------

export class ReviewerAgent extends Agent {
  private readonly role: string;

  constructor(
    name: string,
    displayName: string,
    role: string,
  ) {
    super(name, displayName, 'REVIEW');
    this.role = role;
  }

  protected async run(task: string, context: AgentContext): Promise<AgentResult> {
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
  private readonly role: string;

  constructor(
    name: string,
    displayName: string,
    toolCategory: ToolCategory,
    role: string,
  ) {
    super(name, displayName, toolCategory);
    this.role = role;
  }

  protected async run(task: string, context: AgentContext): Promise<AgentResult> {
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
  private readonly role: string;
  private readonly domain: string;

  constructor(
    name: string,
    displayName: string,
    role: string,
    domain: string,
  ) {
    super(name, displayName, 'NONE');
    this.role = role;
    this.domain = domain;
  }

  protected async run(task: string, context: AgentContext): Promise<AgentResult> {
    const systemPrompt = `You are ${this.displayName}, a SkillFoundry autonomous agent. ${this.role}. Answer questions about ${this.domain}. You have no file access in this mode. Be concise and reference project standards when relevant.`;
    const result = await this.runLoop(systemPrompt, task, context);

    if (result.aborted) {
      return this.buildResult('aborted', result.content);
    }

    return this.buildResult('completed', result.content);
  }
}

// ---------------------------------------------------------------------------
// Factory: create an agent from name + registry definition
// ---------------------------------------------------------------------------

export interface AgentFactoryDefinition {
  name: string;
  displayName: string;
  toolCategory: ToolCategory;
  archetype: 'implementer' | 'reviewer' | 'operator' | 'advisor';
  role: string;
  focus?: string;
  domain?: string;
}

export function createAgent(def: AgentFactoryDefinition): Agent {
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
