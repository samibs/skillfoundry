import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
  provider: string;
  model: string;
  costSession: number;
  budgetMonthly: number;
  messageCount: number;
  state: string;
}

export function Header({
  provider,
  model,
  costSession,
  budgetMonthly,
  messageCount,
  state,
}: HeaderProps) {
  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      borderStyle="round"
      borderColor="blue"
      paddingX={1}
    >
      <Text bold color="blue">
        SkillFoundry CLI
      </Text>
      <Text dimColor>
        {provider}:{model} | ${costSession.toFixed(4)}/${budgetMonthly} |
        msgs:{messageCount} | {state}
      </Text>
    </Box>
  );
}
