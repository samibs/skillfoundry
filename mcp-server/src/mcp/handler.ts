import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { SkillDefinition } from "../skills/loader.js";

/**
 * Create an MCP Server instance with all loaded skills registered as tools.
 */
export function createMcpServer(
  skills: Map<string, SkillDefinition>
): Server {
  const server = new Server(
    {
      name: "skillfoundry",
      version: "3.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [];

    for (const [name, skill] of skills) {
      tools.push({
        name: `sf_${name}`,
        description: skill.description,
        inputSchema: {
          type: "object" as const,
          properties: {
            projectPath: {
              type: "string",
              description: "Absolute path to the target project",
            },
            args: {
              type: "string",
              description: "Optional arguments for the skill",
            },
          },
          required: ["projectPath"],
        },
      });
    }

    return { tools };
  });

  // Handle tool invocations
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Strip sf_ prefix to find the skill
    const skillName = name.replace(/^sf_/, "");
    const skill = skills.get(skillName);

    if (!skill) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: `Unknown skill: ${skillName}`,
              available: Array.from(skills.keys()),
            }),
          },
        ],
        isError: true,
      };
    }

    const projectPath = (args as Record<string, unknown>)?.projectPath as string;
    const skillArgs = (args as Record<string, unknown>)?.args as string | undefined;

    // Return the skill content as context for the LLM to execute.
    // In Phase 1, skills are prompt context — the LLM reads them and acts.
    // In Phase 2+, tool agents will execute real tools instead.
    return {
      content: [
        {
          type: "text" as const,
          text: [
            `# Executing SkillFoundry skill: ${skill.name}`,
            `**Project:** ${projectPath}`,
            skillArgs ? `**Arguments:** ${skillArgs}` : "",
            "",
            "---",
            "",
            skill.content,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  });

  return server;
}
