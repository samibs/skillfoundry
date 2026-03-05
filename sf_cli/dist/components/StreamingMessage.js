import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { renderMarkdown } from '../utils/markdown.js';
import { colors, symbols, borders, formatTokens } from '../utils/theme.js';
export function StreamingMessage({ content, isStreaming, thinkingContent, showThinking, agentName, turnCount, sessionInputTokens, sessionOutputTokens, }) {
    const label = agentName ? `sf:${agentName}` : 'sf';
    const showTokens = (sessionInputTokens || 0) > 0 || (sessionOutputTokens || 0) > 0;
    const showTurn = (turnCount || 0) > 0;
    return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [showThinking && thinkingContent && (_jsx(Box, { marginBottom: 1, borderStyle: borders.card, borderLeft: true, borderRight: false, borderTop: false, borderBottom: false, borderLeftColor: colors.textMuted, paddingLeft: 1, children: _jsxs(Text, { color: colors.textSecondary, italic: true, children: ["thinking: ", thinkingContent.slice(-200)] }) })), _jsx(Box, { borderStyle: borders.card, borderLeft: true, borderRight: false, borderTop: false, borderBottom: false, borderLeftColor: colors.roleAssistant, paddingLeft: 1, children: _jsxs(Box, { flexDirection: "column", children: [_jsxs(Box, { children: [_jsxs(Text, { bold: true, color: colors.roleAssistant, children: [symbols.prompt, " ", label, ' '] }), _jsx(Box, { flexDirection: "column", flexShrink: 1, children: _jsx(Text, { wrap: "wrap", children: content ? renderMarkdown(content) : '' }) }), isStreaming && (_jsxs(Text, { color: colors.accent, children: [' ', _jsx(Spinner, { type: "dots" })] }))] }), isStreaming && (showTurn || showTokens) && (_jsxs(Text, { color: colors.textMuted, children: ['  ', symbols.bullet, " ", showTurn ? `turn ${turnCount}` : '', showTurn && showTokens ? ` ${symbols.bullet} ` : '', showTokens
                                    ? `${formatTokens(sessionInputTokens || 0)} in / ${formatTokens(sessionOutputTokens || 0)} out`
                                    : ''] }))] }) })] }));
}
//# sourceMappingURL=StreamingMessage.js.map