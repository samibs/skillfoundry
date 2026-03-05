export interface UsageEntry {
    timestamp: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    runId?: string;
}
export interface UsageData {
    version: string;
    entries: UsageEntry[];
    monthlyTotals: Record<string, number>;
}
export declare function loadUsage(workDir: string): UsageData;
export declare function saveUsage(workDir: string, usage: UsageData): void;
export declare function recordUsage(workDir: string, entry: Omit<UsageEntry, 'timestamp'>): UsageData;
export interface BudgetCheck {
    allowed: boolean;
    reason: string;
    monthlySpend: number;
    monthlyBudget: number;
    runSpend: number;
    runBudget: number;
}
export declare function checkBudget(workDir: string, monthlyBudget: number, runBudget: number, currentRunCost?: number, cachedUsage?: UsageData): BudgetCheck;
export declare function getUsageSummary(workDir: string): {
    monthlySpend: number;
    todaySpend: number;
    totalEntries: number;
    byProvider: Record<string, {
        count: number;
        cost: number;
        tokens: number;
    }>;
    last5: UsageEntry[];
};
