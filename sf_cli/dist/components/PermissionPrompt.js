import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { formatToolCallSummary } from '../core/permissions.js';
import { colors, symbols, borders } from '../utils/theme.js';
export function PermissionPrompt({ toolCall, reason, onRespond }) {
    const [selected, setSelected] = useState(0);
    const options = [
        { key: 'y', label: 'Allow', value: 'allow' },
        { key: 'n', label: 'Deny', value: 'deny' },
        { key: 'a', label: 'Always allow this', value: 'always-allow' },
        { key: 't', label: `Always allow ${toolCall.name}`, value: 'always-allow-tool' },
    ];
    useInput((_input, key) => {
        if (key.upArrow) {
            setSelected((s) => Math.max(0, s - 1));
        }
        else if (key.downArrow) {
            setSelected((s) => Math.min(options.length - 1, s + 1));
        }
        else if (key.return) {
            onRespond(options[selected].value);
        }
        else {
            const shortcut = options.find((o) => o.key === _input.toLowerCase());
            if (shortcut) {
                onRespond(shortcut.value);
            }
        }
    });
    return (_jsxs(Box, { flexDirection: "column", borderStyle: borders.double, borderColor: colors.borderWarning, paddingX: 1, marginBottom: 1, children: [_jsxs(Text, { bold: true, color: colors.warning, children: [symbols.warn, " Tool requires approval"] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: colors.textPrimary, children: formatToolCallSummary(toolCall) }) }), _jsx(Box, { marginTop: 0, children: _jsx(Text, { color: colors.textSecondary, children: reason }) }), _jsx(Box, { paddingX: 0, marginTop: 1, marginBottom: 0, children: _jsx(Text, { color: colors.borderDim, children: symbols.lineLight.repeat(40) }) }), _jsx(Box, { flexDirection: "column", children: options.map((opt, i) => (_jsx(Box, { children: _jsxs(Text, { color: i === selected ? colors.accent : colors.textMuted, bold: i === selected, children: [i === selected ? symbols.chevron : symbols.promptDim, ' ', _jsxs(Text, { color: colors.accent, bold: true, children: ["[", opt.key, "]"] }), " ", opt.label] }) }, opt.key))) })] }));
}
//# sourceMappingURL=PermissionPrompt.js.map