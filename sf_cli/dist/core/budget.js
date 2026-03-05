// Budget enforcement — tracks cumulative cost, enforces per-run and monthly caps.
// Persists usage data to .skillfoundry/usage.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const USAGE_FILE = join('.skillfoundry', 'usage.json');
function defaultUsage() {
    return { version: '1.0', entries: [], monthlyTotals: {} };
}
function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
export function loadUsage(workDir) {
    const path = join(workDir, USAGE_FILE);
    if (!existsSync(path)) {
        return defaultUsage();
    }
    try {
        return JSON.parse(readFileSync(path, 'utf-8'));
    }
    catch {
        return defaultUsage();
    }
}
export function saveUsage(workDir, usage) {
    const dir = join(workDir, '.skillfoundry');
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(join(workDir, USAGE_FILE), JSON.stringify(usage, null, 2));
}
export function recordUsage(workDir, entry) {
    const usage = loadUsage(workDir);
    const fullEntry = {
        ...entry,
        timestamp: new Date().toISOString(),
    };
    usage.entries.push(fullEntry);
    // Update monthly total
    const monthKey = currentMonthKey();
    usage.monthlyTotals[monthKey] = (usage.monthlyTotals[monthKey] || 0) + entry.costUsd;
    saveUsage(workDir, usage);
    return usage;
}
export function checkBudget(workDir, monthlyBudget, runBudget, currentRunCost = 0, cachedUsage) {
    const usage = cachedUsage || loadUsage(workDir);
    const monthKey = currentMonthKey();
    const monthlySpend = usage.monthlyTotals[monthKey] || 0;
    if (monthlySpend >= monthlyBudget) {
        return {
            allowed: false,
            reason: `Monthly budget exceeded: $${monthlySpend.toFixed(2)} / $${monthlyBudget.toFixed(2)}`,
            monthlySpend,
            monthlyBudget,
            runSpend: currentRunCost,
            runBudget,
        };
    }
    if (currentRunCost >= runBudget) {
        return {
            allowed: false,
            reason: `Run budget exceeded: $${currentRunCost.toFixed(4)} / $${runBudget.toFixed(2)}`,
            monthlySpend,
            monthlyBudget,
            runSpend: currentRunCost,
            runBudget,
        };
    }
    return {
        allowed: true,
        reason: 'Within budget',
        monthlySpend,
        monthlyBudget,
        runSpend: currentRunCost,
        runBudget,
    };
}
export function getUsageSummary(workDir) {
    const usage = loadUsage(workDir);
    const monthKey = currentMonthKey();
    const monthlySpend = usage.monthlyTotals[monthKey] || 0;
    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySpend = usage.entries
        .filter((e) => e.timestamp.startsWith(todayStr))
        .reduce((sum, e) => sum + e.costUsd, 0);
    const byProvider = {};
    for (const entry of usage.entries) {
        if (!byProvider[entry.provider]) {
            byProvider[entry.provider] = { count: 0, cost: 0, tokens: 0 };
        }
        byProvider[entry.provider].count++;
        byProvider[entry.provider].cost += entry.costUsd;
        byProvider[entry.provider].tokens += entry.inputTokens + entry.outputTokens;
    }
    const last5 = usage.entries.slice(-5).reverse();
    return { monthlySpend, todaySpend, totalEntries: usage.entries.length, byProvider, last5 };
}
//# sourceMappingURL=budget.js.map