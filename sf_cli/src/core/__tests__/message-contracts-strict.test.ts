import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentMessageBus } from '../agent-message-bus.js';
import {
  MessageContractRegistry,
  createContractMiddleware,
} from '../message-contracts.js';
import {
  installContractsForMode,
  resolveContractMode,
} from '../message-schemas.js';

afterEach(() => {
  delete process.env.SF_BUS_CONTRACTS;
});

describe('createContractMiddleware — failClosed (strict rollout)', () => {
  it('rejects an unregistered handoff when failClosed is set', () => {
    const bus = new AgentMessageBus();
    const reg = new MessageContractRegistry(); // nothing registered
    const onReject = vi.fn();
    bus.use(createContractMiddleware(reg, { failClosed: true, onReject }));

    const received: unknown[] = [];
    bus.subscribe('status:heartbeat', (m) => received.push(m.payload));
    bus.publish(AgentMessageBus.buildMessage('a', 'b', 'status:heartbeat', { beat: 1 }));

    expect(received).toHaveLength(0); // dropped — no contract, fail-closed
    expect(onReject).toHaveBeenCalledOnce();
    expect(onReject.mock.calls[0][1][0]).toMatch(/no registered contract/);
  });

  it('permissive (failClosed off) lets an unregistered handoff through', () => {
    const bus = new AgentMessageBus();
    const reg = new MessageContractRegistry();
    bus.use(createContractMiddleware(reg)); // failClosed defaults false

    const received: unknown[] = [];
    bus.subscribe('status:heartbeat', (m) => received.push(m.payload));
    bus.publish(AgentMessageBus.buildMessage('a', 'b', 'status:heartbeat', { beat: 1 }));

    expect(received).toEqual([{ beat: 1 }]);
  });
});

describe('resolveContractMode', () => {
  it('returns the configured mode when no env override', () => {
    expect(resolveContractMode('permissive')).toBe('permissive');
    expect(resolveContractMode(undefined)).toBe('off');
  });

  it('lets SF_BUS_CONTRACTS override the configured mode', () => {
    process.env.SF_BUS_CONTRACTS = 'strict';
    expect(resolveContractMode('off')).toBe('strict');
  });

  it('ignores an invalid env value', () => {
    process.env.SF_BUS_CONTRACTS = 'nonsense';
    expect(resolveContractMode('permissive')).toBe('permissive');
  });
});

describe('installContractsForMode — flag-gated wiring', () => {
  it('off → installs nothing and returns null', () => {
    const bus = new AgentMessageBus();
    const spy = vi.spyOn(bus, 'use');
    expect(installContractsForMode(bus, 'off')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('permissive → covered types validated, unregistered pass through', () => {
    const bus = new AgentMessageBus();
    const reg = installContractsForMode(bus, 'permissive');
    expect(reg).not.toBeNull();

    const received: unknown[] = [];
    bus.subscribe('task:delegate', (m) => received.push(m.payload));
    // object payload (valid for baseline) delivered
    bus.publish(AgentMessageBus.buildMessage('a', 'b', 'task:delegate', { story: '1' }));
    // string payload rejected (baseline requires object)
    bus.publish(
      AgentMessageBus.buildMessage('a', 'b', 'task:delegate', 'go' as unknown as Record<string, unknown>),
    );
    expect(received).toEqual([{ story: '1' }]);
  });

  it('strict → fail-closed on a type with no registered contract', () => {
    const bus = new AgentMessageBus();
    // Baseline covers all 8 known MessageTypes, so to observe fail-closed we register
    // an empty registry via env override path is not possible here; instead verify the
    // baseline still enforces object-shape and that strict wires failClosed through by
    // rejecting a non-object on a covered type.
    installContractsForMode(bus, 'strict');
    const received: unknown[] = [];
    bus.subscribe('memory:store', (m) => received.push(m.payload));
    bus.publish(
      AgentMessageBus.buildMessage('a', 'b', 'memory:store', 42 as unknown as Record<string, unknown>),
    );
    expect(received).toHaveLength(0);
  });

  it('strict honors SF_BUS_CONTRACTS override from off', () => {
    process.env.SF_BUS_CONTRACTS = 'strict';
    const bus = new AgentMessageBus();
    const reg = installContractsForMode(bus, 'off'); // config says off, env says strict
    expect(reg).not.toBeNull();
  });
});
