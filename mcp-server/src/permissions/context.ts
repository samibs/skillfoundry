// ─── Permission Context ─────────────────────────────────────────────────────
// Defines the permission context for tool access control.
// Reads configuration from environment variables at startup.

export interface ToolPermissionContext {
  denyNames: Set<string>;       // lowercased tool names to block
  denyPrefixes: string[];       // lowercased prefixes to block
  simpleMode: boolean;          // core tools only
  trusted: boolean;             // workspace trust level
}

/**
 * Tools allowed in simple mode (minimal safe set).
 */
export const SIMPLE_MODE_TOOLS: ReadonlySet<string> = new Set([
  "sf_build",
  "sf_run_tests",
  "sf_git_status",
]);

/**
 * Tools that require workspace trust to be enabled.
 */
export const TRUST_REQUIRED_TOOLS: ReadonlySet<string> = new Set([
  "sf_security_scan",
  "sf_verify_auth",
  "sf_harvest_knowledge",
  "sf_create_skill",
  "sf_memory_gate",
]);

/**
 * Create a ToolPermissionContext from environment variables.
 *
 * Environment variables:
 *   SKILLFOUNDRY_DENY_TOOLS    — comma-separated tool names to block
 *   SKILLFOUNDRY_DENY_PREFIXES — comma-separated prefixes to block
 *   SKILLFOUNDRY_SIMPLE_MODE   — "true" to restrict to SIMPLE_MODE_TOOLS only
 *   SKILLFOUNDRY_TRUST         — "false" to mark workspace as untrusted (default: trusted)
 *
 * @returns ToolPermissionContext populated from env vars
 */
export function createPermissionContext(): ToolPermissionContext {
  const rawDenyTools = process.env.SKILLFOUNDRY_DENY_TOOLS ?? "";
  const rawDenyPrefixes = process.env.SKILLFOUNDRY_DENY_PREFIXES ?? "";
  const rawSimpleMode = process.env.SKILLFOUNDRY_SIMPLE_MODE ?? "";
  const rawTrust = process.env.SKILLFOUNDRY_TRUST ?? "";

  const denyNames = new Set<string>(
    rawDenyTools
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0)
  );

  const denyPrefixes = rawDenyPrefixes
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  const simpleMode = rawSimpleMode.toLowerCase() === "true";
  const trusted = rawTrust.toLowerCase() !== "false";

  return { denyNames, denyPrefixes, simpleMode, trusted };
}
