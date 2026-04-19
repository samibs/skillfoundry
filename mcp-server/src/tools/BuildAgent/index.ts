/**
 * BuildAgent tool module — self-contained MCP tool for sf_build.
 */

import { TOOL_NAME, TOOL_DESCRIPTION, TOOL_TIER, INPUT_SCHEMA } from "./constants.js";
import { CATEGORY } from "./permissions.js";
import { runBuild } from "./BuildAgent.js";
import type { ToolModule, ToolResult } from "../types.js";

const buildAgentModule: ToolModule = {
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  tier: TOOL_TIER,
  category: CATEGORY,
  inputSchema: INPUT_SCHEMA,

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = args.projectPath as string;
    if (!projectPath) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "projectPath is required" }) }],
        isError: true,
      };
    }

    try {
      const result = await runBuild(projectPath);
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

export default buildAgentModule;
