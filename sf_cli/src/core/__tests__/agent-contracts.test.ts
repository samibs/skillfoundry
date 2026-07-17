import { describe, it, expect } from 'vitest';
import {
  validateAgentOutput,
  getAgentOutputContract,
  contractedAgentNames,
  registerAgentResultContracts,
  extractStructuredOutput,
  validateAgentResultText,
  ARCHETYPE_OUTPUT_CONTRACTS,
  AGENT_OUTPUT_OVERRIDES,
} from '../agent-contracts.js';
import { getAgentArchetype } from '../agent-registry.js';
import { MessageContractRegistry } from '../message-contracts.js';
import { AgentMessageBus } from '../agent-message-bus.js';

describe('agent contract coverage (all agents converted, follow-up 3)', () => {
  it('every registered agent resolves to a contract (override or archetype default)', () => {
    const names = contractedAgentNames();
    expect(names.length).toBeGreaterThan(40); // ~66 registered agents
    for (const name of names) {
      const contract = getAgentOutputContract(name);
      expect(contract).toBeTruthy();
      const expected =
        AGENT_OUTPUT_OVERRIDES[name] ?? ARCHETYPE_OUTPUT_CONTRACTS[getAgentArchetype(name)];
      expect(contract).toBe(expected);
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

  it('operator (health) requires a status; advisor (learn) requires an answer', () => {
    // 'health' is a non-overridden operator → generic operator contract.
    expect(validateAgentOutput('health', { status: 'ok', report: { checks: 10 } }).valid).toBe(true);
    expect(validateAgentOutput('health', { report: {} }).valid).toBe(false);
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

describe('per-agent overrides (thing 1: best-practice layered resolution)', () => {
  it('gate-keeper overrides the generic reviewer contract with a verdict shape', () => {
    const ok = validateAgentOutput('gate-keeper', { verdict: 'BLOCK' });
    expect(ok.valid).toBe(true);
    expect(ok.override).toBe(true);
    // The generic reviewer "findings" shape is NOT what gate-keeper must produce.
    expect(validateAgentOutput('gate-keeper', { findings: [] }).valid).toBe(false);
    // Invalid verdict rejected.
    expect(validateAgentOutput('gate-keeper', { verdict: 'MAYBE' }).valid).toBe(false);
  });

  it('tester overrides the generic operator contract with test metrics', () => {
    expect(validateAgentOutput('tester', { status: 'ok', tests_run: 42, failures: 0 }).valid).toBe(true);
    expect(validateAgentOutput('tester', { status: 'ok' }).valid).toBe(false); // tests_run required
    expect(validateAgentOutput('tester', { status: 'ok', tests_run: '42' }).valid).toBe(false);
  });

  it('a non-overridden agent still uses the archetype default (override=false)', () => {
    const r = validateAgentOutput('review', { findings: [{ severity: 'LOW', file: 'x.ts' }] });
    expect(r.valid).toBe(true);
    expect(r.override).toBe(false);
  });
});

describe('runtime enforcement helpers (thing 2: extract → validate → warn)', () => {
  it('extracts a fenced json block from free-text output', () => {
    const text = 'Here is my analysis.\n```json\n{"findings": []}\n```\nDone.';
    expect(extractStructuredOutput(text)).toEqual({ findings: [] });
  });

  it('extracts a bare JSON object and returns null for prose', () => {
    expect(extractStructuredOutput('{"status":"completed"}')).toEqual({ status: 'completed' });
    expect(extractStructuredOutput('I finished the task successfully.')).toBeNull();
    expect(extractStructuredOutput('```json\n{ not valid json }\n```')).toBeNull();
  });

  it('validateAgentResultText enforces only when structured output is present', () => {
    // prose → unenforced (free-text agents are never penalized)
    const prose = validateAgentResultText('coder', 'I modified auth.ts and added tests.');
    expect(prose.enforced).toBe(false);
    expect(prose.valid).toBe(true);

    // structured + valid
    const good = validateAgentResultText('coder', '```json\n{"status":"completed"}\n```');
    expect(good.enforced).toBe(true);
    expect(good.valid).toBe(true);

    // structured + invalid (violates the coder/implementer contract)
    const bad = validateAgentResultText('coder', '{"status":"vibing"}');
    expect(bad.enforced).toBe(true);
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
  });
});
