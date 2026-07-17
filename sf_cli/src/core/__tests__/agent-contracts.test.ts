import { describe, it, expect } from 'vitest';
import {
  validateAgentOutput,
  getAgentOutputContract,
  contractedAgentNames,
  registerAgentResultContracts,
  ARCHETYPE_OUTPUT_CONTRACTS,
} from '../agent-contracts.js';
import { getAgentArchetype } from '../agent-registry.js';
import { MessageContractRegistry } from '../message-contracts.js';
import { AgentMessageBus } from '../agent-message-bus.js';

describe('agent contract coverage (all agents converted, follow-up 3)', () => {
  it('every registered agent resolves to an archetype output contract', () => {
    const names = contractedAgentNames();
    expect(names.length).toBeGreaterThan(40); // ~66 registered agents
    for (const name of names) {
      const contract = getAgentOutputContract(name);
      expect(contract).toBe(ARCHETYPE_OUTPUT_CONTRACTS[getAgentArchetype(name)]);
      expect(contract).toBeTruthy();
    }
  });

  it('the four archetypes each have a distinct contract', () => {
    expect(Object.keys(ARCHETYPE_OUTPUT_CONTRACTS).sort()).toEqual([
      'advisor',
      'implementer',
      'operator',
      'reviewer',
    ]);
  });
});

describe('validateAgentOutput — per-archetype enforcement', () => {
  it('reviewer (security) requires findings and validates a real finding', () => {
    const ok = validateAgentOutput('security', {
      findings: [{ severity: 'HIGH', file: 'src/auth.ts', line: 10 }],
    });
    expect(ok.valid).toBe(true);
    expect(ok.archetype).toBe('reviewer');

    const badSeverity = validateAgentOutput('security', {
      findings: [{ severity: 'SPICY', file: 'x.ts' }],
    });
    expect(badSeverity.valid).toBe(false);

    const missing = validateAgentOutput('security', { notes: 'looks fine' });
    expect(missing.valid).toBe(false);
    expect(missing.errors.join(' ')).toMatch(/findings/);
  });

  it('implementer (coder) requires a status enum', () => {
    expect(validateAgentOutput('coder', { status: 'completed', files_changed: [{ file: 'a.ts' }] }).valid).toBe(true);
    expect(validateAgentOutput('coder', { status: 'vibing' }).valid).toBe(false);
    expect(validateAgentOutput('coder', {}).valid).toBe(false);
  });

  it('operator (tester) requires a status; advisor (learn) requires an answer', () => {
    expect(validateAgentOutput('tester', { status: 'ok', report: { passed: 10 } }).valid).toBe(true);
    expect(validateAgentOutput('tester', { report: {} }).valid).toBe(false);
    expect(validateAgentOutput('learn', { answer: 'because X' }).valid).toBe(true);
    expect(validateAgentOutput('learn', { answer: 42 }).valid).toBe(false);
  });

  it('an unknown agent name defaults to the implementer contract', () => {
    expect(validateAgentOutput('made-up-agent', { status: 'completed' }).archetype).toBe('implementer');
  });
});

describe('registerAgentResultContracts — bus enforcement (composes with follow-up 2)', () => {
  it('rejects a narrative result:complete and accepts a structured one', () => {
    const bus = new AgentMessageBus();
    const reg = new MessageContractRegistry();
    registerAgentResultContracts(reg);
    bus.use((message, next) => {
      if (reg.validate(message).valid) next();
    });

    const received: unknown[] = [];
    bus.subscribe('result:complete', (m) => received.push(m.payload));

    // structured agent result → delivered
    bus.publish(
      AgentMessageBus.buildMessage('security', 'gate', 'result:complete', {
        findings: [{ severity: 'LOW', file: 'x.ts' }],
      }),
    );
    // narrative string → dropped
    bus.publish(
      AgentMessageBus.buildMessage(
        'security',
        'gate',
        'result:complete',
        'I found some issues' as unknown as Record<string, unknown>,
      ),
    );

    expect(received).toHaveLength(1);
    expect(received[0]).toHaveProperty('findings');
  });
});
