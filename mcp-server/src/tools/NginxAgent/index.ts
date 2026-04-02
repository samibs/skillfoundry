/**
 * NginxAgent tool module — self-contained MCP tool for sf_nginx_config.
 */

import { TOOL_NAME, TOOL_DESCRIPTION, TOOL_TIER, INPUT_SCHEMA } from "./constants.js";
import { CATEGORY } from "./permissions.js";
import { setupNginxForApp } from "./NginxAgent.js";
import type { ToolModule, ToolResult } from "../types.js";

const nginxAgentModule: ToolModule = {
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  tier: TOOL_TIER,
  category: CATEGORY,
  inputSchema: INPUT_SCHEMA,

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const domain = args.domain as string;
    const port = args.port as number;

    if (!domain) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "domain is required" }) }],
        isError: true,
      };
    }

    if (!port) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "port is required" }) }],
        isError: true,
      };
    }

    try {
      const ssl = args.ssl as boolean | undefined;
      const result = await setupNginxForApp({ domain, port, ssl });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: !result.generated,
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

export default nginxAgentModule;
