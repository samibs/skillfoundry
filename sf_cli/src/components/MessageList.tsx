import React from 'react';
import { Box } from 'ink';
import type { Message as MessageType } from '../types.js';
import { Message } from './Message.js';

interface MessageListProps {
  messages: MessageType[];
}

export function MessageList({ messages }: MessageListProps) {
  // Show the last 50 messages to avoid terminal overflow
  const visible = messages.slice(-50);
  return (
    <Box flexDirection="column" flexGrow={1}>
      {visible.map((msg) => (
        <Message key={msg.id} message={msg} />
      ))}
    </Box>
  );
}
