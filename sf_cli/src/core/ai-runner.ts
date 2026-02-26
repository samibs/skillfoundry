// Standalone agentic loop — extracted from useStream.ts.
// Zero React dependencies. Drives multi-turn tool-use conversations
// and can be called from both the React hook (interactive) and the
// pipeline engine (batch/forge).

import { createProvider } from './provider.js';
import { executeTool } from './executor.js';
import { checkBudget, recordUsage, loadUsage } from './budget.js';
import type { UsageData } from './budget.js';
import { streamWithRetry } from './retry.js';
import { checkPermission } from './permissions.js';
import { redactText } from './redact.js';
import { ALL_TOOLS } from './tools.js';
import type {
  SfConfig,
  SfPolicy,
  AnthropicMessage,
  AnthropicContentBlock,
  ToolCall,
  ProviderAdapter,
  RunnerCallbacks,
  RunnerOptions,
  RunnerResult,
} from '../types.js';

const DEFAULT_MAX_TURNS = 25;

/**
 * Run a multi-turn agentic loop: send messages to an AI provider,
 * execute tool calls, feed results back, and repeat until the AI
 * stops requesting tools or the turn limit is reached.
 *
 * This is the core engine that powers both interactive chat (via useStream)
 * and batch pipeline execution (via pipeline.ts / forge).
 */
export async function runAgentLoop(
  messages: AnthropicMessage[],
  options: RunnerOptions,
  callbacks?: RunnerCallbacks,
): Promise<RunnerResult> {
  const {
    config,
    policy,
    systemPrompt,
    tools = ALL_TOOLS,
    maxTurns = DEFAULT_MAX_TURNS,
    workDir = process.cwd(),
    abortSignal,
  } = options;

  // Provider setup
  const provider = createProvider(config.provider);
  const fbName = config.fallback_provider || '';
  let fallbackProvider: ProviderAdapter | null = null;
  if (fbName) {
    fallbackProvider = createProvider(fbName);
  }

  // Budget cache — loaded from disk once, reused in-memory
  let budgetCache: UsageData | null = loadUsage(workDir);

  // Pre-flight budget check
  const budgetCheck = checkBudget(
    workDir,
    config.monthly_budget_usd,
    config.run_budget_usd,
    0,
    budgetCache ?? undefined,
  );
  if (!budgetCheck.allowed) {
    return {
      content: `Budget exceeded: ${budgetCheck.reason}`,
      turnCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      aborted: false,
    };
  }

  // Copy messages so we don't mutate the caller's array
  const conversation: AnthropicMessage[] = [...messages];

  let turnCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  let lastTextContent = '';

  while (turnCount < maxTurns) {
    if (abortSignal?.aborted) {
      return {
        content: lastTextContent,
        turnCount,
        totalInputTokens,
        totalOutputTokens,
        totalCostUsd,
        aborted: true,
      };
    }

    turnCount++;

    // Per-turn budget check
    const turnBudget = checkBudget(
      workDir,
      config.monthly_budget_usd,
      config.run_budget_usd,
      totalCostUsd,
      budgetCache ?? undefined,
    );
    if (!turnBudget.allowed) {
      return {
        content: `Run budget exceeded after ${turnCount} turns: ${turnBudget.reason}`,
        turnCount,
        totalInputTokens,
        totalOutputTokens,
        totalCostUsd,
        aborted: false,
      };
    }

    // Stream with tools
    let accumulated = '';
    const toolStreamResult = await streamWithRetry(
      async (p) =>
        p.streamWithTools(
          conversation,
          {
            model: config.model,
            tools,
            systemPrompt,
          },
          (chunk: string, done: boolean) => {
            if (abortSignal?.aborted) return;
            if (!done) {
              accumulated += chunk;
              callbacks?.onStreamChunk?.(redactText(accumulated, policy.redact));
            }
          },
        ),
      provider,
      fallbackProvider,
    );

    const result = toolStreamResult.result;

    totalInputTokens += result.inputTokens;
    totalOutputTokens += result.outputTokens;
    totalCostUsd += result.costUsd;

    // Record usage
    budgetCache = recordUsage(workDir, {
      provider: toolStreamResult.fallbackUsed || config.provider,
      model: config.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    });

    callbacks?.onTurnComplete?.(turnCount, {
      input: result.inputTokens,
      output: result.outputTokens,
      cost: result.costUsd,
    });

    // Check for tool_use blocks
    const toolUseBlocks = result.content.filter((b) => b.type === 'tool_use');
    const textBlocks = result.content.filter((b) => b.type === 'text');

    if (toolUseBlocks.length === 0 || result.stopReason !== 'tool_use') {
      // No tool calls — final response
      const finalText = textBlocks.map((b) => b.text).join('');
      lastTextContent = redactText(finalText, policy.redact);
      break;
    }

    // Build assistant content blocks for the conversation
    const assistantContent: AnthropicContentBlock[] = result.content.map((block) => {
      if (block.type === 'text') {
        return { type: 'text' as const, text: block.text };
      }
      return {
        type: 'tool_use' as const,
        id: block.id,
        name: block.name,
        input: block.input,
      };
    });

    conversation.push({ role: 'assistant', content: assistantContent });

    // Execute each tool call
    const toolResults: AnthropicContentBlock[] = [];

    for (const block of toolUseBlocks) {
      if (abortSignal?.aborted) break;

      const toolCall: ToolCall = {
        id: block.id!,
        name: block.name!,
        input: block.input!,
      };

      callbacks?.onToolStart?.(toolCall);

      // Check permissions
      const permission = checkPermission(toolCall, policy, 'auto');

      if (permission.decision === 'deny') {
        const denyOutput = `Permission denied: ${permission.reason}`;
        const denyResult = { toolCallId: toolCall.id, output: denyOutput, isError: true };
        callbacks?.onToolComplete?.(toolCall, denyResult);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: denyOutput,
          is_error: true,
        });
        continue;
      }

      if (permission.decision === 'ask' && callbacks?.requestPermission) {
        const response = await callbacks.requestPermission(toolCall, permission.reason);
        if (response === 'deny') {
          const denyResult = { toolCallId: toolCall.id, output: 'User denied permission', isError: true };
          callbacks?.onToolComplete?.(toolCall, denyResult);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: 'User denied permission',
            is_error: true,
          });
          continue;
        }
      }

      // Execute the tool
      const execResult = executeTool(toolCall.name, toolCall.input, {
        workDir,
        policy,
      });
      execResult.toolCallId = toolCall.id;

      callbacks?.onToolComplete?.(toolCall, execResult);

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolCall.id,
        content: execResult.output,
        is_error: execResult.isError,
      });
    }

    // Add tool results as user message
    conversation.push({ role: 'user', content: toolResults });

    // Track the last text for partial results
    const turnText = textBlocks.map((b) => b.text).join('');
    if (turnText) {
      lastTextContent = redactText(turnText, policy.redact);
    }
  }

  return {
    content: lastTextContent,
    turnCount,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd,
    aborted: false,
  };
}
