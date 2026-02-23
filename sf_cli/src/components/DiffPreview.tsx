import React from 'react';
import { Box, Text } from 'ink';

export interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'header';
  content: string;
  lineNumber?: number;
}

interface DiffPreviewProps {
  fileName: string;
  lines: DiffLine[];
  maxLines?: number;
}

export function parseDiff(rawDiff: string): Array<{ fileName: string; lines: DiffLine[] }> {
  const files: Array<{ fileName: string; lines: DiffLine[] }> = [];
  const diffLines = rawDiff.split('\n');
  let currentFile = '';
  let currentLines: DiffLine[] = [];

  for (const line of diffLines) {
    if (line.startsWith('diff --git')) {
      if (currentFile && currentLines.length > 0) {
        files.push({ fileName: currentFile, lines: currentLines });
      }
      const match = line.match(/b\/(.+)$/);
      currentFile = match ? match[1] : 'unknown';
      currentLines = [];
    } else if (line.startsWith('@@')) {
      currentLines.push({ type: 'header', content: line });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      currentLines.push({ type: 'add', content: line.slice(1) });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentLines.push({ type: 'remove', content: line.slice(1) });
    } else if (line.startsWith(' ')) {
      currentLines.push({ type: 'context', content: line.slice(1) });
    }
  }

  if (currentFile && currentLines.length > 0) {
    files.push({ fileName: currentFile, lines: currentLines });
  }

  return files;
}

export function DiffPreview({ fileName, lines, maxLines = 50 }: DiffPreviewProps) {
  const displayLines = lines.slice(0, maxLines);
  const truncated = lines.length > maxLines;
  const additions = lines.filter((l) => l.type === 'add').length;
  const deletions = lines.filter((l) => l.type === 'remove').length;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold> {fileName} </Text>
        <Text color="green">+{additions}</Text>
        <Text> </Text>
        <Text color="red">-{deletions}</Text>
      </Box>
      <Box flexDirection="column" marginLeft={2}>
        {displayLines.map((line, i) => {
          switch (line.type) {
            case 'add':
              return (
                <Text key={i} color="green" wrap="truncate">
                  + {line.content}
                </Text>
              );
            case 'remove':
              return (
                <Text key={i} color="red" wrap="truncate">
                  - {line.content}
                </Text>
              );
            case 'header':
              return (
                <Text key={i} color="cyan" dimColor wrap="truncate">
                  {line.content}
                </Text>
              );
            case 'context':
              return (
                <Text key={i} dimColor wrap="truncate">
                  {'  '}{line.content}
                </Text>
              );
          }
        })}
        {truncated && (
          <Text dimColor italic>
            ... {lines.length - maxLines} more lines
          </Text>
        )}
      </Box>
    </Box>
  );
}
