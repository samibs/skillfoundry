import React, { useCallback } from 'react';
import { Box, useApp } from 'ink';
import { Header } from './components/Header.js';
import { MessageList } from './components/MessageList.js';
import { StreamingMessage } from './components/StreamingMessage.js';
import { Input } from './components/Input.js';
import { StatusBar } from './components/StatusBar.js';
import { useSession } from './hooks/useSession.js';
import { useStream } from './hooks/useStream.js';
import {
  parseSlashCommand,
  getCommand,
  initCommands,
} from './commands/index.js';

initCommands();

interface AppProps {
  workDir: string;
}

export function App({ workDir }: AppProps) {
  const { exit } = useApp();
  const {
    messages,
    config,
    policy,
    state,
    permissionMode,
    addMessage,
    sessionContext,
  } = useSession(workDir);

  const { isStreaming, streamContent, thinkingContent, sendMessage } =
    useStream(config, policy, addMessage);

  const sessionCost = messages
    .filter((m) => m.metadata?.costUsd)
    .reduce((sum, m) => sum + (m.metadata!.costUsd || 0), 0);

  const handleSubmit = useCallback(
    async (input: string) => {
      const parsed = parseSlashCommand(input);
      if (parsed) {
        if (parsed.name === 'exit' || parsed.name === 'quit') {
          exit();
          return;
        }
        const cmd = getCommand(parsed.name);
        if (cmd) {
          const result = await cmd.execute(parsed.args, sessionContext);
          if (result) {
            addMessage({ role: 'system', content: result });
          }
          return;
        }
        addMessage({
          role: 'system',
          content: `Unknown command: /${parsed.name}. Type /help for available commands.`,
        });
        return;
      }

      await sendMessage(input, messages);
    },
    [messages, sendMessage, addMessage, sessionContext, exit],
  );

  return (
    <Box flexDirection="column">
      <Header
        provider={config.provider}
        model={config.model}
        costSession={sessionCost}
        budgetMonthly={config.monthly_budget_usd}
        messageCount={messages.length}
        state={state.current_state}
      />
      <Box flexDirection="column" paddingX={1} marginY={1}>
        <MessageList messages={messages} />
        {isStreaming && (
          <StreamingMessage
            content={streamContent}
            isStreaming={isStreaming}
            thinkingContent={thinkingContent}
          />
        )}
      </Box>
      <Input onSubmit={handleSubmit} isDisabled={isStreaming} />
      <StatusBar
        provider={config.provider}
        permissionMode={permissionMode}
        isStreaming={isStreaming}
      />
    </Box>
  );
}
