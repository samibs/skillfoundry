/**
 * Response Optimizer — reduces token usage in MCP tool responses.
 *
 * The #1 cost driver in LLM conversations is context re-reading: every message
 * causes the entire conversation history to be re-tokenized. Tool responses are
 * part of that history. Compressing them pays dividends on every subsequent turn.
 *
 * Strategies:
 *   1. JSON compaction — strip nulls, use minimal formatting for large payloads
 *   2. Output truncation — cap large responses with a summary header
 *   3. Skill content compression — strip examples, tables, verbose sections
 *   4. Token estimation — measure before/after for tracking
 */

// ── Token Estimation ──────────────────────────────────────────────────

const CHARS_PER_TOKEN = 3.5;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ── JSON Compaction ───────────────────────────────────────────────────

/**
 * Compact a JSON payload by:
 * - Removing null/undefined values
 * - Using minimal indentation for large payloads
 * - Truncating arrays beyond a reasonable limit
 */
export function compactJson(data: unknown, maxArrayItems = 50): unknown {
  if (data === null || data === undefined) return undefined;
  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    const compacted = data
      .slice(0, maxArrayItems)
      .map((item) => compactJson(item, maxArrayItems));
    if (data.length > maxArrayItems) {
      compacted.push(`... and ${data.length - maxArrayItems} more items`);
    }
    return compacted;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value === "") continue;
    const compacted = compactJson(value, maxArrayItems);
    if (compacted !== undefined) {
      result[key] = compacted;
    }
  }
  return result;
}

/**
 * Stringify JSON with size-aware formatting.
 * Small payloads get pretty-printed (2-space indent).
 * Large payloads get minimal formatting (no indent).
 */
export function smartStringify(data: unknown): string {
  const compacted = compactJson(data);
  const minimal = JSON.stringify(compacted);

  // Under 2KB — pretty print for readability
  if (minimal.length < 2048) {
    return JSON.stringify(compacted, null, 2);
  }

  // Under 8KB — single-space indent (readable but compact)
  if (minimal.length < 8192) {
    return JSON.stringify(compacted, null, 1);
  }

  // Large — no indentation
  return minimal;
}

// ── Output Truncation ─────────────────────────────────────────────────

/** Maximum response size in characters before truncation kicks in. */
const MAX_RESPONSE_CHARS = 30_000; // ~8,500 tokens

/**
 * Truncate a response string if it exceeds the limit.
 * Prepends a summary header so the LLM knows content was trimmed.
 */
export function truncateResponse(text: string, maxChars = MAX_RESPONSE_CHARS): string {
  if (text.length <= maxChars) return text;

  const truncated = text.slice(0, maxChars);
  const droppedTokens = estimateTokens(text.slice(maxChars));
  return [
    `[Response truncated — ${droppedTokens} tokens omitted. Showing first ${maxChars} chars.]`,
    "",
    truncated,
  ].join("\n");
}

// ── Skill Content Compression ─────────────────────────────────────────

/**
 * Compress skill prompt content for concise mode.
 * Strips examples, large tables, verbose explanations while keeping
 * the core instructions and rules.
 *
 * Typical reduction: 40-65% fewer tokens.
 */
export function compressSkillContent(content: string): string {
  let compressed = content;

  // 1. Remove markdown code blocks (examples)
  compressed = compressed.replace(/```[\s\S]*?```/g, "[example omitted]");

  // 2. Remove lines that are purely examples
  compressed = compressed
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim().toLowerCase();
      return (
        !trimmed.startsWith("example:") &&
        !trimmed.startsWith("for example") &&
        !trimmed.startsWith("e.g.") &&
        !trimmed.startsWith("for instance")
      );
    })
    .join("\n");

  // 3. Collapse table rows (keep header + separator, drop data rows beyond 3)
  const lines = compressed.split("\n");
  const result: string[] = [];
  let tableRowCount = 0;
  for (const line of lines) {
    if (/^\|.*\|$/.test(line.trim())) {
      tableRowCount++;
      if (tableRowCount <= 3) {
        result.push(line);
      } else if (tableRowCount === 4) {
        result.push("| ... | (remaining rows omitted for brevity) |");
      }
    } else {
      tableRowCount = 0;
      result.push(line);
    }
  }
  compressed = result.join("\n");

  // 4. Remove blockquote sections (usually context/philosophy, not instructions)
  compressed = compressed
    .split("\n")
    .filter((line) => !line.startsWith("> "))
    .join("\n");

  // 5. Collapse consecutive blank lines
  compressed = compressed.replace(/\n{3,}/g, "\n\n");

  return compressed;
}

// ── Response Wrapper ──────────────────────────────────────────────────

export interface OptimizedResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface OptimizeOptions {
  /** Use concise mode (strip examples, tables, verbose content) */
  concise?: boolean;
  /** Max response characters before truncation */
  maxChars?: number;
  /** Max array items in JSON responses */
  maxArrayItems?: number;
}

/**
 * Optimize a JSON tool response for minimal token usage.
 */
export function optimizeJsonResponse(
  data: unknown,
  isError = false,
  options: OptimizeOptions = {},
): OptimizedResponse {
  const { maxChars = MAX_RESPONSE_CHARS, maxArrayItems = 50 } = options;

  let text = smartStringify(
    maxArrayItems !== 50 ? compactJson(data, maxArrayItems) : data,
  );
  text = truncateResponse(text, maxChars);

  return {
    content: [{ type: "text" as const, text }],
    isError,
  };
}

/**
 * Optimize a skill prompt response for minimal token usage.
 */
export function optimizeSkillResponse(
  skillName: string,
  skillContent: string,
  projectPath: string,
  skillArgs?: string,
  options: OptimizeOptions = {},
): OptimizedResponse {
  const { concise = false, maxChars = MAX_RESPONSE_CHARS } = options;

  let content = concise ? compressSkillContent(skillContent) : skillContent;

  let text = [
    `# Executing SkillFoundry skill: ${skillName}`,
    `**Project:** ${projectPath}`,
    skillArgs ? `**Arguments:** ${skillArgs}` : "",
    "",
    "---",
    "",
    content,
  ]
    .filter(Boolean)
    .join("\n");

  text = truncateResponse(text, maxChars);

  return {
    content: [{ type: "text" as const, text }],
  };
}

// ── Metrics ───────────────────────────────────────────────────────────

export interface TokenSavings {
  originalTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  reductionPercent: number;
}

/**
 * Measure token savings from optimization.
 */
export function measureSavings(original: string, optimized: string): TokenSavings {
  const originalTokens = estimateTokens(original);
  const optimizedTokens = estimateTokens(optimized);
  const savedTokens = originalTokens - optimizedTokens;
  return {
    originalTokens,
    optimizedTokens,
    savedTokens,
    reductionPercent: originalTokens > 0
      ? Math.round((savedTokens / originalTokens) * 100)
      : 0,
  };
}
