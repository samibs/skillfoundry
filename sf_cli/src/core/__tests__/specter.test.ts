import { describe, it, expect, vi } from 'vitest';
import { SpecterEngine } from '../specter.js';
import { AGENT_REGISTRY, createAgentInstance } from '../agent-registry.js';
import type { AgentContext } from '../agent.js';

describe('SpecterEngine', () => {
  it('should be correctly registered in AGENT_REGISTRY', () => {
    expect(AGENT_REGISTRY.specter).toBeDefined();
    expect(AGENT_REGISTRY.specter.name).toBe('specter');
    expect(AGENT_REGISTRY.specter.toolCategory).toBe('FULL');
  });

  it('should be instantiable via createAgentInstance', () => {
    const agent = createAgentInstance('specter');
    // createAgentInstance returns a generic Agent for specter to avoid circular imports
    // (specter.ts → agent.ts → agent-registry.ts → specter.ts).
    // Use `new SpecterEngine()` directly when the real engine is needed.
    expect(agent.name).toBe('specter');
    expect(typeof agent.execute).toBe('function');
  });

  it('should execute and return a draft report', async () => {
    const agent = new SpecterEngine();
    const context: AgentContext = {
      workDir: '/tmp',
      config: { model: 'claude-3-5-sonnet-latest' } as any,
      policy: { allow_shell: true } as any,
      parentAgent: null,
      budgetUsd: 1.0,
      abortSignal: { aborted: false },
      delegationDepth: 0,
    };

    const result = await agent.execute('Test task', context);
    expect(result.status).toBe('completed');
    
    const report = JSON.parse(result.output);
    expect(report.status).toBe('PASS');
    expect(report.summary).toContain('No speculative attack vectors');
    expect(Array.isArray(report.vectors)).toBe(true);
  });

  it('should generate vectors from LLM response', async () => {
    const agent = new SpecterEngine();
    const context: AgentContext = {
      workDir: process.cwd().replace('/sf_cli', ''), // Root dir
      config: { model: 'claude-3-5-sonnet-latest' } as any,
      policy: { allow_shell: true } as any,
      parentAgent: null,
      budgetUsd: 1.0,
      abortSignal: { aborted: false },
      delegationDepth: 0,
    };

    // Mock runLoop
    const mockVectors = [
      { id: 'VEC-001', title: 'Test Vector', severity: 'high', status: 'draft' }
    ];
    vi.spyOn(agent as any, 'runLoop').mockResolvedValue({
      content: JSON.stringify(mockVectors),
      turnCount: 1,
      totalCostUsd: 0.01,
    });

    const vectors = await agent.generateVectors('diff content', 'prd content', context);
    expect(vectors.length).toBe(1);
    expect(vectors[0].title).toBe('Test Vector');
    expect(vectors[0].status).toBe('draft');
  });

  it('should run simulation and return result', async () => {
    const agent = new SpecterEngine();
    const context: AgentContext = {
      workDir: '/tmp',
      config: {} as any,
      policy: {} as any,
      parentAgent: null,
      budgetUsd: 1.0,
      abortSignal: { aborted: false },
      delegationDepth: 0,
    };

    const vector: any = {
      id: 'VEC-001',
      exploitSimCommand: 'echo "exploited"',
    };

    const result = await agent.runSimulation(vector, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('exploited');
  });

  it('should block unsafe simulation commands', async () => {
    const agent = new SpecterEngine();
    const context: AgentContext = {
      workDir: '/tmp',
      config: {} as any,
      policy: {} as any,
      parentAgent: null,
      budgetUsd: 1.0,
      abortSignal: { aborted: false },
      delegationDepth: 0,
    };

    const vector: any = {
      id: 'VEC-001',
      exploitSimCommand: 'curl https://google.com',
    };

    const result = await agent.runSimulation(vector, context);
    expect(result.success).toBe(false);
    expect(result.output).toContain('Blocked');
  });
});
