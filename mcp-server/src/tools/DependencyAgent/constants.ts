/**
 * DependencyAgent constants — tool metadata and input schema for sf_check_deps.
 */

export const TOOL_NAME = "sf_check_deps";

export const TOOL_DESCRIPTION =
  "Check all dependencies: version existence, maturity classification, peer conflicts.";

export const TOOL_TIER = "TIER1" as const;

export const INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    projectPath: { type: "string", description: "Project root path" },
  },
  required: ["projectPath"],
};
