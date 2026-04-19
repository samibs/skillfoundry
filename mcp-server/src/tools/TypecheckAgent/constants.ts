/**
 * TypecheckAgent constants — tool metadata and input schema for sf_typecheck.
 */

export const TOOL_NAME = "sf_typecheck";

export const TOOL_DESCRIPTION =
  "Run TypeScript type checker (tsc --noEmit) and return diagnostics.";

export const TOOL_TIER = "TIER2" as const;

export const INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    projectPath: { type: "string", description: "Project root path" },
  },
  required: ["projectPath"],
};
