import { describe, it, expect, vi } from 'vitest';
import { AgentMessageBus } from '../agent-message-bus.js';
import {
  MessageContractRegistry,
  createContractMiddleware,
} from '../message-contracts.js';

// A representative result:complete contract: payload must carry a numeric coverage.
const COVERAGE_SCHEMA = {
  type: 'object',
  required: ['coverage'],
  properties: { coverage: { type: 'number' } },
  additionalProperties: true,
};

describe('MessageContractRegistry.validate', () => {
  it('passes a payload that matches the registered schema', () => {
    const reg = new MessageContractRegistry();
    reg.register('result:complete', COVERAGE_SCHEMA);
    const msg = AgentMessageBus.buildMessage('tester', 'gate', 'result:complete', {
      coverage: 96,
    });
    const r = reg.validate(msg);
    expect(r.valid).toBe(true);
    expect(r.enforced).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('fails a payload that violates the schema and reports readable errors', () => {
    const reg = new MessageContractRegistry();
    reg.register('result:complete', COVERAGE_SCHEMA);
    const msg = AgentMessageBus.buildMessage('tester', 'gate', 'result:complete', {
      coverage: 'ninety-six',
    });
    const r = reg.validate(msg);
    expect(r.valid).toBe(false);
    expect(r.enforced).toBe(true);
    expect(r.errors.join(' ')).toMatch(/coverage|number/i);
  });

  it('treats an unregistered (type, recipient) as valid-but-unenforced (FR-008)', () => {
    const reg = new MessageContractRegistry();
    const msg = AgentMessageBus.buildMessage('a', 'b', 'status:heartbeat', {
      anything: true,
    });
    const r = reg.validate(msg);
    expect(r.valid).toBe(true);
    expect(r.enforced).toBe(false);
  });

  it('prefers a recipient-specific contract over the wildcard one', () => {
    const reg = new MessageContractRegistry();
    // Wildcard: lax. Specific to "strict-agent": requires a "token".
    reg.register('task:delegate', { type: 'object' });
    reg.register(
      'task:delegate',
      { type: 'object', required: ['token'], properties: { token: { type: 'string' } } },
      'strict-agent',
    );
    const toStrict = AgentMessageBus.buildMessage('x', 'strict-agent', 'task:delegate', {});
    const toOther = AgentMessageBus.buildMessage('x', 'other', 'task:delegate', {});
    expect(reg.validate(toStrict).valid).toBe(false); // missing token
    expect(reg.validate(toOther).valid).toBe(true); // wildcard is lax
  });

  it('surfaces a malformed schema at registration time', () => {
    const reg = new MessageContractRegistry();
    expect(() =>
      reg.register('result:complete', { type: 'not-a-real-type' }),
    ).toThrow();
  });

  it('has() reports contract presence including wildcard fallback', () => {
    const reg = new MessageContractRegistry();
    reg.register('memory:store', { type: 'object' });
    expect(reg.has('memory:store', 'anyone')).toBe(true);
    expect(reg.has('memory:query', 'anyone')).toBe(false);
  });
});

describe('createContractMiddleware — bus integration (FR-004)', () => {
  it('drops an invalid message so subscribers never receive it', () => {
    const bus = new AgentMessageBus();
    const reg = new MessageContractRegistry();
    reg.register('result:complete', COVERAGE_SCHEMA);
    const onReject = vi.fn();
    bus.use(createContractMiddleware(reg, { onReject }));

    const received: unknown[] = [];
    bus.subscribe('result:complete', (m) => received.push(m.payload));

    bus.publish(
      AgentMessageBus.buildMessage('tester', 'gate', 'result:complete', {
        coverage: 'bad',
      }),
    );

    expect(received).toHaveLength(0); // never delivered
    expect(onReject).toHaveBeenCalledOnce();
  });

  it('delivers a valid message unchanged', () => {
    const bus = new AgentMessageBus();
    const reg = new MessageContractRegistry();
    reg.register('result:complete', COVERAGE_SCHEMA);
    bus.use(createContractMiddleware(reg));

    const received: unknown[] = [];
    bus.subscribe('result:complete', (m) => received.push(m.payload));

    bus.publish(
      AgentMessageBus.buildMessage('tester', 'gate', 'result:complete', { coverage: 96 }),
    );

    expect(received).toEqual([{ coverage: 96 }]);
  });

  it('lets unenforced message types through (incremental adoption)', () => {
    const bus = new AgentMessageBus();
    const reg = new MessageContractRegistry(); // nothing registered
    bus.use(createContractMiddleware(reg));

    const received: unknown[] = [];
    bus.subscribe('status:heartbeat', (m) => received.push(m.payload));

    bus.publish(
      AgentMessageBus.buildMessage('a', 'b', 'status:heartbeat', { beat: 1 }),
    );

    expect(received).toEqual([{ beat: 1 }]);
  });
});
