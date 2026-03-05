import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { renderMarkdown } from '../utils/markdown.js';
import { colors, symbols, borders } from '../utils/theme.js';
const ROLE_COLORS = {
    user: colors.roleUser,
    assistant: colors.roleAssistant,
    system: colors.roleSystem,
    tool: colors.roleTool,
};
const ROLE_LABELS = {
    user: 'you',
    assistant: 'sf',
    system: 'sys',
    tool: 'tool',
};
export function Message({ message }) {
    const color = ROLE_COLORS[message.role] || colors.textPrimary;
    const label = message.role === 'assistant' && message.metadata?.routedAgent
        ? `sf:${message.metadata.routedAgent}`
        : (ROLE_LABELS[message.role] || message.role);
    const content = message.role === 'assistant'
        ? renderMarkdown(message.content)
        : message.content;
    return (_jsx(Box, { flexDirection: "column", marginBottom: 1, children: _jsx(Box, { borderStyle: borders.card, borderLeft: true, borderRight: false, borderTop: false, borderBottom: false, borderLeftColor: color, paddingLeft: 1, children: _jsxs(Box, { flexDirection: "column", children: [_jsxs(Box, { children: [_jsxs(Text, { bold: true, color: color, children: [symbols.prompt, " ", label, ' '] }), _jsx(Box, { flexDirection: "column", flexShrink: 1, children: _jsx(Text, { wrap: "wrap", children: content }) })] }), message.metadata?.costUsd !== undefined && (_jsxs(Text, { color: colors.textMuted, children: ['  ', symbols.bullet, " ", message.metadata.inputTokens, " in / ", message.metadata.outputTokens, " out", ' ', symbols.bullet, ' ', _jsxs(Text, { color: colors.warning, children: ["$", message.metadata.costUsd.toFixed(4)] }), message.metadata.mode ? _jsxs(Text, { color: colors.textMuted, children: [" ", symbols.bullet, " ", message.metadata.mode] }) : '', message.metadata.routedAgent ? (_jsxs(Text, { color: colors.secondary, children: [" ", symbols.bullet, " ", symbols.arrow, message.metadata.routedAgent, ":", message.metadata.routingConfidence] })) : ''] }))] }) }) }));
}
//# sourceMappingURL=Message.js.map