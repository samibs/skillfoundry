import { Router } from "express";
import type { SkillDefinition } from "../skills/loader.js";

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

  return router;
}
