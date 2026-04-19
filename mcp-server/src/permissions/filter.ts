// ─── Permission Filter ──────────────────────────────────────────────────────
// Checks individual tools against the permission context and filters tool lists.

import {
  type ToolPermissionContext,
  SIMPLE_MODE_TOOLS,
  TRUST_REQUIRED_TOOLS,
} from "./context.js";

/**
 * Describes why a tool was denied.
 */
export interface PermissionDenial {
  toolName: string;
  reason: string;
}

/**
 * Minimal shape required to filter tools by name.
 * Compatible with ToolModule from ../tools/types when it exists.
 */
interface ToolLike {
  name: string;
}

/**
 * Check whether a tool is blocked by the permission context.
 *
 * Evaluation order:
 *   1. Explicit deny by name (case-insensitive)
 *   2. Deny by prefix (case-insensitive startsWith)
 *   3. Simple mode gate (only SIMPLE_MODE_TOOLS pass)
 *   4. Trust gate (TRUST_REQUIRED_TOOLS need trusted=true)
 *
 * @param ctx  - The active permission context
 * @param toolName - Name of the tool to check
 * @returns PermissionDenial if blocked, null if allowed
 */
export function blocks(
  ctx: ToolPermissionContext,
  toolName: string
): PermissionDenial | null {
  const lower = toolName.toLowerCase();

  // 1. Explicit deny list
  if (ctx.denyNames.has(lower)) {
    return {
      toolName,
      reason: `Tool "${toolName}" is in the deny list`,
    };
  }

  // 2. Prefix deny list
  for (const prefix of ctx.denyPrefixes) {
    if (lower.startsWith(prefix)) {
      return {
        toolName,
        reason: `Tool "${toolName}" matches denied prefix "${prefix}"`,
      };
    }
  }

  // 3. Simple mode — only allow the core safe set
  if (ctx.simpleMode && !SIMPLE_MODE_TOOLS.has(lower)) {
    return {
      toolName,
      reason: `Simple mode is active — only ${[...SIMPLE_MODE_TOOLS].join(", ")} are allowed`,
    };
  }

  // 4. Trust gate — certain tools require workspace trust
  if (!ctx.trusted && TRUST_REQUIRED_TOOLS.has(lower)) {
    return {
      toolName,
      reason: `Tool "${toolName}" requires a trusted workspace (set SKILLFOUNDRY_TRUST=true)`,
    };
  }

  return null;
}

/**
 * Result of filtering a list of tools through the permission context.
 */
export interface FilterResult<T extends ToolLike> {
  allowed: T[];
  denied: PermissionDenial[];
}

/**
 * Partition a list of tools into allowed and denied based on the permission context.
 *
 * @param tools - Array of tools (anything with a `name` property)
 * @param ctx   - The active permission context
 * @returns Object with `allowed` tools and `denied` explanations
 */
export function filterTools<T extends ToolLike>(
  tools: T[],
  ctx: ToolPermissionContext
): FilterResult<T> {
  const allowed: T[] = [];
  const denied: PermissionDenial[] = [];

  for (const tool of tools) {
    const denial = blocks(ctx, tool.name);
    if (denial) {
      denied.push(denial);
    } else {
      allowed.push(tool);
    }
  }

  return { allowed, denied };
}
