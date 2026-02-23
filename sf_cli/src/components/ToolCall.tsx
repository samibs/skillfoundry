import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ToolCall as ToolCallType, ToolResult } from '../types.js';

interface ToolCallProps {
  toolCall: ToolCallType;
  result?: ToolResult;
  isExecuting: boolean;
}

const TOOL_ICONS: Record<string, string> = {
  bash: '$',
  read: 'R',
  write: 'W',
  glob: 'G',
  grep: '?',
};

function formatInput(toolCall: ToolCallType): string {
  switch (toolCall.name) {
    case 'bash':
      return String(toolCall.input.command || '');
    case 'read':
      return String(toolCall.input.file_path || '');
    case 'write':
      return String(toolCall.input.file_path || '');
    case 'glob':
      return String(toolCall.input.pattern || '');
    case 'grep': {
      const pattern = String(toolCall.input.pattern || '');
      const path = toolCall.input.path ? ` in ${toolCall.input.path}` : '';
      return `/${pattern}/${path}`;
    }
    default:
      return JSON.stringify(toolCall.input).slice(0, 100);
  }
}

export function ToolCallDisplay({ toolCall, result, isExecuting }: ToolCallProps) {
  const icon = TOOL_ICONS[toolCall.name] || '>';

  return (
    <Box flexDirection="column" marginLeft={4} marginBottom={1}>
      <Box>
        <Text color="magenta" bold>
          [{icon}] {toolCall.name}{' '}
        </Text>
        {isExecuting && (
          <Text color="blue">
            <Spinner type="dots" />
          </Text>
        )}
        {result && !result.isError && <Text color="green">done</Text>}
        {result?.isError && <Text color="red">error</Text>}
      </Box>
      <Box marginLeft={4}>
        <Text dimColor wrap="wrap">
          {formatInput(toolCall)}
        </Text>
      </Box>
      {result && (
        <Box marginLeft={4} marginTop={0}>
          <Text
            color={result.isError ? 'red' : 'gray'}
            wrap="wrap"
          >
            {result.output.slice(0, 200)}
            {result.output.length > 200 ? '...' : ''}
          </Text>
        </Box>
      )}
    </Box>
  );
}
