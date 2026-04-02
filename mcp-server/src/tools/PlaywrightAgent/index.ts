/**
 * PlaywrightAgent tool module — self-contained MCP tool for sf_verify_auth.
 */

import { TOOL_NAME, TOOL_DESCRIPTION, TOOL_TIER, INPUT_SCHEMA } from "./constants.js";
import { CATEGORY } from "./permissions.js";
import { verifyAuthFlow } from "./PlaywrightAgent.js";
import type { ToolModule, ToolResult } from "../types.js";

const playwrightAgentModule: ToolModule = {
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  tier: TOOL_TIER,
  category: CATEGORY,
  inputSchema: INPUT_SCHEMA,

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = args.projectPath as string;
    const loginUrl = args.loginUrl as string;
    const credentials = args.credentials as { email: string; password: string } | undefined;

    if (!projectPath) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "projectPath is required" }) }],
        isError: true,
      };
    }

    if (!loginUrl) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "loginUrl is required" }) }],
        isError: true,
      };
    }

    if (!credentials || !credentials.email || !credentials.password) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "credentials with email and password are required" }) }],
        isError: true,
      };
    }

    try {
      // Parse base URL and login path from loginUrl
      const parsed = new URL(loginUrl);
      const baseUrl = `${parsed.protocol}//${parsed.host}`;
      const loginPath = parsed.pathname;

      const result = await verifyAuthFlow({
        baseUrl,
        loginPath,
        email: credentials.email,
        password: credentials.password,
        evidenceDir: `/tmp/sf-playwright-evidence/${projectPath.replace(/\//g, "_")}`,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: !result.passed,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: message }) }],
        isError: true,
      };
    }
  },
};

export default playwrightAgentModule;
