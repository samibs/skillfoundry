/**
 * Memory Nudge System — agent-curated memory with periodic prompts.
 *
 * Inspired by Hermes Agent's agent-curated memory. Instead of saving
 * everything to memory_bank/ indiscriminately, this system:
 *
 * 1. Monitors tool invocation results for "noteworthy" patterns
 * 2. Generates nudge suggestions: "Should this be recorded?"
 * 3. Appends nudges to tool responses so the LLM can decide
 *
 * This reduces memory bloat by only recording patterns the agent
 * explicitly chooses to save, while ensuring important findings
 * aren't lost because nobody thought to record them.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface MemoryNudge {
  /** Suggested pattern to record */
  pattern: string;
  /** Why this is worth recording */
  reason: string;
  /** Suggested entry type for session recording */
  entryType: "decision" | "correction" | "error" | "fact" | "pattern";
  /** Suggested scope */
  scope: "project" | "universal";
  /** Auto-extracted tags */
  tags: string[];
}

// ── Nudge Detection ───────────────────────────────────────────────────

/** Tools whose results are worth analyzing for memory nudges. */
const NUDGE_WORTHY_TOOLS = new Set([
  "sf_security_scan",
  "sf_security_scan_lite",
  "sf_deviation_enforcer",
  "sf_contract_check",
  "sf_import_validator",
  "sf_secret_guard",
  "sf_build",
  "sf_run_tests",
  "sf_typecheck",
  "sf_lint",
  "sf_check_deps",
  "sf_lighthouse",
  "sf_version_check",
]);

/** Minimum response size (chars) to trigger nudge analysis. */
const MIN_RESPONSE_SIZE = 200;

/** Maximum nudges per session to avoid noise. */
const MAX_NUDGES_PER_SESSION = 10;
let sessionNudgeCount = 0;

/**
 * Reset nudge counter (call on session start).
 */
export function resetNudgeCounter(): void {
  sessionNudgeCount = 0;
}

/**
 * Analyze a tool response and generate a memory nudge if warranted.
 *
 * Returns null if:
 * - Tool is not nudge-worthy
 * - Response is too small
 * - Session nudge limit reached
 * - No noteworthy patterns detected
 */
export function analyzeForNudge(
  toolName: string,
  responseText: string,
  isError: boolean,
): MemoryNudge | null {
  // Gate 1: Is this tool worth analyzing?
  if (!NUDGE_WORTHY_TOOLS.has(toolName)) return null;

  // Gate 2: Response too small to contain meaningful patterns
  if (responseText.length < MIN_RESPONSE_SIZE) return null;

  // Gate 3: Session nudge limit
  if (sessionNudgeCount >= MAX_NUDGES_PER_SESSION) return null;

  // Parse the response to look for patterns
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(responseText);
  } catch {
    return null; // Non-JSON responses (skill prompts) don't get nudges
  }

  const nudge = detectPattern(toolName, data, isError);
  if (nudge) {
    sessionNudgeCount++;
  }
  return nudge;
}

// ── Pattern Detection ─────────────────────────────────────────────────

function detectPattern(
  toolName: string,
  data: Record<string, unknown>,
  isError: boolean,
): MemoryNudge | null {
  // Security scan found vulnerabilities
  if (
    (toolName === "sf_security_scan" || toolName === "sf_security_scan_lite") &&
    isError
  ) {
    const findings = extractCount(data, "findings", "totalFindings", "total");
    if (findings > 0) {
      return {
        pattern: `Security scan found ${findings} vulnerability(ies). Review findings and record the fix pattern if this is a recurring issue.`,
        reason: "Security findings often recur across projects. Recording the fix pattern prevents the same vulnerability in future projects.",
        entryType: "pattern",
        scope: "universal",
        tags: ["security", "vulnerability", toolName.replace("sf_", "")],
      };
    }
  }

  // Deviation enforcer found violations
  if (toolName === "sf_deviation_enforcer" && isError) {
    const violations = extractCount(data, "totalViolations");
    if (violations > 5) {
      return {
        pattern: `Deviation enforcer found ${violations} violations. This project has systemic pattern issues worth documenting.`,
        reason: "High violation counts indicate the agent is making systematic mistakes that should be corrected in project rules.",
        entryType: "correction",
        scope: "project",
        tags: ["deviation", "quality", "anti-pattern"],
      };
    }
  }

  // Contract check found mismatches
  if (toolName === "sf_contract_check" && isError) {
    return {
      pattern: "Frontend-backend contract mismatch detected. Record the specific mismatch pattern to prevent recurrence.",
      reason: "Contract mismatches are the #1 vibe-coding failure. Recording the specific shape mismatch helps catch it earlier next time.",
      entryType: "error",
      scope: "project",
      tags: ["contract", "frontend-backend", "api"],
    };
  }

  // Import validator found broken imports
  if (toolName === "sf_import_validator" && isError) {
    const total = extractCount(data, "summary.total", "total");
    if (total > 0) {
      return {
        pattern: `${total} broken import(s) found. If these are from a package rename or removal, record the migration pattern.`,
        reason: "Import issues from package updates recur across projects. Recording the fix saves time on future updates.",
        entryType: "fact",
        scope: "universal",
        tags: ["imports", "dependencies", "migration"],
      };
    }
  }

  // Build failures
  if (toolName === "sf_build" && isError) {
    return {
      pattern: "Build failed. If the root cause was a non-obvious issue (not a typo), consider recording the fix pattern.",
      reason: "Non-obvious build failures (config issues, dependency conflicts, env problems) recur and are worth documenting.",
      entryType: "error",
      scope: "project",
      tags: ["build", "failure"],
    };
  }

  // Test failures
  if (toolName === "sf_run_tests" && isError) {
    return {
      pattern: "Tests failed. If the failure revealed a subtle bug or test environment issue, consider recording the pattern.",
      reason: "Subtle test failures (race conditions, env-specific, fixture issues) save hours when documented.",
      entryType: "error",
      scope: "project",
      tags: ["tests", "failure"],
    };
  }

  // Dependency check found issues
  if (toolName === "sf_check_deps" && isError) {
    return {
      pattern: "Dependency issues detected. If a package required special handling (peer deps, native modules, version pinning), record it.",
      reason: "Dependency quirks (native modules, peer conflicts, version constraints) are the most frequently repeated debugging sessions.",
      entryType: "fact",
      scope: "universal",
      tags: ["dependencies", "npm", "quirk"],
    };
  }

  // Secret guard found exposed secrets
  if (toolName === "sf_secret_guard" && isError) {
    return {
      pattern: "Hardcoded secrets detected. Record which files/patterns were affected to improve .gitignore and .env.example.",
      reason: "Secret exposure patterns should be recorded to prevent recurrence and improve project templates.",
      entryType: "correction",
      scope: "project",
      tags: ["security", "secrets", "env"],
    };
  }

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Extract a numeric count from nested data using dot-separated paths.
 */
function extractCount(
  data: Record<string, unknown>,
  ...paths: string[]
): number {
  for (const path of paths) {
    const parts = path.split(".");
    let current: unknown = data;
    for (const part of parts) {
      if (current && typeof current === "object") {
        current = (current as Record<string, unknown>)[part];
      } else {
        current = undefined;
        break;
      }
    }
    if (typeof current === "number") return current;
    if (Array.isArray(current)) return current.length;
  }
  return 0;
}

/**
 * Format a nudge as text to append to a tool response.
 */
export function formatNudge(nudge: MemoryNudge): string {
  return [
    "",
    "---",
    "**Memory Nudge** — Consider recording this pattern:",
    `> ${nudge.pattern}`,
    `> *Why:* ${nudge.reason}`,
    `> *To record:* Use \`sf_session_record\` with entryType="${nudge.entryType}", scope="${nudge.scope}", tags=${JSON.stringify(nudge.tags)}`,
  ].join("\n");
}
