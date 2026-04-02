/**
 * TestRunner constants — tool metadata and input schema for sf_run_tests.
 */

export const TOOL_NAME = "sf_run_tests";

export const TOOL_DESCRIPTION =
  "Run the project's test suite (vitest/jest/mocha) and return structured results.";

export const TOOL_TIER = "TIER1" as const;

export const INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    projectPath: { type: "string", description: "Project root path" },
    pattern: { type: "string", description: "Test file pattern filter" },
  },
  required: ["projectPath"],
};
