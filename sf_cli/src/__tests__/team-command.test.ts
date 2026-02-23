import { describe, it, expect, vi } from 'vitest';
import { teamCommand } from '../commands/team.js';
import type { SessionContext, TeamDefinitionRef } from '../types.js';
import { TEAM_PRESETS } from '../core/team-registry.js';

function makeSession(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    config: {
      provider: 'anthropic',
      engine: 'default',
      model: 'claude-sonnet-4-20250514',
      fallback_provider: '',
      fallback_engine: '',
      monthly_budget_usd: 50,
      run_budget_usd: 5,
      memory_sync_enabled: false,
      memory_sync_remote: '',
    },
    policy: { allow_shell: true, allow_network: true, allow_paths: [], redact: true },
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
    workDir: '/tmp/test',
    activeAgent: null,
    activeTeam: null,
    addMessage: vi.fn(),
    setState: vi.fn(),
    setActiveAgent: vi.fn(),
    setActiveTeam: vi.fn(),
    ...overrides,
  };
}

describe('teamCommand', () => {
  it('shows no team active when no args and no team', async () => {
    const session = makeSession();
    const result = await teamCommand.execute('', session);
    expect(result).toContain('No team active');
  });

  it('shows current team when no args and team is active', async () => {
    const session = makeSession({ activeTeam: TEAM_PRESETS.dev });
    const result = await teamCommand.execute('', session);
    expect(result).toContain('Development Team');
    expect(result).toContain('coder, tester, fixer');
  });

  it('activates preset team by name', async () => {
    const session = makeSession();
    const result = await teamCommand.execute('dev', session);
    expect(session.setActiveTeam).toHaveBeenCalledWith(TEAM_PRESETS.dev);
    expect(result).toContain('Development Team summoned');
  });

  it('returns error for unknown team', async () => {
    const session = makeSession();
    const result = await teamCommand.execute('nonexistent', session);
    expect(result).toContain('Unknown team');
  });

  it('creates custom team from valid agents', async () => {
    const session = makeSession();
    const result = await teamCommand.execute('custom coder tester', session);
    expect(session.setActiveTeam).toHaveBeenCalled();
    expect(result).toContain('Custom team summoned');
    expect(result).toContain('coder, tester');
  });

  it('rejects custom team with < 2 agents', async () => {
    const session = makeSession();
    const result = await teamCommand.execute('custom coder', session);
    expect(result).toContain('minimum 2 agents');
  });

  it('rejects custom team with unknown agents', async () => {
    const session = makeSession();
    const result = await teamCommand.execute('custom coder fakename', session);
    expect(result).toContain('Unknown agent');
  });

  it('dismisses team with /team off', async () => {
    const session = makeSession({ activeTeam: TEAM_PRESETS.dev });
    const result = await teamCommand.execute('off', session);
    expect(session.setActiveTeam).toHaveBeenCalledWith(null);
    expect(result).toContain('dismissed');
  });

  it('lists all preset teams', async () => {
    const session = makeSession();
    const result = await teamCommand.execute('list', session);
    expect(result).toContain('dev');
    expect(result).toContain('fullstack');
    expect(result).toContain('security');
    expect(result).toContain('ops');
    expect(result).toContain('review');
    expect(result).toContain('ship');
  });

  it('shows status when team is active', async () => {
    const session = makeSession({ activeTeam: TEAM_PRESETS.security });
    const result = await teamCommand.execute('status', session);
    expect(result).toContain('Security Team');
    expect(result).toContain('auto-routed');
  });

  it('shows no team for status when none active', async () => {
    const session = makeSession();
    const result = await teamCommand.execute('status', session);
    expect(result).toContain('No team active');
  });
});
