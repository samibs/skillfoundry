/**
 * Cost Router — dispatches tasks to the appropriate model tier.
 *
 * Haiku:  fast + cheap — grep, file search, simple transforms, summaries
 * Sonnet: balanced    — code generation, test writing, documentation
 * Opus:   powerful    — architecture decisions, complex debugging, review, PRD analysis
 *
 * Pricing (approximate, per 1M tokens):
 *   Haiku:  $0.25 input / $1.25 output
 *   Sonnet: $3 input / $15 output
 *   Opus:   $15 input / $75 output
 *
 * Default routing is by task category. Per-agent overrides take precedence.
 */

export type ModelTier = "haiku" | "sonnet" | "opus";

export interface ModelConfig {
  modelId: string;
  tier: ModelTier;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

export const MODELS: Record<ModelTier, ModelConfig> = {
  haiku: {
    modelId: "claude-haiku-4-5-20251001",
    tier: "haiku",
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.25,
  },
  sonnet: {
    modelId: "claude-sonnet-4-6",
    tier: "sonnet",
    inputCostPer1M: 3,
    outputCostPer1M: 15,
  },
  opus: {
    modelId: "claude-opus-4-6",
    tier: "opus",
    inputCostPer1M: 15,
    outputCostPer1M: 75,
  },
};

// ─── Task Category → Model Tier Mapping ─────────────────────────────────────

export type TaskCategory =
  | "search"       // grep, file discovery, pattern matching
  | "transform"    // simple code transforms, formatting
  | "summarize"    // text summarization, extraction
  | "generate"     // code generation, test writing
  | "document"     // documentation, comments, READMEs
  | "review"       // code review, PR review
  | "architect"    // architecture decisions, system design
  | "debug"        // complex debugging, root cause analysis
  | "security"     // security audit, threat modeling
  | "prd"          // PRD creation, analysis
  | "orchestrate"; // pipeline orchestration, multi-step planning

const CATEGORY_ROUTING: Record<TaskCategory, ModelTier> = {
  search: "haiku",
  transform: "haiku",
  summarize: "haiku",
  generate: "sonnet",
  document: "sonnet",
  review: "opus",
  architect: "opus",
  debug: "opus",
  security: "sonnet",
  prd: "opus",
  orchestrate: "opus",
};

// ─── Agent → Category Mapping ───────────────────────────────────────────────

const AGENT_CATEGORY: Record<string, TaskCategory> = {
  // LLM skill agents
  forge: "orchestrate",
  go: "orchestrate",
  goma: "orchestrate",
  architect: "architect",
  coder: "generate",
  tester: "generate",
  reviewer: "review",
  review: "review",
  security: "security",
  prd: "prd",
  docs: "document",
  debugger: "debug",
  debug: "debug",
  fixer: "debug",
  evaluator: "review",
  stories: "generate",
  layer_check: "review",
  certify: "review",
  refactor: "generate",
  performance: "review",
  migration: "generate",
  anvil: "review",
  gate_keeper: "review",
  // Search/utility
  recall: "search",
  context: "search",
  agent_index: "search",
  analytics: "summarize",
  metrics: "summarize",
  status: "summarize",
  health: "search",
  cost: "summarize",
  explain: "summarize",
  clean: "transform",
};

// ─── Per-Agent Overrides ────────────────────────────────────────────────────

const AGENT_OVERRIDES: Record<string, ModelTier> = {
  // Always use Opus for orchestration — these make architectural decisions
  forge: "opus",
  go: "opus",
  goma: "opus",
  // Always use Haiku for simple utilities
  health: "haiku",
  status: "haiku",
  version: "haiku",
};

// ─── Token Tracking ─────────────────────────────────────────────────────────

interface TokenSpend {
  tier: ModelTier;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

const spendLog: TokenSpend[] = [];
let dailyBudget = Infinity;

/**
 * Set a daily budget cap (in dollars).
 */
export function setDailyBudget(budget: number): void {
  dailyBudget = budget;
}

/**
 * Get total spend for today.
 */
export function getTodaySpend(): { total: number; byTier: Record<ModelTier, number> } {
  const byTier: Record<ModelTier, number> = { haiku: 0, sonnet: 0, opus: 0 };
  let total = 0;
  for (const entry of spendLog) {
    byTier[entry.tier] += entry.cost;
    total += entry.cost;
  }
  return { total, byTier };
}

/**
 * Check if we're within budget.
 */
export function isWithinBudget(): boolean {
  return getTodaySpend().total < dailyBudget;
}

/**
 * Record token usage.
 */
export function recordSpend(
  tier: ModelTier,
  inputTokens: number,
  outputTokens: number
): TokenSpend {
  const model = MODELS[tier];
  const cost =
    (inputTokens / 1_000_000) * model.inputCostPer1M +
    (outputTokens / 1_000_000) * model.outputCostPer1M;

  const entry: TokenSpend = { tier, inputTokens, outputTokens, cost };
  spendLog.push(entry);
  return entry;
}

// ─── Routing Logic ──────────────────────────────────────────────────────────

export interface RoutingDecision {
  agentName: string;
  tier: ModelTier;
  modelId: string;
  reason: string;
  estimatedCostPer1KTokens: number;
}

/**
 * Determine which model tier to use for a given agent.
 */
export function routeAgent(agentName: string): RoutingDecision {
  // 1. Check per-agent override
  if (AGENT_OVERRIDES[agentName]) {
    const tier = AGENT_OVERRIDES[agentName];
    return {
      agentName,
      tier,
      modelId: MODELS[tier].modelId,
      reason: `Agent override: ${agentName} always uses ${tier}`,
      estimatedCostPer1KTokens: MODELS[tier].inputCostPer1M / 1000,
    };
  }

  // 2. Check agent → category mapping
  const category = AGENT_CATEGORY[agentName];
  if (category) {
    const tier = CATEGORY_ROUTING[category];
    return {
      agentName,
      tier,
      modelId: MODELS[tier].modelId,
      reason: `Category routing: ${agentName} → ${category} → ${tier}`,
      estimatedCostPer1KTokens: MODELS[tier].inputCostPer1M / 1000,
    };
  }

  // 3. Default: Sonnet (balanced cost/capability)
  return {
    agentName,
    tier: "sonnet",
    modelId: MODELS.sonnet.modelId,
    reason: `Default routing: unknown agent ${agentName} → sonnet`,
    estimatedCostPer1KTokens: MODELS.sonnet.inputCostPer1M / 1000,
  };
}

/**
 * Route by explicit task category (when agent name is unknown).
 */
export function routeByCategory(category: TaskCategory): RoutingDecision {
  const tier = CATEGORY_ROUTING[category];
  return {
    agentName: `[${category}]`,
    tier,
    modelId: MODELS[tier].modelId,
    reason: `Direct category routing: ${category} → ${tier}`,
    estimatedCostPer1KTokens: MODELS[tier].inputCostPer1M / 1000,
  };
}

/**
 * Get routing table for all known agents.
 */
export function getRoutingTable(): RoutingDecision[] {
  const agents = new Set([
    ...Object.keys(AGENT_CATEGORY),
    ...Object.keys(AGENT_OVERRIDES),
  ]);

  return Array.from(agents)
    .sort()
    .map(routeAgent);
}
