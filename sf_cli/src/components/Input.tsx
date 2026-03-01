import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { colors, symbols, borders } from '../utils/theme.js';

interface InputProps {
  onSubmit: (value: string) => void;
  isDisabled: boolean;
}

export function Input({ onSubmit, isDisabled }: InputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(
    (val: string) => {
      if (isDisabled || !val.trim()) return;
      onSubmit(val.trim());
      setValue('');
    },
    [onSubmit, isDisabled],
  );

  return (
    <Box
      borderStyle={borders.input}
      borderColor={isDisabled ? colors.textMuted : colors.borderDim}
      borderLeftColor={isDisabled ? colors.textMuted : colors.accent}
      paddingX={1}
    >
      <Text bold color={isDisabled ? colors.textMuted : colors.accent}>
        {symbols.chevron}{' '}
      </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={
          isDisabled ? 'waiting for response...' : 'Type a message or /command'
        }
      />
    </Box>
  );
}
