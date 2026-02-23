import React from 'react';
import { Box, Text } from 'ink';
import type { Message as MessageType } from '../types.js';
import { renderMarkdown } from '../utils/markdown.js';

interface MessageProps {
  message: MessageType;
}

const ROLE_COLORS: Record<string, string> = {
  user: 'cyan',
  assistant: 'green',
  system: 'yellow',
  tool: 'magenta',
};

const ROLE_LABELS: Record<string, string> = {
  user: 'you',
  assistant: 'sf',
  system: 'sys',
  tool: 'tool',
};

export function Message({ message }: MessageProps) {
  const color = ROLE_COLORS[message.role] || 'white';
  // Show routed agent name when team routing occurred
  const label = message.role === 'assistant' && message.metadata?.routedAgent
    ? `sf:${message.metadata.routedAgent}`
    : (ROLE_LABELS[message.role] || message.role);

  const content =
    message.role === 'assistant'
      ? renderMarkdown(message.content)
      : message.content;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color={color}>
          {label}&gt;{' '}
        </Text>
        <Box flexDirection="column" flexShrink={1}>
          <Text wrap="wrap">{content}</Text>
        </Box>
      </Box>
      {message.metadata?.costUsd !== undefined && (
        <Text dimColor>
          {'     '}[{message.metadata.inputTokens} in /{' '}
          {message.metadata.outputTokens} out | $
          {message.metadata.costUsd.toFixed(4)}
          {message.metadata.mode ? ` | ${message.metadata.mode}` : ''}
          {message.metadata.routedAgent ? ` | routed:${message.metadata.routingConfidence}` : ''}]
        </Text>
      )}
    </Box>
  );
}
