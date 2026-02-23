import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  provider: string;
  permissionMode: string;
  isStreaming: boolean;
  activeAgent?: string | null;
  activeTeam?: { name: string } | null;
  streamingAgent?: string | null;
  streamingTurnCount?: number;
}

export function StatusBar({
  provider,
  permissionMode,
  isStreaming,
  activeAgent,
  activeTeam,
  streamingAgent,
  streamingTurnCount = 0,
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

  let streamingStatus = 'ready';
  if (isStreaming) {
    if (streamingAgent) {
      const turnLabel = streamingTurnCount > 1 ? ` (turn ${streamingTurnCount})` : '';
      streamingStatus = `${streamingAgent} working${turnLabel}`;
    } else {
      streamingStatus = 'streaming...';
    }
  }

  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Text dimColor>
        /help commands | /status info | /exit quit{dismissHint}
      </Text>
      <Text dimColor>
        {modeLabel}mode:{permissionMode} | {streamingStatus}
      </Text>
    </Box>
  );
}
