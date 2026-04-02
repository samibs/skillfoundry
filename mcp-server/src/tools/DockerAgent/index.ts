/**
 * DockerAgent tool module — exports TWO MCP tools: sf_docker_build and sf_docker_compose.
 */

import {
  DOCKER_BUILD_NAME,
  DOCKER_BUILD_DESCRIPTION,
  DOCKER_COMPOSE_NAME,
  DOCKER_COMPOSE_DESCRIPTION,
  TOOL_TIER,
  DOCKER_BUILD_SCHEMA,
  DOCKER_COMPOSE_SCHEMA,
} from "./constants.js";
import { CATEGORY } from "./permissions.js";
import { dockerBuild, composeUp } from "./DockerAgent.js";
import type { ToolModule, ToolResult } from "../types.js";

const dockerBuildModule: ToolModule = {
  name: DOCKER_BUILD_NAME,
  description: DOCKER_BUILD_DESCRIPTION,
  tier: TOOL_TIER,
  category: CATEGORY,
  inputSchema: DOCKER_BUILD_SCHEMA,

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = args.projectPath as string;
    if (!projectPath) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "projectPath is required" }) }],
        isError: true,
      };
    }

    try {
      const result = await dockerBuild(projectPath, args.tag as string | undefined);
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

const dockerComposeModule: ToolModule = {
  name: DOCKER_COMPOSE_NAME,
  description: DOCKER_COMPOSE_DESCRIPTION,
  tier: TOOL_TIER,
  category: CATEGORY,
  inputSchema: DOCKER_COMPOSE_SCHEMA,

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const projectPath = args.projectPath as string;
    if (!projectPath) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "projectPath is required" }) }],
        isError: true,
      };
    }

    try {
      const result = await composeUp(projectPath, args.detach as boolean | undefined);
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

const dockerAgentModules: ToolModule[] = [dockerBuildModule, dockerComposeModule];

export default dockerAgentModules;
