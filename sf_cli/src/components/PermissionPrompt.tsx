import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ToolCall } from '../types.js';
import { formatToolCallSummary } from '../core/permissions.js';
import { colors, symbols, borders } from '../utils/theme.js';

export type PermissionResponse = 'allow' | 'deny' | 'always-allow' | 'always-allow-tool';

interface PermissionPromptProps {
  toolCall: ToolCall;
  reason: string;
  onRespond: (response: PermissionResponse) => void;
}

export function PermissionPrompt({ toolCall, reason, onRespond }: PermissionPromptProps) {
  const [selected, setSelected] = useState(0);

  const options: Array<{ key: string; label: string; value: PermissionResponse }> = [
    { key: 'y', label: 'Allow', value: 'allow' },
    { key: 'n', label: 'Deny', value: 'deny' },
    { key: 'a', label: 'Always allow this', value: 'always-allow' },
    { key: 't', label: `Always allow ${toolCall.name}`, value: 'always-allow-tool' },
  ];

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelected((s) => Math.max(0, s - 1));
    } else if (key.downArrow) {
      setSelected((s) => Math.min(options.length - 1, s + 1));
    } else if (key.return) {
      onRespond(options[selected].value);
    } else {
      const shortcut = options.find((o) => o.key === _input.toLowerCase());
      if (shortcut) {
        onRespond(shortcut.value);
      }
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle={borders.double}
      borderColor={colors.borderWarning}
      paddingX={1}
      marginBottom={1}
    >
      <Text bold color={colors.warning}>
        {symbols.warn} Tool requires approval
      </Text>
      <Box marginTop={1}>
        <Text color={colors.textPrimary}>{formatToolCallSummary(toolCall)}</Text>
      </Box>
      <Box marginTop={0}>
        <Text color={colors.textSecondary}>{reason}</Text>
      </Box>
      <Box paddingX={0} marginTop={1} marginBottom={0}>
        <Text color={colors.borderDim}>
          {symbols.lineLight.repeat(40)}
        </Text>
      </Box>
      <Box flexDirection="column">
        {options.map((opt, i) => (
          <Box key={opt.key}>
            <Text
              color={i === selected ? colors.accent : colors.textMuted}
              bold={i === selected}
            >
              {i === selected ? symbols.chevron : symbols.promptDim}{' '}
              <Text color={colors.accent} bold>[{opt.key}]</Text> {opt.label}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
