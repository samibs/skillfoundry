import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { checkContracts } from "../src/agents/contract-check-agent.js";
import { validateImports } from "../src/agents/import-validator-agent.js";

let repo: string;

beforeAll(async () => {
  repo = await mkdtemp(path.join(os.tmpdir(), "handoff-"));
  await mkdir(path.join(repo, "src"), { recursive: true });
  await writeFile(path.join(repo, "package.json"), JSON.stringify({ name: "h", version: "1.0.0", type: "module" }), "utf-8");
  // A frontend call to a route that the regex scanner won't find a backend for.
  await writeFile(path.join(repo, "src", "client.ts"), `export async function load() { return fetch("/api/widgets"); }\n`, "utf-8");
});

afterAll(async () => {
  if (repo) await rm(repo, { recursive: true, force: true });
});

describe("contract-check codemap baseline handoff (STORY-009)", () => {
  it("is a pure no-op when no baseline is supplied", async () => {
    const a = await checkContracts(repo);
    const b = await checkContracts(repo, undefined);
    expect(b.summary).toEqual(a.summary);
  });

  it("recognises a route supplied via the codemap baseline", async () => {
    const without = await checkContracts(repo);
    const orphanWithout = without.orphanedCalls.some((c) => c.path.includes("/api/widgets"));
    expect(orphanWithout).toBe(true); // unknown to the regex scanner

    const withBaseline = await checkContracts(repo, { endpoints: [{ method: "GET", path: "/api/widgets" }] });
    const orphanWith = withBaseline.orphanedCalls.some((c) => c.path.includes("/api/widgets"));
    expect(orphanWith).toBe(false); // now matched against the AST-derived endpoint
    expect(withBaseline.summary.totalBackendRoutes).toBeGreaterThan(without.summary.totalBackendRoutes);
  });
});

describe("import-validator codemap baseline handoff (STORY-009)", () => {
  it("is a pure no-op when no baseline is supplied", async () => {
    const a = await validateImports(repo);
    const b = await validateImports(repo, undefined);
    expect(b.summary.total).toBe(a.summary.total);
  });

  it("surfaces unresolved imports seeded from the baseline", async () => {
    const base = await validateImports(repo);
    const seeded = await validateImports(repo, {
      unresolvedImports: [{ fromFile: "src/a.ts", specifier: "./missing", line: 4 }],
    });
    expect(seeded.summary.total).toBe(base.summary.total + 1);
    expect(seeded.errors.some((e) => e.importPath === "./missing")).toBe(true);
  });
});
