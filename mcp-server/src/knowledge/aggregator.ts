import type { AppScanResult, ForgeLogEntry } from "./scanner.js";
import type { KnowledgeEntry, Confidence } from "./memory-gate.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AggregationResult {
  appsScanned: number;
  appsWithData: number;
  totalForgeLogs: number;
  failurePatterns: FailurePattern[];
  quirkCandidates: KnowledgeEntry[];
  stats: AggregationStats;
}

export interface FailurePattern {
  event: string;
  category: string;
  occurrences: number;
  apps: string[];
  firstSeen: string;
  lastSeen: string;
  sampleData: Record<string, unknown>;
}

interface AggregationStats {
  totalErrors: number;
  totalWarnings: number;
  topEvents: { event: string; count: number }[];
  appsWithFailures: number;
  platformDistribution: Record<string, number>;
}

// ─── Pattern Extraction ─────────────────────────────────────────────────────

/**
 * Known forge log events that indicate actionable failure patterns.
 */
const ACTIONABLE_EVENTS: Record<string, string> = {
  no_tests_after_remediation: "Agent failed to create tests even after remediation — test generation is unreliable for this story type",
  story_failed: "Story implementation failed — check root cause in data.fixerAttempts",
  circuit_breaker_triggered: "Same error hit 2+ consecutive stories — root cause not addressed",
  build_failed: "Build broke during implementation — likely dependency or type issue",
  test_gap_detected: "Story completed with 0 test files — vacuous pass",
  layer_check_failed: "Three-layer validation failed — incomplete implementation",
  security_violation: "Security scan found critical issue",
  anvil_gate_failed: "Anvil quality gate blocked the pipeline",
};

/**
 * Extract failure patterns from forge logs across all apps.
 */
function extractFailurePatterns(
  scanResults: AppScanResult[]
): FailurePattern[] {
  const patternMap = new Map<string, FailurePattern>();

  for (const app of scanResults) {
    for (const log of app.forgeLogs) {
      if (log.level !== "ERROR" && log.level !== "WARN") continue;

      const key = `${log.category}:${log.event}`;
      const existing = patternMap.get(key);

      if (existing) {
        existing.occurrences++;
        if (!existing.apps.includes(app.appName)) {
          existing.apps.push(app.appName);
        }
        if (log.timestamp < existing.firstSeen) existing.firstSeen = log.timestamp;
        if (log.timestamp > existing.lastSeen) existing.lastSeen = log.timestamp;
      } else {
        patternMap.set(key, {
          event: log.event,
          category: log.category,
          occurrences: 1,
          apps: [app.appName],
          firstSeen: log.timestamp,
          lastSeen: log.timestamp,
          sampleData: log.data,
        });
      }
    }
  }

  return Array.from(patternMap.values()).sort(
    (a, b) => b.occurrences - a.occurrences
  );
}

/**
 * Convert failure patterns into knowledge entry candidates.
 * Only patterns that appear across 2+ apps or 3+ times are promoted.
 */
function patternsToQuirkCandidates(
  patterns: FailurePattern[]
): KnowledgeEntry[] {
  const candidates: KnowledgeEntry[] = [];

  for (const pattern of patterns) {
    // Only promote recurring patterns (cross-app or repeated)
    if (pattern.apps.length < 2 && pattern.occurrences < 3) continue;

    const actionableDescription = ACTIONABLE_EVENTS[pattern.event];
    if (!actionableDescription) continue;

    candidates.push({
      framework: "skillfoundry",
      versionRange: "*",
      quirk: `${pattern.event}: ${actionableDescription} (seen ${pattern.occurrences} times across ${pattern.apps.length} app(s))`,
      fix: suggestFix(pattern),
      confidence: "observed" as Confidence,
      evidenceSource: "integration_test",
      evidenceSummary: `Aggregated from forge logs: ${pattern.apps.join(", ")}`,
      discoveredAt: pattern.lastSeen,
      discoveredIn: pattern.apps.join(", "),
    });
  }

  return candidates;
}

function suggestFix(pattern: FailurePattern): string {
  switch (pattern.event) {
    case "no_tests_after_remediation":
      return "Check if the story type is testable. Consider adding test patterns to the PRD.";
    case "story_failed":
      return `Story failed after ${(pattern.sampleData as Record<string, unknown>).fixerAttempts || "unknown"} fixer attempts. Review error signature for root cause.`;
    case "circuit_breaker_triggered":
      return "Same error repeating across stories. Fix the root cause before proceeding.";
    case "build_failed":
      return "Check dependency compatibility (§5.0 maturity, §5.4 compatibility notes).";
    case "test_gap_detected":
      return "Enforce TEST EXISTENCE GATE in forge pipeline. Never accept 0 test files.";
    default:
      return "Review forge logs for details.";
  }
}

// ─── Stats Computation ──────────────────────────────────────────────────────

function computeStats(scanResults: AppScanResult[]): AggregationStats {
  let totalErrors = 0;
  let totalWarnings = 0;
  const eventCounts = new Map<string, number>();
  const platformCounts: Record<string, number> = {};
  let appsWithFailures = 0;

  for (const app of scanResults) {
    let hasFailure = false;

    for (const log of app.forgeLogs) {
      if (log.level === "ERROR") { totalErrors++; hasFailure = true; }
      if (log.level === "WARN") totalWarnings++;
      eventCounts.set(log.event, (eventCounts.get(log.event) || 0) + 1);
    }

    if (hasFailure) appsWithFailures++;

    for (const platform of app.platforms) {
      platformCounts[platform] = (platformCounts[platform] || 0) + 1;
    }
  }

  const topEvents = Array.from(eventCounts.entries())
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalErrors,
    totalWarnings,
    topEvents,
    appsWithFailures,
    platformDistribution: platformCounts,
  };
}

// ─── Main Aggregator ────────────────────────────────────────────────────────

/**
 * Aggregate knowledge from scan results across all apps.
 */
export function aggregateKnowledge(
  scanResults: AppScanResult[]
): AggregationResult {
  const appsWithData = scanResults.filter(
    (r) => r.forgeLogs.length > 0 || r.sessionMonitor !== null
  ).length;

  const totalForgeLogs = scanResults.reduce(
    (sum, r) => sum + r.forgeLogs.length,
    0
  );

  const failurePatterns = extractFailurePatterns(scanResults);
  const quirkCandidates = patternsToQuirkCandidates(failurePatterns);
  const stats = computeStats(scanResults);

  return {
    appsScanned: scanResults.length,
    appsWithData,
    totalForgeLogs,
    failurePatterns,
    quirkCandidates,
    stats,
  };
}
