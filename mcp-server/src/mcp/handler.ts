import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { SkillDefinition } from "../skills/loader.js";
import { verifyAuthFlow, type AuthTestInput } from "../agents/playwright-agent.js";
import { runSemgrepScan, type SemgrepInput } from "../agents/semgrep-agent.js";
import { applyGate, canPromote, type EvidenceSource } from "../knowledge/memory-gate.js";
import { runHarvest, getQuirks } from "../knowledge/harvester.js";

// ─── Tool Agent Definitions ──────────────────────────────────────────────────

const TOOL_AGENTS = [
  {
    name: "sf_verify_auth",
    description:
      "Run Playwright browser test to verify auth flows (login, session cookies, protected routes). " +
      "Returns REAL pass/fail with screenshot evidence — not LLM opinion.",
    inputSchema: {
      type: "object" as const,
      properties: {
        baseUrl: { type: "string", description: "Application base URL (e.g., https://myapp.example.com)" },
        email: { type: "string", description: "Test account email" },
        password: { type: "string", description: "Test account password" },
        loginPath: { type: "string", description: "Login page path (default: /login)" },
        expectedRedirect: { type: "string", description: "Expected path after login (e.g., /dashboard)" },
        protectedPath: { type: "string", description: "Protected route to test access control" },
      },
      required: ["baseUrl", "email", "password"],
    },
  },
  {
    name: "sf_security_scan",
    description:
      "Run Semgrep SAST scan on a project with OWASP rule packs. " +
      "Returns REAL findings with severity, file:line — not regex pattern matching.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Absolute path to project to scan" },
        rules: {
          type: "array",
          items: { type: "string" },
          description: "Semgrep rule packs (default: [\"p/owasp-top-ten\"])",
        },
        include: {
          type: "array",
          items: { type: "string" },
          description: "File patterns to include (e.g., [\"*.ts\", \"*.tsx\"])",
        },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_memory_gate",
    description:
      "Evaluate whether a knowledge pattern should be saved as 'verified' or 'observed'. " +
      "LLM reasoning alone = observed. Tool evidence (Playwright, Semgrep, build) = verified.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: ["evaluate", "promote"],
          description: "evaluate: check new entry. promote: upgrade observed→verified.",
        },
        framework: { type: "string", description: "Framework name (e.g., nextauth)" },
        versionRange: { type: "string", description: "Version range (e.g., 5.x-beta)" },
        quirk: { type: "string", description: "Description of the quirk/pattern" },
        fix: { type: "string", description: "How to fix it" },
        evidenceSource: {
          type: "string",
          enum: ["playwright", "semgrep", "build", "unit_test", "integration_test", "curl", "llm_reasoning", "manual"],
          description: "How this pattern was discovered/verified",
        },
        evidenceSummary: { type: "string", description: "Brief summary of the evidence" },
      },
      required: ["action", "framework", "quirk", "evidenceSource"],
    },
  },
  {
    name: "sf_harvest_knowledge",
    description:
      "Scan all app directories for AI session logs, extract failure patterns, " +
      "aggregate into knowledge base. Returns quirk candidates and stats.",
    inputSchema: {
      type: "object" as const,
      properties: {
        appsRoot: {
          type: "string",
          description: "Root directory containing app folders (e.g., /home/user/apps)",
        },
      },
      required: ["appsRoot"],
    },
  },
  {
    name: "sf_query_quirks",
    description:
      "Query the knowledge base for known deployment quirks by framework.",
    inputSchema: {
      type: "object" as const,
      properties: {
        framework: {
          type: "string",
          description: "Framework to query (e.g., nextauth, prisma, next.js). Omit for all.",
        },
      },
    },
  },
];

// ─── MCP Server ──────────────────────────────────────────────────────────────

export function createMcpServer(
  skills: Map<string, SkillDefinition>
): Server {
  const server = new Server(
    { name: "skillfoundry", version: "3.0.0" },
    { capabilities: { tools: {} } }
  );

  // List all available tools (LLM skills + tool agents)
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [];

    // LLM skill tools
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

    // Tool agent tools
    tools.push(...TOOL_AGENTS);

    return { tools };
  });

  // Handle tool invocations
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const typedArgs = args as Record<string, unknown>;

    // ─── Tool Agents (real execution) ───────────────────────────
    if (name === "sf_verify_auth") {
      const input: AuthTestInput = {
        baseUrl: typedArgs.baseUrl as string,
        email: typedArgs.email as string,
        password: typedArgs.password as string,
        loginPath: (typedArgs.loginPath as string) || "/login",
        expectedRedirect: typedArgs.expectedRedirect as string | undefined,
        protectedPath: typedArgs.protectedPath as string | undefined,
      };

      const result = await verifyAuthFlow(input);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        }],
        isError: !result.passed,
      };
    }

    if (name === "sf_security_scan") {
      const input: SemgrepInput = {
        projectPath: typedArgs.projectPath as string,
        rules: (typedArgs.rules as string[]) || undefined,
        include: (typedArgs.include as string[]) || undefined,
      };

      const result = await runSemgrepScan(input);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        }],
        isError: !result.passed,
      };
    }

    if (name === "sf_memory_gate") {
      const action = typedArgs.action as string;
      const evidenceSource = typedArgs.evidenceSource as EvidenceSource;

      if (action === "evaluate") {
        const { entry, decision } = applyGate(
          {
            framework: typedArgs.framework as string,
            versionRange: (typedArgs.versionRange as string) || "*",
            quirk: typedArgs.quirk as string,
            fix: (typedArgs.fix as string) || "",
            evidenceSource,
            evidenceSummary: (typedArgs.evidenceSummary as string) || "",
            discoveredAt: new Date().toISOString(),
            discoveredIn: (typedArgs.discoveredIn as string) || undefined,
          },
          evidenceSource
        );

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ entry, decision }, null, 2),
          }],
        };
      }

      if (action === "promote") {
        const decision = canPromote(
          {
            framework: typedArgs.framework as string,
            versionRange: (typedArgs.versionRange as string) || "*",
            quirk: typedArgs.quirk as string,
            fix: (typedArgs.fix as string) || "",
            confidence: "observed",
            evidenceSource,
            evidenceSummary: (typedArgs.evidenceSummary as string) || "",
            discoveredAt: new Date().toISOString(),
          },
          evidenceSource
        );

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(decision, null, 2),
          }],
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: `Unknown action: ${action}` }),
        }],
        isError: true,
      };
    }

    // ─── Knowledge Harvester ──────────────────────────────────
    if (name === "sf_harvest_knowledge") {
      const appsRoot = typedArgs.appsRoot as string;
      const result = await runHarvest(appsRoot);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            runId: result.runId,
            appsScanned: result.aggregation.appsScanned,
            appsWithData: result.aggregation.appsWithData,
            totalForgeLogs: result.aggregation.totalForgeLogs,
            failurePatterns: result.aggregation.failurePatterns.length,
            newQuirksInserted: result.newQuirksInserted,
            duplicatesSkipped: result.duplicatesSkipped,
            topEvents: result.aggregation.stats.topEvents.slice(0, 5),
            platformDistribution: result.aggregation.stats.platformDistribution,
            duration: result.duration,
          }, null, 2),
        }],
      };
    }

    if (name === "sf_query_quirks") {
      const framework = typedArgs.framework as string | undefined;
      const quirks = await getQuirks(framework);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            data: quirks,
            meta: { total: quirks.length, framework: framework || "all" },
          }, null, 2),
        }],
      };
    }

    // ─── LLM Skills (prompt context) ────────────────────────────
    const skillName = name.replace(/^sf_/, "");
    const skill = skills.get(skillName);

    if (!skill) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error: `Unknown tool: ${name}`,
            available: [...Array.from(skills.keys()).map(k => `sf_${k}`), ...TOOL_AGENTS.map(t => t.name)],
          }),
        }],
        isError: true,
      };
    }

    const projectPath = typedArgs?.projectPath as string;
    const skillArgs = typedArgs?.args as string | undefined;

    return {
      content: [{
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
      }],
    };
  });

  return server;
}
