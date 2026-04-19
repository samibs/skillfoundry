/**
 * VerificationAgent constants — tool metadata and input schema for sf_verify.
 */

export const TOOL_NAME = "sf_verify";

export const TOOL_DESCRIPTION =
  "Verify other agents' output by running build, test, typecheck, or lint checks and comparing results against claimed output";

export const TOOL_TIER = "TIER1" as const;

export const INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    projectPath: { type: "string", description: "Absolute path to project root" },
    strategies: {
      type: "array",
      items: { type: "string", enum: ["build", "test", "typecheck", "lint"] },
      description: "Verification strategies to run",
    },
    claims: {
      type: "object",
      description:
        'What the previous agent claimed (e.g., {"build": "passed", "test": "15/15 passed"})',
      additionalProperties: { type: "string" },
    },
  },
  required: ["projectPath", "strategies"],
};
