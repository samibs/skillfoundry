import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, readFile } from "fs/promises";
import os from "os";
import path from "path";
import { buildFacts, emitCodeMapFacts, sanitizeText } from "../src/agents/codemap/memory-feed.js";
import { emptyMap, type CodeMap } from "../src/agents/codemap/graph.js";

const NOW = "2026-06-04T00:00:00.000Z";

function sampleMap(): CodeMap {
  const m = emptyMap();
  m.nodes.push({ id: "src/db/schema.ts", kind: "file", name: "src/db/schema.ts", file: "src/db/schema.ts", line: 1, layer: "db" });
  m.nodes.push({ id: "src/db/schema.ts#User@1", kind: "model", name: "User", file: "src/db/schema.ts", line: 1, layer: "db" });
  m.endpoints.push({ method: "GET", path: "/users/:id", file: "src/api.ts", handler: null, requestShape: null, responseShape: null });
  m.unresolvedImports.push({ fromFile: "src/a.ts", specifier: "./missing", line: 4 });
  return m;
}

describe("codemap memory feed (STORY-010)", () => {
  it("sanitizes absolute paths and secrets", () => {
    const out = sanitizeText("/home/u/proj/src/a.ts uses api_key: sk-abc123", "/home/u/proj");
    expect(out).not.toContain("/home/u/proj");
    expect(out).toContain("[redacted]");
  });

  it("builds facts for endpoints, models, unresolved imports, and layers", () => {
    const facts = buildFacts(sampleMap(), "/tmp/x", NOW);
    const tags = facts.flatMap((f) => f.tags);
    expect(tags).toContain("endpoints");
    expect(tags).toContain("models");
    expect(tags).toContain("unresolved");
    expect(tags).toContain("layers");
    expect(facts.every((f) => f.tags.includes("code-map"))).toBe(true);
    expect(facts.every((f) => f.created_by === "codemap")).toBe(true);
  });

  let repo: string;
  beforeEach(async () => {
    repo = await mkdtemp(path.join(os.tmpdir(), "memfeed-"));
  });
  afterEach(async () => {
    if (repo) await rm(repo, { recursive: true, force: true });
  });

  it("skips projects without a memory_bank", async () => {
    const n = await emitCodeMapFacts(repo, sampleMap(), { now: NOW });
    expect(n).toBe(0);
  });

  it("writes facts when memory_bank exists, and is idempotent", async () => {
    await mkdir(path.join(repo, "memory_bank", "knowledge"), { recursive: true });
    const first = await emitCodeMapFacts(repo, sampleMap(), { now: NOW });
    expect(first).toBeGreaterThan(0);

    const file = path.join(repo, "memory_bank", "knowledge", "code-map.jsonl");
    const written = (await readFile(file, "utf-8")).trim().split("\n");
    expect(written.length).toBe(first);
    // every line is a valid record tagged code-map
    for (const line of written) {
      const rec = JSON.parse(line);
      expect(rec.tags).toContain("code-map");
    }

    // re-running with the same map adds nothing (dedup by content hash)
    const second = await emitCodeMapFacts(repo, sampleMap(), { now: NOW });
    expect(second).toBe(0);
  });
});
