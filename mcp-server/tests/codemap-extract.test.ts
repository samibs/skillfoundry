import { describe, it, expect } from "vitest";
import path from "path";
import { parseFile, isSkip } from "../src/agents/codemap/parser.js";
import { extractFile } from "../src/agents/codemap/extract.js";
import type { FileExtract } from "../src/agents/codemap/graph.js";

const REPO = path.join(import.meta.dirname, "fixtures/codemap/repo");

async function extract(rel: string): Promise<FileExtract> {
  const parsed = await parseFile(path.join(REPO, rel));
  if (isSkip(parsed)) throw new Error(`unexpected skip for ${rel}`);
  return extractFile(rel, parsed);
}

const names = (e: FileExtract, kind: string) =>
  e.nodes.filter((n) => n.kind === kind).map((n) => n.name).sort();

describe("codemap extract (STORY-002)", () => {
  it("extracts functions, classes and methods (TS)", async () => {
    const e = await extract("src/b.ts");
    expect(names(e, "function")).toContain("helper");
    expect(names(e, "class")).toContain("Thing");
    expect(names(e, "method")).toContain("greet");
    // file node + contains edges
    expect(e.nodes.some((n) => n.kind === "file" && n.id === "src/b.ts")).toBe(true);
    expect(e.edges.some((ed) => ed.kind === "contains" && ed.from === "src/b.ts")).toBe(true);
  });

  it("records raw imports without resolving them", async () => {
    const e = await extract("src/a.ts");
    const specs = e.rawImports.map((r) => r.specifier).sort();
    expect(specs).toEqual(["./b", "./missing", "@app/util", "react"]);
  });

  it("emits calls edges only for same-file targets", async () => {
    const e = await extract("src/a.ts");
    const calls = e.edges.filter((ed) => ed.kind === "calls");
    // local() -> add(), square -> local(); helper() is imported (no edge)
    const calledNames = calls.map((c) => c.to.split("#")[1]?.split("@")[0]).sort();
    expect(calledNames).toContain("add");
    expect(calledNames).toContain("local");
    expect(calledNames).not.toContain("helper");
  });

  it("classifies Python methods vs functions and resolves same-file calls", async () => {
    const e = await extract("app.py");
    expect(names(e, "function").sort()).toEqual(["helper", "main"]);
    expect(names(e, "method")).toContain("bar");
    expect(names(e, "class")).toContain("Foo");
    const calls = e.edges.filter((ed) => ed.kind === "calls");
    expect(calls.some((c) => c.to.includes("#helper@"))).toBe(true); // main -> helper
  });

  it("produces deterministic ids across runs", async () => {
    const a = await extract("src/a.ts");
    const b = await extract("src/a.ts");
    expect(b.nodes.map((n) => n.id)).toEqual(a.nodes.map((n) => n.id));
  });

  it("degrades gracefully on malformed files (still a file node, no throw)", async () => {
    const e = await extract("src/broken.ts");
    expect(e.nodes.some((n) => n.kind === "file" && n.id === "src/broken.ts")).toBe(true);
  });
});
