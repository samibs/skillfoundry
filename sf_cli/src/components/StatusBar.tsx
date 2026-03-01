import React from 'react';
import { Box, Text } from 'ink';
import { colors, symbols } from '../utils/theme.js';

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
  if (activeTeam) {
    dismissHint = ` ${symbols.bullet} /team off`;
  } else if (activeAgent) {
    dismissHint = ` ${symbols.bullet} /agent off`;
  }

  let streamingStatus: React.ReactNode;
  if (isStreaming) {
    if (streamingAgent) {
      const turnLabel = streamingTurnCount > 1 ? ` (turn ${streamingTurnCount})` : '';
      streamingStatus = (
        <Text color={colors.accent}>
          {symbols.running} {streamingAgent} working{turnLabel}
        </Text>
      );
    } else {
      streamingStatus = <Text color={colors.accent}>{symbols.running} streaming</Text>;
    }
  } else {
    streamingStatus = <Text color={colors.textSecondary}>ready</Text>;
  }

  let modeLabel: React.ReactNode = null;
  if (activeTeam) {
    modeLabel = (
      <>
        <Text color={colors.secondary}>team:{activeTeam.name}</Text>
        <Text color={colors.textMuted}> {symbols.bullet} </Text>
      </>
    );
  } else if (activeAgent) {
    modeLabel = (
      <>
        <Text color={colors.secondary}>agent:{activeAgent}</Text>
        <Text color={colors.textMuted}> {symbols.bullet} </Text>
      </>
    );
  }

  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        <Text color={colors.borderDim}>
          {symbols.lineLight.repeat(
            Math.max(40, (process.stdout.columns || 80) - 2),
          )}
        </Text>
      </Box>
      <Box justifyContent="space-between" paddingX={1}>
        <Text color={colors.textMuted}>
          <Text color={colors.accent}>/help</Text> commands
          <Text color={colors.textMuted}> {symbols.bullet} </Text>
          <Text color={colors.accent}>/status</Text> info
          <Text color={colors.textMuted}> {symbols.bullet} </Text>
          <Text color={colors.accent}>/exit</Text> quit
          {dismissHint}
        </Text>
        <Text>
          {modeLabel}
          <Text color={colors.textSecondary}>mode:{permissionMode}</Text>
          <Text color={colors.textMuted}> {symbols.bullet} </Text>
          {streamingStatus}
        </Text>
      </Box>
    </Box>
  );
}
