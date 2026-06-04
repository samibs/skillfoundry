import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cp, rm, mkdtemp } from "fs/promises";
import os from "os";
import path from "path";
import { runCodemap } from "../src/agents/codemap-agent.js";
import { fileExists, mapPathFor } from "../src/agents/codemap/persist.js";

const FIXTURE = path.join(import.meta.dirname, "fixtures/codemap/repo");
let repo: string;

beforeAll(async () => {
  repo = await mkdtemp(path.join(os.tmpdir(), "sf-codemap-"));
  await cp(FIXTURE, repo, { recursive: true });
});

afterAll(async () => {
  if (repo) await rm(repo, { recursive: true, force: true });
});

describe("sf_codemap agent (STORY-007)", () => {
  it("rejects an invalid projectPath without throwing", async () => {
    const r = await runCodemap({ projectPath: "/no/such/dir", mode: "build" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("invalid projectPath");
  });

  it("builds a map and persists the artifact", async () => {
    const r = await runCodemap({ projectPath: repo, mode: "build" });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("build");
    expect(r.nodes ?? 0).toBeGreaterThan(0);
    expect(typeof r.duration).toBe("number");
    expect(await fileExists(mapPathFor(repo))).toBe(true);
  });

  it("refreshes incrementally (default mode)", async () => {
    const r = await runCodemap({ projectPath: repo });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("refresh");
  });

  it("queries a symbol and returns its node + related edges", async () => {
    const r = await runCodemap({ projectPath: repo, mode: "query", symbol: "add" });
    expect(r.ok).toBe(true);
    expect(r.node?.name).toBe("add");
    expect(Array.isArray(r.related)).toBe(true);
  });

  it("query for an unknown symbol returns ok with a null node", async () => {
    const r = await runCodemap({ projectPath: repo, mode: "query", symbol: "doesNotExist" });
    expect(r.ok).toBe(true);
    expect(r.node).toBeNull();
  });

  it("diff-impact fails gracefully on a non-git working copy (no fabricated data)", async () => {
    const diff = await runCodemap({ projectPath: repo, mode: "diff-impact" });
    expect(diff.ok).toBe(false);
    expect(diff.error).toMatch(/git/i);
  });

  it("semantic labeling is gated on a configured provider", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const sem = await runCodemap({ projectPath: repo, mode: "build", semantic: true });
      expect(sem.ok).toBe(false);
      expect(sem.error).toMatch(/provider/i);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});
