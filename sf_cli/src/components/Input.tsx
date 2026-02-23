import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

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
      borderStyle="round"
      borderColor={isDisabled ? 'gray' : 'cyan'}
      paddingX={1}
    >
      <Text bold color="cyan">
        you&gt;{' '}
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
