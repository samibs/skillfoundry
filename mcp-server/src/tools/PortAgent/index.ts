/**
 * PortAgent tool module — self-contained MCP tools for sf_assign_port and sf_check_port.
 */

import {
  ASSIGN_PORT_NAME,
  ASSIGN_PORT_DESCRIPTION,
  CHECK_PORT_NAME,
  CHECK_PORT_DESCRIPTION,
  TOOL_TIER,
  ASSIGN_PORT_SCHEMA,
  CHECK_PORT_SCHEMA,
} from "./constants.js";
import { CATEGORY } from "./permissions.js";
import { assignPort, checkPort } from "./PortAgent.js";
import type { ToolModule, ToolResult } from "../types.js";

const assignPortModule: ToolModule = {
  name: ASSIGN_PORT_NAME,
  description: ASSIGN_PORT_DESCRIPTION,
  tier: TOOL_TIER,
  category: CATEGORY,
  inputSchema: ASSIGN_PORT_SCHEMA,

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const appName = args.appName as string;
    if (!appName) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "appName is required" }) }],
        isError: true,
      };
    }

    try {
      const result = await assignPort(appName);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: !result.assigned,
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

const checkPortModule: ToolModule = {
  name: CHECK_PORT_NAME,
  description: CHECK_PORT_DESCRIPTION,
  tier: TOOL_TIER,
  category: CATEGORY,
  inputSchema: CHECK_PORT_SCHEMA,

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const port = args.port as number;
    if (port === undefined || port === null) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "port is required" }) }],
        isError: true,
      };
    }

    try {
      const result = await checkPort(port);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: false,
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

const portAgentModules: ToolModule[] = [assignPortModule, checkPortModule];

export default portAgentModules;
