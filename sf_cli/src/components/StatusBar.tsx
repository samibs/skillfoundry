import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  provider: string;
  permissionMode: string;
  isStreaming: boolean;
}

export function StatusBar({
  provider,
  permissionMode,
  isStreaming,
}: StatusBarProps) {
  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Text dimColor>/help commands | /status info | Ctrl+C exit</Text>
      <Text dimColor>
        mode:{permissionMode} | {isStreaming ? 'streaming...' : 'ready'}
      </Text>
    </Box>
  );
}
