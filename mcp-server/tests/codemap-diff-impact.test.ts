import { describe, it, expect } from "vitest";
import { diffImpact, parseUnifiedDiff } from "../src/agents/codemap/diff-impact.js";
import { emptyMap, type CodeMap } from "../src/agents/codemap/graph.js";

function fileNode(map: CodeMap, file: string): void {
  map.nodes.push({ id: file, kind: "file", name: file, file, line: 1 });
}

/** a → b → c (imports), plus m1/m2/m3 → c. */
function chainMap(): CodeMap {
  const m = emptyMap();
  for (const f of ["src/a.ts", "src/b.ts", "src/c.ts", "src/m1.ts", "src/m2.ts", "src/m3.ts"]) fileNode(m, f);
  m.edges.push({ from: "src/a.ts", to: "src/b.ts", kind: "imports" });
  m.edges.push({ from: "src/b.ts", to: "src/c.ts", kind: "imports" });
  m.edges.push({ from: "src/m1.ts", to: "src/c.ts", kind: "imports" });
  m.edges.push({ from: "src/m2.ts", to: "src/c.ts", kind: "imports" });
  m.edges.push({ from: "src/m3.ts", to: "src/c.ts", kind: "imports" });
  return m;
}

describe("codemap diff-impact (STORY-011)", () => {
  it("lists transitive dependents of a changed file", () => {
    const { changed, impacted } = diffImpact(chainMap(), [{ file: "src/c.ts", ranges: [] }]);
    expect(changed.some((n) => n.file === "src/c.ts")).toBe(true);
    const files = new Set(impacted.map((n) => n.file));
    // direct importers
    expect(files.has("src/m1.ts")).toBe(true);
    expect(files.has("src/m2.ts")).toBe(true);
    expect(files.has("src/m3.ts")).toBe(true);
    expect(files.has("src/b.ts")).toBe(true);
    // transitive: a imports b imports c
    expect(files.has("src/a.ts")).toBe(true);
    // the changed file is not listed as its own dependent
    expect(files.has("src/c.ts")).toBe(false);
  });

  it("is cycle-safe", () => {
    const m = emptyMap();
    fileNode(m, "x.ts");
    fileNode(m, "y.ts");
    m.edges.push({ from: "x.ts", to: "y.ts", kind: "imports" });
    m.edges.push({ from: "y.ts", to: "x.ts", kind: "imports" }); // cycle
    const { impacted } = diffImpact(m, [{ file: "x.ts", ranges: [] }]);
    expect(impacted.some((n) => n.file === "y.ts")).toBe(true); // terminates, no infinite loop
  });

  it("parses unified diff hunks into new-side line ranges", () => {
    const diff = [
      "diff --git a/src/c.ts b/src/c.ts",
      "--- a/src/c.ts",
      "+++ b/src/c.ts",
      "@@ -10,0 +11,3 @@",
      "+line",
      "+line",
      "+line",
    ].join("\n");
    const changes = parseUnifiedDiff(diff);
    expect(changes).toHaveLength(1);
    expect(changes[0].file).toBe("src/c.ts");
    expect(changes[0].ranges).toEqual([[11, 13]]);
  });
});
