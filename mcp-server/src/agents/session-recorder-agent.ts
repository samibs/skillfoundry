/**
 * Session Recorder Agent — records decisions, corrections, errors, and patterns
 * during normal development sessions (not just forge).
 *
 * Addresses the dormant knowledge problem: 72% of projects have only bootstrap
 * boilerplate because knowledge is only recorded during forge sessions.
 * This agent allows recording during any development activity.
 */

import path from "path";
import {
  initDatabase,
  insertSessionRecording,
  querySessionRecordings,
  type SessionRecording,
} from "../state/db.js";
import type { KnowledgeScope } from "../knowledge/memory-gate.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RecordInput {
  action: "record" | "query" | "promote";
  projectPath: string;
  entryType?: "decision" | "correction" | "error" | "fact" | "pattern";
  content?: string;
  context?: string;
  scope?: KnowledgeScope;
  tags?: string[];
  sessionId?: string;
  /** For query action */
  limit?: number;
  /** For promote action — entry ID to promote to universal */
  entryId?: number;
}

export interface RecordResult {
  success: boolean;
  action: string;
  id?: number;
  entries?: SessionRecording[];
  message: string;
  duration: number;
}

// ─── Auto-Scope Detection ───────────────────────────────────────────────────

/**
 * Determine if a recording should be project-scoped or universal.
 *
 * Universal patterns are those that apply across projects:
 * - Framework quirks (e.g., "Prisma 7 requires adapter pattern")
 * - Tool configuration issues (e.g., "set -e kills test scripts")
 * - AI behavior corrections (e.g., "agent creates mock data despite rules")
 *
 * Project-scoped patterns are specific to one project:
 * - Architecture decisions (e.g., "chose Redis for session store")
 * - Business logic corrections (e.g., "VAT rate is 17% not 15%")
 * - Local configuration (e.g., "runs on port 3456")
 */
function autoDetectScope(content: string, entryType: string): KnowledgeScope {
  const lower = content.toLowerCase();

  // Universal indicators
  const universalPatterns = [
    /breaking change/i,
    /(?:npm|pip|cargo)\s+(?:install|update)/i,
    /(?:prisma|next\.js|react|vue|django|fastapi|express)\s+\d/i,
    /peer\s+depend/i,
    /migration\s+(?:fail|break|error)/i,
    /agent\s+(?:fail|mistake|incorrect|wrong)/i,
    /llm\s+(?:fail|hallucinate|incorrect)/i,
    /set\s*-e|pipefail/i,
    /cors\s+(?:wildcard|misconfigur)/i,
    /hardcoded\s+(?:secret|credential|password)/i,
    /frontend.+backend.+mismatch/i,
    /type(?:script)?\s+(?:error|mismatch)/i,
  ];

  for (const pattern of universalPatterns) {
    if (pattern.test(lower)) return "universal";
  }

  // Error and pattern types default to universal (they're often reusable)
  if (entryType === "error" || entryType === "pattern") return "universal";

  // Decisions and facts default to project-scoped
  return "project";
}

// ─── Auto-Tag Extraction ────────────────────────────────────────────────────

function autoExtractTags(content: string, entryType: string): string[] {
  const tags = new Set<string>([entryType]);
  const lower = content.toLowerCase();

  // Framework/tool tags
  const tools = [
    "prisma", "next.js", "react", "vue", "express", "fastapi", "django",
    "typescript", "python", "postgresql", "sqlite", "redis", "docker",
    "nginx", "pm2", "jest", "vitest", "playwright", "eslint", "biome",
  ];
  for (const tool of tools) {
    if (lower.includes(tool)) tags.add(tool);
  }

  // Category tags
  if (/security|auth|token|secret|credential/i.test(lower)) tags.add("security");
  if (/test|coverage|spec/i.test(lower)) tags.add("testing");
  if (/deploy|build|ci|cd/i.test(lower)) tags.add("deployment");
  if (/migrat|schema|database|db/i.test(lower)) tags.add("database");
  if (/frontend|ui|component|css/i.test(lower)) tags.add("frontend");
  if (/backend|api|endpoint|route/i.test(lower)) tags.add("backend");
  if (/performance|slow|cache|optimi/i.test(lower)) tags.add("performance");

  return Array.from(tags);
}

// ─── Main ───────────────────────────────────────────────────────────────────

export async function handleSessionRecording(input: RecordInput): Promise<RecordResult> {
  const start = Date.now();

  await initDatabase();

  const appName = path.basename(input.projectPath);

  switch (input.action) {
    case "record": {
      if (!input.content || !input.entryType) {
        return {
          success: false,
          action: "record",
          message: "content and entryType are required for recording",
          duration: Date.now() - start,
        };
      }

      const scope = input.scope || autoDetectScope(input.content, input.entryType);
      const tags = input.tags || autoExtractTags(input.content, input.entryType);

      const id = insertSessionRecording({
        appName,
        appPath: input.projectPath,
        entryType: input.entryType,
        scope,
        content: input.content,
        context: input.context,
        tags,
        sessionId: input.sessionId,
      });

      return {
        success: true,
        action: "record",
        id,
        message: `Recorded ${input.entryType} (scope: ${scope}) with ${tags.length} auto-tags: [${tags.join(", ")}]`,
        duration: Date.now() - start,
      };
    }

    case "query": {
      const entries = querySessionRecordings({
        appName: input.entryType ? undefined : appName,
        entryType: input.entryType,
        scope: input.scope,
        limit: input.limit || 20,
      });

      return {
        success: true,
        action: "query",
        entries,
        message: `Found ${entries.length} recordings`,
        duration: Date.now() - start,
      };
    }

    case "promote": {
      // Query universal entries for this app to show what could be promoted
      const universalEntries = querySessionRecordings({
        appName,
        scope: "universal",
        limit: 50,
      });

      return {
        success: true,
        action: "promote",
        entries: universalEntries,
        message: `Found ${universalEntries.length} universal entries eligible for cross-project promotion`,
        duration: Date.now() - start,
      };
    }

    default:
      return {
        success: false,
        action: input.action,
        message: `Unknown action: ${input.action}. Use: record, query, or promote`,
        duration: Date.now() - start,
      };
  }
}
