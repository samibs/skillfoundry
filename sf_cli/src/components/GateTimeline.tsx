import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { GateResult, GateStatus, GateRunSummary } from '../core/gates.js';

interface GateTimelineProps {
  gates: Array<GateResult & { isRunning?: boolean }>;
  summary?: GateRunSummary;
}

const STATUS_ICON: Record<GateStatus | 'running', string> = {
  pass: 'v',
  fail: 'x',
  warn: '!',
  skip: '-',
  running: '~',
};

const STATUS_COLOR: Record<GateStatus | 'running', string> = {
  pass: 'green',
  fail: 'red',
  warn: 'yellow',
  skip: 'gray',
  running: 'blue',
};

function GateRow({ gate, isRunning }: { gate: GateResult; isRunning?: boolean }) {
  const status = isRunning ? 'running' : gate.status;
  const icon = STATUS_ICON[status];
  const color = STATUS_COLOR[status];

  return (
    <Box>
      <Box width={6}>
        <Text bold color={color}>
          {gate.tier}
        </Text>
      </Box>
      <Box width={3}>
        {isRunning ? (
          <Text color="blue">
            <Spinner type="dots" />
          </Text>
        ) : (
          <Text color={color}>[{icon}]</Text>
        )}
      </Box>
      <Box width={28}>
        <Text color={isRunning ? 'blue' : undefined}>
          {gate.name}
        </Text>
      </Box>
      <Box width={10}>
        <Text dimColor>
          {gate.durationMs > 0 ? `${(gate.durationMs / 1000).toFixed(1)}s` : ''}
        </Text>
      </Box>
      {gate.status === 'fail' && gate.detail && (
        <Box flexShrink={1}>
          <Text color="red" wrap="truncate">
            {gate.detail.split('\n')[0].slice(0, 60)}
          </Text>
        </Box>
      )}
    </Box>
  );
}

export function GateTimeline({ gates, summary }: GateTimelineProps) {
  return (
    <Box flexDirection="column" marginY={1}>
      <Box marginBottom={1}>
        <Text bold>The Anvil — Quality Gates</Text>
      </Box>
      <Box flexDirection="column">
        {gates.map((gate, i) => (
          <GateRow key={gate.tier + i} gate={gate} isRunning={gate.isRunning} />
        ))}
      </Box>
      {summary && (
        <Box marginTop={1} flexDirection="column">
          <Text>
            {'  '}
            <Text bold color={summary.verdict === 'PASS' ? 'green' : summary.verdict === 'WARN' ? 'yellow' : 'red'}>
              VERDICT: {summary.verdict}
            </Text>
            {'  '}
            <Text dimColor>
              {summary.passed}P {summary.failed}F {summary.warned}W {summary.skipped}S
              {' '}({(summary.totalMs / 1000).toFixed(1)}s)
            </Text>
          </Text>
        </Box>
      )}
    </Box>
  );
}
