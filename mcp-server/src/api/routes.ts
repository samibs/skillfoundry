import { Router } from "express";
import type { SkillDefinition } from "../skills/loader.js";
import { runHarvest, getQuirks } from "../knowledge/harvester.js";
import { getRoutingTable, getTodaySpend } from "../agents/cost-router.js";
import { getMetricsSummary, getAgentMetrics } from "../state/metrics.js";

const startTime = Date.now();

export function createApiRouter(
  skills: Map<string, SkillDefinition>
): Router {
  const router = Router();

  // Health check
  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      name: "skillfoundry-mcp-server",
      version: "3.0.0",
      skills: skills.size,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  // Ready check (same as health for Phase 1 — Phase 2 adds DB check)
  router.get("/ready", (_req, res) => {
    res.json({
      status: "ready",
      skills: skills.size,
    });
  });

  // List all loaded agents/skills
  router.get("/api/v1/agents", (_req, res) => {
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
      meta: { total: agents.length },
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
  router.post("/api/v1/knowledge/harvest", async (req, res) => {
    try {
      const appsRoot = (req.body as Record<string, unknown>)?.appsRoot as string;
      if (!appsRoot) {
        res.status(400).json({
          error: { code: "VALIDATION_FAILED", message: "appsRoot is required" },
        });
        return;
      }
      const result = await runHarvest(appsRoot);
      res.json({
        data: {
          runId: result.runId,
          appsScanned: result.aggregation.appsScanned,
          appsWithData: result.aggregation.appsWithData,
          newQuirksInserted: result.newQuirksInserted,
          duplicatesSkipped: result.duplicatesSkipped,
          failurePatterns: result.aggregation.failurePatterns.length,
          duration: result.duration,
        },
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

  return router;
}
