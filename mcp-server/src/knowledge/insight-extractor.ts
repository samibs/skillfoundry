/**
 * Insight Extractor — extracts actionable insights from parsed session transcripts.
 *
 * Scans messages for:
 * 1. Errors encountered during development
 * 2. Fixes applied (error → resolution patterns)
 * 3. Tool failures (Bash, Read, Write, etc.)
 * 4. Dependency issues (npm, pip, version conflicts)
 * 5. Security findings mentioned in sessions
 * 6. Performance issues identified
 * 7. Patterns & corrections (user corrected AI behavior)
 */

import type { ParsedSession, ParsedMessage } from "./session-transcript-parser.js";
import type { PlatformInsightRecord } from "../state/db.js";

// ─── Pattern Definitions ────────────────────────────────────────────────────

interface InsightPattern {
  id: string;
  type: PlatformInsightRecord["insightType"];
  severity: PlatformInsightRecord["severity"];
  /** Regex to match against message content */
  pattern: RegExp;
  /** Extract the insight content from the match */
  extract: (match: RegExpMatchArray, message: ParsedMessage) => string;
  /** Tags to add */
  tags: string[];
}

const INSIGHT_PATTERNS: InsightPattern[] = [
  // ─── Errors ────────────────────────────────────
  {
    id: "npm-install-fail",
    type: "error",
    severity: "high",
    pattern: /npm\s+(?:ERR!|error)\s+(.{10,200})/i,
    extract: (m) => `npm install error: ${m[1].trim()}`,
    tags: ["npm", "dependency"],
  },
  {
    id: "build-fail",
    type: "error",
    severity: "high",
    pattern: /(?:Build|Compilation|TSC|tsc)\s+(?:failed|error)[\s:]+(.{10,200})/i,
    extract: (m) => `Build failure: ${m[1].trim()}`,
    tags: ["build", "typescript"],
  },
  {
    id: "type-error",
    type: "error",
    severity: "medium",
    pattern: /(?:TypeError|ReferenceError|SyntaxError):\s+(.{10,200})/,
    extract: (m) => `Runtime error: ${m[0].slice(0, 200)}`,
    tags: ["runtime", "javascript"],
  },
  {
    id: "python-error",
    type: "error",
    severity: "medium",
    pattern: /(?:ModuleNotFoundError|ImportError|AttributeError|ValueError):\s+(.{10,200})/,
    extract: (m) => `Python error: ${m[0].slice(0, 200)}`,
    tags: ["python", "runtime"],
  },
  {
    id: "prisma-error",
    type: "error",
    severity: "high",
    pattern: /(?:PrismaClientKnownRequestError|P\d{4})[\s:]+(.{10,200})/i,
    extract: (m) => `Prisma error: ${m[0].slice(0, 200)}`,
    tags: ["prisma", "database"],
  },
  {
    id: "migration-fail",
    type: "error",
    severity: "high",
    pattern: /(?:migration|migrate)\s+(?:failed|error)[\s:]+(.{10,200})/i,
    extract: (m) => `Migration failure: ${m[1].trim()}`,
    tags: ["migration", "database"],
  },
  {
    id: "port-in-use",
    type: "error",
    severity: "low",
    pattern: /(?:EADDRINUSE|address already in use|port\s+\d+\s+(?:is\s+)?(?:already|in use))/i,
    extract: (m) => `Port conflict: ${m[0].slice(0, 150)}`,
    tags: ["port", "server"],
  },
  {
    id: "permission-denied",
    type: "error",
    severity: "medium",
    pattern: /(?:EACCES|permission denied|EPERM)[\s:]+(.{10,200})/i,
    extract: (m) => `Permission error: ${m[0].slice(0, 200)}`,
    tags: ["permissions", "filesystem"],
  },

  // ─── Fixes ─────────────────────────────────────
  {
    id: "fix-applied",
    type: "fix",
    severity: "info",
    pattern: /(?:fixed|resolved|solved|patched)\s+(?:by|with|using)\s+(.{10,200})/i,
    extract: (m) => `Fix: ${m[0].slice(0, 200)}`,
    tags: ["fix", "resolution"],
  },
  {
    id: "workaround",
    type: "fix",
    severity: "info",
    pattern: /(?:workaround|work(?:\s|-)?around)[\s:]+(.{10,200})/i,
    extract: (m) => `Workaround: ${m[1].trim()}`,
    tags: ["workaround"],
  },

  // ─── Tool Failures ─────────────────────────────
  {
    id: "tool-timeout",
    type: "tool_failure",
    severity: "medium",
    pattern: /(?:timed?\s*out|timeout)\s+(?:after|waiting|running)\s+(.{10,150})/i,
    extract: (m) => `Tool timeout: ${m[0].slice(0, 200)}`,
    tags: ["timeout", "tool"],
  },
  {
    id: "command-failed",
    type: "tool_failure",
    severity: "medium",
    pattern: /(?:command|process)\s+(?:failed|exited)\s+(?:with|code)\s+(.{5,100})/i,
    extract: (m) => `Command failure: ${m[0].slice(0, 200)}`,
    tags: ["command", "tool"],
  },

  // ─── Dependency Issues ─────────────────────────
  {
    id: "peer-dep-conflict",
    type: "dependency_issue",
    severity: "medium",
    pattern: /(?:peer\s+dep|peerDependenc(?:y|ies))\s+(?:conflict|warning|issue)(.{0,200})/i,
    extract: (m) => `Peer dependency conflict: ${m[0].slice(0, 200)}`,
    tags: ["dependency", "npm", "peer"],
  },
  {
    id: "version-mismatch",
    type: "dependency_issue",
    severity: "medium",
    pattern: /(?:version\s+mismatch|incompatible\s+version|requires\s+[\w@]+\s+but\s+found)(.{0,200})/i,
    extract: (m) => `Version mismatch: ${m[0].slice(0, 200)}`,
    tags: ["dependency", "version"],
  },
  {
    id: "missing-module",
    type: "dependency_issue",
    severity: "high",
    pattern: /(?:Cannot find (?:module|package)|Module not found)[\s:']+([^\s'"]{3,100})/i,
    extract: (m) => `Missing module: ${m[1]}`,
    tags: ["dependency", "missing"],
  },

  // ─── Security Findings ─────────────────────────
  {
    id: "hardcoded-secret-found",
    type: "security_finding",
    severity: "critical",
    pattern: /(?:hardcoded|hard-coded)\s+(?:secret|password|credential|api.?key|token)(.{0,200})/i,
    extract: (m) => `Security: ${m[0].slice(0, 200)}`,
    tags: ["security", "secret"],
  },
  {
    id: "xss-vulnerability",
    type: "security_finding",
    severity: "high",
    pattern: /(?:XSS|cross.?site\s+scripting)\s+(?:vulnerability|risk|issue)(.{0,200})/i,
    extract: (m) => `Security: ${m[0].slice(0, 200)}`,
    tags: ["security", "xss"],
  },
  {
    id: "sql-injection-found",
    type: "security_finding",
    severity: "critical",
    pattern: /(?:SQL\s+injection|sql.?inject)(?:ion)?\s+(?:vulnerability|risk|found|detected)(.{0,200})/i,
    extract: (m) => `Security: ${m[0].slice(0, 200)}`,
    tags: ["security", "sql-injection"],
  },

  // ─── Corrections (user corrected AI) ───────────
  {
    id: "user-correction",
    type: "correction",
    severity: "info",
    pattern: /(?:no,?\s+(?:don'?t|not\s+that|instead)|(?:that'?s\s+)?wrong|actually|I\s+(?:meant|want(?:ed)?)|stop|undo\s+that)/i,
    extract: (m, msg) => `User correction: ${msg.content.slice(0, 300)}`,
    tags: ["correction", "user-feedback"],
  },

  // ─── Patterns ──────────────────────────────────
  {
    id: "recurring-pattern",
    type: "pattern",
    severity: "info",
    pattern: /(?:this\s+keeps\s+happening|(?:same|this)\s+error\s+again|recurring|happens\s+every\s+time)/i,
    extract: (m, msg) => `Recurring pattern: ${msg.content.slice(0, 300)}`,
    tags: ["pattern", "recurring"],
  },
];

// ─── Extractor ──────────────────────────────────────────────────────────────

/**
 * Extract insights from a single parsed session.
 */
export function extractSessionInsights(session: ParsedSession): PlatformInsightRecord[] {
  const insights: PlatformInsightRecord[] = [];
  const seen = new Set<string>();

  for (const message of session.messages) {
    // Only scan user and assistant messages (skip tool calls for noise reduction)
    if (message.role === "tool") continue;

    for (const pattern of INSIGHT_PATTERNS) {
      // Corrections only apply to user messages
      if (pattern.id === "user-correction" && message.role !== "user") continue;

      pattern.pattern.lastIndex = 0;
      const match = message.content.match(pattern.pattern);
      if (!match) continue;

      const content = pattern.extract(match, message);
      const dedupeKey = `${session.appPath}:${pattern.type}:${content.slice(0, 100)}`;

      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      insights.push({
        appName: session.appName,
        appPath: session.appPath,
        platform: session.platform,
        sessionId: session.sessionId,
        insightType: pattern.type,
        severity: pattern.severity,
        content,
        context: message.content.slice(0, 500),
        fileReference: null,
        tags: [...pattern.tags, session.platform],
      });
    }
  }

  return insights;
}

/**
 * Extract insights from multiple sessions.
 */
export function extractAllInsights(sessions: ParsedSession[]): PlatformInsightRecord[] {
  const allInsights: PlatformInsightRecord[] = [];
  const globalSeen = new Set<string>();

  for (const session of sessions) {
    const insights = extractSessionInsights(session);
    for (const insight of insights) {
      // Global dedup by app+type+content
      const key = `${insight.appPath}:${insight.insightType}:${insight.content.slice(0, 100)}`;
      if (!globalSeen.has(key)) {
        globalSeen.add(key);
        allInsights.push(insight);
      }
    }
  }

  // Sort by severity
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  allInsights.sort((a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5));

  return allInsights;
}

/**
 * Aggregate insights into cross-project patterns for MCP improvement suggestions.
 */
export function aggregateInsightPatterns(insights: PlatformInsightRecord[]): {
  topErrors: Array<{ content: string; count: number; projects: string[] }>;
  topToolFailures: Array<{ content: string; count: number; projects: string[] }>;
  topDependencyIssues: Array<{ content: string; count: number; projects: string[] }>;
  securityFindings: Array<{ content: string; severity: string; projects: string[] }>;
  corrections: Array<{ content: string; count: number; projects: string[] }>;
  improvementSuggestions: string[];
} {
  const grouped: Record<string, Map<string, Set<string>>> = {};

  for (const insight of insights) {
    if (!grouped[insight.insightType]) grouped[insight.insightType] = new Map();
    const typeMap = grouped[insight.insightType];
    // Normalize content for grouping (first 80 chars)
    const key = insight.content.slice(0, 80).toLowerCase().replace(/[^a-z0-9\s]/g, "");
    if (!typeMap.has(key)) typeMap.set(key, new Set());
    typeMap.get(key)!.add(insight.appName);
  }

  function topN(type: string, n: number) {
    const typeMap = grouped[type] || new Map();
    return Array.from(typeMap.entries())
      .map(([content, projects]) => ({ content, count: projects.size, projects: Array.from(projects) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  }

  const topErrors = topN("error", 10);
  const topToolFailures = topN("tool_failure", 10);
  const topDependencyIssues = topN("dependency_issue", 10);
  const corrections = topN("correction", 10);

  const securityFindings = insights
    .filter(i => i.insightType === "security_finding")
    .reduce((acc, i) => {
      const existing = acc.find(a => a.content === i.content);
      if (existing) {
        if (!existing.projects.includes(i.appName)) existing.projects.push(i.appName);
      } else {
        acc.push({ content: i.content, severity: i.severity, projects: [i.appName] });
      }
      return acc;
    }, [] as Array<{ content: string; severity: string; projects: string[] }>);

  // Generate improvement suggestions based on patterns
  const improvementSuggestions: string[] = [];

  if (topErrors.some(e => e.content.includes("missing module") && e.count >= 3)) {
    improvementSuggestions.push("Add dependency pre-check agent: scan for missing modules before running tools");
  }
  if (topErrors.some(e => e.content.includes("build") && e.count >= 3)) {
    improvementSuggestions.push("Enhance build agent: add pre-build validation for common TypeScript/ESLint errors");
  }
  if (topToolFailures.some(e => e.content.includes("timeout") && e.count >= 2)) {
    improvementSuggestions.push("Add adaptive timeout: increase tool timeouts for large projects based on file count");
  }
  if (topDependencyIssues.some(e => e.content.includes("peer") && e.count >= 3)) {
    improvementSuggestions.push("Add peer dependency resolver: auto-detect and suggest fixes for peer dep conflicts");
  }
  if (corrections.length >= 5) {
    improvementSuggestions.push("Review user corrections: frequent corrections suggest agent behavior needs tuning");
  }
  if (securityFindings.length >= 3) {
    improvementSuggestions.push("Strengthen security scan: recurring security findings across projects need broader rule coverage");
  }

  return {
    topErrors,
    topToolFailures,
    topDependencyIssues,
    securityFindings,
    corrections,
    improvementSuggestions,
  };
}
