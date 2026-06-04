import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "fs/promises";
import os from "os";
import path from "path";
// Dependency-free reader extracted from the dashboard server (no express needed).
import { readMapArtifact } from "../../dashboard/server/codemap-routes.js";

const CLIENT = path.join(import.meta.dirname, "../../dashboard/client");

describe("dashboard /api/codemap reader (STORY-013)", () => {
  let proj: string;
  beforeAll(async () => {
    proj = await mkdtemp(path.join(os.tmpdir(), "dash-codemap-"));
  });
  afterAll(async () => {
    if (proj) await rm(proj, { recursive: true, force: true });
  });

  it("returns an empty-state (not fabricated data) when no map exists", async () => {
    const { status, body } = await readMapArtifact(proj, "map");
    expect(status).toBe(200);
    expect(body.available).toBe(false);
    expect(body.nodes).toEqual([]);
    expect(body.reason).toMatch(/sf_codemap|preflight/i);
  });

  it("serves the cached map when present", async () => {
    await mkdir(path.join(proj, ".skillfoundry"), { recursive: true });
    await writeFile(
      path.join(proj, ".skillfoundry", "code-map.json"),
      JSON.stringify({ schemaVersion: "1.0", nodes: [{ id: "a.ts", kind: "file", name: "a.ts", file: "a.ts", line: 1 }], endpoints: [] }),
      "utf-8",
    );
    const { status, body } = await readMapArtifact(proj, "map");
    expect(status).toBe(200);
    expect(body.nodes).toHaveLength(1);
  });

  it("rejects path traversal and non-absolute project paths", async () => {
    expect((await readMapArtifact("../../etc", "map")).status).toBe(400);
    expect((await readMapArtifact("relative/path", "map")).status).toBe(400);
  });

  it("diff-impact empty-state points at the diff-impact command", async () => {
    const fresh = await mkdtemp(path.join(os.tmpdir(), "dash-diff-"));
    const { body } = await readMapArtifact(fresh, "diff");
    expect(body.available).toBe(false);
    expect(body.reason).toMatch(/diff-impact/i);
    await rm(fresh, { recursive: true, force: true });
  });
});

describe("dashboard Code Map UI wiring (STORY-014)", () => {
  it("index.html exposes the Code Map tab, search, and diff toggle (responsive)", async () => {
    const html = await readFile(path.join(CLIENT, "index.html"), "utf-8");
    expect(html).toContain('data-tab="codemap"');
    expect(html).toContain('id="codemap-search"');
    expect(html).toContain('id="codemap-diff-toggle"');
    expect(html).toContain('js/codemap.js');
    expect(html).toContain('width=device-width'); // viewport / responsive
  });

  it("codemap.js talks to the real endpoints (no mocks)", async () => {
    const js = await readFile(path.join(CLIENT, "js", "codemap.js"), "utf-8");
    expect(js).toContain("/api/codemap");
    expect(js).toContain("/api/codemap/diff-impact");
    expect(js.toLowerCase()).not.toContain("lorem ipsum");
  });
});
