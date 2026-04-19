/**
 * GitAgent tool module — self-contained MCP tools for sf_git_status and sf_git_commit.
 *
 * Exports an ARRAY of ToolModules because this agent handles two MCP tools.
 */

import {
  GIT_STATUS_TOOL_NAME,
  GIT_STATUS_DESCRIPTION,
  GIT_COMMIT_TOOL_NAME,
  GIT_COMMIT_DESCRIPTION,
  TOOL_TIER,
  GIT_STATUS_INPUT_SCHEMA,
  GIT_COMMIT_INPUT_SCHEMA,
} from "./constants.js";
import { CATEGORY } from "./permissions.js";
import { getStatus, commit } from "./GitAgent.js";
import type { ToolModule, ToolResult } from "../types.js";

const gitStatusModule: ToolModule = {
  name: GIT_STATUS_TOOL_NAME,
  description: GIT_STATUS_DESCRIPTION,
  tier: TOOL_TIER,
  category: CATEGORY,
  inputSchema: GIT_STATUS_INPUT_SCHEMA,

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = args.projectPath as string;
    if (!projectPath) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "projectPath is required" }) }],
        isError: true,
      };
    }

    try {
      const result = await getStatus(projectPath);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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

const gitCommitModule: ToolModule = {
  name: GIT_COMMIT_TOOL_NAME,
  description: GIT_COMMIT_DESCRIPTION,
  tier: TOOL_TIER,
  category: CATEGORY,
  inputSchema: GIT_COMMIT_INPUT_SCHEMA,

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = args.projectPath as string;
    const commitMessage = args.message as string;

    if (!projectPath) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "projectPath is required" }) }],
        isError: true,
      };
    }
    if (!commitMessage) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "message is required" }) }],
        isError: true,
      };
    }

    const files = args.files as string[] | undefined;

    try {
      const result = await commit(projectPath, commitMessage, files);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: !result.success,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: errorMsg }) }],
        isError: true,
      };
    }
  },
};

const gitAgentModules: ToolModule[] = [gitStatusModule, gitCommitModule];

export default gitAgentModules;
