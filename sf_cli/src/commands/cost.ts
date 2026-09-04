import type { SlashCommand, SessionContext } from '../types.js';
import { getUsageSummary } from '../core/budget.js';
import { buildEfficiencyReport, formatEfficiencyReport } from '../core/delivery-metrics.js';
import { topLevel } from '../core/mission-git.js';

export const costCommand: SlashCommand = {
  name: 'cost',
  description: 'Show token usage, cost breakdown, and delivery efficiency',
  usage: '/cost [--efficiency] [--json]',
  execute: async (args: string, session: SessionContext): Promise<string> => {
    // Delivery efficiency answers a different question from spend: not "what did this
    // cost" but "how much of that cost was necessary". Token count alone rewards an agent
    // that thinks less and ships worse, so the two views are kept distinct.
    if (/--efficiency\b/.test(args)) {
      const workDir = topLevel(session.workDir) ?? session.workDir;
      const report = buildEfficiencyReport(workDir);
      if (/--json\b/.test(args)) return JSON.stringify(report, null, 2);
      return ['**Delivery Efficiency**', '', ...formatEfficiencyReport(report).map((l) => `  ${l}`), ''].join('\n');
    }

    const summary = getUsageSummary(session.workDir);

    const sessionCost = session.messages
      .filter((m) => m.metadata?.costUsd)
      .reduce((sum, m) => sum + (m.metadata!.costUsd || 0), 0);

    const sessionTokens = session.messages
      .filter((m) => m.metadata?.inputTokens)
      .reduce(
        (acc, m) => ({
          input: acc.input + (m.metadata!.inputTokens || 0),
          output: acc.output + (m.metadata!.outputTokens || 0),
        }),
        { input: 0, output: 0 },
      );

    const lines = [
      '**Cost Report**',
      '',
      '  Session:',
      `    Cost:     $${sessionCost.toFixed(4)}`,
      `    Tokens:   ${sessionTokens.input} in / ${sessionTokens.output} out`,
      `    Messages: ${session.messages.length}`,
      '',
      '  This Month:',
      `    Spend:    $${summary.monthlySpend.toFixed(4)}`,
      `    Budget:   $${session.config.monthly_budget_usd.toFixed(2)}`,
      `    Remaining:$${Math.max(0, session.config.monthly_budget_usd - summary.monthlySpend).toFixed(2)}`,
      '',
      `  Today:      $${summary.todaySpend.toFixed(4)}`,
      `  All Time:   ${summary.totalEntries} API calls`,
    ];

    if (Object.keys(summary.byProvider).length > 0) {
      lines.push('');
      lines.push('  By Provider:');

      let localTokens = 0;
      let localCost = 0;
      let cloudTokens = 0;
      let cloudCost = 0;
      const localProviders = ['ollama', 'lmstudio'];

      for (const [provider, data] of Object.entries(summary.byProvider)) {
        lines.push(`    ${provider}: ${data.count} calls, $${data.cost.toFixed(4)}, ${data.tokens} tokens`);
        if (localProviders.includes(provider)) {
          localTokens += data.tokens;
          localCost += data.cost;
        } else {
          cloudTokens += data.tokens;
          cloudCost += data.cost;
        }
      }

      // Show local vs cloud breakdown if both have been used
      if (localTokens > 0 || cloudTokens > 0) {
        lines.push('');
        lines.push('  Local vs Cloud:');
        lines.push(`    Local:  ${localTokens} tokens ($${localCost.toFixed(4)})`);
        lines.push(`    Cloud:  ${cloudTokens} tokens ($${cloudCost.toFixed(4)})`);
        if (localTokens > 0 && cloudCost > 0) {
          // Estimate savings: what would local tokens have cost at cloud rates
          const avgCloudRate = cloudCost / cloudTokens;
          const estimatedSavings = localTokens * avgCloudRate;
          lines.push(`    Saved:  ~$${estimatedSavings.toFixed(4)} by routing locally`);
        }
      }
    }

    lines.push('');
    lines.push('  Run `/cost --efficiency` for delivery efficiency: evidence reuse,');
    lines.push('  repeated commands, and repository-wide runs avoided.');

    return lines.join('\n');
  },
};
