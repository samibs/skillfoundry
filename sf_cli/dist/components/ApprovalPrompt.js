import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors, symbols, borders } from '../utils/theme.js';
export function ApprovalPrompt({ title, description, fileCount, onRespond }) {
    const [selected, setSelected] = useState(0);
    const options = [
        { key: 'y', label: 'Approve & apply', value: 'approve' },
        { key: 'n', label: 'Reject', value: 'reject' },
        { key: 'e', label: 'Edit plan', value: 'edit' },
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
    return (_jsxs(Box, { flexDirection: "column", borderStyle: borders.double, borderColor: colors.borderSuccess, paddingX: 1, marginY: 1, children: [_jsxs(Text, { bold: true, color: colors.success, children: [symbols.diamond, " ", title] }), description && (_jsx(Box, { marginTop: 1, children: _jsx(Text, { color: colors.textPrimary, wrap: "wrap", children: description }) })), fileCount !== undefined && (_jsx(Box, { marginTop: 0, children: _jsxs(Text, { color: colors.textSecondary, children: [symbols.bullet, " ", fileCount, " file(s) will be modified"] }) })), _jsx(Box, { paddingX: 0, marginTop: 1, marginBottom: 0, children: _jsx(Text, { color: colors.borderDim, children: symbols.lineLight.repeat(40) }) }), _jsx(Box, { flexDirection: "column", children: options.map((opt, i) => (_jsx(Box, { children: _jsxs(Text, { color: i === selected ? colors.accent : colors.textMuted, bold: i === selected, children: [i === selected ? symbols.chevron : symbols.promptDim, ' ', _jsxs(Text, { color: colors.accent, bold: true, children: ["[", opt.key, "]"] }), " ", opt.label] }) }, opt.key))) })] }));
}
//# sourceMappingURL=ApprovalPrompt.js.map