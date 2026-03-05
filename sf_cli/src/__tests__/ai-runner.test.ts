import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('../core/provider.js', () => ({
  createProvider: vi.fn(),
}));

vi.mock('../core/executor.js', () => ({
  executeTool: vi.fn(),
}));

vi.mock('../core/budget.js', () => ({
  loadUsage: vi.fn(() => ({ monthly: 0, runs: {} })),
  checkBudget: vi.fn(() => ({ allowed: true, reason: '', monthlySpend: 0, monthlyBudget: 50 })),
  recordUsage: vi.fn(() => ({ monthly: 0.01, runs: {} })),
}));

vi.mock('../core/retry.js', () => ({
  streamWithRetry: vi.fn(),
}));

vi.mock('../core/permissions.js', () => ({
  checkPermission: vi.fn(() => ({ decision: 'allow', reason: '' })),
}));

vi.mock('../core/redact.js', () => ({
  redactText: vi.fn((text: string) => text),
}));

import { runAgentLoop } from '../core/ai-runner.js';
import { createProvider } from '../core/provider.js';
import { executeTool } from '../core/executor.js';
import { checkBudget } from '../core/budget.js';
import { streamWithRetry } from '../core/retry.js';
import { checkPermission } from '../core/permissions.js';
import type { SfConfig, SfPolicy, AnthropicMessage, ProviderAdapter } from '../types.js';

const mockConfig: SfConfig = {
  provider: 'test',
  engine: 'test',
  model: 'test-model',
  fallback_provider: '',
  fallback_engine: '',
  monthly_budget_usd: 50,
  run_budget_usd: 5,
  memory_sync_enabled: false,
  memory_sync_remote: '',
  route_local_first: false,
  local_provider: '',
  local_model: '',
  context_window: 0,
  log_level: 'error',
};

const mockPolicy: SfPolicy = {
  allow_shell: true,
  allow_network: false,
  allow_paths: [],
  redact: false,
};

function mockProvider(): ProviderAdapter {
  return {
    name: 'test',
    stream: vi.fn(),
    streamWithTools: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const provider = mockProvider();
  vi.mocked(createProvider).mockReturnValue(provider);
});

describe('runAgentLoop', () => {
  it('returns text content on single-turn (no tool calls)', async () => {
    vi.mocked(streamWithRetry).mockResolvedValue({
      result: {
        content: [{ type: 'text', text: 'Hello world' }],
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.001,
        stopReason: 'end_turn',
      },
    });

    const messages: AnthropicMessage[] = [{ role: 'user', content: 'hi' }];
    const result = await runAgentLoop(messages, { config: mockConfig, policy: mockPolicy });

    expect(result.content).toBe('Hello world');
    expect(result.turnCount).toBe(1);
    expect(result.totalInputTokens).toBe(100);
    expect(result.totalOutputTokens).toBe(50);
    expect(result.totalCostUsd).toBe(0.001);
    expect(result.aborted).toBe(false);
  });

  it('executes tools in multi-turn conversation', async () => {
    // Turn 1: AI requests a tool
    vi.mocked(streamWithRetry)
      .mockResolvedValueOnce({
        result: {
          content: [
            { type: 'text', text: 'Let me read that file.' },
            { type: 'tool_use', id: 'tc1', name: 'read', input: { file_path: 'test.ts' } },
          ],
          inputTokens: 200,
          outputTokens: 100,
          costUsd: 0.002,
          stopReason: 'tool_use',
        },
      })
      // Turn 2: AI returns final text
      .mockResolvedValueOnce({
        result: {
          content: [{ type: 'text', text: 'The file contains tests.' }],
          inputTokens: 300,
          outputTokens: 80,
          costUsd: 0.003,
          stopReason: 'end_turn',
        },
      });

    vi.mocked(executeTool).mockReturnValue({
      toolCallId: 'tc1',
      output: 'file contents here',
      isError: false,
    });

    const messages: AnthropicMessage[] = [{ role: 'user', content: 'read test.ts' }];
    const result = await runAgentLoop(messages, { config: mockConfig, policy: mockPolicy });

    expect(result.content).toBe('The file contains tests.');
    expect(result.turnCount).toBe(2);
    expect(result.totalInputTokens).toBe(500);
    expect(result.totalOutputTokens).toBe(180);
    expect(executeTool).toHaveBeenCalledOnce();
  });

  it('stops when budget is exceeded', async () => {
    // First check passes (pre-flight), second check fails (per-turn)
    vi.mocked(checkBudget)
      .mockReturnValueOnce({ allowed: true, reason: '', monthlySpend: 0, monthlyBudget: 50 })
      .mockReturnValueOnce({ allowed: false, reason: 'Monthly budget exceeded', monthlySpend: 50, monthlyBudget: 50 });

    const messages: AnthropicMessage[] = [{ role: 'user', content: 'do stuff' }];
    const result = await runAgentLoop(messages, { config: mockConfig, policy: mockPolicy });

    expect(result.content).toContain('budget exceeded');
    expect(result.turnCount).toBe(1);
    expect(streamWithRetry).not.toHaveBeenCalled();
  });

  it('handles permission denied via callback', async () => {
    vi.mocked(checkPermission).mockReturnValue({ decision: 'ask', reason: 'Shell command' });

    vi.mocked(streamWithRetry)
      .mockResolvedValueOnce({
        result: {
          content: [
            { type: 'tool_use', id: 'tc1', name: 'bash', input: { command: 'rm -rf /' } },
          ],
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 0.001,
          stopReason: 'tool_use',
        },
      })
      .mockResolvedValueOnce({
        result: {
          content: [{ type: 'text', text: 'Permission was denied.' }],
          inputTokens: 150,
          outputTokens: 30,
          costUsd: 0.001,
          stopReason: 'end_turn',
        },
      });

    const messages: AnthropicMessage[] = [{ role: 'user', content: 'delete everything' }];
    const result = await runAgentLoop(
      messages,
      { config: mockConfig, policy: mockPolicy },
      { requestPermission: async () => 'deny' },
    );

    expect(result.content).toBe('Permission was denied.');
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('respects maxTurns limit', async () => {
    // Always return tool_use to keep looping
    vi.mocked(streamWithRetry).mockResolvedValue({
      result: {
        content: [
          { type: 'text', text: 'Working...' },
          { type: 'tool_use', id: 'tc1', name: 'read', input: { file_path: 'x.ts' } },
        ],
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.001,
        stopReason: 'tool_use',
      },
    });

    vi.mocked(executeTool).mockReturnValue({
      toolCallId: 'tc1',
      output: 'ok',
      isError: false,
    });

    const messages: AnthropicMessage[] = [{ role: 'user', content: 'loop' }];
    const result = await runAgentLoop(messages, {
      config: mockConfig,
      policy: mockPolicy,
      maxTurns: 3,
    });

    expect(result.turnCount).toBe(3);
    expect(streamWithRetry).toHaveBeenCalledTimes(3);
  });

  it('aborts early when abortSignal is set', async () => {
    const abortSignal = { aborted: false };

    vi.mocked(streamWithRetry)
      .mockResolvedValueOnce({
        result: {
          content: [
            { type: 'text', text: 'Step 1' },
            { type: 'tool_use', id: 'tc1', name: 'read', input: { file_path: 'a.ts' } },
          ],
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 0.001,
          stopReason: 'tool_use',
        },
      });

    vi.mocked(executeTool).mockImplementation(() => {
      // Abort during tool execution
      abortSignal.aborted = true;
      return { toolCallId: 'tc1', output: 'ok', isError: false };
    });

    const messages: AnthropicMessage[] = [{ role: 'user', content: 'do it' }];
    const result = await runAgentLoop(messages, {
      config: mockConfig,
      policy: mockPolicy,
      abortSignal,
    });

    expect(result.aborted).toBe(true);
    expect(result.turnCount).toBeLessThanOrEqual(2);
  });

  it('fires onToolStart and onToolComplete callbacks', async () => {
    vi.mocked(streamWithRetry)
      .mockResolvedValueOnce({
        result: {
          content: [
            { type: 'tool_use', id: 'tc1', name: 'read', input: { file_path: 'test.ts' } },
          ],
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 0.001,
          stopReason: 'tool_use',
        },
      })
      .mockResolvedValueOnce({
        result: {
          content: [{ type: 'text', text: 'Done' }],
          inputTokens: 100,
          outputTokens: 30,
          costUsd: 0.001,
          stopReason: 'end_turn',
        },
      });

    vi.mocked(executeTool).mockReturnValue({
      toolCallId: 'tc1',
      output: 'file content',
      isError: false,
    });

    const onToolStart = vi.fn();
    const onToolComplete = vi.fn();

    const messages: AnthropicMessage[] = [{ role: 'user', content: 'read test.ts' }];
    await runAgentLoop(
      messages,
      { config: mockConfig, policy: mockPolicy },
      { onToolStart, onToolComplete },
    );

    expect(onToolStart).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tc1', name: 'read' }),
    );
    expect(onToolComplete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tc1', name: 'read' }),
      expect.objectContaining({ output: 'file content', isError: false }),
    );
  });

  it('returns budget exceeded message on pre-flight check failure', async () => {
    vi.mocked(checkBudget).mockReturnValue({
      allowed: false,
      reason: 'Monthly limit reached',
      monthlySpend: 50,
      monthlyBudget: 50,
    });

    const messages: AnthropicMessage[] = [{ role: 'user', content: 'hi' }];
    const result = await runAgentLoop(messages, { config: mockConfig, policy: mockPolicy });

    expect(result.content).toContain('Budget exceeded');
    expect(result.turnCount).toBe(0);
    expect(streamWithRetry).not.toHaveBeenCalled();
  });
});
