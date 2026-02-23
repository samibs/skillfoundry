import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { renderMarkdown } from '../utils/markdown.js';

interface StreamingMessageProps {
  content: string;
  isStreaming: boolean;
  thinkingContent?: string;
  showThinking?: boolean;
}

export function StreamingMessage({
  content,
  isStreaming,
  thinkingContent,
  showThinking,
}: StreamingMessageProps) {
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
          sf&gt;{' '}
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
    </Box>
  );
}
