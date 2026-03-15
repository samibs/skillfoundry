import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Agent,
  ImplementerAgent,
  ReviewerAgent,
  OperatorAgent,
  AdvisorAgent,
  createAgent,
  type AgentContext,
  type AgentResult,
  type AgentEvent,
  type AgentEventListener,
} from '../core/agent.js';

// Mock ai-runner
vi.mock('../core/ai-runner.js', () => ({
  runAgentLoop: vi.fn().mockResolvedValue({
    content: 'Task completed successfully',
    turnCount: 3,
    totalInputTokens: 1000,
    totalOutputTokens: 500,
    totalCostUsd: 0.02,
    aborted: false,
  }),
}));

// Mock logger
vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

function createTestContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    workDir: '/test/project',
    config: {
      provider: 'anthropic',
      engine: 'messages',
      model: 'claude-sonnet-4-20250514',
      fallback_provider: '',
      fallback_engine: '',
      monthly_budget_usd: 100,
      run_budget_usd: 10,
      memory_sync_enabled: false,
      memory_sync_remote: '',
      route_local_first: false,
      local_provider: '',
      local_model: '',
      context_window: 0,
      log_level: 'info',
    },
    policy: {
      allow_shell: true,
      allow_network: false,
      allow_paths: ['/test/project'],
      redact: false,
    },
    parentAgent: null,
    budgetUsd: 5.0,
    abortSignal: { aborted: false },
    delegationDepth: 0,
    ...overrides,
  };
}

describe('Agent Base Class', () => {
  describe('Initial State', () => {
    it('starts in idle state', () => {
      const agent = new ImplementerAgent('test', 'Test Agent', 'FULL', 'Test role', 'testing');
      const state = agent.getState();
      expect(state.status).toBe('idle');
      expect(state.progress).toEqual({ current: 0, total: 0, label: '' });
      expect(state.decisions).toEqual([]);
      expect(state.blockers).toEqual([]);
      expect(state.artifacts).toEqual([]);
      expect(state.childAgents).toEqual([]);
    });

    it('has correct name and display name', () => {
      const agent = new ImplementerAgent('coder', 'Ruthless Coder', 'FULL', 'Senior engineer', 'implementation');
      expect(agent.name).toBe('coder');
      expect(agent.displayName).toBe('Ruthless Coder');
      expect(agent.toolCategory).toBe('FULL');
    });
  });

  describe('Execute', () => {
    it('runs and returns completed result', async () => {
      const agent = new ImplementerAgent('coder', 'Ruthless Coder', 'FULL', 'Senior engineer', 'implementation');
      const ctx = createTestContext();

      const result = await agent.execute('Write a hello world function', ctx);

      expect(result.status).toBe('completed');
      expect(result.output).toBe('Task completed successfully');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns budget_exceeded when no budget', async () => {
      const agent = new ImplementerAgent('coder', 'Coder', 'FULL', 'role', 'focus');
      const ctx = createTestContext({ budgetUsd: 0 });

      const result = await agent.execute('task', ctx);

      expect(result.status).toBe('budget_exceeded');
      expect(result.output).toContain('No budget');
    });

    it('returns failed when delegation depth exceeded', async () => {
      const agent = new ImplementerAgent('coder', 'Coder', 'FULL', 'role', 'focus');
      const ctx = createTestContext({ delegationDepth: 4 });

      const result = await agent.execute('task', ctx);

      expect(result.status).toBe('failed');
      expect(result.output).toContain('delegation depth');
    });

    it('returns aborted when signal is set before execution', async () => {
      const agent = new ImplementerAgent('coder', 'Coder', 'FULL', 'role', 'focus');
      const ctx = createTestContext({ abortSignal: { aborted: true } });

      const result = await agent.execute('task', ctx);

      expect(result.status).toBe('aborted');
    });

    it('handles execution errors gracefully', async () => {
      const { runAgentLoop } = await import('../core/ai-runner.js');
      (runAgentLoop as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Provider down'));

      const agent = new ImplementerAgent('coder', 'Coder', 'FULL', 'role', 'focus');
      const ctx = createTestContext();

      const result = await agent.execute('task', ctx);

      expect(result.status).toBe('failed');
      expect(result.output).toContain('Provider down');
    });
  });

  describe('Abort', () => {
    it('sets abort signal and state', () => {
      const agent = new ImplementerAgent('coder', 'Coder', 'FULL', 'role', 'focus');
      // Simulate context being set
      agent.abort();
      const state = agent.getState();
      expect(state.status).toBe('aborted');
    });
  });

  describe('Events', () => {
    it('emits started event on execute', async () => {
      const agent = new ImplementerAgent('coder', 'Coder', 'FULL', 'role', 'focus');
      const events: AgentEvent[] = [];
      agent.on('started', (e) => events.push(e));

      await agent.execute('test task', createTestContext());

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('started');
      expect(events[0].agentName).toBe('coder');
    });

    it('emits completed event on success', async () => {
      const agent = new ImplementerAgent('coder', 'Coder', 'FULL', 'role', 'focus');
      const events: AgentEvent[] = [];
      agent.on('completed', (e) => events.push(e));

      await agent.execute('test task', createTestContext());

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('completed');
    });

    it('emits failed event on error', async () => {
      const { runAgentLoop } = await import('../core/ai-runner.js');
      (runAgentLoop as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Boom'));

      const agent = new ImplementerAgent('coder', 'Coder', 'FULL', 'role', 'focus');
      const events: AgentEvent[] = [];
      agent.on('failed', (e) => events.push(e));

      await agent.execute('task', createTestContext());

      expect(events.length).toBe(1);
      expect(events[0].type).toBe('failed');
      expect(events[0].data?.error).toBe('Boom');
    });

    it('can remove event listeners', async () => {
      const agent = new ImplementerAgent('coder', 'Coder', 'FULL', 'role', 'focus');
      const events: AgentEvent[] = [];
      const listener: AgentEventListener = (e) => events.push(e);

      agent.on('started', listener);
      agent.off('started', listener);

      await agent.execute('test task', createTestContext());

      expect(events.length).toBe(0);
    });

    it('listener errors do not break execution', async () => {
      const agent = new ImplementerAgent('coder', 'Coder', 'FULL', 'role', 'focus');
      agent.on('started', () => { throw new Error('listener crash'); });

      const result = await agent.execute('test task', createTestContext());
      expect(result.status).toBe('completed');
    });
  });

  describe('Delegation', () => {
    it('parent can delegate to child agent', async () => {
      // Create a parent agent that delegates
      class DelegatingAgent extends ImplementerAgent {
        async run(task: string, context: AgentContext): Promise<AgentResult> {
          const child = new ImplementerAgent('child', 'Child', 'CODE', 'child role', 'child focus');
          const childResult = await this.delegate(child, 'sub-task');
          return this.buildResult('completed', `Parent done. Child: ${childResult.status}`);
        }
      }

      const parent = new DelegatingAgent('parent', 'Parent', 'FULL', 'parent role', 'parent focus');
      const ctx = createTestContext();

      const result = await parent.execute('main task', ctx);

      expect(result.status).toBe('completed');
      expect(result.output).toContain('Child: completed');
      expect(result.childResults.size).toBe(1);
      expect(result.childResults.has('child')).toBe(true);
    });

    it('delegation respects budget fraction', async () => {
      class BudgetTestAgent extends ImplementerAgent {
        capturedBudget = 0;
        async run(task: string, context: AgentContext): Promise<AgentResult> {
          const child = new ImplementerAgent('child', 'Child', 'CODE', 'role', 'focus');
          // Delegate with 50% budget
          await this.delegate(child, 'sub-task', 0.5);
          return this.buildResult('completed', 'done');
        }
      }

      const parent = new BudgetTestAgent('parent', 'Parent', 'FULL', 'role', 'focus');
      const ctx = createTestContext({ budgetUsd: 10.0 });
      await parent.execute('task', ctx);

      // Child should have been called — we just verify no budget_exceeded
      const state = parent.getState();
      expect(state.childAgents.length).toBe(1);
    });

    it('delegation fails when no budget remaining', async () => {
      class NoBudgetDelegator extends ImplementerAgent {
        async run(task: string, context: AgentContext): Promise<AgentResult> {
          // Set budget to 0 to simulate exhaustion
          context.budgetUsd = 0;
          const child = new ImplementerAgent('child', 'Child', 'CODE', 'role', 'focus');
          const childResult = await this.delegate(child, 'sub-task');
          return this.buildResult('completed', `Child: ${childResult.status}`);
        }
      }

      const parent = new NoBudgetDelegator('parent', 'Parent', 'FULL', 'role', 'focus');
      const result = await parent.execute('task', createTestContext({ budgetUsd: 0.001 }));

      expect(result.output).toContain('budget_exceeded');
    });

    it('tracks child agents in state', async () => {
      class TrackingAgent extends ImplementerAgent {
        async run(task: string, context: AgentContext): Promise<AgentResult> {
          const child = new ImplementerAgent('worker', 'Worker', 'CODE', 'role', 'focus');
          await this.delegate(child, 'work');
          const state = this.getState();
          expect(state.childAgents.length).toBe(1);
          expect(state.childAgents[0].name).toBe('worker');
          return this.buildResult('completed', 'done');
        }
      }

      const parent = new TrackingAgent('boss', 'Boss', 'FULL', 'role', 'focus');
      await parent.execute('task', createTestContext());
    });
  });
});

describe('ImplementerAgent', () => {
  it('creates with correct properties', () => {
    const agent = new ImplementerAgent('coder', 'Ruthless Coder', 'FULL', 'Senior engineer', 'code quality');
    expect(agent.name).toBe('coder');
    expect(agent.displayName).toBe('Ruthless Coder');
    expect(agent.toolCategory).toBe('FULL');
  });

  it('executes and returns result', async () => {
    const agent = new ImplementerAgent('coder', 'Coder', 'FULL', 'role', 'focus');
    const result = await agent.execute('write code', createTestContext());
    expect(result.status).toBe('completed');
    expect(result.output).toBeTruthy();
  });
});

describe('ReviewerAgent', () => {
  it('creates with REVIEW tool category', () => {
    const agent = new ReviewerAgent('review', 'Code Reviewer', 'Reviews code');
    expect(agent.toolCategory).toBe('REVIEW');
  });

  it('executes and returns result', async () => {
    const agent = new ReviewerAgent('review', 'Code Reviewer', 'Reviews code');
    const result = await agent.execute('review this code', createTestContext());
    expect(result.status).toBe('completed');
  });
});

describe('OperatorAgent', () => {
  it('creates with specified tool category', () => {
    const agent = new OperatorAgent('tester', 'Tester', 'OPS', 'Runs tests');
    expect(agent.toolCategory).toBe('OPS');
  });

  it('executes and returns result', async () => {
    const agent = new OperatorAgent('tester', 'Tester', 'OPS', 'Runs tests');
    const result = await agent.execute('run tests', createTestContext());
    expect(result.status).toBe('completed');
  });
});

describe('AdvisorAgent', () => {
  it('creates with NONE tool category', () => {
    const agent = new AdvisorAgent('bpsbs', 'BPSBS', 'Standards advisor', 'security standards');
    expect(agent.toolCategory).toBe('NONE');
  });

  it('executes and returns result', async () => {
    const agent = new AdvisorAgent('bpsbs', 'BPSBS', 'Standards advisor', 'standards');
    const result = await agent.execute('explain standards', createTestContext());
    expect(result.status).toBe('completed');
  });
});

describe('createAgent Factory', () => {
  it('creates ImplementerAgent', () => {
    const agent = createAgent({
      name: 'coder',
      displayName: 'Coder',
      toolCategory: 'FULL',
      archetype: 'implementer',
      role: 'Senior engineer',
      focus: 'implementation',
    });
    expect(agent).toBeInstanceOf(ImplementerAgent);
    expect(agent.name).toBe('coder');
  });

  it('creates ReviewerAgent', () => {
    const agent = createAgent({
      name: 'review',
      displayName: 'Reviewer',
      toolCategory: 'REVIEW',
      archetype: 'reviewer',
      role: 'Code reviewer',
    });
    expect(agent).toBeInstanceOf(ReviewerAgent);
  });

  it('creates OperatorAgent', () => {
    const agent = createAgent({
      name: 'tester',
      displayName: 'Tester',
      toolCategory: 'OPS',
      archetype: 'operator',
      role: 'Test runner',
    });
    expect(agent).toBeInstanceOf(OperatorAgent);
  });

  it('creates AdvisorAgent', () => {
    const agent = createAgent({
      name: 'bpsbs',
      displayName: 'BPSBS',
      toolCategory: 'NONE',
      archetype: 'advisor',
      role: 'Standards advisor',
      domain: 'security standards',
    });
    expect(agent).toBeInstanceOf(AdvisorAgent);
  });

  it('defaults to ImplementerAgent for unknown archetype', () => {
    const agent = createAgent({
      name: 'unknown',
      displayName: 'Unknown',
      toolCategory: 'FULL',
      archetype: 'unknown' as 'implementer',
      role: 'role',
    });
    expect(agent).toBeInstanceOf(ImplementerAgent);
  });
});

describe('AgentResult Contract', () => {
  it('result contains all required fields', async () => {
    const agent = new ImplementerAgent('coder', 'Coder', 'FULL', 'role', 'focus');
    const result = await agent.execute('task', createTestContext());

    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('output');
    expect(result).toHaveProperty('decisions');
    expect(result).toHaveProperty('artifacts');
    expect(result).toHaveProperty('tokenUsage');
    expect(result).toHaveProperty('childResults');
    expect(result).toHaveProperty('durationMs');

    expect(result.tokenUsage).toHaveProperty('input');
    expect(result.tokenUsage).toHaveProperty('output');
    expect(result.tokenUsage).toHaveProperty('cost');
    expect(result.childResults).toBeInstanceOf(Map);
    expect(Array.isArray(result.decisions)).toBe(true);
    expect(Array.isArray(result.artifacts)).toBe(true);
  });
});
