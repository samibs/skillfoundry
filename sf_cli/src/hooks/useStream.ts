import { useState, useCallback, useRef } from 'react';
import { createProvider } from '../core/provider.js';
import type { ProviderAdapter } from '../types.js';
import { redactText } from '../core/redact.js';
import { ALL_TOOLS } from '../core/tools.js';
import { allowAlways, allowToolAlways } from '../core/permissions.js';
import { classifyIntent } from '../core/intent.js';
import { getAgentTools, getAgentSystemPrompt } from '../core/agent-registry.js';
import { routeToAgent } from '../core/team-router.js';
import type { RoutingResult } from '../core/team-router.js';
import type { TeamDefinitionRef } from '../types.js';
import { checkBudget, recordUsage, loadUsage } from '../core/budget.js';
import type { UsageData } from '../core/budget.js';
import { streamWithRetry } from '../core/retry.js';
import { runAgentLoop } from '../core/ai-runner.js';
import type {
  SfConfig,
  SfPolicy,
  Message,
  PermissionMode,
  AnthropicMessage,
  ActiveToolExecution,
  ToolCall,
  RunnerCallbacks,
} from '../types.js';
import type { PermissionResponse } from '../components/PermissionPrompt.js';

const MAX_TOOL_TURNS = 25;

export function useStream(
  config: SfConfig,
  policy: SfPolicy,
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => Message,
  workDir: string = process.cwd(),
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

  // Streaming metadata: exposed to UI for real-time display
  const [streamingAgent, setStreamingAgent] = useState<string | null>(null);
  const [streamingTurnCount, setStreamingTurnCount] = useState(0);
  const [sessionInputTokens, setSessionInputTokens] = useState(0);
  const [sessionOutputTokens, setSessionOutputTokens] = useState(0);
  const abortRef = useRef(false);
  const permissionModeRef = useRef<PermissionMode>('auto');

  // Provider singleton: avoid SDK reinstantiation per message
  const providerRef = useRef<{ name: string; instance: ProviderAdapter } | null>(null);
  const fallbackProviderRef = useRef<{ name: string; instance: ProviderAdapter } | null>(null);

  // In-memory budget cache: avoid readFileSync on every checkBudget call
  const budgetCacheRef = useRef<UsageData | null>(null);

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
    async (userMessage: string, history: Message[], permissionMode?: PermissionMode, activeAgent?: string | null, activeTeam?: TeamDefinitionRef | null) => {
      setIsStreaming(true);
      setStreamContent('');
      setThinkingContent('');
      setActiveTools([]);
      setStreamingAgent(null);
      setStreamingTurnCount(0);
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
        // Load budget cache from disk once per session, reuse in-memory afterward
        if (!budgetCacheRef.current) {
          budgetCacheRef.current = loadUsage(workDir);
        }

        // Budget enforcement: block if monthly or run budget exceeded
        const budgetCheck = checkBudget(
          workDir,
          config.monthly_budget_usd,
          config.run_budget_usd,
          0,
          budgetCacheRef.current,
        );
        if (!budgetCheck.allowed) {
          addMessage({
            role: 'system',
            content: `Budget exceeded: ${budgetCheck.reason}\n\nMonthly: $${budgetCheck.monthlySpend.toFixed(4)} / $${budgetCheck.monthlyBudget.toFixed(2)}\nUse /cost to view details or adjust budget in .skillfoundry/config.toml.`,
          });
          setIsStreaming(false);
          return;
        }

        // Provider singleton: reuse existing instance if same provider name
        if (!providerRef.current || providerRef.current.name !== config.provider) {
          providerRef.current = { name: config.provider, instance: createProvider(config.provider) };
        }
        const provider = providerRef.current.instance;

        const fbName = config.fallback_provider || '';
        if (fbName && (!fallbackProviderRef.current || fallbackProviderRef.current.name !== fbName)) {
          fallbackProviderRef.current = { name: fbName, instance: createProvider(fbName) };
        }
        const fallbackProvider = fbName ? fallbackProviderRef.current!.instance : null;

        // Resolve per-agent tools and system prompt (team routing > single agent > default)
        let resolvedAgent: string | null = activeAgent || null;
        let routingResult: RoutingResult | null = null;

        if (!resolvedAgent && activeTeam) {
          routingResult = routeToAgent(userMessage, activeTeam.members, activeTeam.defaultAgent);
          resolvedAgent = routingResult.agent;
        }

        const agentTools = resolvedAgent ? getAgentTools(resolvedAgent) : ALL_TOOLS;
        const agentPrompt = resolvedAgent ? getAgentSystemPrompt(resolvedAgent) : undefined;

        // Expose active agent to UI for streaming label
        setStreamingAgent(resolvedAgent);

        // Cost optimization: classify intent to decide whether tools are needed.
        // Simple chat ("ping", "explain X") skips tool definitions, saving ~350 tokens.
        // NONE-category agents always use the chat path (0 tools).
        const intent = agentTools.length === 0 ? 'chat' : classifyIntent(userMessage);

        if (intent === 'chat') {
          let accumulated = '';
          const simpleMessages = anthropicMessages.map((m) => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : '',
          }));

          const streamResult = await streamWithRetry(
            async (p) => p.stream(
              simpleMessages,
              { model: config.model, systemPrompt: agentPrompt },
              (chunk: string, done: boolean) => {
                if (abortRef.current) return;
                if (!done) {
                  accumulated += chunk;
                  const redacted = redactText(accumulated, policy.redact);
                  setStreamContent(redacted);
                }
              },
            ),
            provider,
            fallbackProvider,
          );

          const redactedFinal = redactText(accumulated, policy.redact);

          // Record usage for budget tracking and update in-memory cache
          budgetCacheRef.current = recordUsage(workDir, {
            provider: streamResult.fallbackUsed || config.provider,
            model: config.model,
            inputTokens: streamResult.result.inputTokens,
            outputTokens: streamResult.result.outputTokens,
            costUsd: streamResult.result.costUsd,
          });

          // Update session token totals for UI
          setSessionInputTokens((prev) => prev + streamResult.result.inputTokens);
          setSessionOutputTokens((prev) => prev + streamResult.result.outputTokens);

          addMessage({
            role: 'assistant',
            content: redactedFinal,
            metadata: {
              provider: streamResult.fallbackUsed || config.provider,
              model: config.model,
              inputTokens: streamResult.result.inputTokens,
              outputTokens: streamResult.result.outputTokens,
              costUsd: streamResult.result.costUsd,
              thinkingContent: streamResult.result.thinkingContent,
              mode: 'chat',
              activeAgent: resolvedAgent || undefined,
              routedAgent: routingResult?.agent,
              routingConfidence: routingResult?.confidence,
              activeTeam: activeTeam?.name,
              fallbackUsed: streamResult.fallbackUsed,
            },
          });

          setStreamContent('');
          setThinkingContent('');
          setStreamingAgent(null);
          setIsStreaming(false);
          return;
        }

        // Agent mode: delegate to standalone agentic loop
        const runnerCallbacks: RunnerCallbacks = {
          onStreamChunk: (chunk) => {
            if (!abortRef.current) setStreamContent(chunk);
          },
          onToolStart: (toolCall) => {
            setActiveTools((prev) => [
              ...prev,
              { toolCall, isExecuting: true, permissionPending: false },
            ]);
          },
          onToolComplete: (toolCall, result) => {
            setActiveTools((prev) =>
              prev.map((t) =>
                t.toolCall.id === toolCall.id
                  ? { ...t, result, isExecuting: false, permissionPending: false }
                  : t,
              ),
            );
          },
          onTurnComplete: (turn, tokens) => {
            setStreamingTurnCount(turn);
            setSessionInputTokens((prev) => prev + tokens.input);
            setSessionOutputTokens((prev) => prev + tokens.output);
            setStreamContent('');
          },
          requestPermission: async (toolCall, reason) => {
            // Set permission pending in UI
            setActiveTools((prev) =>
              prev.map((t) =>
                t.toolCall.id === toolCall.id
                  ? { ...t, permissionPending: true, isExecuting: false }
                  : t,
              ),
            );

            const response = await requestPermission(toolCall, reason);

            if (response === 'always-allow') {
              allowAlways(toolCall);
            } else if (response === 'always-allow-tool') {
              allowToolAlways(toolCall.name);
            }

            // Update UI after permission decision
            setActiveTools((prev) =>
              prev.map((t) =>
                t.toolCall.id === toolCall.id
                  ? { ...t, permissionPending: false, isExecuting: response !== 'deny' }
                  : t,
              ),
            );

            return response === 'deny' ? 'deny' : 'allow';
          },
        };

        const runnerResult = await runAgentLoop(
          anthropicMessages,
          {
            config,
            policy,
            systemPrompt: agentPrompt,
            tools: agentTools,
            maxTurns: MAX_TOOL_TURNS,
            workDir,
            abortSignal: { get aborted() { return abortRef.current; } },
          },
          runnerCallbacks,
        );

        if (runnerResult.content) {
          addMessage({
            role: 'assistant',
            content: runnerResult.content,
            metadata: {
              provider: config.provider,
              model: config.model,
              inputTokens: runnerResult.totalInputTokens,
              outputTokens: runnerResult.totalOutputTokens,
              costUsd: runnerResult.totalCostUsd,
              mode: 'agent',
              activeAgent: resolvedAgent || undefined,
              routedAgent: routingResult?.agent,
              routingConfidence: routingResult?.confidence,
              activeTeam: activeTeam?.name,
            },
          });
        }

        setStreamContent('');
        setThinkingContent('');
        setStreamingAgent(null);
        setStreamingTurnCount(0);
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
    streamingAgent,
    streamingTurnCount,
    sessionInputTokens,
    sessionOutputTokens,
  };
}
