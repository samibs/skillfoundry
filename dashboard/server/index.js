/**
 * Claude AS Dashboard Server
 * Express server for dashboard API and static files
 */

import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, "../client")));

// Data storage (in-memory, could be replaced with database)
const dataDir = join(__dirname, "../server/data");

// Ensure data directory exists
await fs.mkdir(dataDir, { recursive: true });

// Helper functions
async function loadPRDs() {
  try {
    const prdsFile = join(dataDir, "prds.json");
    const content = await fs.readFile(prdsFile, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function savePRDs(prds) {
  const prdsFile = join(dataDir, "prds.json");
  await fs.writeFile(prdsFile, JSON.stringify(prds, null, 2), "utf-8");
}

async function loadStories() {
  try {
    const storiesFile = join(dataDir, "stories.json");
    const content = await fs.readFile(storiesFile, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function saveStories(stories) {
  const storiesFile = join(dataDir, "stories.json");
  await fs.writeFile(storiesFile, JSON.stringify(stories, null, 2), "utf-8");
}

async function loadAgentActivity() {
  try {
    const activityFile = join(dataDir, "activity.json");
    const content = await fs.readFile(activityFile, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function saveAgentActivity(activity) {
  const activityFile = join(dataDir, "activity.json");
  await fs.writeFile(activityFile, JSON.stringify(activity, null, 2), "utf-8");
}

// API Routes

// PRD endpoints
app.get("/api/prds", async (req, res) => {
  try {
    const prds = await loadPRDs();
    res.json(prds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/prds/:id", async (req, res) => {
  try {
    const prds = await loadPRDs();
    const prd = prds.find((p) => p.id === req.params.id);
    if (!prd) {
      return res.status(404).json({ error: "PRD not found" });
    }
    res.json(prd);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/prds", async (req, res) => {
  try {
    const prds = await loadPRDs();
    const newPRD = {
      id: `prd-${Date.now()}`,
      ...req.body,
      createdAt: new Date().toISOString(),
      status: req.body.status || "draft",
    };
    prds.push(newPRD);
    await savePRDs(prds);
    res.json(newPRD);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/prds/:id", async (req, res) => {
  try {
    const prds = await loadPRDs();
    const index = prds.findIndex((p) => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "PRD not found" });
    }
    prds[index] = { ...prds[index], ...req.body, updatedAt: new Date().toISOString() };
    await savePRDs(prds);
    res.json(prds[index]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/prds/:id/stories", async (req, res) => {
  try {
    const stories = await loadStories();
    const prdStories = stories.filter((s) => s.prdId === req.params.id);
    res.json(prdStories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Story endpoints
app.get("/api/stories", async (req, res) => {
  try {
    const stories = await loadStories();
    res.json(stories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/stories/:id", async (req, res) => {
  try {
    const stories = await loadStories();
    const story = stories.find((s) => s.id === req.params.id);
    if (!story) {
      return res.status(404).json({ error: "Story not found" });
    }
    res.json(story);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/stories/:id/status", async (req, res) => {
  try {
    const stories = await loadStories();
    const index = stories.findIndex((s) => s.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Story not found" });
    }
    stories[index].status = req.body.status;
    stories[index].updatedAt = new Date().toISOString();
    await saveStories(stories);
    res.json(stories[index]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/stories/dependencies", async (req, res) => {
  try {
    const stories = await loadStories();
    const graph = stories.map((story) => ({
      id: story.id,
      dependencies: story.dependencies || [],
    }));
    res.json(graph);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Agent activity endpoints
app.get("/api/agents/activity", async (req, res) => {
  try {
    const activity = await loadAgentActivity();
    res.json(activity);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/agents/:name", async (req, res) => {
  try {
    const activity = await loadAgentActivity();
    const agentActivity = activity.filter((a) => a.agent === req.params.name);
    res.json(agentActivity);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Metrics endpoints
app.get("/api/metrics/summary", async (req, res) => {
  try {
    const prds = await loadPRDs();
    const stories = await loadStories();
    const activity = await loadAgentActivity();

    const summary = {
      prds: {
        total: prds.length,
        draft: prds.filter((p) => p.status === "draft").length,
        inProgress: prds.filter((p) => p.status === "in_progress").length,
        complete: prds.filter((p) => p.status === "complete").length,
      },
      stories: {
        total: stories.length,
        pending: stories.filter((s) => s.status === "pending").length,
        inProgress: stories.filter((s) => s.status === "in_progress").length,
        complete: stories.filter((s) => s.status === "complete").length,
      },
      agents: {
        totalActions: activity.length,
        uniqueAgents: new Set(activity.map((a) => a.agent)).size,
      },
    };

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/metrics/tokens", async (req, res) => {
  try {
    const activity = await loadAgentActivity();
    const tokenUsage = activity
      .filter((a) => a.metrics && a.metrics.tokens)
      .map((a) => ({
        timestamp: a.timestamp,
        tokens: a.metrics.tokens,
        agent: a.agent,
      }));

    res.json(tokenUsage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/metrics/completion", async (req, res) => {
  try {
    const stories = await loadStories();
    const completionRates = {
      total: stories.length,
      completed: stories.filter((s) => s.status === "complete").length,
      rate: stories.length > 0
        ? (stories.filter((s) => s.status === "complete").length / stories.length) * 100
        : 0,
    };

    res.json(completionRates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Claude AS Dashboard running on http://localhost:${PORT}`);
});
