import React from 'react';
import { Box, Text } from 'ink';
import { colors, symbols, borders, formatTokens } from '../utils/theme.js';

interface HeaderProps {
  provider: string;
  model: string;
  costSession: number;
  budgetMonthly: number;
  messageCount: number;
  state: string;
  activeAgent?: string | null;
  activeTeam?: { name: string; members: string[] } | null;
  sessionInputTokens?: number;
  sessionOutputTokens?: number;
}

export function Header({
  provider,
  model,
  costSession,
  budgetMonthly,
  messageCount,
  state,
  activeAgent,
  activeTeam,
  sessionInputTokens = 0,
  sessionOutputTokens = 0,
}: HeaderProps) {
  const totalTokens = sessionInputTokens + sessionOutputTokens;
  const stateColor =
    state === 'IDLE' ? colors.success : state === 'FAILED' ? colors.error : colors.accent;

  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      borderStyle={borders.header}
      borderTopColor={colors.accent}
      borderBottomColor={colors.borderDim}
      borderLeftColor={colors.borderDim}
      borderRightColor={colors.borderDim}
      paddingX={1}
    >
      <Text bold color={colors.accent}>
        {symbols.diamond} SkillFoundry CLI
      </Text>
      <Text>
        <Text color={colors.secondary}>{provider}:{model}</Text>
        {activeTeam && (
          <>
            <Text color={colors.textMuted}> {symbols.bullet} </Text>
            <Text color={colors.accent}>team:{activeTeam.name}</Text>
            <Text color={colors.textMuted}> ({activeTeam.members.length})</Text>
          </>
        )}
        {!activeTeam && activeAgent && (
          <>
            <Text color={colors.textMuted}> {symbols.bullet} </Text>
            <Text color={colors.accent}>agent:{activeAgent}</Text>
          </>
        )}
        <Text color={colors.textMuted}> {symbols.bullet} </Text>
        <Text color={colors.warning}>${costSession.toFixed(4)}</Text>
        <Text color={colors.textMuted}>/{budgetMonthly}</Text>
        {totalTokens > 0 && (
          <>
            <Text color={colors.textMuted}> {symbols.bullet} </Text>
            <Text color={colors.textSecondary}>{formatTokens(totalTokens)} tok</Text>
          </>
        )}
        <Text color={colors.textMuted}> {symbols.bullet} </Text>
        <Text color={colors.textSecondary}>msgs:{messageCount}</Text>
        <Text color={colors.textMuted}> {symbols.bullet} </Text>
        <Text color={stateColor}>{state}</Text>
      </Text>
    </Box>
  );
}
