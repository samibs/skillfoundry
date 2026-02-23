import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { renderMarkdown } from '../utils/markdown.js';
import { colors, symbols, borders, formatTokens } from '../utils/theme.js';

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
        <Box
          marginBottom={1}
          borderStyle={borders.card}
          borderLeft={true}
          borderRight={false}
          borderTop={false}
          borderBottom={false}
          borderLeftColor={colors.textMuted}
          paddingLeft={1}
        >
          <Text color={colors.textSecondary} italic>
            thinking: {thinkingContent.slice(-200)}
          </Text>
        </Box>
      )}
      <Box
        borderStyle={borders.card}
        borderLeft={true}
        borderRight={false}
        borderTop={false}
        borderBottom={false}
        borderLeftColor={colors.roleAssistant}
        paddingLeft={1}
      >
        <Box flexDirection="column">
          <Box>
            <Text bold color={colors.roleAssistant}>
              {symbols.prompt} {label}{' '}
            </Text>
            <Box flexDirection="column" flexShrink={1}>
              <Text wrap="wrap">
                {content ? renderMarkdown(content) : ''}
              </Text>
            </Box>
            {isStreaming && (
              <Text color={colors.accent}>
                {' '}
                <Spinner type="dots" />
              </Text>
            )}
          </Box>
          {isStreaming && (showTurn || showTokens) && (
            <Text color={colors.textMuted}>
              {'  '}{symbols.bullet} {showTurn ? `turn ${turnCount}` : ''}
              {showTurn && showTokens ? ` ${symbols.bullet} ` : ''}
              {showTokens
                ? `${formatTokens(sessionInputTokens || 0)} in / ${formatTokens(sessionOutputTokens || 0)} out`
                : ''}
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
