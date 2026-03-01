import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ToolCall as ToolCallType, ToolResult } from '../types.js';
import { colors, symbols, borders } from '../utils/theme.js';

interface ToolCallProps {
  toolCall: ToolCallType;
  result?: ToolResult;
  isExecuting: boolean;
}

const TOOL_ICONS: Record<string, string> = {
  bash: symbols.bash,
  read: symbols.read,
  write: symbols.write,
  glob: symbols.glob,
  grep: symbols.grep,
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
  const icon = TOOL_ICONS[toolCall.name] || symbols.tool;

  return (
    <Box flexDirection="column" marginLeft={4} marginBottom={1}>
      <Box>
        <Text color={colors.roleTool} bold>
          [{icon}] {toolCall.name}{' '}
        </Text>
        {isExecuting && (
          <Text color={colors.accent}>
            <Spinner type="dots" />
          </Text>
        )}
        {result && !result.isError && (
          <Text color={colors.success}>{symbols.pass} done</Text>
        )}
        {result?.isError && (
          <Text color={colors.error}>{symbols.fail} error</Text>
        )}
      </Box>
      <Box marginLeft={4}>
        <Text color={colors.textSecondary} wrap="wrap">
          {formatInput(toolCall)}
        </Text>
      </Box>
      {result && (
        <Box
          marginLeft={4}
          marginTop={0}
          borderStyle={borders.card}
          borderLeft={true}
          borderRight={false}
          borderTop={false}
          borderBottom={false}
          borderLeftColor={result.isError ? colors.error : colors.borderDim}
          paddingLeft={1}
        >
          <Text
            color={result.isError ? colors.error : colors.textMuted}
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
