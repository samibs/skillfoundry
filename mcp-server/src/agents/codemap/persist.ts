/**
 * Code Map — persistence + hashing (STORY-004).
 *
 * Atomic writes (temp file + rename) so a crash never leaves a corrupt map.
 * loadMap tolerates missing/corrupt/old-schema files by returning null, letting
 * the caller fall back to a clean full build.
 */

import { readFile, writeFile, rename, mkdir, stat } from "fs/promises";
import { createHash } from "crypto";
import path from "path";
import { type CodeMap, SCHEMA_VERSION } from "./graph.js";

export const MAP_DIR = ".skillfoundry";
export const MAP_FILE = "code-map.json";

export function mapPathFor(repoRoot: string): string {
  return path.join(repoRoot, MAP_DIR, MAP_FILE);
}

export async function hashFile(absPath: string): Promise<string> {
  const bytes = await readFile(absPath);
  return createHash("sha256").update(bytes).digest("hex");
}

/** Returns the parsed map, or null if missing, unreadable, corrupt, or wrong schema. */
export async function loadMap(mapPath: string): Promise<CodeMap | null> {
  let raw: string;
  try {
    raw = await readFile(mapPath, "utf-8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as CodeMap;
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION) return null;
    if (!Array.isArray(parsed.nodes) || !parsed.fileHashes) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Atomic JSON write (temp file + rename). */
export async function saveJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await rename(tmp, filePath); // atomic on the same filesystem
}

export async function saveMap(mapPath: string, map: CodeMap): Promise<void> {
  await saveJson(mapPath, map);
}

export async function fileExists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}
