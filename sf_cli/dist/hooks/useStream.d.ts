import type { TeamDefinitionRef } from '../types.js';
import type { SfConfig, SfPolicy, Message, PermissionMode, ActiveToolExecution, ToolCall } from '../types.js';
import type { PermissionResponse } from '../components/PermissionPrompt.js';
export declare function useStream(config: SfConfig, policy: SfPolicy, addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => Message, workDir?: string): {
    isStreaming: boolean;
    streamContent: string;
    thinkingContent: string;
    activeTools: ActiveToolExecution[];
    pendingPermission: {
        toolCall: ToolCall;
        reason: string;
        resolve: (response: PermissionResponse) => void;
    } | null;
    sendMessage: (userMessage: string, history: Message[], permissionMode?: PermissionMode, activeAgent?: string | null, activeTeam?: TeamDefinitionRef | null) => Promise<void>;
    abort: () => void;
    handlePermissionResponse: (response: PermissionResponse) => void;
    setPermissionMode: (mode: PermissionMode) => void;
    streamingAgent: string | null;
    streamingTurnCount: number;
    sessionInputTokens: number;
    sessionOutputTokens: number;
};
