/**
 * Code Map — diff-impact / blast radius (STORY-011).
 *
 * Given a set of changed files+line-ranges (or a parsed git diff), returns the
 * directly-changed nodes and the transitive set of nodes that depend on them
 * (reverse traversal over `imports` and `calls` edges). Cycle-safe; read-only —
 * never mutates the map.
 */

import { type CodeMap, type CodeNode } from "./graph.js";

export interface FileChange {
  file: string; // repo-relative POSIX
  ranges: [number, number][]; // 1-based inclusive line ranges ([] = whole file)
}

export interface DiffImpactResult {
  changed: CodeNode[];
  impacted: CodeNode[];
}

/** Parse `git diff --unified=0` output into per-file changed line ranges (new side). */
export function parseUnifiedDiff(diffText: string): FileChange[] {
  const byFile = new Map<string, [number, number][]>();
  let current: string | null = null;
  for (const line of diffText.split("\n")) {
    const plus = line.match(/^\+\+\+ b\/(.+)$/);
    if (plus) {
      current = plus[1] === "/dev/null" ? null : plus[1];
      if (current && !byFile.has(current)) byFile.set(current, []);
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunk && current) {
      const start = parseInt(hunk[1], 10);
      const count = hunk[2] === undefined ? 1 : parseInt(hunk[2], 10);
      if (count > 0) byFile.get(current)!.push([start, start + count - 1]);
    }
  }
  return [...byFile.entries()].map(([file, ranges]) => ({ file, ranges }));
}

const inRanges = (line: number, ranges: [number, number][]): boolean =>
  ranges.some(([a, b]) => line >= a && line <= b);

export function diffImpact(map: CodeMap, changes: FileChange[]): DiffImpactResult {
  const changedFiles = new Map<string, [number, number][]>();
  for (const c of changes) changedFiles.set(c.file, c.ranges);

  // 1. Directly-changed nodes: a node is changed if its file changed and either
  //    the file has no specific ranges, or the node's line falls in a range.
  const changed: CodeNode[] = [];
  const seed = new Set<string>();
  for (const n of map.nodes) {
    const ranges = changedFiles.get(n.file);
    if (ranges === undefined) continue;
    if (n.kind === "file" || ranges.length === 0 || inRanges(n.line, ranges)) {
      changed.push(n);
      seed.add(n.id);
    }
  }
  // Always seed the file node id for each changed file (anchors import traversal).
  for (const file of changedFiles.keys()) seed.add(file);

  // 2. Reverse adjacency over dependency edges: who depends on `to`? → `from`.
  const dependents = new Map<string, string[]>();
  for (const e of map.edges) {
    if (e.kind !== "imports" && e.kind !== "calls") continue;
    const list = dependents.get(e.to) ?? [];
    list.push(e.from);
    dependents.set(e.to, list);
  }

  // 3. Cycle-safe BFS over reverse edges.
  const visited = new Set<string>(seed);
  const queue = [...seed];
  const impactedIds = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const dep of dependents.get(id) ?? []) {
      if (visited.has(dep)) continue;
      visited.add(dep);
      impactedIds.add(dep);
      queue.push(dep);
    }
  }

  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const impacted: CodeNode[] = [];
  for (const id of impactedIds) {
    const node = byId.get(id);
    if (node) impacted.push(node);
  }
  return { changed, impacted };
}
