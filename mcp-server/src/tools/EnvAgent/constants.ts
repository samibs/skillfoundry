/**
 * EnvAgent constants — tool metadata and input schema for sf_check_env.
 */

export const TOOL_NAME = "sf_check_env";

export const TOOL_DESCRIPTION =
  "Compare .env against .env.example. Find missing/empty vars. Optionally auto-generate secrets.";

export const TOOL_TIER = "TIER2" as const;

export const INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    projectPath: { type: "string", description: "Project root path" },
    autoGenerate: {
      type: "boolean",
      description:
        "Auto-generate missing secrets (SECRET, API_KEY, WEBHOOK)",
    },
  },
  required: ["projectPath"],
};
