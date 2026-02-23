import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  provider: string;
  permissionMode: string;
  isStreaming: boolean;
  activeAgent?: string | null;
  activeTeam?: { name: string } | null;
}

export function StatusBar({
  provider,
  permissionMode,
  isStreaming,
  activeAgent,
  activeTeam,
}: StatusBarProps) {
  let dismissHint = '';
  let modeLabel = '';
  if (activeTeam) {
    dismissHint = ' | /team off';
    modeLabel = `team:${activeTeam.name} | `;
  } else if (activeAgent) {
    dismissHint = ' | /agent off';
    modeLabel = `agent:${activeAgent} | `;
  }

  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Text dimColor>
        /help commands | /status info | /exit quit{dismissHint}
      </Text>
      <Text dimColor>
        {modeLabel}mode:{permissionMode} | {isStreaming ? 'streaming...' : 'ready'}
      </Text>
    </Box>
  );
}
