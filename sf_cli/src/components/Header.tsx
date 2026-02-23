import React from 'react';
import { Box, Text } from 'ink';

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

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
  let agentInfo = '';
  if (activeTeam) {
    agentInfo = ` | team:${activeTeam.name} (${activeTeam.members.length} agents)`;
  } else if (activeAgent) {
    agentInfo = ` | agent:${activeAgent}`;
  }

  const totalTokens = sessionInputTokens + sessionOutputTokens;
  const tokenInfo = totalTokens > 0 ? ` | ${formatTokens(totalTokens)} tok` : '';

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
        {provider}:{model}{agentInfo} | ${costSession.toFixed(4)}/{budgetMonthly}{tokenInfo} |
        msgs:{messageCount} | {state}
      </Text>
    </Box>
  );
}
