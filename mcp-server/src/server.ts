import express from "express";
import { watch } from "fs";
import { randomUUID } from "crypto";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadSkills, reloadSkill } from "./skills/loader.js";
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
  console.log("SkillFoundry MCP Server v5.13.0");
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
        minModel: null,
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

  // JSON parsing for REST API only — NOT for the SSE raw-body endpoint.
  // Streamable HTTP (/mcp/http) DOES need JSON parsing.
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

  // ── Streamable HTTP transport (MCP 2025-03-26 spec) ─────────────────────
  // Single endpoint handles both GET (server-sent events) and POST (JSON-RPC).
  // Each session gets its own transport instance keyed by mcp-session-id header.
  const streamableTransports = new Map<string, StreamableHTTPServerTransport>();

  const handleStreamableHttp = async (
    req: express.Request,
    res: express.Response,
  ): Promise<void> => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && streamableTransports.has(sessionId)) {
      // Existing session — route to its transport
      const transport = streamableTransports.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && req.method === "POST") {
      // New session — initialize transport and connect to shared MCP server
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });
      await mcpServer.connect(transport);
      const sid = transport.sessionId!;
      streamableTransports.set(sid, transport);
      transport.onclose = () => {
        console.log(`[MCP/HTTP] Session closed: ${sid}`);
        streamableTransports.delete(sid);
      };
      console.log(`[MCP/HTTP] New session: ${sid}`);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      error: sessionId
        ? `Unknown session: ${sessionId}`
        : "Missing mcp-session-id header. Send a POST to initialize a new session.",
    });
  };

  app.get("/mcp/http", handleStreamableHttp);
  app.post("/mcp/http", handleStreamableHttp);
  app.delete("/mcp/http", handleStreamableHttp);

  // Start HTTP server
  app.listen(PORT, () => {
    console.log(`\nServer running on port ${PORT}`);
    console.log(`  Health:       http://localhost:${PORT}/health`);
    console.log(`  Ready:        http://localhost:${PORT}/ready`);
    console.log(`  Agents:       http://localhost:${PORT}/api/v1/agents`);
    console.log(`  MCP SSE:      http://localhost:${PORT}/mcp/sse`);
    console.log(`  MCP HTTP:     http://localhost:${PORT}/mcp/http  (Streamable HTTP, MCP 2025-03-26)`);
    console.log(`\nTo connect from Claude Code (SSE), add to settings.json:`);
    console.log(`  "mcpServers": { "skillfoundry": { "url": "http://localhost:${PORT}/mcp/sse" } }`);
    console.log(`\nTo connect via Streamable HTTP, use endpoint:`);
    console.log(`  http://localhost:${PORT}/mcp/http`);
  });

  // Run bootstrap pipeline and publish state to health/ready endpoints
  const pipeline = createBootstrapPipeline();
  try {
    await pipeline.run();
  } catch (err) {
    console.error("[bootstrap] Pipeline failed:", (err as Error).message);
  }
  setBootstrapState(pipeline.getState());

  // Hot-reload watcher — debounced 400ms to coalesce rapid editor saves
  const reloadTimers = new Map<string, ReturnType<typeof setTimeout>>();
  for (const skillDir of SKILL_DIRS) {
    try {
      watch(skillDir, { recursive: false }, (_event, filename) => {
        if (!filename || !filename.endsWith(".md")) return;
        const filePath = path.join(skillDir, filename);
        const existing = reloadTimers.get(filePath);
        if (existing) clearTimeout(existing);
        reloadTimers.set(
          filePath,
          setTimeout(async () => {
            reloadTimers.delete(filePath);
            try {
              const name = await reloadSkill(filePath, skills);
              if (name !== null) {
                console.log(`[hot-reload] ${skills.has(name) ? "Updated" : "Removed"}: ${filename} → sf_${name}`);
              }
            } catch (err) {
              console.warn(`[hot-reload] Failed to reload ${filename}:`, (err as Error).message);
            }
          }, 400),
        );
      });
      console.log(`[hot-reload] Watching: ${skillDir}`);
    } catch {
      // Directory may not exist on some setups — non-fatal
      console.warn(`[hot-reload] Could not watch: ${skillDir}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
