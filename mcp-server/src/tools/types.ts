/**
 * Tool Module Interface — defines the contract every tool module must implement.
 *
 * Each tool lives in its own directory under src/tools/<tool-name>/index.ts
 * and default-exports an object satisfying the ToolModule interface.
 */

/** Tier classification for tool modules */
export type ToolTier = 'TIER1' | 'TIER2' | 'TIER3' | 'DYNAMIC';

/** Category classification for tool modules */
export type ToolCategory = 'builtin' | 'plugin' | 'skill' | 'dynamic';

/**
 * Structured result returned by every tool execution.
 * Follows the MCP content format.
 */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Static constants that a tool module exposes for registration metadata.
 * Used by the registry to build the MCP tool list without invoking execute().
 */
export interface ToolConstants {
  TOOL_NAME: string;
  TOOL_DESCRIPTION: string;
  TOOL_TIER: ToolTier;
  INPUT_SCHEMA: Record<string, unknown>;
}

/**
 * The contract every tool module must satisfy.
 *
 * A tool module is a self-contained unit that:
 * - Declares its name, description, tier, and category
 * - Provides a JSON Schema for input validation
 * - Implements an execute() function that performs real work
 */
export interface ToolModule {
  /** Unique tool name (e.g., "sf_build"). Used as the MCP tool identifier. */
  name: string;

  /** Human-readable description shown in MCP tool listings. */
  description: string;

  /** Execution priority tier. TIER1 runs first in pipelines. */
  tier: ToolTier;

  /** Where this tool comes from: builtin, plugin, skill, or dynamic. */
  category: ToolCategory;

  /** JSON Schema object describing the expected input arguments. */
  inputSchema: Record<string, unknown>;

  /** Execute the tool with the given arguments. Returns structured MCP content. */
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}
