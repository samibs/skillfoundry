/**
 * Code Map Agent (STORY-007) — orchestrates the codemap engine behind the
 * `sf_codemap` MCP tool. Modes: build | refresh (default) | query | diff-impact.
 *
 * Read-only over the target repo except for the cached artifact at
 * `.skillfoundry/code-map.json`. Returns structured summaries (PRD §6.4); never
 * throws on bad input — returns `{ ok: false, error }`.
 */

import { stat } from "fs/promises";
import path from "path";
import { buildMap, gatherFiles } from "./codemap/index.js";
import { refreshMap } from "./codemap/refresh.js";
import { loadMap, saveMap, saveJson, mapPathFor } from "./codemap/persist.js";
import { emitCodeMapFacts } from "./codemap/memory-feed.js";
import { diffImpact, parseUnifiedDiff } from "./codemap/diff-impact.js";
import { applySemanticLabels, defaultLabeler } from "./codemap/semantic.js";
import { exec } from "./exec-utils.js";
import type { CodeMap, CodeNode, CodeEdge } from "./codemap/graph.js";

export type CodemapMode = "build" | "refresh" | "query" | "diff-impact";

export interface CodemapInput {
  projectPath: string;
  mode?: CodemapMode;
  symbol?: string;
  semantic?: boolean;
  /** When false, skip writing facts to memory_bank (default true). */
  memoryFeed?: boolean;
}

export interface CodemapSummary {
  ok: boolean;
  error?: string;
  mode?: CodemapMode;
  duration?: number;
  filesParsed?: number;
  nodes?: number;
  edges?: number;
  endpoints?: number;
  unresolvedImports?: number;
  warnings?: string[];
  builtFromRevision?: string | null;
  factsRecorded?: number;
  /** Count of nodes labeled by the optional semantic pass (undefined if disabled). */
  semanticLabeled?: number;
  /** query mode */
  node?: CodeNode | null;
  related?: CodeEdge[];
  /** diff-impact mode */
  changedCount?: number;
  impactedCount?: number;
  impactedFiles?: string[];
}

function summarize(map: CodeMap, mode: CodemapMode, duration: number, filesParsed: number): CodemapSummary {
  return {
    ok: true,
    mode,
    duration,
    filesParsed,
    nodes: map.nodes.length,
    edges: map.edges.length,
    endpoints: map.endpoints.length,
    unresolvedImports: map.unresolvedImports.length,
    warnings: map.warnings,
    builtFromRevision: map.builtFromRevision,
  };
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

export async function runCodemap(input: CodemapInput): Promise<CodemapSummary> {
  const { projectPath, mode = "refresh", symbol, semantic, memoryFeed = true } = input;
  const start = Date.now();

  if (!projectPath || !(await isDirectory(projectPath))) {
    return { ok: false, error: "invalid projectPath" };
  }

  const mapPath = mapPathFor(projectPath);

  /** Apply optional, non-authoritative LLM labels (STORY-012); off unless requested. */
  async function maybeSemantic(map: CodeMap): Promise<number | undefined> {
    if (!semantic) return undefined;
    const labeler = defaultLabeler(); // throws if no provider — caught by caller
    return applySemanticLabels(map, labeler);
  }

  try {
    if (mode === "diff-impact") {
      let map = await loadMap(mapPath);
      if (!map) {
        map = await buildMap(projectPath);
        await saveMap(mapPath, map);
      }
      const diff = await exec("git", ["diff", "--unified=0"], { cwd: projectPath, timeout: 10000 });
      if (!diff.success) {
        return { ok: false, error: "git diff failed (not a git repo, or git unavailable)" };
      }
      const changes = parseUnifiedDiff(diff.stdout);
      const { changed, impacted } = diffImpact(map, changes);
      const impactedFiles = [...new Set(impacted.map((n) => n.file))].sort();
      // Persist for the dashboard (STORY-013 reads this; keeps the JS server a thin reader).
      await saveJson(path.join(projectPath, ".skillfoundry", "diff-impact.json"), {
        builtFromRevision: map.builtFromRevision,
        changed,
        impacted,
        impactedFiles,
      });
      return {
        ok: true,
        mode: "diff-impact",
        duration: Date.now() - start,
        changedCount: changed.length,
        impactedCount: impacted.length,
        impactedFiles,
      };
    }

    if (mode === "build") {
      const files = await gatherFiles(projectPath);
      const map = await buildMap(projectPath, files);
      const semanticLabeled = await maybeSemantic(map);
      await saveMap(mapPath, map);
      const sourceCount = files.filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|py)$/.test(f)).length;
      const summary = summarize(map, "build", Date.now() - start, sourceCount);
      summary.semanticLabeled = semanticLabeled;
      if (memoryFeed) summary.factsRecorded = await emitCodeMapFacts(projectPath, map);
      return summary;
    }

    if (mode === "refresh") {
      const old = await loadMap(mapPath);
      const { map, stats } = await refreshMap(projectPath, old);
      const semanticLabeled = await maybeSemantic(map);
      await saveMap(mapPath, map);
      const summary = summarize(map, "refresh", Date.now() - start, stats.reparsed.length);
      summary.semanticLabeled = semanticLabeled;
      if (memoryFeed) summary.factsRecorded = await emitCodeMapFacts(projectPath, map);
      return summary;
    }

    if (mode === "query") {
      if (!symbol) return { ok: false, error: "query mode requires a 'symbol'" };
      let map = await loadMap(mapPath);
      if (!map) {
        map = await buildMap(projectPath);
        await saveMap(mapPath, map);
      }
      const node =
        map.nodes.find((n) => n.name === symbol || n.id === symbol) ??
        map.nodes.find((n) => n.name.endsWith(symbol)) ??
        null;
      const related = node
        ? map.edges.filter((e) => e.from === node.id || e.to === node.id)
        : [];
      return { ok: true, mode: "query", duration: Date.now() - start, node, related };
    }

    return { ok: false, error: `unknown mode: ${mode as string}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
