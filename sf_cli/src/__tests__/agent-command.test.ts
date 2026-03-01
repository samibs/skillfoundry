import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { agentCommand } from '../commands/agent.js';
import type { SessionContext } from '../types.js';

function makeSession(activeAgent: string | null = null): SessionContext {
  return {
    config: {
      provider: 'openai',
      engine: 'gpt-4o-mini',
      model: 'gpt-4o-mini',
      fallback_provider: '',
      fallback_engine: '',
      monthly_budget_usd: 10,
      run_budget_usd: 1,
      memory_sync_enabled: false,
      memory_sync_remote: '',
    },
    policy: {
      allow_shell: true,
      allow_network: true,
      allow_paths: ['.'],
      redact: false,
    },
    state: {
      current_state: 'IDLE',
      updated_at: '',
      current_prd: '',
      current_story: '',
      last_plan_id: '',
      last_run_id: '',
      recovery: { rollback_available: false, resume_point: '' },
    },
    messages: [],
    permissionMode: 'ask',
    workDir: join(tmpdir(), 'sf-test'),
    activeAgent,
    addMessage: vi.fn(),
    setState: vi.fn(),
    setActiveAgent: vi.fn(),
  };
}

describe('agentCommand', () => {
  it('shows current status when no args', async () => {
    const session = makeSession(null);
    const result = await agentCommand.execute('', session);
    expect(result).toContain('No agent active');
    expect(result).toContain('60 agents available');
  });

  it('shows active agent when one is set', async () => {
    const session = makeSession('review');
    const result = await agentCommand.execute('', session);
    expect(result).toContain('Active agent: review');
  });

  it('activates a valid agent', async () => {
    const session = makeSession(null);
    const result = await agentCommand.execute('review', session);
    expect(session.setActiveAgent).toHaveBeenCalledWith('review');
    expect(result).toContain('Activated: Code Reviewer');
    expect(result).toContain('REVIEW');
  });

  it('rejects an unknown agent', async () => {
    const session = makeSession(null);
    const result = await agentCommand.execute('nonexistent', session);
    expect(session.setActiveAgent).not.toHaveBeenCalled();
    expect(result).toContain('Unknown agent: nonexistent');
  });

  it('deactivates with /agent off', async () => {
    const session = makeSession('coder');
    const result = await agentCommand.execute('off', session);
    expect(session.setActiveAgent).toHaveBeenCalledWith(null);
    expect(result).toContain('deactivated');
  });

  it('lists all agents grouped by category', async () => {
    const session = makeSession(null);
    const result = await agentCommand.execute('list', session);
    expect(result).toContain('FULL');
    expect(result).toContain('CODE');
    expect(result).toContain('REVIEW');
    expect(result).toContain('OPS');
    expect(result).toContain('INSPECT');
    expect(result).toContain('NONE');
    expect(result).toContain('Total: 60 agents');
  });

  it('shows agent info', async () => {
    const session = makeSession(null);
    const result = await agentCommand.execute('info review', session);
    expect(result).toContain('Code Reviewer');
    expect(result).toContain('REVIEW');
    expect(result).toContain('read, glob, grep');
  });

  it('rejects info for unknown agent', async () => {
    const session = makeSession(null);
    const result = await agentCommand.execute('info fake', session);
    expect(result).toContain('Unknown agent: fake');
  });

  it('shows usage when info has no name', async () => {
    const session = makeSession(null);
    const result = await agentCommand.execute('info', session);
    expect(result).toContain('Usage:');
  });
});
