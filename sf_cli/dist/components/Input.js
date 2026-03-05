import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { colors, symbols, borders } from '../utils/theme.js';
export function Input({ onSubmit, isDisabled }) {
    const [value, setValue] = useState('');
    const handleSubmit = useCallback((val) => {
        if (isDisabled || !val.trim())
            return;
        onSubmit(val.trim());
        setValue('');
    }, [onSubmit, isDisabled]);
    return (_jsxs(Box, { borderStyle: borders.input, borderColor: isDisabled ? colors.textMuted : colors.borderDim, borderLeftColor: isDisabled ? colors.textMuted : colors.accent, paddingX: 1, children: [_jsxs(Text, { bold: true, color: isDisabled ? colors.textMuted : colors.accent, children: [symbols.chevron, ' '] }), _jsx(TextInput, { value: value, onChange: setValue, onSubmit: handleSubmit, placeholder: isDisabled ? 'waiting for response...' : 'Type a message or /command' })] }));
}
//# sourceMappingURL=Input.js.map