import { useState, useCallback, useRef } from 'react';
import { createProvider } from '../core/provider.js';
import { redactText } from '../core/redact.js';
import { ALL_TOOLS } from '../core/tools.js';
import { executeTool } from '../core/executor.js';
import { checkPermission, allowAlways, allowToolAlways } from '../core/permissions.js';
import { classifyIntent } from '../core/intent.js';
import type {
  SfConfig,
  SfPolicy,
  Message,
  PermissionMode,
  AnthropicMessage,
  AnthropicContentBlock,
  ActiveToolExecution,
  ToolCall,
} from '../types.js';
import type { PermissionResponse } from '../components/PermissionPrompt.js';

const MAX_TOOL_TURNS = 25;

export function useStream(
  config: SfConfig,
  policy: SfPolicy,
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => Message,
) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [thinkingContent, setThinkingContent] = useState('');
  const [activeTools, setActiveTools] = useState<ActiveToolExecution[]>([]);
  const [pendingPermission, setPendingPermission] = useState<{
    toolCall: ToolCall;
    reason: string;
    resolve: (response: PermissionResponse) => void;
  } | null>(null);
  const abortRef = useRef(false);
  const permissionModeRef = useRef<PermissionMode>('auto');

  const setPermissionMode = useCallback((mode: PermissionMode) => {
    permissionModeRef.current = mode;
  }, []);

  const handlePermissionResponse = useCallback(
    (response: PermissionResponse) => {
      if (pendingPermission) {
        pendingPermission.resolve(response);
        setPendingPermission(null);
      }
    },
    [pendingPermission],
  );

  const requestPermission = useCallback(
    (toolCall: ToolCall, reason: string): Promise<PermissionResponse> => {
      return new Promise((resolve) => {
        setPendingPermission({ toolCall, reason, resolve });
      });
    },
    [],
  );

  const sendMessage = useCallback(
    async (userMessage: string, history: Message[], permissionMode?: PermissionMode) => {
      setIsStreaming(true);
      setStreamContent('');
      setThinkingContent('');
      setActiveTools([]);
      abortRef.current = false;

      if (permissionMode) {
        permissionModeRef.current = permissionMode;
      }

      addMessage({ role: 'user', content: userMessage });

      // Build Anthropic messages from history for tool-enabled conversation
      const anthropicMessages: AnthropicMessage[] = [
        ...history
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        { role: 'user', content: userMessage },
      ];

      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCostUsd = 0;

      try {
        const provider = createProvider(config.provider);

        // Cost optimization: classify intent to decide whether tools are needed.
        // Simple chat ("ping", "explain X") skips tool definitions, saving ~350 tokens.
        const intent = classifyIntent(userMessage);

        if (intent === 'chat') {
          let accumulated = '';
          const simpleMessages = anthropicMessages.map((m) => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : '',
          }));

          const result = await provider.stream(
            simpleMessages,
            { model: config.model },
            (chunk: string, done: boolean) => {
              if (abortRef.current) return;
              if (!done) {
                accumulated += chunk;
                const redacted = redactText(accumulated, policy.redact);
                setStreamContent(redacted);
              }
            },
          );

          const redactedFinal = redactText(accumulated, policy.redact);
          addMessage({
            role: 'assistant',
            content: redactedFinal,
            metadata: {
              provider: config.provider,
              model: config.model,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              costUsd: result.costUsd,
              thinkingContent: result.thinkingContent,
            },
          });

          setStreamContent('');
          setThinkingContent('');
          setIsStreaming(false);
          return;
        }

        // Agent mode: full tool loop
        let turnCount = 0;

        // Agentic loop: keep sending until no more tool_use or max turns reached
        while (turnCount < MAX_TOOL_TURNS) {
          if (abortRef.current) break;
          turnCount++;

          let accumulated = '';

          const result = await provider.streamWithTools(
            anthropicMessages,
            {
              model: config.model,
              tools: ALL_TOOLS,
            },
            (chunk: string, done: boolean) => {
              if (abortRef.current) return;
              if (!done) {
                accumulated += chunk;
                const redacted = redactText(accumulated, policy.redact);
                setStreamContent(redacted);
              }
            },
          );

          totalInputTokens += result.inputTokens;
          totalOutputTokens += result.outputTokens;
          totalCostUsd += result.costUsd;

          if (result.thinkingContent) {
            setThinkingContent(result.thinkingContent);
          }

          // Check if response contains tool_use blocks
          const toolUseBlocks = result.content.filter((b) => b.type === 'tool_use');
          const textBlocks = result.content.filter((b) => b.type === 'text');

          if (toolUseBlocks.length === 0 || result.stopReason !== 'tool_use') {
            // No tool calls — final response
            const finalText = textBlocks.map((b) => b.text).join('');
            const redactedFinal = redactText(finalText, policy.redact);

            addMessage({
              role: 'assistant',
              content: redactedFinal,
              metadata: {
                provider: config.provider,
                model: config.model,
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                costUsd: totalCostUsd,
                thinkingContent: result.thinkingContent,
              },
            });
            break;
          }

          // Build the assistant content blocks for the conversation
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

          // Add assistant message with tool_use to the conversation
          anthropicMessages.push({
            role: 'assistant',
            content: assistantContent,
          });

          // Execute each tool call
          const toolResults: AnthropicContentBlock[] = [];

          for (const block of toolUseBlocks) {
            if (abortRef.current) break;

            const toolCall: ToolCall = {
              id: block.id!,
              name: block.name!,
              input: block.input!,
            };

            // Set tool as executing in UI
            setActiveTools((prev) => [
              ...prev,
              { toolCall, isExecuting: true, permissionPending: false },
            ]);

            // Check permissions
            const permission = checkPermission(
              toolCall,
              policy,
              permissionModeRef.current,
            );

            if (permission.decision === 'deny') {
              const denyResult = {
                toolCallId: toolCall.id,
                output: `Permission denied: ${permission.reason}`,
                isError: true,
              };

              setActiveTools((prev) =>
                prev.map((t) =>
                  t.toolCall.id === toolCall.id
                    ? { ...t, result: denyResult, isExecuting: false }
                    : t,
                ),
              );

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: denyResult.output,
                is_error: true,
              });
              continue;
            }

            if (permission.decision === 'ask') {
              // Set permission pending in UI
              setActiveTools((prev) =>
                prev.map((t) =>
                  t.toolCall.id === toolCall.id
                    ? { ...t, permissionPending: true, isExecuting: false }
                    : t,
                ),
              );

              const response = await requestPermission(toolCall, permission.reason);

              if (response === 'deny') {
                const denyResult = {
                  toolCallId: toolCall.id,
                  output: 'User denied permission',
                  isError: true,
                };

                setActiveTools((prev) =>
                  prev.map((t) =>
                    t.toolCall.id === toolCall.id
                      ? { ...t, result: denyResult, isExecuting: false, permissionPending: false }
                      : t,
                  ),
                );

                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: toolCall.id,
                  content: denyResult.output,
                  is_error: true,
                });
                continue;
              }

              if (response === 'always-allow') {
                allowAlways(toolCall);
              } else if (response === 'always-allow-tool') {
                allowToolAlways(toolCall.name);
              }

              // Permission granted — continue to execution
              setActiveTools((prev) =>
                prev.map((t) =>
                  t.toolCall.id === toolCall.id
                    ? { ...t, permissionPending: false, isExecuting: true }
                    : t,
                ),
              );
            }

            // Execute the tool
            const execResult = executeTool(toolCall.name, toolCall.input, {
              workDir: config.provider ? process.cwd() : process.cwd(),
              policy,
            });
            execResult.toolCallId = toolCall.id;

            // Update UI with result
            setActiveTools((prev) =>
              prev.map((t) =>
                t.toolCall.id === toolCall.id
                  ? { ...t, result: execResult, isExecuting: false }
                  : t,
              ),
            );

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: execResult.output,
              is_error: execResult.isError,
            });
          }

          // Add tool results as a user message
          anthropicMessages.push({
            role: 'user',
            content: toolResults,
          });

          // Reset stream content for next turn
          setStreamContent('');
        }

        setStreamContent('');
        setThinkingContent('');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const isAuthError =
          /authentication|api.key|unauthorized|401|auth_token|could not resolve/i.test(
            message,
          );

        let content = `Provider error: ${message}`;
        if (isAuthError) {
          content +=
            '\n\nTo configure API keys, run:\n' +
            '  sf setup --provider <name> --key <your-key>\n' +
            'Or use /setup inside this session.';
        }

        addMessage({
          role: 'system',
          content,
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [config, policy, addMessage, requestPermission],
  );

  const abort = useCallback(() => {
    abortRef.current = true;
    setIsStreaming(false);
    setPendingPermission(null);
  }, []);

  return {
    isStreaming,
    streamContent,
    thinkingContent,
    activeTools,
    pendingPermission,
    sendMessage,
    abort,
    handlePermissionResponse,
    setPermissionMode,
  };
}
