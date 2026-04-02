/**
 * BuildAgent constants — tool metadata and input schema for sf_build.
 */

export const TOOL_NAME = "sf_build";

export const TOOL_DESCRIPTION =
  "Run the project build and return pass/fail with errors.";

export const TOOL_TIER = "TIER1" as const;

export const INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    projectPath: { type: "string", description: "Project root path" },
  },
  required: ["projectPath"],
};
