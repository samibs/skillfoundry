/**
 * LighthouseAgent tool module — self-contained MCP tool for sf_lighthouse.
 */

import { TOOL_NAME, TOOL_DESCRIPTION, TOOL_TIER, INPUT_SCHEMA } from "./constants.js";
import { CATEGORY } from "./permissions.js";
import { runLighthouse } from "./LighthouseAgent.js";
import type { ToolModule, ToolResult } from "../types.js";

const lighthouseAgentModule: ToolModule = {
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  tier: TOOL_TIER,
  category: CATEGORY,
  inputSchema: INPUT_SCHEMA,

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const url = args.url as string;
    if (!url) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "url is required" }) }],
        isError: true,
      };
    }

    try {
      const result = await runLighthouse(url);
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

export default lighthouseAgentModule;
