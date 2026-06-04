/**
 * Code Map — incremental refresh (STORY-004, extended for Phase 2).
 *
 * Re-parses ONLY files whose sha256 changed since the stored map (plus new files),
 * carries unchanged files' nodes/edges/raw-imports/endpoints forward verbatim,
 * drops deleted files, then re-runs the repo-level passes (import resolution,
 * Prisma models, layer assignment). A null/old-schema map falls back to a clean
 * full build. Change detection covers parseable files AND `.prisma` schemas.
 */

import path from "path";
import { langForPath } from "./parser.js";
import { hashFile } from "./persist.js";
import {
  buildMap,
  gatherFiles,
  addFile,
  finalizePasses,
  hashableFiles,
  gitRevision,
} from "./index.js";
import { type CodeMap, MapBuilder } from "./graph.js";

export interface RefreshStats {
  mode: "full" | "incremental";
  reparsed: string[];
  added: string[];
  deleted: string[];
  unchanged: number;
}

export interface RefreshOutcome {
  map: CodeMap;
  stats: RefreshStats;
}

export async function refreshMap(
  repoRoot: string,
  oldMap: CodeMap | null,
  allFiles?: string[],
): Promise<RefreshOutcome> {
  const files = allFiles ?? (await gatherFiles(repoRoot));
  const hashTargets = hashableFiles(files); // parseable + .prisma
  const sourceFiles = files.filter((f) => langForPath(f) !== null);

  if (!oldMap) {
    const map = await buildMap(repoRoot, files);
    return { map, stats: { mode: "full", reparsed: sourceFiles, added: hashTargets, deleted: [], unchanged: 0 } };
  }

  // Classify every hashable file against the stored hashes.
  const currentHashes: Record<string, string> = {};
  const changed: string[] = [];
  const added: string[] = [];
  for (const rel of hashTargets) {
    try {
      currentHashes[rel] = await hashFile(path.join(repoRoot, rel));
    } catch {
      continue; // unreadable; treated as absent
    }
    const prev = oldMap.fileHashes[rel];
    if (prev === undefined) added.push(rel);
    else if (prev !== currentHashes[rel]) changed.push(rel);
  }
  const deleted = Object.keys(oldMap.fileHashes).filter((f) => currentHashes[f] === undefined);
  const reparse = new Set([...changed, ...added]);
  const unchangedSource = new Set(
    sourceFiles.filter((f) => !reparse.has(f) && currentHashes[f] !== undefined),
  );

  // Nothing to do — return the existing map untouched.
  if (reparse.size === 0 && deleted.length === 0) {
    return { map: oldMap, stats: { mode: "incremental", reparsed: [], added: [], deleted: [], unchanged: unchangedSource.size } };
  }

  // Carry unchanged files forward from the old map.
  const fileOfNode = new Map<string, string>();
  for (const n of oldMap.nodes) fileOfNode.set(n.id, n.file);

  const builder = new MapBuilder();
  for (const n of oldMap.nodes) {
    if (unchangedSource.has(n.file)) builder.addNode(n);
  }
  for (const e of oldMap.edges) {
    if (e.kind === "imports") continue; // re-resolved globally below
    const ff = fileOfNode.get(e.from);
    const tf = fileOfNode.get(e.to);
    // declares-route / declares-model / contains / calls are file-local (from ∈ same file)
    if (ff && unchangedSource.has(ff) && (tf === undefined || unchangedSource.has(tf))) builder.addEdge(e);
  }
  for (const ri of oldMap.rawImports) {
    if (unchangedSource.has(ri.fromFile)) builder.rawImports.push(ri);
  }
  for (const ep of oldMap.endpoints) {
    if (unchangedSource.has(ep.file)) builder.addEndpoint(ep);
  }

  // Re-parse only changed/added files (non-parseable .prisma are no-ops here;
  // Prisma models are re-scanned wholesale by finalizePasses).
  const reparsed: string[] = [];
  for (const rel of reparse) {
    if (langForPath(rel) === null) continue;
    await addFile(builder, repoRoot, rel);
    reparsed.push(rel);
  }

  const map = await finalizePasses(builder, repoRoot, files);
  map.fileHashes = currentHashes;
  map.builtFromRevision = await gitRevision(repoRoot);

  return {
    map,
    stats: { mode: "incremental", reparsed, added, deleted, unchanged: unchangedSource.size },
  };
}
