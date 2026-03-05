import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { colors, symbols, borders } from '../utils/theme.js';
const STATUS_ICON = {
    pass: symbols.gatePass,
    fail: symbols.gateFail,
    warn: symbols.gateWarn,
    skip: symbols.skip,
    running: symbols.running,
};
const STATUS_COLOR = {
    pass: colors.success,
    fail: colors.error,
    warn: colors.warning,
    skip: colors.textMuted,
    running: colors.accent,
};
function GateRow({ gate, isRunning, isLast, }) {
    const status = isRunning ? 'running' : gate.status;
    const icon = STATUS_ICON[status];
    const color = STATUS_COLOR[status];
    const branch = isLast ? symbols.gateLast : symbols.gateArrow;
    return (_jsxs(Box, { children: [_jsxs(Text, { color: colors.borderDim, children: ['  ', branch, symbols.lineHeavy, ' '] }), _jsx(Box, { width: 4, children: _jsx(Text, { bold: true, color: color, children: gate.tier }) }), _jsx(Box, { width: 3, children: isRunning ? (_jsx(Text, { color: colors.accent, children: _jsx(Spinner, { type: "dots" }) })) : (_jsx(Text, { color: color, children: icon })) }), _jsx(Box, { width: 28, children: _jsx(Text, { color: isRunning ? colors.accent : colors.textPrimary, children: gate.name }) }), _jsx(Box, { width: 8, children: _jsx(Text, { color: colors.textMuted, children: gate.durationMs > 0 ? `${(gate.durationMs / 1000).toFixed(1)}s` : '' }) }), gate.status === 'fail' && gate.detail && (_jsx(Box, { flexShrink: 1, children: _jsx(Text, { color: colors.error, wrap: "truncate", children: gate.detail.split('\n')[0].slice(0, 60) }) }))] }));
}
export function GateTimeline({ gates, summary }) {
    const verdictColor = summary?.verdict === 'PASS'
        ? colors.success
        : summary?.verdict === 'WARN'
            ? colors.warning
            : colors.error;
    const verdictIcon = summary?.verdict === 'PASS'
        ? symbols.pass
        : summary?.verdict === 'WARN'
            ? symbols.warn
            : symbols.fail;
    return (_jsxs(Box, { flexDirection: "column", marginY: 1, children: [_jsx(Box, { marginBottom: 1, children: _jsxs(Text, { bold: true, color: colors.accent, children: [symbols.diamond, " The Anvil"] }) }), _jsx(Box, { flexDirection: "column", children: gates.map((gate, i) => (_jsx(GateRow, { gate: gate, isRunning: gate.isRunning, isLast: i === gates.length - 1 }, gate.tier + i))) }), summary && (_jsx(Box, { marginTop: 1, borderStyle: borders.card, borderColor: verdictColor, paddingX: 1, children: _jsxs(Text, { children: [_jsxs(Text, { bold: true, color: verdictColor, children: [verdictIcon, " VERDICT: ", summary.verdict] }), '  ', _jsxs(Text, { color: colors.textSecondary, children: [summary.passed, "P ", summary.failed, "F ", summary.warned, "W ", summary.skipped, "S", ' ', "(", (summary.totalMs / 1000).toFixed(1), "s)"] })] }) }))] }));
}
//# sourceMappingURL=GateTimeline.js.map