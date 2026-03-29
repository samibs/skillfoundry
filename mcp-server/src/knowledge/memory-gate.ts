/**
 * Memory Gate — the mechanism that prevents saving wrong "definitive" patterns.
 *
 * Rules:
 * - Tool-verified evidence (Playwright, Semgrep, build log) → confidence: "verified"
 * - LLM reasoning alone → confidence: "observed" (cannot be promoted without evidence)
 * - curl test for auth flows → confidence: "observed" (curl is blind to browser behavior)
 */

export type Confidence = "verified" | "observed";

export type EvidenceSource =
  | "playwright"
  | "semgrep"
  | "build"
  | "unit_test"
  | "integration_test"
  | "curl"
  | "llm_reasoning"
  | "manual";

/**
 * Scope controls knowledge promotion:
 * - "project": stays local to the originating project, never promoted
 * - "universal": eligible for cross-project promotion
 */
export type KnowledgeScope = "project" | "universal";

export interface KnowledgeEntry {
  framework: string;
  versionRange: string;
  quirk: string;
  fix: string;
  confidence: Confidence;
  evidenceSource: EvidenceSource;
  evidenceSummary: string;
  discoveredAt: string;
  discoveredIn?: string;
  scope?: KnowledgeScope;
}

interface GateDecision {
  allowed: boolean;
  confidence: Confidence;
  reason: string;
}

/**
 * Evidence sources that produce "verified" confidence.
 * These are real tool outputs, not LLM opinions.
 */
const VERIFIED_SOURCES: Set<EvidenceSource> = new Set([
  "playwright",
  "semgrep",
  "build",
  "unit_test",
  "integration_test",
]);

/**
 * Evidence sources that only produce "observed" confidence.
 * The agent THINKS it works, but hasn't PROVEN it.
 */
const OBSERVED_SOURCES: Set<EvidenceSource> = new Set([
  "curl",
  "llm_reasoning",
  "manual",
]);

/**
 * Categories where curl is NOT sufficient for verification.
 * These require browser-level (Playwright) evidence.
 */
const BROWSER_REQUIRED_CATEGORIES: Set<string> = new Set([
  "auth",
  "login",
  "session",
  "cookie",
  "csrf",
  "redirect",
  "oauth",
  "sso",
]);

/**
 * Evaluate whether a knowledge entry should be saved and at what confidence level.
 */
export function evaluateEntry(
  entry: Omit<KnowledgeEntry, "confidence">,
  evidenceSource: EvidenceSource
): GateDecision {
  // Rule 1: Tool evidence → verified
  if (VERIFIED_SOURCES.has(evidenceSource)) {
    return {
      allowed: true,
      confidence: "verified",
      reason: `Tool-verified by ${evidenceSource}`,
    };
  }

  // Rule 2: curl for browser-related quirks → observed only
  if (evidenceSource === "curl") {
    const isBrowserCategory = BROWSER_REQUIRED_CATEGORIES.has(
      categorize(entry.quirk)
    );
    if (isBrowserCategory) {
      return {
        allowed: true,
        confidence: "observed",
        reason:
          "curl cannot verify browser behavior (cookies, CSRF, redirects). " +
          "Run Playwright to promote to verified.",
      };
    }
    // curl for non-browser things (API endpoints, health checks) is acceptable
    return {
      allowed: true,
      confidence: "observed",
      reason: "curl evidence — acceptable for API testing but not promoted to verified without tool agent",
    };
  }

  // Rule 3: LLM reasoning → observed only, with warning
  if (evidenceSource === "llm_reasoning") {
    return {
      allowed: true,
      confidence: "observed",
      reason:
        "LLM reasoning only — this pattern has NOT been verified by any tool. " +
        "It may be wrong. Run the appropriate tool agent to promote to verified. " +
        "WARNING: Previous LLM-reasoned patterns were corrected 3 times in one session.",
    };
  }

  // Rule 4: Manual → observed
  return {
    allowed: true,
    confidence: "observed",
    reason: "Manual observation — run tool agent to promote to verified",
  };
}

/**
 * Apply the gate decision to produce a complete entry.
 */
export function applyGate(
  entry: Omit<KnowledgeEntry, "confidence">,
  evidenceSource: EvidenceSource
): { entry: KnowledgeEntry; decision: GateDecision } {
  const decision = evaluateEntry(entry, evidenceSource);
  return {
    entry: { ...entry, confidence: decision.confidence },
    decision,
  };
}

/**
 * Check if an observed entry can be promoted to verified.
 */
export function canPromote(
  entry: KnowledgeEntry,
  newEvidenceSource: EvidenceSource
): GateDecision {
  if (entry.confidence === "verified") {
    return {
      allowed: false,
      confidence: "verified",
      reason: "Already verified — no promotion needed",
    };
  }

  if (!VERIFIED_SOURCES.has(newEvidenceSource)) {
    return {
      allowed: false,
      confidence: "observed",
      reason: `${newEvidenceSource} is not a verifying source. Need: ${Array.from(VERIFIED_SOURCES).join(", ")}`,
    };
  }

  return {
    allowed: true,
    confidence: "verified",
    reason: `Promoted from observed to verified by ${newEvidenceSource}`,
  };
}

/**
 * Categorize a quirk description to determine if browser verification is needed.
 */
function categorize(quirk: string): string {
  const lower = quirk.toLowerCase();
  for (const cat of BROWSER_REQUIRED_CATEGORIES) {
    if (lower.includes(cat)) return cat;
  }
  return "general";
}
