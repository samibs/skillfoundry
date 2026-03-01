import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { GateResult, GateStatus, GateRunSummary } from '../core/gates.js';
import { colors, symbols, borders } from '../utils/theme.js';

interface GateTimelineProps {
  gates: Array<GateResult & { isRunning?: boolean }>;
  summary?: GateRunSummary;
}

const STATUS_ICON: Record<GateStatus | 'running', string> = {
  pass: symbols.gatePass,
  fail: symbols.gateFail,
  warn: symbols.gateWarn,
  skip: symbols.skip,
  running: symbols.running,
};

const STATUS_COLOR: Record<GateStatus | 'running', string> = {
  pass: colors.success,
  fail: colors.error,
  warn: colors.warning,
  skip: colors.textMuted,
  running: colors.accent,
};

function GateRow({
  gate,
  isRunning,
  isLast,
}: {
  gate: GateResult;
  isRunning?: boolean;
  isLast: boolean;
}) {
  const status = isRunning ? 'running' : gate.status;
  const icon = STATUS_ICON[status];
  const color = STATUS_COLOR[status];
  const branch = isLast ? symbols.gateLast : symbols.gateArrow;

  return (
    <Box>
      <Text color={colors.borderDim}>
        {'  '}{branch}{symbols.lineHeavy}{' '}
      </Text>
      <Box width={4}>
        <Text bold color={color}>
          {gate.tier}
        </Text>
      </Box>
      <Box width={3}>
        {isRunning ? (
          <Text color={colors.accent}>
            <Spinner type="dots" />
          </Text>
        ) : (
          <Text color={color}>{icon}</Text>
        )}
      </Box>
      <Box width={28}>
        <Text color={isRunning ? colors.accent : colors.textPrimary}>
          {gate.name}
        </Text>
      </Box>
      <Box width={8}>
        <Text color={colors.textMuted}>
          {gate.durationMs > 0 ? `${(gate.durationMs / 1000).toFixed(1)}s` : ''}
        </Text>
      </Box>
      {gate.status === 'fail' && gate.detail && (
        <Box flexShrink={1}>
          <Text color={colors.error} wrap="truncate">
            {gate.detail.split('\n')[0].slice(0, 60)}
          </Text>
        </Box>
      )}
    </Box>
  );
}

export function GateTimeline({ gates, summary }: GateTimelineProps) {
  const verdictColor =
    summary?.verdict === 'PASS'
      ? colors.success
      : summary?.verdict === 'WARN'
        ? colors.warning
        : colors.error;
  const verdictIcon =
    summary?.verdict === 'PASS'
      ? symbols.pass
      : summary?.verdict === 'WARN'
        ? symbols.warn
        : symbols.fail;

  return (
    <Box flexDirection="column" marginY={1}>
      <Box marginBottom={1}>
        <Text bold color={colors.accent}>
          {symbols.diamond} The Anvil
        </Text>
      </Box>
      <Box flexDirection="column">
        {gates.map((gate, i) => (
          <GateRow
            key={gate.tier + i}
            gate={gate}
            isRunning={gate.isRunning}
            isLast={i === gates.length - 1}
          />
        ))}
      </Box>
      {summary && (
        <Box
          marginTop={1}
          borderStyle={borders.card}
          borderColor={verdictColor}
          paddingX={1}
        >
          <Text>
            <Text bold color={verdictColor}>
              {verdictIcon} VERDICT: {summary.verdict}
            </Text>
            {'  '}
            <Text color={colors.textSecondary}>
              {summary.passed}P {summary.failed}F {summary.warned}W {summary.skipped}S
              {' '}({(summary.totalMs / 1000).toFixed(1)}s)
            </Text>
          </Text>
        </Box>
      )}
    </Box>
  );
}
