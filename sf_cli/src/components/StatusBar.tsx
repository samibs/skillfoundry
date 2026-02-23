import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  provider: string;
  permissionMode: string;
  isStreaming: boolean;
  activeAgent?: string | null;
}

export function StatusBar({
  provider,
  permissionMode,
  isStreaming,
  activeAgent,
}: StatusBarProps) {
  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Text dimColor>
        /help commands | /status info | /exit quit
        {activeAgent ? ` | /agent off` : ''}
      </Text>
      <Text dimColor>
        {activeAgent ? `agent:${activeAgent} | ` : ''}mode:{permissionMode} | {isStreaming ? 'streaming...' : 'ready'}
      </Text>
    </Box>
  );
}
