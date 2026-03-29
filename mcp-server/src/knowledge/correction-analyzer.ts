/**
 * Correction Analyzer — feedback loop from user corrections to deviation rules.
 *
 * Analyzes user corrections extracted from AI session transcripts,
 * groups them by semantic similarity, and auto-generates deviation rules
 * when a pattern appears 3+ times across 2+ projects.
 *
 * Features:
 *   - Extracts correction events from platform insights
 *   - Groups corrections by semantic similarity (normalized content hashing)
 *   - Threshold: 3 occurrences across 2+ projects triggers auto-rule generation
 *   - Generated rules stored in deviation_rules with source "auto_correction"
 *   - Exposes query interface for per-project correction history
 */

import crypto from "crypto";
import {
  initDatabase,
  upsertCorrectionPattern,
  getCorrectionPatterns,
  upsertDeviationRule,
  type CorrectionPattern,
} from "../state/db.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CorrectionEvent {
  appName: string;
  appPath: string;
  platform: string;
  sessionId: string | null;
  content: string;
  context: string;
}

export interface CorrectionAnalysisResult {
  totalCorrections: number;
  uniquePatterns: number;
  newRulesGenerated: number;
  patterns: Array<{
    hash: string;
    description: string;
    occurrences: number;
    projects: string[];
    autoRuleGenerated: boolean;
  }>;
}

// ─── Normalization ──────────────────────────────────────────────────────────

/** Normalize correction text for similarity grouping. */
function normalizeCorrection(content: string): string {
  return content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Generate a stable hash for a normalized correction. */
function hashCorrection(normalized: string): string {
  // Extract key phrases for grouping
  const keywords = extractKeyPhrases(normalized);
  const hashInput = keywords.join("|");
  return crypto.createHash("sha256").update(hashInput).digest("hex").slice(0, 16);
}

/** Extract key phrases from correction text for semantic grouping. */
function extractKeyPhrases(text: string): string[] {
  const phrases: string[] = [];

  // Common correction categories
  const categories: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /placeholder|stub|mock|fake|todo|coming soon/i, label: "placeholder-code" },
    { pattern: /don.?t (?:add|create|generate|write|include|use)/i, label: "unwanted-generation" },
    { pattern: /wrong (?:file|path|import|module|package|framework)/i, label: "wrong-target" },
    { pattern: /context|forgot|lost|remember|already|previous/i, label: "context-loss" },
    { pattern: /type|typescript|ts-ignore|any\b/i, label: "type-safety" },
    { pattern: /test|spec|coverage/i, label: "testing" },
    { pattern: /auth|login|permission|role|token/i, label: "authentication" },
    { pattern: /env|secret|password|credential|key/i, label: "secrets" },
    { pattern: /import|require|module|dependency|package/i, label: "dependencies" },
    { pattern: /style|css|layout|responsive|mobile/i, label: "styling" },
    { pattern: /database|migration|schema|sql|query/i, label: "database" },
    { pattern: /api|endpoint|route|fetch|request/i, label: "api" },
    { pattern: /duplicate|already exists|repeated/i, label: "duplication" },
    { pattern: /build|compile|bundle|webpack|vite/i, label: "build" },
    { pattern: /deploy|production|staging|pm2/i, label: "deployment" },
  ];

  for (const cat of categories) {
    if (cat.pattern.test(text)) {
      phrases.push(cat.label);
    }
  }

  // Extract action verbs that indicate what the user wanted differently
  const actionMatch = text.match(/(?:don.?t|stop|no|not|instead|should|must|never|always)\s+(\w+(?:\s+\w+){0,3})/);
  if (actionMatch) {
    phrases.push(actionMatch[1].trim());
  }

  // If no category matched, use first 3 significant words
  if (phrases.length === 0) {
    const words = text.split(/\s+/).filter(w => w.length > 3);
    phrases.push(...words.slice(0, 3));
  }

  return phrases.sort();
}

// ─── Correction Description ─────────────────────────────────────────────────

/** Generate a human-readable description from correction content. */
function describeCorrection(content: string): string {
  // Clean up the raw correction content
  const clean = content
    .replace(/^user correction:\s*/i, "")
    .replace(/\n/g, " ")
    .trim()
    .slice(0, 300);

  return clean || "Unspecified correction";
}

// ─── Auto-Rule Generation ───────────────────────────────────────────────────

/** Category mapping for auto-generated deviation rules. */
function inferRuleCategory(description: string): string {
  const d = description.toLowerCase();
  if (/placeholder|stub|mock|todo|fake|coming soon/.test(d)) return "LLM-Specific Deviations";
  if (/type|typescript|ts-ignore|any\b/.test(d)) return "TypeScript Deviations";
  if (/auth|login|permission|role/.test(d)) return "Authorization Deviations";
  if (/secret|password|credential|env/.test(d)) return "Security Deviations";
  if (/test|spec|coverage/.test(d)) return "Testing Deviations";
  if (/api|endpoint|route|contract/.test(d)) return "Contract Mismatches";
  if (/database|migration|schema/.test(d)) return "Database Deviations";
  if (/style|css|layout|responsive/.test(d)) return "Frontend Deviations";
  if (/build|compile|deploy/.test(d)) return "Error Handling Deviations";
  if (/context|forgot|remember/.test(d)) return "LLM-Specific Deviations";
  return "LLM-Specific Deviations";
}

/** Generate a deviation rule ID from pattern hash. */
function generateRuleId(hash: string): string {
  return `AUTO-${hash.slice(0, 6).toUpperCase()}`;
}

// ─── Main Entry Points ──────────────────────────────────────────────────────

/**
 * Analyze correction events and update correction_patterns table.
 * Auto-generates deviation rules when threshold is met.
 */
export async function analyzeCorrections(
  corrections: CorrectionEvent[],
  dbPath?: string
): Promise<CorrectionAnalysisResult> {
  await initDatabase(dbPath);

  let newRulesGenerated = 0;

  // Group corrections by similarity
  const groups = new Map<string, { description: string; projects: Set<string>; count: number }>();

  for (const correction of corrections) {
    const normalized = normalizeCorrection(correction.content);
    const hash = hashCorrection(normalized);
    const description = describeCorrection(correction.content);

    if (!groups.has(hash)) {
      groups.set(hash, { description, projects: new Set(), count: 0 });
    }

    const group = groups.get(hash)!;
    group.projects.add(correction.appName);
    group.count++;
  }

  // Upsert patterns into DB
  for (const [hash, group] of groups) {
    upsertCorrectionPattern({
      patternHash: hash,
      description: group.description,
      occurrenceCount: group.count,
      projectCount: group.projects.size,
      projects: Array.from(group.projects),
      autoRuleGenerated: false,
      generatedRuleId: null,
    });
  }

  // Check threshold for auto-rule generation
  const allPatterns = getCorrectionPatterns(3); // 3+ occurrences
  for (const pattern of allPatterns) {
    if (pattern.autoRuleGenerated) continue;
    if (pattern.projectCount < 2) continue;

    // Generate a deviation rule
    const ruleId = generateRuleId(pattern.patternHash);
    const category = inferRuleCategory(pattern.description);

    upsertDeviationRule({
      id: ruleId,
      category,
      patternDescription: `Auto-detected from ${pattern.occurrenceCount} user corrections across ${pattern.projectCount} projects: ${pattern.description.slice(0, 200)}`,
      prevention: `This pattern was corrected ${pattern.occurrenceCount} times. Projects affected: ${pattern.projects.join(", ")}`,
      responsibleAgent: null,
      detectionRegex: null, // Auto-generated rules start without regex; operator can add later
      fileGlob: null,
      severity: pattern.occurrenceCount >= 5 ? "high" : "medium",
      active: true,
      source: "auto_correction",
    });

    // Mark pattern as having generated a rule
    upsertCorrectionPattern({
      ...pattern,
      autoRuleGenerated: true,
      generatedRuleId: ruleId,
    });

    newRulesGenerated++;
  }

  // Build result
  const resultPatterns = Array.from(groups.entries()).map(([hash, group]) => {
    const dbPattern = getCorrectionPatterns(1).find(p => p.patternHash === hash);
    return {
      hash,
      description: group.description,
      occurrences: dbPattern?.occurrenceCount ?? group.count,
      projects: Array.from(group.projects),
      autoRuleGenerated: dbPattern?.autoRuleGenerated ?? false,
    };
  });

  return {
    totalCorrections: corrections.length,
    uniquePatterns: groups.size,
    newRulesGenerated,
    patterns: resultPatterns.sort((a, b) => b.occurrences - a.occurrences),
  };
}

/**
 * Query correction patterns for a specific project.
 */
export function queryProjectCorrections(appName: string, dbPath?: string): CorrectionPattern[] {
  const patterns = getCorrectionPatterns(1);
  return patterns.filter(p => p.projects.includes(appName));
}

/**
 * Get a monthly correction trend summary.
 */
export function getCorrectionTrend(): {
  totalPatterns: number;
  autoRulesGenerated: number;
  topPatterns: CorrectionPattern[];
} {
  const all = getCorrectionPatterns(1);
  const autoRules = all.filter(p => p.autoRuleGenerated);
  const top = all.sort((a, b) => b.occurrenceCount - a.occurrenceCount).slice(0, 10);

  return {
    totalPatterns: all.length,
    autoRulesGenerated: autoRules.length,
    topPatterns: top,
  };
}
