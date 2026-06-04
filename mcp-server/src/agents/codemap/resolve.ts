/**
 * Code Map — import resolution (STORY-003).
 *
 * Turns raw import specifiers into `imports` edges between repo files, classifies
 * bare specifiers that match a declared dependency as `external` (dropped), and
 * records the rest in `unresolvedImports`. Static only — never requires/executes
 * the target (PRD §4.2 / §7.3).
 */

import path from "path";
import {
  type CodeEdge,
  type RawImport,
  type UnresolvedImport,
  fileNodeId,
} from "./graph.js";

export interface TsPaths {
  baseUrl: string; // repo-relative POSIX, "" = repo root
  paths: Record<string, string[]>; // alias glob → targets (repo-relative-ish)
}

export interface ResolveContext {
  files: Set<string>; // every repo-relative POSIX file path present in the repo
  dependencies: Set<string>; // package.json dependencies + devDependencies names
  tsPaths: TsPaths | null;
}

const JS_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".d.ts"];

const toPosix = (p: string): string => p.split(path.sep).join("/");
const dirOf = (p: string): string => toPosix(path.posix.dirname(p));
const norm = (p: string): string => toPosix(path.posix.normalize(p)).replace(/^\.\//, "");

/** Try a JS/TS module path (no extension) against the file set: exts + /index. */
function resolveJsLike(candidate: string, files: Set<string>): string | null {
  const base = norm(candidate);
  if (files.has(base)) return base;
  for (const ext of JS_EXTS) {
    if (files.has(base + ext)) return base + ext;
  }
  for (const ext of JS_EXTS) {
    if (files.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
  }
  return null;
}

/** Match a tsconfig `paths` alias and resolve the mapped target. */
function resolveAlias(spec: string, ctx: ResolveContext): string | null {
  const ts = ctx.tsPaths;
  if (!ts) return null;
  for (const [pattern, targets] of Object.entries(ts.paths)) {
    const star = pattern.indexOf("*");
    if (star === -1) {
      if (spec !== pattern) continue;
      for (const t of targets) {
        const hit = resolveJsLike(norm(path.posix.join(ts.baseUrl, t)), ctx.files);
        if (hit) return hit;
      }
      continue;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (!spec.startsWith(prefix) || !spec.endsWith(suffix)) continue;
    const captured = spec.slice(prefix.length, spec.length - suffix.length);
    for (const t of targets) {
      const target = t.replace("*", captured);
      const hit = resolveJsLike(norm(path.posix.join(ts.baseUrl, target)), ctx.files);
      if (hit) return hit;
    }
  }
  return null;
}

/** Resolve a Python relative import (leading-dot module spec). */
function resolvePythonRelative(spec: string, fromFile: string, files: Set<string>): string | null {
  const dots = spec.match(/^\.+/)?.[0].length ?? 0;
  if (dots === 0) return null;
  const moduleTail = spec.slice(dots); // may be "" for `from . import x`
  let base = dirOf(fromFile);
  for (let i = 1; i < dots; i++) base = dirOf(base + "/_"); // go up (dots-1) levels
  const rel = moduleTail ? moduleTail.split(".").join("/") : "";
  const stem = norm(base + (rel ? "/" + rel : ""));
  if (files.has(stem + ".py")) return stem + ".py";
  if (files.has(stem + "/__init__.py")) return stem + "/__init__.py";
  if (!moduleTail && files.has(base + "/__init__.py")) return base + "/__init__.py";
  return null;
}

const isJsRelative = (s: string): boolean => s.startsWith("./") || s.startsWith("../") || s === "." || s === "..";
const isPyRelative = (s: string): boolean => s.startsWith(".");
const topSegment = (s: string): string => (s.startsWith("@") ? s.split("/").slice(0, 2).join("/") : s.split("/")[0]);

export interface ResolveResult {
  edges: CodeEdge[];
  unresolved: UnresolvedImport[];
}

export function resolveImports(rawImports: RawImport[], ctx: ResolveContext): ResolveResult {
  const edges: CodeEdge[] = [];
  const unresolved: UnresolvedImport[] = [];
  const seenEdge = new Set<string>();
  const isPython = (f: string): boolean => f.endsWith(".py");

  for (const imp of rawImports) {
    const { fromFile, specifier, line } = imp;
    let resolved: string | null = null;

    if (isPython(fromFile)) {
      if (isPyRelative(specifier)) {
        resolved = resolvePythonRelative(specifier, fromFile, ctx.files);
        if (!resolved) {
          unresolved.push({ fromFile, specifier, line });
          continue;
        }
      } else {
        // Absolute Python import (stdlib/3rd-party/local pkg) — treat as external.
        continue;
      }
    } else if (isJsRelative(specifier)) {
      resolved = resolveJsLike(norm(path.posix.join(dirOf(fromFile), specifier)), ctx.files);
      if (!resolved) {
        unresolved.push({ fromFile, specifier, line });
        continue;
      }
    } else {
      // Bare specifier: declared dependency → external; tsconfig alias → resolve; else unresolved.
      if (ctx.dependencies.has(topSegment(specifier))) continue;
      resolved = resolveAlias(specifier, ctx);
      if (!resolved) {
        unresolved.push({ fromFile, specifier, line });
        continue;
      }
    }

    const key = `${fromFile}->${resolved}`;
    if (!seenEdge.has(key) && resolved !== fromFile) {
      seenEdge.add(key);
      edges.push({ from: fileNodeId(fromFile), to: fileNodeId(resolved), kind: "imports" });
    }
  }

  return { edges, unresolved };
}
