import type { AnthropicMessage, RunnerCallbacks, RunnerOptions, RunnerResult } from '../types.js';
/**
 * Run a multi-turn agentic loop: send messages to an AI provider,
 * execute tool calls, feed results back, and repeat until the AI
 * stops requesting tools or the turn limit is reached.
 *
 * This is the core engine that powers both interactive chat (via useStream)
 * and batch pipeline execution (via pipeline.ts / forge).
 */
export declare function runAgentLoop(messages: AnthropicMessage[], options: RunnerOptions, callbacks?: RunnerCallbacks): Promise<RunnerResult>;
