import { jsx as _jsx } from "react/jsx-runtime";
import { Box } from 'ink';
import { Message } from './Message.js';
export function MessageList({ messages }) {
    // Show the last 50 messages to avoid terminal overflow
    const visible = messages.slice(-50);
    return (_jsx(Box, { flexDirection: "column", flexGrow: 1, children: visible.map((msg) => (_jsx(Message, { message: msg }, msg.id))) }));
}
//# sourceMappingURL=MessageList.js.map