import { describe, it, expect } from "vitest";
import { resolveImports, type ResolveContext } from "../src/agents/codemap/resolve.js";
import type { RawImport } from "../src/agents/codemap/graph.js";

const ctx: ResolveContext = {
  files: new Set(["src/a.ts", "src/b.ts", "src/util.ts", "app.py", "pkgmod.py"]),
  dependencies: new Set(["react"]),
  tsPaths: { baseUrl: "", paths: { "@app/*": ["src/*"] } },
};

const raw: RawImport[] = [
  { fromFile: "src/a.ts", specifier: "./b", line: 1 },        // relative → src/b.ts
  { fromFile: "src/a.ts", specifier: "@app/util", line: 2 },  // alias → src/util.ts
  { fromFile: "src/a.ts", specifier: "react", line: 3 },      // external dep → dropped
  { fromFile: "src/a.ts", specifier: "./missing", line: 4 },  // unresolved
  { fromFile: "app.py", specifier: "os", line: 1 },           // python absolute → external
  { fromFile: "app.py", specifier: ".pkgmod", line: 2 },      // python relative → pkgmod.py
];

describe("codemap resolve (STORY-003)", () => {
  const { edges, unresolved } = resolveImports(raw, ctx);
  const edgeTargets = edges.map((e) => `${e.from}->${e.to}`).sort();

  it("resolves relative imports", () => {
    expect(edgeTargets).toContain("src/a.ts->src/b.ts");
  });

  it("resolves tsconfig path aliases", () => {
    expect(edgeTargets).toContain("src/a.ts->src/util.ts");
  });

  it("resolves python relative imports", () => {
    expect(edgeTargets).toContain("app.py->pkgmod.py");
  });

  it("classifies declared deps as external (no edge, not unresolved)", () => {
    expect(edgeTargets.some((t) => t.includes("react"))).toBe(false);
    expect(unresolved.some((u) => u.specifier === "react")).toBe(false);
  });

  it("does not flag python absolute/stdlib imports as unresolved", () => {
    expect(unresolved.some((u) => u.specifier === "os")).toBe(false);
  });

  it("records genuinely unresolved relative imports", () => {
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].specifier).toBe("./missing");
  });
});
