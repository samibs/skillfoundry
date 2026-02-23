import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { renderMarkdown } from '../utils/markdown.js';

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

interface StreamingMessageProps {
  content: string;
  isStreaming: boolean;
  thinkingContent?: string;
  showThinking?: boolean;
  agentName?: string | null;
  turnCount?: number;
  sessionInputTokens?: number;
  sessionOutputTokens?: number;
}

export function StreamingMessage({
  content,
  isStreaming,
  thinkingContent,
  showThinking,
  agentName,
  turnCount,
  sessionInputTokens,
  sessionOutputTokens,
}: StreamingMessageProps) {
  const label = agentName ? `sf:${agentName}` : 'sf';
  const showTokens = (sessionInputTokens || 0) > 0 || (sessionOutputTokens || 0) > 0;
  const showTurn = (turnCount || 0) > 0;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {showThinking && thinkingContent && (
        <Box marginBottom={1}>
          <Text dimColor italic>
            thinking: {thinkingContent.slice(-200)}
          </Text>
        </Box>
      )}
      <Box>
        <Text bold color="green">
          {label}&gt;{' '}
        </Text>
        <Box flexDirection="column" flexShrink={1}>
          <Text wrap="wrap">
            {content ? renderMarkdown(content) : ''}
          </Text>
        </Box>
        {isStreaming && (
          <Text color="blue">
            {' '}
            <Spinner type="dots" />
          </Text>
        )}
      </Box>
      {isStreaming && (showTurn || showTokens) && (
        <Text dimColor>
          {'     '}[
          {showTurn ? `turn ${turnCount}` : ''}
          {showTurn && showTokens ? ' | ' : ''}
          {showTokens
            ? `${formatTokens(sessionInputTokens || 0)} in / ${formatTokens(sessionOutputTokens || 0)} out`
            : ''}
          ]
        </Text>
      )}
    </Box>
  );
}
