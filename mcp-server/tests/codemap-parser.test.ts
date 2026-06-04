import { describe, it, expect } from "vitest";
import path from "path";
import { parseFile, isSkip, langForPath } from "../src/agents/codemap/parser.js";

const REPO = path.join(import.meta.dirname, "fixtures/codemap/repo");

describe("codemap parser (STORY-001)", () => {
  it("parses TypeScript into a clean tree", async () => {
    const r = await parseFile(path.join(REPO, "src/a.ts"));
    expect(isSkip(r)).toBe(false);
    if (!isSkip(r)) {
      expect(r.lang).toBe("typescript");
      expect(r.tree.rootNode.hasError).toBe(false);
    }
  });

  it("parses Python", async () => {
    const r = await parseFile(path.join(REPO, "app.py"));
    expect(isSkip(r)).toBe(false);
    if (!isSkip(r)) expect(r.lang).toBe("python");
  });

  it("skips unsupported extensions (returns skip, no throw)", async () => {
    const r = await parseFile(path.join(REPO, "package.json"));
    expect(isSkip(r)).toBe(true);
    if (isSkip(r)) expect(r.skipped).toBe("unsupported");
  });

  it("returns an error tree for malformed source instead of throwing", async () => {
    const r = await parseFile(path.join(REPO, "src/broken.ts"));
    expect(isSkip(r)).toBe(false);
    if (!isSkip(r)) expect(r.tree.rootNode.hasError).toBe(true);
  });

  it("maps extensions to languages", () => {
    expect(langForPath("x.tsx")).toBe("tsx");
    expect(langForPath("x.py")).toBe("python");
    expect(langForPath("x.mjs")).toBe("javascript");
    expect(langForPath("x.md")).toBeNull();
  });
});
