import { describe, it, expect, vi } from 'vitest';
import { AgentMessageBus } from '../agent-message-bus.js';
import { MessageContractRegistry } from '../message-contracts.js';
import {
  FINDING_SCHEMA,
  SEVERITY_SCHEMA,
  DEFAULT_MESSAGE_CONTRACTS,
  buildDefaultRegistry,
  installMessageContracts,
} from '../message-schemas.js';

describe('shared type schemas (single source of truth)', () => {
  it('FINDING_SCHEMA validates a real finding and rejects a bad severity', () => {
    const reg = new MessageContractRegistry();
    reg.register('result:complete', FINDING_SCHEMA);
    const good = AgentMessageBus.buildMessage('sec', 'gate', 'result:complete', {
      severity: 'HIGH',
      file: 'src/auth.ts',
      line: 42,
    });
    const bad = AgentMessageBus.buildMessage('sec', 'gate', 'result:complete', {
      severity: 'SPICY',
      file: 'src/auth.ts',
    });
    expect(reg.validate(good).valid).toBe(true);
    expect(reg.validate(bad).valid).toBe(false);
  });

  it('SEVERITY_SCHEMA enumerates the four canonical levels', () => {
    expect(SEVERITY_SCHEMA.enum).toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  });
});

describe('default registry (permissive baseline)', () => {
  it('covers every one of the 8 message types', () => {
    expect(DEFAULT_MESSAGE_CONTRACTS).toHaveLength(8);
    const reg = buildDefaultRegistry();
    for (const c of DEFAULT_MESSAGE_CONTRACTS) {
      expect(reg.has(c.type, 'anyone')).toBe(true);
    }
  });

  it('accepts the real agent-pool heartbeat payload (no false rejection)', () => {
    const reg = buildDefaultRegistry();
    const heartbeat = AgentMessageBus.buildMessage('agent-pool', '*', 'status:heartbeat', {
      running: 2,
      queued: 5,
      completed: 10,
      failed: 0,
      maxConcurrency: 4,
    });
    expect(reg.validate(heartbeat).valid).toBe(true);
  });

  it('rejects a non-object (narrative) payload for a covered type', () => {
    const reg = buildDefaultRegistry();
    const narrative = AgentMessageBus.buildMessage(
      'coder',
      'tester',
      'task:delegate',
      // A stray string handoff — the failure mode contracts exist to stop.
      'please write some tests for the thing' as unknown as Record<string, unknown>,
    );
    expect(reg.validate(narrative).valid).toBe(false);
  });

  it('supports extra strict per-recipient contracts alongside the baseline', () => {
    const reg = buildDefaultRegistry([
      { type: 'result:complete', schema: FINDING_SCHEMA, recipient: 'gate' },
    ]);
    const toGate = AgentMessageBus.buildMessage('sec', 'gate', 'result:complete', {
      severity: 'LOW',
      file: 'x.ts',
    });
    const missingFields = AgentMessageBus.buildMessage('sec', 'gate', 'result:complete', {
      note: 'looks fine',
    });
    expect(reg.validate(toGate).valid).toBe(true);
    expect(reg.validate(missingFields).valid).toBe(false); // strict for recipient 'gate'
    // A different recipient falls back to the permissive baseline.
    const toOther = AgentMessageBus.buildMessage('sec', 'other', 'result:complete', {
      note: 'looks fine',
    });
    expect(reg.validate(toOther).valid).toBe(true);
  });
});

describe('installMessageContracts (opt-in)', () => {
  it('installs enforcing middleware on a bus and drops invalid messages', () => {
    const bus = new AgentMessageBus();
    const onReject = vi.fn();
    installMessageContracts(bus, buildDefaultRegistry(), { onReject });

    const received: unknown[] = [];
    bus.subscribe('task:delegate', (m) => received.push(m.payload));

    // valid object payload → delivered
    bus.publish(
      AgentMessageBus.buildMessage('a', 'b', 'task:delegate', { story: 'STORY-1' }),
    );
    // invalid string payload → dropped
    bus.publish(
      AgentMessageBus.buildMessage(
        'a',
        'b',
        'task:delegate',
        'do it' as unknown as Record<string, unknown>,
      ),
    );

    expect(received).toEqual([{ story: 'STORY-1' }]);
    expect(onReject).toHaveBeenCalledOnce();
  });
});
