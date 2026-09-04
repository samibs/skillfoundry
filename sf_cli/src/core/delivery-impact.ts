// Delivery Efficiency — change impact analysis.
//
// Test scope selection needs one number it cannot guess: how far a change actually reaches.
// Without it, `selectTestScope` falls back to the budget's base scope and a caller has to
// supply `dependents` by hand — which in practice means nobody does, and the widening rule
// never fires.
//
// This builds a reverse import graph (file → files that import it) so the fan-out of a
// change is measured rather than assumed. It is deliberately a static, regex-level scan:
// resolving a full module graph would cost more than the validation it is trying to avoid.
//
// The bias is conservative. An import this scanner cannot resolve is a dependent it will
// not report, so `unresolvedImports` is surfaced and callers treat a high count as a reason
// to widen rather than narrow.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname, relative, extname } from 'node:path';
import { treeSha } from './mission-git.js';
import { getLogger } from '../utils/logger.js';

const CACHE_DIR = '.skillfoundry';
const CACHE_FILE = 'delivery-import-graph.json';

/** Bump when extraction or resolution changes, so an older graph is rebuilt not trusted. */
export const IMPORT_GRAPH_VERSION = '1';

/** Extensions scanned for imports, and the order relative specifiers resolve in. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py'];

/** Directories never worth walking — none of them contain first-party source. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', 'vendor', '.skillfoundry', '.ai',
]);

/** Hard ceiling on files scanned, so a huge monorepo degrades rather than hangs. */
const MAX_FILES = 20_000;

/** The reverse import graph plus what it could not resolve. */
export interface ImportGraph {
  version: string;
  /** Tree hash the graph was built from; a different tree means rebuild. */
  treeSha: string | null;
  /** Repo-relative file → repo-relative files that import it. */
  dependents: Record<string, string[]>;
  /** Files scanned. */
  fileCount: number;
  /**
   * Import specifiers that could not be resolved to a repository file — bare package
   * specifiers, aliases, generated modules. A high count means the graph understates
   * fan-out, so callers should widen rather than narrow.
   */
  unresolvedImports: number;
  builtAt: string;
}

// ── Import extraction ─────────────────────────────────────────────────────────

/** ES/CommonJS import forms: static, re-export, dynamic, and require. */
const JS_IMPORT_PATTERNS = [
  /\bimport\s+[^'"]*?from\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bexport\s+[^'"]*?from\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** Python import forms. Only relative imports can resolve inside the repository. */
const PY_IMPORT_PATTERNS = [
  /^\s*from\s+(\.[.\w]*)\s+import\s+/gm,
  /^\s*import\s+([.\w]+)/gm,
];

/** Extract raw import specifiers from a source file. */
export function extractImports(content: string, ext: string): string[] {
  const patterns = ext === '.py' ? PY_IMPORT_PATTERNS : JS_IMPORT_PATTERNS;
  const found = new Set<string>();

  for (const re of patterns) {
    // Patterns are module-level with /g, so reset lastIndex before each file.
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m[1]) found.add(m[1]);
    }
  }
  return [...found];
}

/**
 * Resolve an import specifier to a repository file.
 *
 * Only relative specifiers can point at first-party source; a bare specifier is a package
 * and is reported unresolved rather than guessed at.
 *
 * @param fromFile - Repo-relative path of the importing file.
 * @returns The repo-relative path of the imported file, or null.
 */
export function resolveImport(
  workDir: string,
  fromFile: string,
  specifier: string,
  known: Set<string>,
): string | null {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('.');
  if (!isRelative) return null;

  const fromDir = dirname(fromFile);

  // Python relative imports use dots for depth: `.mod`, `..pkg.mod`.
  if (specifier.startsWith('.') && !specifier.startsWith('./') && !specifier.startsWith('../')) {
    const leadingDots = /^\.+/.exec(specifier)?.[0].length ?? 1;
    const tail = specifier.slice(leadingDots).replace(/\./g, '/');
    let base = fromDir;
    for (let i = 1; i < leadingDots; i++) base = dirname(base);
    const candidate = tail ? join(base, tail) : base;
    for (const suffix of ['.py', '/__init__.py']) {
      const p = normalizeRel(candidate + suffix);
      if (known.has(p)) return p;
    }
    return null;
  }

  const base = normalizeRel(join(fromDir, specifier));

  // Exact path first, then TypeScript's `.js` → `.ts` convention, then extensions, then index.
  if (known.has(base)) return base;

  const jsExt = extname(base);
  if (jsExt === '.js' || jsExt === '.mjs' || jsExt === '.cjs') {
    for (const tsExt of ['.ts', '.tsx', '.mts', '.cts']) {
      const swapped = base.slice(0, -jsExt.length) + tsExt;
      if (known.has(swapped)) return swapped;
    }
  }

  for (const ext of SOURCE_EXTENSIONS) {
    if (known.has(base + ext)) return base + ext;
  }
  for (const ext of SOURCE_EXTENSIONS) {
    const idx = normalizeRel(join(base, `index${ext}`));
    if (known.has(idx)) return idx;
  }
  return null;
}

/** Normalise to forward-slash, repo-relative form so keys compare reliably. */
function normalizeRel(p: string): string {
  return p.split('\\').join('/').replace(/^\.\//, '');
}

// ── Graph construction ────────────────────────────────────────────────────────

/** Walk the repository collecting source files, bounded by MAX_FILES. */
function collectSourceFiles(workDir: string): string[] {
  const root = resolve(workDir);
  const out: string[] = [];

  const walk = (dir: string): void => {
    if (out.length >= MAX_FILES) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (out.length >= MAX_FILES) return;
      if (name.startsWith('.') && SKIP_DIRS.has(name)) continue;
      if (SKIP_DIRS.has(name)) continue;

      const abs = join(dir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(abs);
      else if (st.isFile() && SOURCE_EXTENSIONS.includes(extname(name))) {
        out.push(normalizeRel(relative(root, abs)));
      }
    }
  };

  walk(root);
  return out;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, JSON.stringify(value), 'utf-8');
    renameSync(tmp, filePath);
  } catch (err) {
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch { /* best-effort */ }
    }
    throw err;
  }
}

/**
 * Build the reverse import graph for a repository.
 *
 * The graph is cached under `.skillfoundry/` keyed by tree hash: an unchanged tree reuses
 * it, which is the same "already proven + unchanged" rule the evidence store applies to
 * validations. This scan is itself the kind of repeated repository analysis the delivery
 * layer exists to eliminate.
 *
 * @param opts.force - Rebuild even when a cached graph matches the tree.
 */
export function buildImportGraph(workDir: string, opts: { force?: boolean } = {}): ImportGraph {
  const root = resolve(workDir);
  const cachePath = join(root, CACHE_DIR, CACHE_FILE);
  const currentTree = treeSha(workDir, 'HEAD');

  if (!opts.force && existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, 'utf-8')) as ImportGraph;
      if (
        cached.version === IMPORT_GRAPH_VERSION &&
        cached.treeSha &&
        currentTree &&
        cached.treeSha === currentTree
      ) {
        getLogger().info('delivery', 'import_graph_reused', { files: cached.fileCount });
        return cached;
      }
    } catch {
      // A corrupt cache proves nothing; rebuild.
    }
  }

  const files = collectSourceFiles(root);
  const known = new Set(files);
  const dependents: Record<string, string[]> = {};
  let unresolved = 0;

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(join(root, file), 'utf-8');
    } catch {
      continue;
    }
    for (const spec of extractImports(content, extname(file))) {
      const target = resolveImport(root, file, spec, known);
      if (!target) {
        unresolved++;
        continue;
      }
      (dependents[target] ??= []).push(file);
    }
  }

  for (const key of Object.keys(dependents)) {
    dependents[key] = [...new Set(dependents[key])].sort();
  }

  const graph: ImportGraph = {
    version: IMPORT_GRAPH_VERSION,
    treeSha: currentTree,
    dependents,
    fileCount: files.length,
    unresolvedImports: unresolved,
    builtAt: new Date().toISOString(),
  };

  try {
    writeJsonAtomic(cachePath, graph);
  } catch {
    // The graph is still usable in memory even if it cannot be cached.
  }

  getLogger().info('delivery', 'import_graph_built', {
    files: files.length, edges: Object.keys(dependents).length, unresolved,
  });
  return graph;
}

// ── Impact ────────────────────────────────────────────────────────────────────

/** The measured blast radius of a change. */
export interface ImpactAnalysis {
  /** The files the change touches. */
  changedFiles: string[];
  /** Transitive dependents, excluding the changed files themselves. */
  dependents: string[];
  /** How many hops out the search went before stopping. */
  depthReached: number;
  /** True when the traversal hit its depth limit and the true fan-out may be larger. */
  truncated: boolean;
  /** Unresolved imports in the graph — a high count means fan-out is understated. */
  unresolvedImports: number;
  /** Files the graph knows nothing about, e.g. a new file or a non-source asset. */
  unknownFiles: string[];
}

/** Default traversal depth. Beyond this, "wide" is established and the number stops mattering. */
const DEFAULT_DEPTH = 3;

/**
 * Measure how far a change reaches (§5, dependency impact).
 *
 * Walks the reverse import graph transitively from the changed files.
 *
 * @param opts.depth - Maximum hops. Defaults to 3.
 * @returns The dependent set and the caveats that qualify it.
 */
export function analyzeImpact(
  graph: ImportGraph,
  changedFiles: string[],
  opts: { depth?: number } = {},
): ImpactAnalysis {
  const maxDepth = opts.depth ?? DEFAULT_DEPTH;
  const changed = new Set(changedFiles.map(normalizeRel));

  const seen = new Set<string>(changed);
  let frontier = [...changed];
  let depth = 0;
  let truncated = false;

  while (frontier.length > 0 && depth < maxDepth) {
    const next: string[] = [];
    for (const file of frontier) {
      for (const dep of graph.dependents[file] ?? []) {
        if (seen.has(dep)) continue;
        seen.add(dep);
        next.push(dep);
      }
    }
    frontier = next;
    depth++;
    if (frontier.length > 0 && depth === maxDepth) truncated = true;
  }

  const known = new Set(Object.keys(graph.dependents));
  const unknownFiles = [...changed].filter(
    (f) => !known.has(f) && !(graph.dependents[f]?.length),
  );

  return {
    changedFiles: [...changed].sort(),
    dependents: [...seen].filter((f) => !changed.has(f)).sort(),
    depthReached: depth,
    truncated,
    unresolvedImports: graph.unresolvedImports,
    unknownFiles: unknownFiles.sort(),
  };
}

/**
 * Measure impact directly from a repository, building or reusing the graph as needed.
 *
 * This is the call `$tester` and the delivery runner make when they need a real fan-out
 * number instead of a supplied guess.
 */
export function measureImpact(
  workDir: string,
  changedFiles: string[],
  opts: { depth?: number; force?: boolean } = {},
): ImpactAnalysis {
  return analyzeImpact(buildImportGraph(workDir, { force: opts.force }), changedFiles, opts);
}

/** A readable explanation of the measured impact, for scope decisions and reports. */
export function describeImpact(impact: ImpactAnalysis): string {
  const parts = [
    `${impact.changedFiles.length} changed file(s) reach ${impact.dependents.length} dependent(s) within ${impact.depthReached} hop(s)`,
  ];
  if (impact.truncated) parts.push('traversal hit its depth limit, so the true fan-out may be larger');
  if (impact.unresolvedImports > 0) {
    parts.push(`${impact.unresolvedImports} unresolved import(s) in the graph, so fan-out is a lower bound`);
  }
  if (impact.unknownFiles.length > 0) {
    parts.push(`${impact.unknownFiles.length} changed file(s) are not in the import graph (new or non-source)`);
  }
  return parts.join('; ');
}
