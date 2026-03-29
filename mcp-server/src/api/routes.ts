import { Router } from "express";
import type { SkillDefinition } from "../skills/loader.js";
import { runHarvest, getQuirks } from "../knowledge/harvester.js";
import { getRoutingTable, getTodaySpend } from "../agents/cost-router.js";
import { getMetricsSummary, getAgentMetrics } from "../state/metrics.js";
import { getFleetHealth, querySessionRecordings } from "../state/db.js";

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
      version: "4.0.0",
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

  return router;
}
