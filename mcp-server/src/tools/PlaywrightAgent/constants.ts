/**
 * PlaywrightAgent constants — tool metadata and input schema for sf_verify_auth.
 */

export const TOOL_NAME = "sf_verify_auth";

export const TOOL_DESCRIPTION =
  "Test auth flows in a real browser using Playwright. Verifies login, session cookies, redirects.";

export const TOOL_TIER = "TIER1" as const;

export const INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    projectPath: { type: "string", description: "Project root path" },
    loginUrl: { type: "string", description: "Login page URL" },
    credentials: {
      type: "object",
      properties: {
        email: { type: "string" },
        password: { type: "string" },
      },
      required: ["email", "password"],
    },
  },
  required: ["projectPath", "loginUrl", "credentials"],
};
