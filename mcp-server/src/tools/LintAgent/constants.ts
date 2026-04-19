/**
 * LintAgent constants — tool metadata and input schema for sf_lint.
 */

export const TOOL_NAME = "sf_lint";

export const TOOL_DESCRIPTION =
  "Run linter (ESLint/Biome) and return issues. Optionally auto-fix.";

export const TOOL_TIER = "TIER2" as const;

export const INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    projectPath: { type: "string", description: "Project root path" },
    autoFix: { type: "boolean", description: "Auto-fix fixable issues" },
  },
  required: ["projectPath"],
};
