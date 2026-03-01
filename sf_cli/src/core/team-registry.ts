// Team registry: preset and custom agent teams with auto-routing support.
// Summon a team once with /team <name>, available for the entire session.

import { getAgent } from './agent-registry.js';

export interface TeamDefinition {
  name: string;
  displayName: string;
  description: string;
  members: string[];
  defaultAgent: string;
}

export const TEAM_PRESETS: Record<string, TeamDefinition> = {
  dev: {
    name: 'dev',
    displayName: 'Development Team',
    description: 'Core dev workflow: code, test, fix, review',
    members: ['coder', 'tester', 'fixer', 'review', 'debugger'],
    defaultAgent: 'coder',
  },
  fullstack: {
    name: 'fullstack',
    displayName: 'Full-Stack Team',
    description: 'End-to-end: architecture, API, UI, data, docs',
    members: ['architect', 'coder', 'api-design', 'data-architect', 'ux-ui', 'tester', 'docs'],
    defaultAgent: 'coder',
  },
  security: {
    name: 'security',
    displayName: 'Security Team',
    description: 'Audit and harden: scan, review, gate',
    members: ['security', 'security-scanner', 'gate-keeper', 'review', 'standards'],
    defaultAgent: 'security',
  },
  ops: {
    name: 'ops',
    displayName: 'Operations Team',
    description: 'Deploy, monitor, debug production',
    members: ['devops', 'sre', 'ops', 'debugger', 'health', 'performance', 'metrics'],
    defaultAgent: 'devops',
  },
  review: {
    name: 'review',
    displayName: 'Review Team',
    description: 'Multi-perspective code review',
    members: ['review', 'evaluator', 'gate-keeper', 'security', 'standards', 'accessibility'],
    defaultAgent: 'review',
  },
  ship: {
    name: 'ship',
    displayName: 'Ship Team',
    description: 'Release pipeline: test, audit, release, ship',
    members: ['tester', 'review', 'release', 'ship', 'anvil'],
    defaultAgent: 'ship',
  },
};

export function getTeamPreset(name: string): TeamDefinition | undefined {
  return TEAM_PRESETS[name];
}

export function getAllTeamPresetNames(): string[] {
  return Object.keys(TEAM_PRESETS).sort();
}

export function createCustomTeam(agentNames: string[]): { team?: TeamDefinition; error?: string } {
  if (agentNames.length < 2) {
    return { error: 'Custom teams require at least 2 agents.' };
  }

  const invalid = agentNames.filter((n) => !getAgent(n));
  if (invalid.length > 0) {
    return { error: `Unknown agent(s): ${invalid.join(', ')}. Use /agent list to see available agents.` };
  }

  return {
    team: {
      name: 'custom',
      displayName: 'Custom Team',
      description: `Custom: ${agentNames.join(', ')}`,
      members: agentNames,
      defaultAgent: agentNames[0],
    },
  };
}
