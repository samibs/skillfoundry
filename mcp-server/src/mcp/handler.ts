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
import { createSkill } from "../agents/skill-factory.js";
import { insertDynamicSkill, listDynamicSkills, getCertifiedSkills } from "../state/db.js";
import { ALL_TOOL_AGENTS } from "./tool-registry.js";
import { dispatchToolAgent } from "./tool-dispatch.js";
import { guardSecrets } from "../agents/secret-guard-agent.js";
import { validateImports } from "../agents/import-validator-agent.js";
import { enforceDeviations, loadDeviationCatalog } from "../agents/deviation-enforcer-agent.js";
import { analyzeCorrections, queryProjectCorrections, getCorrectionTrend } from "../knowledge/correction-analyzer.js";
import { checkContracts } from "../agents/contract-check-agent.js";
import {
  optimizeJsonResponse,
  optimizeSkillResponse,
  type OptimizeOptions,
} from "./response-optimizer.js";
import {
  trackToolInvocation,
  getSessionTokenReport,
  getDailyTokenReport,
  type TokenTracker,
} from "./token-tracker.js";
import {
  analyzeForNudge,
  formatNudge,
} from "./memory-nudge.js";
import {
  indexToolResponse,
  searchHistory,
  rebuildSearchIndexes,
} from "./session-search.js";
import { getSessionId } from "./token-tracker.js";
import { stat } from "fs/promises";
import pathMod from "path";

// ─── Input Validation ─────────────────────────────────────────────────────

const ALLOWED_ROOTS = ["/home/", "/tmp/"];

async function validateProjectPath(raw: unknown): Promise<string> {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("projectPath must be a non-empty string");
  }
  const resolved = pathMod.resolve(raw);
  if (!ALLOWED_ROOTS.some(r => resolved.startsWith(r))) {
    throw new Error(`projectPath must be under ${ALLOWED_ROOTS.join(" or ")}`);
  }
  const s = await stat(resolved);
  if (!s.isDirectory()) {
    throw new Error("projectPath must be a directory");
  }
  return resolved;
}

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
  {
    name: "sf_create_skill",
    description:
      "Create a new certified AI skill on the fly using the iznir engine. " +
      "Analyzes intent, generates 6 guardrails, runs 10-case test suite, " +
      "certifies (80%+ required), exports as .md, and registers as live MCP tool. " +
      "Use when the user needs a capability that no existing skill covers.",
    inputSchema: {
      type: "object" as const,
      properties: {
        description: {
          type: "string",
          description: "What the skill should do (natural language description)",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "sf_list_dynamic_skills",
    description: "List all dynamically created skills and their certification status.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "sf_secret_guard",
    description:
      "Scan a project for hardcoded secrets (API keys, passwords, tokens, DB URLs, JWT secrets) " +
      "and validate .env.example completeness. Pre-commit secret prevention.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Absolute path to project to scan" },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_import_validator",
    description:
      "Validate all import/require statements in a project resolve to actual packages or local files. " +
      "Detects missing packages, broken local imports, and native module dependencies.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Absolute path to project to validate" },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_deviation_enforcer",
    description:
      "Scan a project against all known LLM deviation patterns (161 rules, 16 categories). " +
      "Detects code that matches known AI failure patterns.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Absolute path to project to scan" },
        maxViolations: { type: "number", description: "Max violations to report (default: 200)" },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_contract_check",
    description:
      "Validate frontend API calls match actual backend endpoints. " +
      "Supports NestJS controller prefixes, FastAPI router prefixes, and centralized API client baseURL resolution.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Absolute path to project to check" },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_query_corrections",
    description:
      "Query user correction patterns from AI session analysis. " +
      "Shows what the AI agents tend to get wrong and how often.",
    inputSchema: {
      type: "object" as const,
      properties: {
        appName: { type: "string", description: "Filter by project name (optional)" },
      },
    },
  },
];

// ─── MCP Server ──────────────────────────────────────────────────────────────

export function createMcpServer(
  skills: Map<string, SkillDefinition>
): Server {
  const server = new Server(
    { name: "skillfoundry", version: "5.5.0" },
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
            concise: {
              type: "boolean",
              description: "Return compressed skill content (strips examples, tables, verbose sections). Reduces tokens by 40-65%. Use for repeated/familiar skills.",
            },
          },
          required: ["projectPath"],
        },
      });
    }

    // Tool agent tools
    tools.push(...TOOL_AGENTS);
    tools.push(...ALL_TOOL_AGENTS);

    // Token optimization tools
    tools.push({
      name: "sf_token_report",
      description:
        "Get token usage report for the current session or daily summary. " +
        "Shows which tools consume the most output tokens, estimated cost, and budget warnings.",
      inputSchema: {
        type: "object" as const,
        properties: {
          date: {
            type: "string",
            description: "Date for daily report (YYYY-MM-DD). Omit for current session report.",
          },
        },
      },
    });

    tools.push({
      name: "sf_memory_search",
      description:
        "Full-text search across ALL session history — tool responses, session recordings, and knowledge base. " +
        "Supports FTS5 query syntax: quotes for exact phrases, AND/OR/NOT, prefix* matching. " +
        "Use to find past fixes, decisions, patterns, and errors across all projects.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: 'FTS5 search query (e.g., "prisma migration", "auth* AND error", "contract mismatch")',
          },
          scope: {
            type: "string",
            enum: ["all", "tools", "recordings"],
            description: "Search scope: all (default), tools (tool responses only), recordings (knowledge base only)",
          },
          toolName: {
            type: "string",
            description: "Filter by tool name (e.g., sf_build, sf_security_scan)",
          },
          appName: {
            type: "string",
            description: "Filter by project/app name",
          },
          limit: {
            type: "number",
            description: "Max results (default: 20)",
          },
        },
        required: ["query"],
      },
    });

    return { tools };
  });

  // Handle tool invocations
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const typedArgs = args as Record<string, unknown>;
    const startTime = Date.now();

    // Extract optimization options from args (available on all tools)
    const optimizeOpts: OptimizeOptions = {
      concise: typedArgs.concise === true,
    };

    // Helper: wrap tool result with token tracking, FTS indexing, and memory nudges
    function tracked(result: { content: Array<{ type: string; text: string }>; isError?: boolean }) {
      const text = result.content.map((c) => c.text).join("");
      trackToolInvocation(name, text, Date.now() - startTime);

      // Index for full-text search
      indexToolResponse(getSessionId(), name, text, result.isError === true);

      // Memory nudge: analyze noteworthy tool results for patterns worth recording
      const nudge = analyzeForNudge(name, text, result.isError === true);
      if (nudge) {
        const nudgeText = formatNudge(nudge);
        result.content.push({ type: "text" as const, text: nudgeText });
      }

      return result;
    }

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
      return tracked(optimizeJsonResponse(result, !result.passed, optimizeOpts));
    }

    if (name === "sf_security_scan") {
      const input: SemgrepInput = {
        projectPath: typedArgs.projectPath as string,
        rules: (typedArgs.rules as string[]) || undefined,
        include: (typedArgs.include as string[]) || undefined,
      };

      const result = await runSemgrepScan(input);
      return tracked(optimizeJsonResponse(result, !result.passed, optimizeOpts));
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

        return tracked(optimizeJsonResponse({ entry, decision }, false, optimizeOpts));
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

        return tracked(optimizeJsonResponse(decision, false, optimizeOpts));
      }

      return tracked(optimizeJsonResponse({ error: `Unknown action: ${action}` }, true, optimizeOpts));
    }

    // ─── Knowledge Harvester ──────────────────────────────────
    if (name === "sf_harvest_knowledge") {
      const appsRoot = typedArgs.appsRoot as string;
      const result = await runHarvest(appsRoot);
      return tracked(optimizeJsonResponse({
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
      }, false, optimizeOpts));
    }

    if (name === "sf_query_quirks") {
      const framework = typedArgs.framework as string | undefined;
      const quirks = await getQuirks(framework);
      return tracked(optimizeJsonResponse({
        data: quirks,
        meta: { total: quirks.length, framework: framework || "all" },
      }, false, optimizeOpts));
    }

    // ─── Secret Guard ────────────────────────────────────────
    if (name === "sf_secret_guard") {
      const pp = await validateProjectPath(typedArgs.projectPath);
      const result = await guardSecrets(pp);
      for (const f of result.findings) {
        f.matchedContent = f.matchedContent.slice(0, 20) + "****[REDACTED]";
      }
      return tracked(optimizeJsonResponse(result, result.summary.total > 0, optimizeOpts));
    }

    // ─── Import Validator ────────────────────────────────────
    if (name === "sf_import_validator") {
      const pp = await validateProjectPath(typedArgs.projectPath);
      const result = await validateImports(pp);
      return tracked(optimizeJsonResponse(result, result.summary.total > 0, optimizeOpts));
    }

    // ─── Deviation Enforcer ──────────────────────────────────
    if (name === "sf_deviation_enforcer") {
      const pp = await validateProjectPath(typedArgs.projectPath);
      await loadDeviationCatalog();
      const maxV = typeof typedArgs.maxViolations === "number" && typedArgs.maxViolations > 0
        ? Math.min(typedArgs.maxViolations, 500) : 200;
      const result = await enforceDeviations(pp, undefined, { maxViolations: maxV });
      return tracked(optimizeJsonResponse(result, result.totalViolations > 0, optimizeOpts));
    }

    // ─── Contract Check ──────────────────────────────────────
    if (name === "sf_contract_check") {
      const pp = await validateProjectPath(typedArgs.projectPath);
      const result = await checkContracts(pp);
      return tracked(optimizeJsonResponse(result, !result.passed, optimizeOpts));
    }

    // ─── Query Corrections ───────────────────────────────────
    if (name === "sf_query_corrections") {
      const appName = typedArgs.appName as string | undefined;
      if (appName) {
        const patterns = queryProjectCorrections(appName);
        return tracked(optimizeJsonResponse({ appName, patterns }, false, optimizeOpts));
      }
      const trend = getCorrectionTrend();
      return tracked(optimizeJsonResponse(trend, false, optimizeOpts));
    }

    // ─── Tier 1/2/3 Tool Agents ─────────────────────────────
    const toolResult = await dispatchToolAgent(name, typedArgs);
    if (toolResult) return tracked(toolResult);

    // ─── Skill Factory ────────────────────────────────────────
    if (name === "sf_create_skill") {
      const description = typedArgs.description as string;

      try {
        const newSkill = await createSkill(description);
        insertDynamicSkill(newSkill);

        if (newSkill.status === "certified" && newSkill.exportedContent) {
          skills.set(newSkill.name.toLowerCase().replace(/\s+/g, "-"), {
            name: newSkill.name.toLowerCase().replace(/\s+/g, "-"),
            description: newSkill.description,
            filePath: `factory://${newSkill.id}`,
            content: newSkill.exportedContent,
            metadata: { dynamic: true, domain: newSkill.domain, riskLevel: newSkill.riskLevel },
          });
        }

        return tracked(optimizeJsonResponse({
          status: newSkill.status,
          name: newSkill.name,
          domain: newSkill.domain,
          riskLevel: newSkill.riskLevel,
          guardrails: newSkill.guardrails.length,
          testScore: newSkill.testResults?.score,
          certified: newSkill.status === "certified",
          registeredAsMcpTool: newSkill.status === "certified",
          mcpToolName: newSkill.status === "certified"
            ? `sf_${newSkill.name.toLowerCase().replace(/\s+/g, "-")}`
            : null,
          tags: newSkill.tags,
        }, newSkill.status === "failed", optimizeOpts));
      } catch (err) {
        return tracked(optimizeJsonResponse(
          { error: `Skill creation failed: ${(err as Error).message}` },
          true,
          optimizeOpts,
        ));
      }
    }

    if (name === "sf_list_dynamic_skills") {
      const allSkills = listDynamicSkills();
      return tracked(optimizeJsonResponse({
        data: allSkills.map((s) => ({
          name: s.name,
          status: s.status,
          domain: s.domain,
          riskLevel: s.riskLevel,
          testScore: s.testResults?.score,
          certified: s.status === "certified",
          createdAt: s.createdAt,
        })),
        meta: {
          total: allSkills.length,
          certified: allSkills.filter((s) => s.status === "certified").length,
          failed: allSkills.filter((s) => s.status === "failed").length,
        },
      }, false, optimizeOpts));
    }

    // ─── Token Budget Report ─────────────────────────────────
    if (name === "sf_token_report") {
      const reportDate = typedArgs.date as string | undefined;
      const report = reportDate
        ? getDailyTokenReport(reportDate)
        : getSessionTokenReport();
      return tracked(optimizeJsonResponse(report, false, optimizeOpts));
    }

    // ─── Session Search (FTS5) ───────────────────────────────
    if (name === "sf_memory_search") {
      const query = typedArgs.query as string;
      if (!query || query.trim().length === 0) {
        return tracked(optimizeJsonResponse({ error: "query is required" }, true, optimizeOpts));
      }
      const results = searchHistory({
        query,
        scope: (typedArgs.scope as "all" | "tools" | "recordings") || "all",
        toolName: typedArgs.toolName as string | undefined,
        appName: typedArgs.appName as string | undefined,
        limit: (typedArgs.limit as number) || 20,
      });
      return tracked(optimizeJsonResponse({
        query,
        results,
        meta: { total: results.length, scope: typedArgs.scope || "all" },
      }, false, optimizeOpts));
    }

    // ─── LLM Skills (prompt context) ────────────────────────────
    const skillName = name.replace(/^sf_/, "");
    const skill = skills.get(skillName);

    if (!skill) {
      return tracked(optimizeJsonResponse({
        error: `Unknown tool: ${name}`,
        available: [...Array.from(skills.keys()).map(k => `sf_${k}`), ...TOOL_AGENTS.map(t => t.name)],
      }, true, optimizeOpts));
    }

    const projectPath = typedArgs?.projectPath as string;
    const skillArgs = typedArgs?.args as string | undefined;

    return tracked(optimizeSkillResponse(
      skill.name,
      skill.content,
      projectPath,
      skillArgs,
      optimizeOpts,
    ));
  });

  return server;
}
