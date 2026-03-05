export const statusCommand = {
    name: 'status',
    description: 'Show session and workspace status',
    usage: '/status',
    execute: async (_args, session) => {
        const { config, state } = session;
        const totalCost = session.messages
            .filter((m) => m.metadata?.costUsd)
            .reduce((sum, m) => sum + (m.metadata.costUsd || 0), 0);
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
        if (state.last_plan_id) {
            lines.push(`  Last Plan:  ${state.last_plan_id}`);
        }
        if (state.last_run_id) {
            lines.push(`  Last Run:   ${state.last_run_id}`);
        }
        return lines.join('\n');
    },
};
//# sourceMappingURL=status.js.map