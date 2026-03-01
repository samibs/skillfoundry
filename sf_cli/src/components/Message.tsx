import React from 'react';
import { Box, Text } from 'ink';
import type { Message as MessageType } from '../types.js';
import { renderMarkdown } from '../utils/markdown.js';
import { colors, symbols, borders } from '../utils/theme.js';

interface MessageProps {
  message: MessageType;
}

const ROLE_COLORS: Record<string, string> = {
  user: colors.roleUser,
  assistant: colors.roleAssistant,
  system: colors.roleSystem,
  tool: colors.roleTool,
};

const ROLE_LABELS: Record<string, string> = {
  user: 'you',
  assistant: 'sf',
  system: 'sys',
  tool: 'tool',
};

export function Message({ message }: MessageProps) {
  const color = ROLE_COLORS[message.role] || colors.textPrimary;
  const label = message.role === 'assistant' && message.metadata?.routedAgent
    ? `sf:${message.metadata.routedAgent}`
    : (ROLE_LABELS[message.role] || message.role);

  const content =
    message.role === 'assistant'
      ? renderMarkdown(message.content)
      : message.content;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box
        borderStyle={borders.card}
        borderLeft={true}
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        borderLeftColor={color}
        paddingLeft={1}
      >
        <Box flexDirection="column">
          <Box>
            <Text bold color={color}>
              {symbols.prompt} {label}{' '}
            </Text>
            <Box flexDirection="column" flexShrink={1}>
              <Text wrap="wrap">{content}</Text>
            </Box>
          </Box>
          {message.metadata?.costUsd !== undefined && (
            <Text color={colors.textMuted}>
              {'  '}{symbols.bullet} {message.metadata.inputTokens} in / {message.metadata.outputTokens} out
              {' '}{symbols.bullet}{' '}
              <Text color={colors.warning}>${message.metadata.costUsd.toFixed(4)}</Text>
              {message.metadata.mode ? <Text color={colors.textMuted}> {symbols.bullet} {message.metadata.mode}</Text> : ''}
              {message.metadata.routedAgent ? (
                <Text color={colors.secondary}> {symbols.bullet} {symbols.arrow}{message.metadata.routedAgent}:{message.metadata.routingConfidence}</Text>
              ) : ''}
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
