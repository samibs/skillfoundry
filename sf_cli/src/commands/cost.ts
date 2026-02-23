import type { SlashCommand, SessionContext } from '../types.js';
import { getUsageSummary } from '../core/budget.js';

export const costCommand: SlashCommand = {
  name: 'cost',
  description: 'Show token usage and cost breakdown',
  usage: '/cost',
  execute: async (_args: string, session: SessionContext): Promise<string> => {
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
      for (const [provider, data] of Object.entries(summary.byProvider)) {
        lines.push(`    ${provider}: ${data.count} calls, $${data.cost.toFixed(4)}, ${data.tokens} tokens`);
      }
    }

    return lines.join('\n');
  },
};
