import { describe, it, expect } from "vitest";
import { applySemanticLabels, type NodeFact, type Labeler } from "../src/agents/codemap/semantic.js";
import { emptyMap, type CodeMap } from "../src/agents/codemap/graph.js";

function sampleMap(): CodeMap {
  const m = emptyMap();
  m.nodes.push({ id: "src/a.ts", kind: "file", name: "src/a.ts", file: "src/a.ts", line: 1 });
  m.nodes.push({ id: "src/a.ts#add@1", kind: "function", name: "add", file: "src/a.ts", line: 1 });
  m.nodes.push({ id: "src/a.ts#Thing@5", kind: "class", name: "Thing", file: "src/a.ts", line: 5 });
  return m;
}

describe("codemap semantic labels (STORY-012)", () => {
  it("labels function/class/model nodes and stamps them as non-authoritative hints", async () => {
    let received: NodeFact[] = [];
    const labeler: Labeler = async (facts) => {
      received = facts;
      return new Map(facts.map((f) => [f.id, { summary: `does ${f.name}` }]));
    };

    const map = sampleMap();
    const n = await applySemanticLabels(map, labeler);
    expect(n).toBe(2); // add + Thing, not the file node

    const fn = map.nodes.find((x) => x.name === "add")!;
    expect(fn.summary).toBe("does add");
    expect(fn.confidence).toBe("llm-hint"); // must be flagged non-authoritative

    const file = map.nodes.find((x) => x.kind === "file")!;
    expect(file.summary).toBeUndefined(); // file nodes are not labeled
  });

  it("sends fact-only descriptors (no source contents) to the labeler", async () => {
    let received: NodeFact[] = [];
    const labeler: Labeler = async (facts) => {
      received = facts;
      return new Map();
    };
    await applySemanticLabels(sampleMap(), labeler);
    for (const f of received) {
      expect(Object.keys(f).sort()).toEqual(["file", "id", "kind", "line", "name"]);
    }
  });

  it("makes no changes when the labeler returns nothing", async () => {
    const labeler: Labeler = async () => new Map();
    const map = sampleMap();
    const n = await applySemanticLabels(map, labeler);
    expect(n).toBe(0);
    expect(map.nodes.every((x) => x.summary === undefined)).toBe(true);
  });
});
