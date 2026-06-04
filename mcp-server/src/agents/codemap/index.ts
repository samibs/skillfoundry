/**
 * Code Map — build orchestrator (STORY-002/003/004 integration).
 *
 * Walks a repo, parses supported files, extracts the graph, resolves imports,
 * and assembles a CodeMap. Used by the persistence/refresh layer and (later) the
 * sf_codemap tool. Read-only over the target repo.
 */

import { readdir, readFile } from "fs/promises";
import path from "path";
import { exec } from "../exec-utils.js";
import { parseFile, langForPath, isSkip } from "./parser.js";
import { extractFile } from "./extract.js";
import { extractEndpoints } from "./contract-extract.js";
import { extractModelsFromTree, extractPrismaModels } from "./models.js";
import { assignLayers } from "./layers.js";
import { resolveImports, type ResolveContext, type TsPaths } from "./resolve.js";
import { hashFile } from "./persist.js";
import {
  type CodeMap,
  MapBuilder,
  emptyMap,
  SCHEMA_VERSION,
  fileNodeId,
} from "./graph.js";

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".next", ".nuxt", "dist", "build", "out",
  "coverage", "venv", ".venv", ".angular", ".skillfoundry", "__pycache__",
  ".turbo", ".cache",
]);

const MAX_FILES = 20000; // safety bound on very large repos

const toPosix = (p: string): string => p.split(path.sep).join("/");

/** List repo-relative POSIX paths, skipping ignored dirs. */
export async function gatherFiles(repoRoot: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(absDir: string): Promise<void> {
    if (out.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_FILES) return;
      if (entry.name.startsWith(".") && IGNORED_DIRS.has(entry.name)) continue;
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(abs);
      } else if (entry.isFile()) {
        out.push(toPosix(path.relative(repoRoot, abs)));
      }
    }
  }
  await walk(repoRoot);
  return out.sort();
}

function stripJsonComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

async function readTsPaths(repoRoot: string): Promise<TsPaths | null> {
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    try {
      const raw = await readFile(path.join(repoRoot, name), "utf-8");
      const json = JSON.parse(stripJsonComments(raw)) as {
        compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
      };
      const co = json.compilerOptions ?? {};
      if (!co.paths && !co.baseUrl) return { baseUrl: "", paths: {} };
      const baseUrl = co.baseUrl ? toPosix(path.posix.normalize(co.baseUrl)).replace(/^\.\/?/, "") : "";
      return { baseUrl, paths: co.paths ?? {} };
    } catch {
      /* try next */
    }
  }
  return null;
}

async function readDependencies(repoRoot: string): Promise<Set<string>> {
  try {
    const raw = await readFile(path.join(repoRoot, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    return new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ]);
  } catch {
    return new Set();
  }
}

export async function buildResolveContext(repoRoot: string, files: string[]): Promise<ResolveContext> {
  return {
    files: new Set(files),
    dependencies: await readDependencies(repoRoot),
    tsPaths: await readTsPaths(repoRoot),
  };
}

export async function gitRevision(repoRoot: string): Promise<string | null> {
  const res = await exec("git", ["rev-parse", "HEAD"], { cwd: repoRoot, timeout: 5000 });
  return res.success ? res.stdout.trim() : null;
}

/** Parse a file once and run all per-file extractors (structure, contracts, models). */
export async function addFile(builder: MapBuilder, repoRoot: string, rel: string): Promise<void> {
  const parsed = await parseFile(path.join(repoRoot, rel));
  if (isSkip(parsed)) {
    // Supported-but-skipped (too large / unreadable) still gets a file node + warning.
    if (langForPath(rel)) {
      builder.addNode({ id: fileNodeId(rel), kind: "file", name: rel, file: rel, line: 1 });
      builder.warn(`${rel}: skipped (${parsed.skipped})`);
    }
    return;
  }
  if (parsed.tree.rootNode.hasError) builder.warn(`${rel}: parsed with syntax errors`);
  builder.addExtract(extractFile(rel, parsed));

  const ep = extractEndpoints(rel, parsed);
  for (const e of ep.endpoints) builder.addEndpoint(e);
  for (const edge of ep.edges) builder.addEdge(edge);

  const md = extractModelsFromTree(rel, parsed);
  for (const n of md.nodes) builder.addNode(n);
  for (const edge of md.edges) builder.addEdge(edge);
}

/** Repo-level passes that must run after every (full or incremental) build. */
export async function finalizePasses(builder: MapBuilder, repoRoot: string, files: string[]): Promise<CodeMap> {
  const map = builder.finalize();

  // Resolve imports against the full file set.
  const ctx = await buildResolveContext(repoRoot, files);
  const { edges, unresolved } = resolveImports(map.rawImports, ctx);
  for (const e of edges) builder.addEdge(e);
  map.unresolvedImports.push(...unresolved);

  // Prisma models (not tree-sitter parsed — scanned by file).
  const prisma = await extractPrismaModels(repoRoot, files);
  for (const n of prisma.nodes) builder.addNode(n);
  for (const e of prisma.edges) builder.addEdge(e);

  builder.finalize();
  assignLayers(map); // 100% file coverage; depends on rawImports being complete
  return map;
}

/** Full build from a known set of source-relevant files (parseable ones are parsed). */
export async function buildMap(repoRoot: string, allFiles?: string[]): Promise<CodeMap> {
  const files = allFiles ?? (await gatherFiles(repoRoot));
  const sourceFiles = files.filter((f) => langForPath(f) !== null);

  const builder = new MapBuilder();
  for (const rel of sourceFiles) {
    await addFile(builder, repoRoot, rel);
  }
  const map = await finalizePasses(builder, repoRoot, files);

  // Hash parseable + .prisma files — they drive incremental refresh.
  for (const rel of hashableFiles(files)) {
    try {
      map.fileHashes[rel] = await hashFile(path.join(repoRoot, rel));
    } catch {
      /* unreadable — already warned */
    }
  }
  map.builtFromRevision = await gitRevision(repoRoot);
  return map;
}

/** Files whose content changes should trigger an incremental refresh. */
export function hashableFiles(files: string[]): string[] {
  return files.filter((f) => langForPath(f) !== null || f.endsWith(".prisma"));
}
