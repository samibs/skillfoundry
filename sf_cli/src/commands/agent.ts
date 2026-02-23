import type { SlashCommand, SessionContext } from '../types.js';
import {
  getAgent,
  getAllAgentNames,
  getAgentsByCategory,
  TOOL_SETS,
  type ToolCategory,
} from '../core/agent-registry.js';

const CATEGORIES: ToolCategory[] = ['FULL', 'CODE', 'REVIEW', 'OPS', 'INSPECT', 'NONE'];

export const agentCommand: SlashCommand = {
  name: 'agent',
  description: 'Activate a per-agent persona with optimized tool sets',
  usage: '/agent [name|off|list|info <name>]',
  execute: async (args: string, session: SessionContext): Promise<string> => {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0]?.toLowerCase() || '';

    // No args — show current agent and quick list
    if (!sub) {
      const current = session.activeAgent;
      const names = getAllAgentNames();
      let out = current
        ? `Active agent: ${current}\n`
        : 'No agent active (using default mode)\n';
      out += `\n${names.length} agents available. Use /agent list for details, /agent <name> to activate.`;
      return out;
    }

    // /agent off — deactivate
    if (sub === 'off' || sub === 'clear' || sub === 'reset') {
      session.setActiveAgent(null);
      return 'Agent deactivated. Using default mode (all tools).';
    }

    // /agent list — grouped by category
    if (sub === 'list') {
      const lines: string[] = ['Agent Registry\n'];

      for (const cat of CATEGORIES) {
        const agents = getAgentsByCategory(cat);
        const toolCount = TOOL_SETS[cat].length;
        const toolNames = TOOL_SETS[cat].map((t) => t.name).join(', ') || '(none)';
        lines.push(`${cat} (${toolCount} tools: ${toolNames})`);
        lines.push(`  ${agents.join(', ')}`);
        lines.push('');
      }

      lines.push(`Total: ${getAllAgentNames().length} agents`);
      return lines.join('\n');
    }

    // /agent info <name> — show details
    if (sub === 'info') {
      const name = parts[1]?.toLowerCase();
      if (!name) return 'Usage: /agent info <name>';

      const agent = getAgent(name);
      if (!agent) return `Unknown agent: ${name}. Use /agent list to see available agents.`;

      const toolNames = TOOL_SETS[agent.toolCategory].map((t) => t.name).join(', ') || '(none)';
      return [
        `Agent: ${agent.displayName} (${agent.name})`,
        `Category: ${agent.toolCategory} (${TOOL_SETS[agent.toolCategory].length} tools)`,
        `Tools: ${toolNames}`,
        `Prompt: ${agent.systemPrompt}`,
      ].join('\n');
    }

    // /agent <name> — activate
    const agent = getAgent(sub);
    if (!agent) {
      return `Unknown agent: ${sub}. Use /agent list to see available agents.`;
    }

    session.setActiveAgent(agent.name);
    const toolCount = TOOL_SETS[agent.toolCategory].length;
    const toolNames = TOOL_SETS[agent.toolCategory].map((t) => t.name).join(', ') || '(none)';
    return `Activated: ${agent.displayName} [${agent.toolCategory}] (${toolCount} tools: ${toolNames})\nUse /agent off to deactivate.`;
  },
};
