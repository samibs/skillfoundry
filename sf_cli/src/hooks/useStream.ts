import { useState, useCallback, useRef } from 'react';
import { createProvider } from '../core/provider.js';
import { redactText } from '../core/redact.js';
import type { SfConfig, SfPolicy, Message } from '../types.js';

export function useStream(
  config: SfConfig,
  policy: SfPolicy,
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => Message,
) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [thinkingContent, setThinkingContent] = useState('');
  const abortRef = useRef(false);

  const sendMessage = useCallback(
    async (userMessage: string, history: Message[]) => {
      setIsStreaming(true);
      setStreamContent('');
      setThinkingContent('');
      abortRef.current = false;

      addMessage({ role: 'user', content: userMessage });

      const providerMessages = [
        ...history
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ];

      try {
        const provider = createProvider(config.provider);
        let accumulated = '';

        const result = await provider.stream(
          providerMessages,
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

        const finalContent = redactText(accumulated, policy.redact);
        addMessage({
          role: 'assistant',
          content: finalContent,
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
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        addMessage({
          role: 'system',
          content: `Provider error: ${message}`,
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [config, policy, addMessage],
  );

  const abort = useCallback(() => {
    abortRef.current = true;
    setIsStreaming(false);
  }, []);

  return { isStreaming, streamContent, thinkingContent, sendMessage, abort };
}
