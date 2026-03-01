import { describe, it, expect } from 'vitest';
import {
  AGENT_REGISTRY,
  TOOL_SETS,
  getAgent,
  getAgentTools,
  getAgentSystemPrompt,
  getAllAgentNames,
  getAgentsByCategory,
} from '../core/agent-registry.js';
import { ALL_TOOLS } from '../core/tools.js';
import type { ToolCategory } from '../core/agent-registry.js';

const VALID_CATEGORIES: ToolCategory[] = ['FULL', 'CODE', 'REVIEW', 'OPS', 'INSPECT', 'NONE'];

describe('agent-registry', () => {
  it('registers exactly 60 agents', () => {
    expect(Object.keys(AGENT_REGISTRY)).toHaveLength(60);
  });

  it('getAllAgentNames returns 60 sorted names', () => {
    const names = getAllAgentNames();
    expect(names).toHaveLength(60);
    // Verify sorted
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('every agent has a valid toolCategory', () => {
    for (const [name, def] of Object.entries(AGENT_REGISTRY)) {
      expect(VALID_CATEGORIES, `${name} has invalid category: ${def.toolCategory}`)
        .toContain(def.toolCategory);
    }
  });

  it('every agent has a non-empty systemPrompt under 150 words', () => {
    for (const [name, def] of Object.entries(AGENT_REGISTRY)) {
      expect(def.systemPrompt.length, `${name} has empty prompt`).toBeGreaterThan(0);
      const wordCount = def.systemPrompt.split(/\s+/).length;
      expect(wordCount, `${name} prompt too long (${wordCount} words)`).toBeLessThanOrEqual(150);
    }
  });

  it('every agent has a non-empty displayName', () => {
    for (const [name, def] of Object.entries(AGENT_REGISTRY)) {
      expect(def.displayName.length, `${name} has empty displayName`).toBeGreaterThan(0);
    }
  });

  it('agent name matches the key', () => {
    for (const [key, def] of Object.entries(AGENT_REGISTRY)) {
      expect(def.name, `key ${key} does not match name ${def.name}`).toBe(key);
    }
  });
});

describe('TOOL_SETS', () => {
  it('FULL has 5 tools', () => {
    expect(TOOL_SETS.FULL).toHaveLength(5);
  });

  it('CODE has 4 tools (no bash)', () => {
    expect(TOOL_SETS.CODE).toHaveLength(4);
    expect(TOOL_SETS.CODE.map((t) => t.name)).not.toContain('bash');
  });

  it('REVIEW has 3 tools (read, glob, grep)', () => {
    expect(TOOL_SETS.REVIEW).toHaveLength(3);
    expect(TOOL_SETS.REVIEW.map((t) => t.name).sort()).toEqual(['glob', 'grep', 'read']);
  });

  it('OPS has 4 tools (no write)', () => {
    expect(TOOL_SETS.OPS).toHaveLength(4);
    expect(TOOL_SETS.OPS.map((t) => t.name)).not.toContain('write');
  });

  it('INSPECT has 2 tools (read, glob)', () => {
    expect(TOOL_SETS.INSPECT).toHaveLength(2);
    expect(TOOL_SETS.INSPECT.map((t) => t.name).sort()).toEqual(['glob', 'read']);
  });

  it('NONE has 0 tools', () => {
    expect(TOOL_SETS.NONE).toHaveLength(0);
  });
});

describe('getAgentTools', () => {
  it('returns correct tools for FULL agent', () => {
    const tools = getAgentTools('coder');
    expect(tools).toHaveLength(5);
  });

  it('returns correct tools for REVIEW agent', () => {
    const tools = getAgentTools('review');
    expect(tools).toHaveLength(3);
    expect(tools.map((t) => t.name).sort()).toEqual(['glob', 'grep', 'read']);
  });

  it('returns correct tools for INSPECT agent', () => {
    const tools = getAgentTools('explain');
    expect(tools).toHaveLength(2);
  });

  it('returns empty array for NONE agent', () => {
    const tools = getAgentTools('learn');
    expect(tools).toHaveLength(0);
  });

  it('falls back to ALL_TOOLS for unknown agent', () => {
    const tools = getAgentTools('nonexistent-agent');
    expect(tools).toBe(ALL_TOOLS);
    expect(tools).toHaveLength(5);
  });
});

describe('getAgentSystemPrompt', () => {
  it('returns agent-specific prompt for known agent', () => {
    const prompt = getAgentSystemPrompt('review');
    expect(prompt).toContain('Code Reviewer');
    expect(prompt).toContain('Do NOT modify files');
  });

  it('returns default prompt for unknown agent', () => {
    const prompt = getAgentSystemPrompt('nonexistent');
    expect(prompt).toContain('SkillFoundry AI');
  });
});

describe('getAgent', () => {
  it('returns definition for known agent', () => {
    const agent = getAgent('security');
    expect(agent).toBeDefined();
    expect(agent!.displayName).toBe('Security Specialist');
    expect(agent!.toolCategory).toBe('REVIEW');
  });

  it('returns undefined for unknown agent', () => {
    expect(getAgent('nonexistent')).toBeUndefined();
  });
});

describe('getAgentsByCategory', () => {
  it('returns agents for FULL category', () => {
    const agents = getAgentsByCategory('FULL');
    expect(agents.length).toBe(21);
    expect(agents).toContain('coder');
    expect(agents).toContain('forge');
  });

  it('returns agents for NONE category', () => {
    const agents = getAgentsByCategory('NONE');
    expect(agents).toEqual(['bpsbs', 'learn']);
  });

  it('category counts add up to 60', () => {
    let total = 0;
    for (const cat of VALID_CATEGORIES) {
      total += getAgentsByCategory(cat).length;
    }
    expect(total).toBe(60);
  });
});
