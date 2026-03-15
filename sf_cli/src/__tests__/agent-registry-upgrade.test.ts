import { describe, it, expect, vi } from 'vitest';
import {
  AGENT_REGISTRY,
  AGENT_ARCHETYPE_MAP,
  getAgentArchetype,
  createAgentInstance,
  getAllAgentNames,
  getAgent,
  getAgentTools,
  getAgentSystemPrompt,
  type AgentArchetype,
} from '../core/agent-registry.js';
import {
  Agent,
  ImplementerAgent,
  ReviewerAgent,
  OperatorAgent,
  AdvisorAgent,
} from '../core/agent.js';

// Mock ai-runner (agents need it for execution)
vi.mock('../core/ai-runner.js', () => ({
  runAgentLoop: vi.fn().mockResolvedValue({
    content: 'done',
    turnCount: 1,
    totalInputTokens: 100,
    totalOutputTokens: 50,
    totalCostUsd: 0.001,
    aborted: false,
  }),
}));

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('Agent Archetype Map', () => {
  it('maps all 60 registered agents', () => {
    const registeredNames = Object.keys(AGENT_REGISTRY);
    const mappedNames = Object.keys(AGENT_ARCHETYPE_MAP);

    // Every registered agent should have an archetype mapping
    for (const name of registeredNames) {
      expect(AGENT_ARCHETYPE_MAP).toHaveProperty(name);
    }
    expect(mappedNames.length).toBeGreaterThanOrEqual(registeredNames.length);
  });

  it('REVIEW agents map to reviewer archetype', () => {
    const reviewAgents = Object.entries(AGENT_REGISTRY)
      .filter(([, def]) => def.toolCategory === 'REVIEW')
      .map(([name]) => name);

    for (const name of reviewAgents) {
      expect(getAgentArchetype(name)).toBe('reviewer');
    }
  });

  it('NONE agents map to advisor archetype', () => {
    const noneAgents = Object.entries(AGENT_REGISTRY)
      .filter(([, def]) => def.toolCategory === 'NONE')
      .map(([name]) => name);

    for (const name of noneAgents) {
      expect(getAgentArchetype(name)).toBe('advisor');
    }
  });

  it('FULL agents map to implementer archetype', () => {
    const fullAgents = Object.entries(AGENT_REGISTRY)
      .filter(([, def]) => def.toolCategory === 'FULL')
      .map(([name]) => name);

    for (const name of fullAgents) {
      expect(getAgentArchetype(name)).toBe('implementer');
    }
  });

  it('returns implementer for unknown agents', () => {
    expect(getAgentArchetype('nonexistent')).toBe('implementer');
  });

  it('only uses valid archetype values', () => {
    const validArchetypes: AgentArchetype[] = ['implementer', 'reviewer', 'operator', 'advisor'];
    for (const archetype of Object.values(AGENT_ARCHETYPE_MAP)) {
      expect(validArchetypes).toContain(archetype);
    }
  });
});

describe('createAgentInstance', () => {
  it('creates ImplementerAgent for FULL agents', () => {
    const agent = createAgentInstance('coder');
    expect(agent).toBeInstanceOf(ImplementerAgent);
    expect(agent.name).toBe('coder');
    expect(agent.displayName).toBe('Ruthless Coder');
  });

  it('creates ReviewerAgent for REVIEW agents', () => {
    const agent = createAgentInstance('review');
    expect(agent).toBeInstanceOf(ReviewerAgent);
    expect(agent.name).toBe('review');
    expect(agent.toolCategory).toBe('REVIEW');
  });

  it('creates OperatorAgent for OPS agents', () => {
    const agent = createAgentInstance('tester');
    expect(agent).toBeInstanceOf(OperatorAgent);
    expect(agent.name).toBe('tester');
  });

  it('creates AdvisorAgent for NONE agents', () => {
    const agent = createAgentInstance('bpsbs');
    expect(agent).toBeInstanceOf(AdvisorAgent);
    expect(agent.name).toBe('bpsbs');
    expect(agent.toolCategory).toBe('NONE');
  });

  it('creates OperatorAgent for INSPECT agents', () => {
    const agent = createAgentInstance('status');
    expect(agent).toBeInstanceOf(OperatorAgent);
    expect(agent.name).toBe('status');
  });

  it('creates default agent for unknown name', () => {
    const agent = createAgentInstance('totally-unknown');
    expect(agent).toBeInstanceOf(ImplementerAgent);
    expect(agent.name).toBe('totally-unknown');
  });

  it('creates all 60 agents without errors', () => {
    const names = getAllAgentNames();
    expect(names.length).toBe(60);

    for (const name of names) {
      const agent = createAgentInstance(name);
      expect(agent).toBeInstanceOf(Agent);
      expect(agent.name).toBe(name);
    }
  });

  it('preserves displayName from registry', () => {
    const agent = createAgentInstance('forge');
    expect(agent.displayName).toBe('The Forge');
  });

  it('preserves toolCategory from registry', () => {
    const agent = createAgentInstance('security');
    expect(agent.toolCategory).toBe('REVIEW');
  });
});

describe('Backward Compatibility', () => {
  it('existing getAgent still works', () => {
    const def = getAgent('coder');
    expect(def).toBeDefined();
    expect(def!.name).toBe('coder');
    expect(def!.systemPrompt).toBeTruthy();
  });

  it('existing getAgentTools still works', () => {
    const tools = getAgentTools('coder');
    expect(tools.length).toBeGreaterThan(0);
  });

  it('existing getAgentSystemPrompt still works', () => {
    const prompt = getAgentSystemPrompt('coder');
    expect(prompt).toBeTruthy();
    expect(prompt.length).toBeGreaterThan(10);
  });
});
