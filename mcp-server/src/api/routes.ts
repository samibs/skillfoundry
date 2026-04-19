import { Router } from "express";
import type { SkillDefinition } from "../skills/loader.js";
import type { BootstrapState } from "../bootstrap/pipeline.js";
import type { ToolModule, ToolCategory } from "../tools/types.js";
import { buildCommandGraph, graphSummary } from "../registry/command-graph.js";
import { runHarvest, getQuirks } from "../knowledge/harvester.js";
import { getRoutingTable, getTodaySpend } from "../agents/cost-router.js";
import { getMetricsSummary, getAgentMetrics } from "../state/metrics.js";
import { getFleetHealth, querySessionRecordings } from "../state/db.js";
import { listSessions, loadSession } from "../session/persistence.js";
import { createSessionConfig } from "../session/config.js";

const VERSION = "5.4.0";
const startTime = Date.now();

let storedBootstrapState: BootstrapState | null = null;
let registeredTools: ToolModule[] = [];

const VALID_CATEGORIES = new Set<ToolCategory>(['builtin', 'plugin', 'skill', 'dynamic']);

/**
 * Store the bootstrap state so the /health and /ready endpoints can report it.
 * Call this from the server after the bootstrap pipeline completes (or fails).
 * @param state - Snapshot of the bootstrap pipeline state
 */
export function setBootstrapState(state: BootstrapState): void {
  storedBootstrapState = state;
}

/**
 * Store the registered tool modules so the /api/v1/agents endpoint can
 * segment them via the command graph.
 * Call this from server.ts after tool discovery completes.
 * @param tools - Array of registered ToolModule instances
 */
export function setRegisteredTools(tools: ToolModule[]): void {
  registeredTools = tools;
}

export function createApiRouter(
  skills: Map<string, SkillDefinition>
): Router {
  const router = Router();

  // Health check
  router.get("/health", (_req, res) => {
    const bsState = storedBootstrapState;

    if (bsState === null) {
      res.json({
        status: "starting",
        version: VERSION,
        bootstrap: { stage: "unknown" },
        tools: { registered: skills.size },
        uptime: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const isComplete = bsState.currentStage === "complete";

    res.json({
      status: isComplete ? "healthy" : "starting",
      name: "skillfoundry-mcp-server",
      version: VERSION,
      bootstrap: {
        stage: isComplete ? "ready" : bsState.currentStage,
        completed: bsState.completedStages,
        total: bsState.totalStages,
        durationMs: bsState.durationMs,
        errors: bsState.errors,
      },
      tools: {
        registered: skills.size,
      },
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness probe — returns 503 until bootstrap is fully complete
  router.get("/ready", (_req, res) => {
    if (
      storedBootstrapState !== null &&
      storedBootstrapState.currentStage === "complete"
    ) {
      res.json({ status: "ready" });
      return;
    }

    const currentStage = storedBootstrapState?.currentStage ?? "unknown";
    res.status(503).json({
      status: "not_ready",
      stage: currentStage,
    });
  });

  // List all loaded agents/skills, with optional category segmentation
  router.get("/api/v1/agents", (req, res) => {
    const categoryParam = req.query.category as string | undefined;

    // Build the command graph from registered tool modules
    const graph = buildCommandGraph(registeredTools);
    const summary = graphSummary(graph);

    // If a specific category was requested, validate and return only that segment
    if (categoryParam !== undefined) {
      if (!VALID_CATEGORIES.has(categoryParam as ToolCategory)) {
        res.status(400).json({
          error: {
            code: "INVALID_CATEGORY",
            message: `Invalid category '${categoryParam}'. Valid values: builtin, plugin, skill, dynamic`,
          },
        });
        return;
      }

      const categoryKey = categoryParam as ToolCategory;
      const segmentKeyMap: Record<ToolCategory, keyof typeof graph> = {
        builtin: 'builtins',
        plugin: 'plugins',
        skill: 'skills',
        dynamic: 'dynamic',
      };
      const segment = graph[segmentKeyMap[categoryKey]];
      const tools = segment.map((tool) => ({
        name: tool.name,
        description: tool.description,
        tier: tool.tier,
        category: tool.category,
        status: "active",
      }));

      res.json({
        data: tools,
        meta: { category: categoryKey, total: tools.length },
      });
      return;
    }

    // No category filter — return skill-based agents plus command graph summary
    const agents = Array.from(skills.entries()).map(([name, skill]) => ({
      name,
      mcpToolName: `sf_${name}`,
      description: skill.description,
      filePath: skill.filePath,
      type: "llm_agent",
      status: "active",
    }));

    res.json({
      data: agents,
      meta: {
        total: agents.length,
        graph: summary,
      },
    });
  });

  // Get specific agent
  router.get("/api/v1/agents/:name", (req, res) => {
    const skill = skills.get(req.params.name);
    if (!skill) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: `Agent '${req.params.name}' not found` },
      });
      return;
    }

    res.json({
      data: {
        name: skill.name,
        mcpToolName: `sf_${skill.name}`,
        description: skill.description,
        filePath: skill.filePath,
        type: "llm_agent",
        status: "active",
        metadata: skill.metadata,
        contentLength: skill.content.length,
      },
    });
  });

  // ─── Knowledge API ──────────────────────────────────────────

  // Query known quirks
  router.get("/api/v1/knowledge/quirks", async (req, res) => {
    try {
      const framework = req.query.framework as string | undefined;
      const quirks = await getQuirks(framework);
      res.json({ data: quirks, meta: { total: quirks.length } });
    } catch (err) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: (err as Error).message },
      });
    }
  });

  // Trigger knowledge harvest
  // Accepts: { appsRoot: string } OR { appsRoots: string[] }
  router.post("/api/v1/knowledge/harvest", async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const appsRoot = body?.appsRoot as string | undefined;
      const appsRoots = body?.appsRoots as string[] | undefined;

      // Build list of roots to scan
      let roots: string[] = [];
      if (appsRoots && Array.isArray(appsRoots) && appsRoots.length > 0) {
        roots = appsRoots;
      } else if (appsRoot) {
        roots = [appsRoot];
      }

      if (roots.length === 0) {
        res.status(400).json({
          error: {
            code: "VALIDATION_FAILED",
            message: "appsRoot (string) or appsRoots (string[]) is required",
          },
        });
        return;
      }

      const result = await runHarvest(roots);
      res.json({
        data: {
          runId: result.runId,
          appsScanned: result.aggregation.appsScanned,
          appsWithData: result.aggregation.appsWithData,
          newQuirksInserted: result.newQuirksInserted,
          duplicatesSkipped: result.duplicatesSkipped,
          failurePatterns: result.aggregation.failurePatterns.length,
          duration: result.duration,
          platformDistribution: result.aggregation.stats.platformDistribution,
          artifactSummary: result.aggregation.stats.artifactSummary,
        },
      });
    } catch (err) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: (err as Error).message },
      });
    }
  });

  // ─── Fleet Health API ─────────────────────────────────────

  router.get("/api/v1/fleet/health", async (_req, res) => {
    try {
      const fleet = getFleetHealth();
      const total = fleet.length;
      const assessed = fleet.filter((f) => f.hasForgeSession).length;
      const unassessed = total - assessed;
      const withMemoryBank = fleet.filter((f) => f.hasMemoryBank).length;
      const staleApps = fleet.filter((f) => {
        if (!f.frameworkVersion) return true;
        const parts = f.frameworkVersion.split(".");
        const major = parseInt(parts[0], 10);
        const minor = parseInt(parts[1] || "0", 10);
        const patch = parseInt(parts[2] || "0", 10);
        // Version scheme is MAJOR.MINOR.PATCH (e.g., 2.0.73)
        // Stale = anything below 2.0.70
        if (major < 2) return true;
        if (major === 2 && minor === 0 && patch < 70) return true;
        return false;
      });

      // Platform distribution
      const platforms: Record<string, number> = {};
      for (const app of fleet) {
        for (const p of app.platforms) {
          platforms[p] = (platforms[p] || 0) + 1;
        }
      }

      // Framework version distribution
      const versions: Record<string, number> = {};
      for (const app of fleet) {
        if (app.frameworkVersion) {
          versions[app.frameworkVersion] = (versions[app.frameworkVersion] || 0) + 1;
        }
      }

      res.json({
        data: {
          summary: {
            totalApps: total,
            assessedApps: assessed,
            unassessedApps: unassessed,
            assessmentCoverage: total > 0 ? Math.round((assessed / total) * 100) : 0,
            appsWithMemoryBank: withMemoryBank,
            staleApps: staleApps.length,
          },
          platformDistribution: platforms,
          frameworkVersions: versions,
          staleApps: staleApps.map((a) => ({
            name: a.appName,
            version: a.frameworkVersion,
            lastHarvest: a.lastHarvestAt,
          })),
          unassessedApps: fleet
            .filter((f) => !f.hasForgeSession)
            .map((a) => ({
              name: a.appName,
              platforms: a.platforms,
              hasMemoryBank: a.hasMemoryBank,
              instructionFiles: a.instructionFileCount,
            })),
          apps: fleet,
        },
      });
    } catch (err) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: (err as Error).message },
      });
    }
  });

  // ─── Session Recordings API ──────────────────────────────

  router.get("/api/v1/knowledge/recordings", async (req, res) => {
    try {
      const recordings = querySessionRecordings({
        appName: req.query.app as string | undefined,
        entryType: req.query.type as string | undefined,
        scope: req.query.scope as "project" | "universal" | undefined,
        limit: parseInt(req.query.limit as string, 10) || 50,
      });
      res.json({
        data: recordings,
        meta: { total: recordings.length },
      });
    } catch (err) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: (err as Error).message },
      });
    }
  });

  // ─── Cost Router API ────────────────────────────────────────

  router.get("/api/v1/routing", (_req, res) => {
    res.json({
      data: getRoutingTable(),
      spend: getTodaySpend(),
    });
  });

  // ─── Metrics API ──────────────────────────────────────────

  router.get("/api/v1/metrics", (req, res) => {
    try {
      const since = req.query.since as string | undefined;
      const summary = getMetricsSummary(since);
      res.json({ data: summary });
    } catch (err) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: (err as Error).message },
      });
    }
  });

  router.get("/api/v1/metrics/agents/:name", (req, res) => {
    try {
      const metrics = getAgentMetrics(req.params.name);
      if (metrics.length === 0) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: `No metrics for agent '${req.params.name}'` },
        });
        return;
      }
      res.json({ data: metrics[0] });
    } catch (err) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: (err as Error).message },
      });
    }
  });

  // ─── Sessions API ──────────────────────────────────────────

  router.get("/api/v1/sessions", (_req, res) => {
    try {
      const sessionConfig = createSessionConfig();
      const sessionIds = listSessions(sessionConfig.persistDirectory);
      res.json({
        data: sessionIds,
        meta: { total: sessionIds.length },
      });
    } catch (err) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: (err as Error).message },
      });
    }
  });

  router.get("/api/v1/sessions/:id", (req, res) => {
    try {
      const sessionConfig = createSessionConfig();
      const stored = loadSession(req.params.id, sessionConfig.persistDirectory);
      if (!stored) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: `Session '${req.params.id}' not found` },
        });
        return;
      }
      res.json({
        data: {
          sessionId: stored.sessionId,
          inputTokens: stored.inputTokens,
          outputTokens: stored.outputTokens,
          totalTokens: stored.inputTokens + stored.outputTokens,
          turnCount: stored.turnCount,
          createdAt: stored.createdAt,
          lastActive: stored.lastActive,
        },
      });
    } catch (err) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: (err as Error).message },
      });
    }
  });

  return router;
}
