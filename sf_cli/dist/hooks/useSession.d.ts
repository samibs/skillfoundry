import type { Message, SfConfig, SfPolicy, SfState, SessionContext, PermissionMode, TeamDefinitionRef } from '../types.js';
export declare function useSession(workDir: string): {
    messages: Message[];
    config: SfConfig;
    policy: SfPolicy;
    state: SfState;
    permissionMode: PermissionMode;
    activeAgent: string | null;
    activeTeam: TeamDefinitionRef | null;
    addMessage: (msg: Omit<Message, "id" | "timestamp">) => Message;
    updateSessionState: (updates: Partial<SfState>) => void;
    setActiveAgent: (name: string | null) => void;
    setActiveTeam: (team: TeamDefinitionRef | null) => void;
    sessionContext: SessionContext;
};
