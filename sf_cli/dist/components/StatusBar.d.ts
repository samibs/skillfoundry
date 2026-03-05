interface StatusBarProps {
    provider: string;
    permissionMode: string;
    isStreaming: boolean;
    activeAgent?: string | null;
    activeTeam?: {
        name: string;
    } | null;
    streamingAgent?: string | null;
    streamingTurnCount?: number;
}
export declare function StatusBar({ provider, permissionMode, isStreaming, activeAgent, activeTeam, streamingAgent, streamingTurnCount, }: StatusBarProps): import("react/jsx-runtime").JSX.Element;
export {};
