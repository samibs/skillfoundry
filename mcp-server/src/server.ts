import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { loadSkills } from "./skills/loader.js";
import { createMcpServer } from "./mcp/handler.js";
import { createApiRouter, setBootstrapState, setRegisteredTools } from "./api/routes.js";
import { initDatabase, getCertifiedSkills } from "./state/db.js";
import { ensureMetricsTable } from "./state/metrics.js";
import { ensureTokenTrackingTable } from "./mcp/token-tracker.js";
import { ensureSearchTables } from "./mcp/session-search.js";
import { createBootstrapPipeline } from "./bootstrap/index.js";
import { ToolRegistry } from "./tools/registry.js";
import path from "path";

const PORT = parseInt(process.env.SKILLFOUNDRY_PORT || "9877", 10);
const FRAMEWORK_ROOT = path.resolve(
  process.env.SKILLFOUNDRY_ROOT || path.join(import.meta.dirname, "..", "..")
);

// Skill directories to scan (in priority order — first occurrence wins on name collision)
const SKILL_DIRS = [
  process.env.SKILLFOUNDRY_COMMANDS_DIR ||
    path.join(FRAMEWORK_ROOT, ".claude", "commands"),
  process.env.SKILLFOUNDRY_AGENTS_DIR ||
    path.join(FRAMEWORK_ROOT, "agents"),
];

async function main(): Promise<void> {
  console.log("SkillFoundry MCP Server v5.5.0");
  console.log(`Framework root: ${FRAMEWORK_ROOT}`);
  console.log(`Skill directories: ${SKILL_DIRS.join(", ")}`);

  // Initialize SQLite (knowledge store + metrics + token tracking)
  await initDatabase();
  ensureMetricsTable();
  ensureTokenTrackingTable();
  ensureSearchTables();
  console.log("Database initialized (with token tracking + FTS5 search)");

  // Load all skills (static .md files)
  const skills = await loadSkills(SKILL_DIRS);

  // Load dynamic skills from SQLite (created by skill factory)
  const dynamicSkills = getCertifiedSkills();
  for (const ds of dynamicSkills) {
    if (ds.exportedContent && !skills.has(ds.name.toLowerCase().replace(/\s+/g, "-"))) {
      skills.set(ds.name.toLowerCase().replace(/\s+/g, "-"), {
        name: ds.name.toLowerCase().replace(/\s+/g, "-"),
        description: ds.description,
        filePath: `factory://${ds.id}`,
        content: ds.exportedContent,
        metadata: { dynamic: true, domain: ds.domain, riskLevel: ds.riskLevel },
      });
    }
  }

  console.log(`Loaded ${skills.size} skills (${dynamicSkills.length} dynamic)`);

  // Discover tool modules (compiled agents in src/tools/)
  const toolRegistry = new ToolRegistry();
  const toolsDir = path.join(import.meta.dirname, "tools");
  await toolRegistry.discover(toolsDir);
  setRegisteredTools(toolRegistry.list());
  console.log(`Discovered ${toolRegistry.size} tool modules`);

  // Create MCP server
  const mcpServer = createMcpServer(skills);

  // Create Express app
  const app = express();

  // JSON parsing for REST API only — NOT for MCP message endpoint
  // (SSEServerTransport reads the raw request body itself)
  app.use((req, res, next) => {
    if (req.path === "/mcp/messages") return next();
    express.json()(req, res, next);
  });

  // REST API routes
  const apiRouter = createApiRouter(skills);
  app.use(apiRouter);

  // SSE transport for MCP
  // Stores active transports keyed by session ID
  const transports = new Map<string, SSEServerTransport>();

  // MCP SSE endpoint — client connects here for the event stream
  app.get("/mcp/sse", async (req, res) => {
    console.log("[MCP] New SSE connection");
    const transport = new SSEServerTransport("/mcp/messages", res);
    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);

    res.on("close", () => {
      console.log(`[MCP] SSE connection closed: ${sessionId}`);
      transports.delete(sessionId);
    });

    await mcpServer.connect(transport);
  });

  // MCP message endpoint — client POSTs messages here
  app.post("/mcp/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);

    if (!transport) {
      res.status(400).json({
        error: "No active SSE connection for this session. Connect to /mcp/sse first.",
      });
      return;
    }

    await transport.handlePostMessage(req, res);
  });

  // Start HTTP server
  app.listen(PORT, () => {
    console.log(`\nServer running on port ${PORT}`);
    console.log(`  Health:   http://localhost:${PORT}/health`);
    console.log(`  Ready:    http://localhost:${PORT}/ready`);
    console.log(`  Agents:   http://localhost:${PORT}/api/v1/agents`);
    console.log(`  MCP SSE:  http://localhost:${PORT}/mcp/sse`);
    console.log(`\nTo connect from Claude Code, add to settings.json:`);
    console.log(
      `  "mcpServers": { "skillfoundry": { "url": "http://localhost:${PORT}/mcp/sse" } }`
    );
  });

  // Run bootstrap pipeline and publish state to health/ready endpoints
  const pipeline = createBootstrapPipeline();
  try {
    await pipeline.run();
  } catch (err) {
    console.error("[bootstrap] Pipeline failed:", (err as Error).message);
  }
  setBootstrapState(pipeline.getState());
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
