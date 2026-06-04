/**
 * Dashboard — Code Map routes (STORY-013).
 *
 * Thin, read-only reader of the cached `.skillfoundry/code-map.json` and
 * `.skillfoundry/diff-impact.json` artifacts produced by the `sf_codemap` engine.
 * No engine coupling here. Path-traversal guarded; localhost-only by virtue of
 * the server bind. Array fields default to [].
 */

import { readFile } from "fs/promises";
import path from "path";

const ARTIFACTS = {
  map: "code-map.json",
  diff: "diff-impact.json",
};

/**
 * Read a code-map artifact for a project. Returns a structured result the route
 * turns into an HTTP response. `kind` is "map" or "diff".
 */
export async function readMapArtifact(projectPath, kind) {
  const fileName = ARTIFACTS[kind];
  if (!fileName) return { status: 400, body: { error: "unknown artifact" } };

  // Path-traversal guard: reject obvious escapes; require an absolute project root.
  if (!projectPath || projectPath.includes("..") || !path.isAbsolute(projectPath)) {
    return { status: 400, body: { error: "invalid project path" } };
  }

  const artifactPath = path.join(projectPath, ".skillfoundry", fileName);
  try {
    const raw = await readFile(artifactPath, "utf-8");
    const data = JSON.parse(raw);
    return { status: 200, body: data };
  } catch {
    // Empty-state guidance — never fabricate a map.
    return {
      status: 200,
      body: {
        available: false,
        reason:
          kind === "diff"
            ? "No diff-impact yet. Run `sf_codemap diff-impact` (or /preflight diff-impact)."
            : "No code map yet. Run `sf_codemap` (or /preflight) to build it.",
        nodes: [],
        edges: [],
        endpoints: [],
      },
    };
  }
}

/** Mount the read-only code-map routes on an Express app. */
export function registerCodemapRoutes(app, defaultProject) {
  const resolveProject = (req) => req.query.project || defaultProject || process.cwd();

  app.get("/api/codemap", async (req, res) => {
    const { status, body } = await readMapArtifact(resolveProject(req), "map");
    res.status(status).json(body);
  });

  app.get("/api/codemap/diff-impact", async (req, res) => {
    const { status, body } = await readMapArtifact(resolveProject(req), "diff");
    res.status(status).json(body);
  });
}
