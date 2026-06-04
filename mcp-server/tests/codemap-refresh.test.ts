import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cp, rm, writeFile, mkdtemp } from "fs/promises";
import os from "os";
import path from "path";
import { buildMap } from "../src/agents/codemap/index.js";
import { refreshMap } from "../src/agents/codemap/refresh.js";
import { saveMap, loadMap, mapPathFor } from "../src/agents/codemap/persist.js";
import { SCHEMA_VERSION, type CodeMap } from "../src/agents/codemap/graph.js";

const FIXTURE = path.join(import.meta.dirname, "fixtures/codemap/repo");
let repo: string;

beforeAll(async () => {
  repo = await mkdtemp(path.join(os.tmpdir(), "codemap-"));
  await cp(FIXTURE, repo, { recursive: true });
});

afterAll(async () => {
  if (repo) await rm(repo, { recursive: true, force: true });
});

const hasNode = (m: CodeMap, name: string, file: string) =>
  m.nodes.some((n) => n.name === name && n.file === file);

describe("codemap persistence + incremental refresh (STORY-004)", () => {
  it("full build then save/load roundtrip", async () => {
    const map = await buildMap(repo);
    expect(map.schemaVersion).toBe(SCHEMA_VERSION);
    expect(hasNode(map, "helper", "src/b.ts")).toBe(true);
    expect(Object.keys(map.fileHashes).length).toBeGreaterThan(0);

    const mp = mapPathFor(repo);
    await saveMap(mp, map);
    const loaded = await loadMap(mp);
    expect(loaded).not.toBeNull();
    expect(loaded!.nodes.length).toBe(map.nodes.length);
  });

  it("re-parses only changed files and drops their stale nodes", async () => {
    const base = await buildMap(repo);

    // Rename a symbol in b.ts.
    await writeFile(
      path.join(repo, "src/b.ts"),
      `export function helper2(n: number): number { return n * 2; }\nexport class Thing { greet() { return "hi"; } }\n`,
      "utf-8",
    );

    const { map, stats } = await refreshMap(repo, base);
    expect(stats.mode).toBe("incremental");
    expect(stats.reparsed).toEqual(["src/b.ts"]);
    expect(hasNode(map, "helper2", "src/b.ts")).toBe(true);
    expect(hasNode(map, "helper", "src/b.ts")).toBe(false); // stale node gone
    expect(hasNode(map, "add", "src/a.ts")).toBe(true); // unchanged carried forward
  });

  it("detects added files", async () => {
    const base = await buildMap(repo);
    await writeFile(path.join(repo, "src/c.ts"), `export function brandNew() { return 7; }\n`, "utf-8");
    const { map, stats } = await refreshMap(repo, base);
    expect(stats.added).toContain("src/c.ts");
    expect(hasNode(map, "brandNew", "src/c.ts")).toBe(true);
  });

  it("detects deleted files and removes their nodes", async () => {
    const base = await buildMap(repo);
    await rm(path.join(repo, "src/c.ts"));
    const { map, stats } = await refreshMap(repo, base);
    expect(stats.deleted).toContain("src/c.ts");
    expect(map.nodes.some((n) => n.file === "src/c.ts")).toBe(false);
  });

  it("no-ops when nothing changed", async () => {
    const base = await buildMap(repo);
    const { stats } = await refreshMap(repo, base);
    expect(stats.reparsed).toEqual([]);
    expect(stats.deleted).toEqual([]);
  });

  it("falls back to a full build on a null/old-schema map", async () => {
    const { stats } = await refreshMap(repo, null);
    expect(stats.mode).toBe("full");

    // loadMap rejects a wrong-schema file.
    const mp = mapPathFor(repo);
    await writeFile(mp, JSON.stringify({ schemaVersion: "0.0", nodes: [], fileHashes: {} }), "utf-8");
    expect(await loadMap(mp)).toBeNull();
  });
});
