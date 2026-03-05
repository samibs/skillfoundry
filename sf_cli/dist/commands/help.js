import { getAllCommands } from './index.js';
export const helpCommand = {
    name: 'help',
    description: 'Show available commands',
    usage: '/help',
    execute: async (_args, _session) => {
        const commands = getAllCommands();
        const lines = ['**Available Commands**', ''];
        for (const cmd of commands) {
            lines.push(`  \`${cmd.usage}\` — ${cmd.description}`);
        }
        lines.push('', '  `/exit` — Quit the CLI');
        lines.push('', 'Type a message to chat with AI, or use a slash command.');
        return lines.join('\n');
    },
};
//# sourceMappingURL=help.js.map