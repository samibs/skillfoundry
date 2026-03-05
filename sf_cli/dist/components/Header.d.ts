interface HeaderProps {
    provider: string;
    model: string;
    costSession: number;
    budgetMonthly: number;
    messageCount: number;
    state: string;
    activeAgent?: string | null;
    activeTeam?: {
        name: string;
        members: string[];
    } | null;
    sessionInputTokens?: number;
    sessionOutputTokens?: number;
}
export declare function Header({ provider, model, costSession, budgetMonthly, messageCount, state, activeAgent, activeTeam, sessionInputTokens, sessionOutputTokens, }: HeaderProps): import("react/jsx-runtime").JSX.Element;
export {};
