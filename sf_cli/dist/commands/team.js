import { TEAM_PRESETS, getTeamPreset, getAllTeamPresetNames, createCustomTeam, } from '../core/team-registry.js';
export const teamCommand = {
    name: 'team',
    description: 'Summon a team (e.g. /team dev, /team security, /team list)',
    usage: '/team <name>',
    execute: async (args, session) => {
        const parts = args.trim().split(/\s+/).filter(Boolean);
        const sub = parts[0]?.toLowerCase() || '';
        // No args — show status
        if (!sub) {
            if (session.activeTeam) {
                const t = session.activeTeam;
                return `Active team: ${t.displayName} (${t.members.length} agents: ${t.members.join(', ')})\nDefault: ${t.defaultAgent} | Use /team off to dismiss.`;
            }
            const presets = getAllTeamPresetNames();
            return `No team active.\n\nAvailable teams: ${presets.join(', ')}\nUse /team <name> to summon, or /team custom <agent1> <agent2> ... for a custom roster.`;
        }
        // /team off — dismiss
        if (sub === 'off' || sub === 'dismiss' || sub === 'clear') {
            session.setActiveTeam(null);
            return 'Team dismissed. Using default mode.';
        }
        // /team list — show all presets
        if (sub === 'list') {
            const lines = ['Available Teams\n'];
            for (const [name, team] of Object.entries(TEAM_PRESETS)) {
                lines.push(`  ${name.padEnd(12)} ${team.displayName}`);
                lines.push(`  ${''.padEnd(12)} ${team.members.join(', ')} (default: ${team.defaultAgent})`);
                lines.push('');
            }
            lines.push('Use /team <name> to summon, or /team custom <agent1> <agent2> ...');
            return lines.join('\n');
        }
        // /team status — current roster details
        if (sub === 'status') {
            if (!session.activeTeam)
                return 'No team active. Use /team <name> to summon.';
            const t = session.activeTeam;
            const lines = [
                `Team: ${t.displayName}`,
                `Members: ${t.members.join(', ')}`,
                `Default: ${t.defaultAgent}`,
                `Description: ${t.description}`,
                '',
                'Messages are auto-routed to the best-matching team member.',
                'Use /team off to dismiss.',
            ];
            return lines.join('\n');
        }
        // /team custom <agent1> <agent2> ...
        if (sub === 'custom') {
            const agentNames = parts.slice(1).map((n) => n.toLowerCase());
            if (agentNames.length < 2) {
                return 'Usage: /team custom <agent1> <agent2> ... (minimum 2 agents)';
            }
            const result = createCustomTeam(agentNames);
            if (result.error)
                return result.error;
            session.setActiveTeam(result.team);
            return `Custom team summoned: ${agentNames.join(', ')} (default: ${agentNames[0]})\nMessages will auto-route to the best match. Use /team off to dismiss.`;
        }
        // /team <preset-name> — activate preset
        const preset = getTeamPreset(sub);
        if (!preset) {
            const presets = getAllTeamPresetNames();
            return `Unknown team: ${sub}. Available: ${presets.join(', ')}\nOr use /team custom <agent1> <agent2> ... for a custom roster.`;
        }
        session.setActiveTeam(preset);
        return `${preset.displayName} summoned: ${preset.members.join(', ')} (default: ${preset.defaultAgent})\nMessages will auto-route to the best match. Use /team off to dismiss.`;
    },
};
//# sourceMappingURL=team.js.map