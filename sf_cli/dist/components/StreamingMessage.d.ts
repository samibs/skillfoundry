interface StreamingMessageProps {
    content: string;
    isStreaming: boolean;
    thinkingContent?: string;
    showThinking?: boolean;
    agentName?: string | null;
    turnCount?: number;
    sessionInputTokens?: number;
    sessionOutputTokens?: number;
}
export declare function StreamingMessage({ content, isStreaming, thinkingContent, showThinking, agentName, turnCount, sessionInputTokens, sessionOutputTokens, }: StreamingMessageProps): import("react/jsx-runtime").JSX.Element;
export {};
