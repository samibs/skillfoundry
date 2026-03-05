import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { colors, symbols } from '../utils/theme.js';
export function StatusBar({ provider, permissionMode, isStreaming, activeAgent, activeTeam, streamingAgent, streamingTurnCount = 0, }) {
    let dismissHint = '';
    if (activeTeam) {
        dismissHint = ` ${symbols.bullet} /team off`;
    }
    else if (activeAgent) {
        dismissHint = ` ${symbols.bullet} /agent off`;
    }
    let streamingStatus;
    if (isStreaming) {
        if (streamingAgent) {
            const turnLabel = streamingTurnCount > 1 ? ` (turn ${streamingTurnCount})` : '';
            streamingStatus = (_jsxs(Text, { color: colors.accent, children: [symbols.running, " ", streamingAgent, " working", turnLabel] }));
        }
        else {
            streamingStatus = _jsxs(Text, { color: colors.accent, children: [symbols.running, " streaming"] });
        }
    }
    else {
        streamingStatus = _jsx(Text, { color: colors.textSecondary, children: "ready" });
    }
    let modeLabel = null;
    if (activeTeam) {
        modeLabel = (_jsxs(_Fragment, { children: [_jsxs(Text, { color: colors.secondary, children: ["team:", activeTeam.name] }), _jsxs(Text, { color: colors.textMuted, children: [" ", symbols.bullet, " "] })] }));
    }
    else if (activeAgent) {
        modeLabel = (_jsxs(_Fragment, { children: [_jsxs(Text, { color: colors.secondary, children: ["agent:", activeAgent] }), _jsxs(Text, { color: colors.textMuted, children: [" ", symbols.bullet, " "] })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Box, { paddingX: 1, children: _jsx(Text, { color: colors.borderDim, children: symbols.lineLight.repeat(Math.max(40, (process.stdout.columns || 80) - 2)) }) }), _jsxs(Box, { justifyContent: "space-between", paddingX: 1, children: [_jsxs(Text, { color: colors.textMuted, children: [_jsx(Text, { color: colors.accent, children: "/help" }), " commands", _jsxs(Text, { color: colors.textMuted, children: [" ", symbols.bullet, " "] }), _jsx(Text, { color: colors.accent, children: "/status" }), " info", _jsxs(Text, { color: colors.textMuted, children: [" ", symbols.bullet, " "] }), _jsx(Text, { color: colors.accent, children: "/exit" }), " quit", dismissHint] }), _jsxs(Text, { children: [modeLabel, _jsxs(Text, { color: colors.textSecondary, children: ["mode:", permissionMode] }), _jsxs(Text, { color: colors.textMuted, children: [" ", symbols.bullet, " "] }), streamingStatus] })] })] }));
}
//# sourceMappingURL=StatusBar.js.map