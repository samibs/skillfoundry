import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { colors, symbols, borders } from '../utils/theme.js';
const TOOL_ICONS = {
    bash: symbols.bash,
    read: symbols.read,
    write: symbols.write,
    glob: symbols.glob,
    grep: symbols.grep,
};
function formatInput(toolCall) {
    switch (toolCall.name) {
        case 'bash':
            return String(toolCall.input.command || '');
        case 'read':
            return String(toolCall.input.file_path || '');
        case 'write':
            return String(toolCall.input.file_path || '');
        case 'glob':
            return String(toolCall.input.pattern || '');
        case 'grep': {
            const pattern = String(toolCall.input.pattern || '');
            const path = toolCall.input.path ? ` in ${toolCall.input.path}` : '';
            return `/${pattern}/${path}`;
        }
        default:
            return JSON.stringify(toolCall.input).slice(0, 100);
    }
}
export function ToolCallDisplay({ toolCall, result, isExecuting }) {
    const icon = TOOL_ICONS[toolCall.name] || symbols.tool;
    return (_jsxs(Box, { flexDirection: "column", marginLeft: 4, marginBottom: 1, children: [_jsxs(Box, { children: [_jsxs(Text, { color: colors.roleTool, bold: true, children: ["[", icon, "] ", toolCall.name, ' '] }), isExecuting && (_jsx(Text, { color: colors.accent, children: _jsx(Spinner, { type: "dots" }) })), result && !result.isError && (_jsxs(Text, { color: colors.success, children: [symbols.pass, " done"] })), result?.isError && (_jsxs(Text, { color: colors.error, children: [symbols.fail, " error"] }))] }), _jsx(Box, { marginLeft: 4, children: _jsx(Text, { color: colors.textSecondary, wrap: "wrap", children: formatInput(toolCall) }) }), result && (_jsx(Box, { marginLeft: 4, marginTop: 0, borderStyle: borders.card, borderLeft: true, borderRight: false, borderTop: false, borderBottom: false, borderLeftColor: result.isError ? colors.error : colors.borderDim, paddingLeft: 1, children: _jsxs(Text, { color: result.isError ? colors.error : colors.textMuted, wrap: "wrap", children: [result.output.slice(0, 200), result.output.length > 200 ? '...' : ''] }) }))] }));
}
//# sourceMappingURL=ToolCall.js.map