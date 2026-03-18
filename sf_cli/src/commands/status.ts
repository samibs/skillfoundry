import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SlashCommand, SessionContext } from '../types.js';

export const statusCommand: SlashCommand = {
  name: 'status',
  description: 'Show session and workspace status',
  usage: '/status',
  execute: async (_args: string, session: SessionContext): Promise<string> => {
    const { config, state } = session;
    const totalCost = session.messages
      .filter((m) => m.metadata?.costUsd)
      .reduce((sum, m) => sum + (m.metadata!.costUsd || 0), 0);
    const lines = [
      '**Session Status**',
      '',
      `  State:      ${state.current_state}`,
      `  Provider:   ${config.provider}:${config.model}`,
      `  Engine:     ${config.engine}`,
      `  Budget:     $${config.run_budget_usd}/run, $${config.monthly_budget_usd}/month`,
      `  Session $:  $${totalCost.toFixed(4)}`,
      `  Messages:   ${session.messages.length}`,
      `  Work Dir:   ${session.workDir}`,
    ];
    if (config.route_local_first) {
      lines.push(`  Routing:    local-first (${config.local_provider}:${config.local_model})`);
    }
    if (config.data_jurisdiction !== 'none') {
      lines.push(`  Jurisdiction: ${config.data_jurisdiction}`);
    }
    if (config.quality_fallback) {
      lines.push(`  Quality FB: enabled`);
    }
    if (state.last_plan_id) {
      lines.push(`  Last Plan:  ${state.last_plan_id}`);
    }
    if (state.last_run_id) {
      lines.push(`  Last Run:   ${state.last_run_id}`);
    }

    // Auto-harvest status
    const sfRoot = findFrameworkRoot(session.workDir);
    if (sfRoot) {
      const harvestState = join(sfRoot, '.claude', 'auto-harvest-state.json');
      if (existsSync(harvestState)) {
        try {
          const hs = JSON.parse(readFileSync(harvestState, 'utf-8'));
          lines.push('');
          lines.push('**Harvest**');
          lines.push(`  Last:       ${hs.last_run ?? 'never'}`);
          lines.push(`  Lifetime:   ${hs.total_runs ?? 0} runs, ${hs.total_entries_harvested ?? 0} entries`);
          if (hs.projects_scanned) {
            lines.push(`  Projects:   ${hs.projects_harvested_last ?? 0}/${hs.projects_scanned} harvested`);
          }
        } catch {
          // ignore malformed state
        }
      }
    }

    return lines.join('\n');
  },
};

function findFrameworkRoot(workDir: string): string | null {
  // Check if we're inside the framework itself
  const cliDir = dirname(dirname(fileURLToPath(import.meta.url)));
  const frameworkDir = dirname(dirname(cliDir));
  if (existsSync(join(frameworkDir, '.project-registry'))) {
    return frameworkDir;
  }
  // Check if the project has a .skillfoundry config pointing to framework source
  const configPath = join(workDir, '.skillfoundry', 'config.toml');
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      const match = content.match(/source\s*=\s*"([^"]+)"/);
      if (match && existsSync(join(match[1], '.project-registry'))) {
        return match[1];
      }
    } catch {
      // ignore
    }
  }
  return null;
}
