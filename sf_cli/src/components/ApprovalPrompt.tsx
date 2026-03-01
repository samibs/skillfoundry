import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors, symbols, borders } from '../utils/theme.js';

export type ApprovalResponse = 'approve' | 'reject' | 'edit';

interface ApprovalPromptProps {
  title: string;
  description?: string;
  fileCount?: number;
  onRespond: (response: ApprovalResponse) => void;
}

export function ApprovalPrompt({ title, description, fileCount, onRespond }: ApprovalPromptProps) {
  const [selected, setSelected] = useState(0);

  const options: Array<{ key: string; label: string; value: ApprovalResponse }> = [
    { key: 'y', label: 'Approve & apply', value: 'approve' },
    { key: 'n', label: 'Reject', value: 'reject' },
    { key: 'e', label: 'Edit plan', value: 'edit' },
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
      borderColor={colors.borderSuccess}
      paddingX={1}
      marginY={1}
    >
      <Text bold color={colors.success}>
        {symbols.diamond} {title}
      </Text>
      {description && (
        <Box marginTop={1}>
          <Text color={colors.textPrimary} wrap="wrap">{description}</Text>
        </Box>
      )}
      {fileCount !== undefined && (
        <Box marginTop={0}>
          <Text color={colors.textSecondary}>
            {symbols.bullet} {fileCount} file(s) will be modified
          </Text>
        </Box>
      )}
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
