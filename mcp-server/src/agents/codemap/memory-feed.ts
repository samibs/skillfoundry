/**
 * Code Map — memory_bank feed (STORY-010).
 *
 * Emits a few sanitized, deduped knowledge facts (API surface, model inventory,
 * unresolved-import hotspots, layer distribution) so structural lessons from one
 * app can surface in others. Best-effort: only writes when the project already
 * has a `memory_bank/knowledge/` dir, dedupes by content hash, and never throws
 * (a failure here must not fail the map build).
 *
 * Records follow the existing knowledge JSONL schema (id, type, content,
 * created_at, created_by, session_id, context, weight, *_count, tags) — no new
 * shape is invented. Global propagation is handled by the existing knowledge-sync
 * daemon, not here.
 */

import { readFile, appendFile, access } from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { type CodeMap } from "./graph.js";

export interface KnowledgeRecord {
  id: string;
  type: string;
  content: string;
  created_at: string;
  created_by: string;
  session_id: string;
  context: { prd_id: string | null; story_id: string | null; phase: string | null };
  weight: number;
  validation_count: number;
  retrieval_count: number;
  tags: string[];
}

const SECRET_RE = /\b(api[_-]?key|secret|token|password|passwd|authorization|bearer)\b\s*[=:]\s*\S+/gi;

/** Strip absolute paths and obvious secrets — mirrors scripts/sanitize-knowledge.sh intent. */
export function sanitizeText(text: string, repoRoot: string): string {
  let out = text.split(repoRoot).join("");
  out = out.replace(SECRET_RE, (m) => m.replace(/[=:]\s*\S+/, "=[redacted]"));
  return out;
}

function record(content: string, tags: string[], now: string): KnowledgeRecord {
  const id = createHash("sha256").update(content).digest("hex").slice(0, 32);
  return {
    id,
    type: "pattern",
    content,
    created_at: now,
    created_by: "codemap",
    session_id: "codemap",
    context: { prd_id: "codebase-comprehension-preflight", story_id: null, phase: null },
    weight: 0.4,
    validation_count: 0,
    retrieval_count: 0,
    tags: ["code-map", ...tags],
  };
}

/** Build the candidate fact records for a map (pure; useful for testing). */
export function buildFacts(map: CodeMap, repoRoot: string, now: string): KnowledgeRecord[] {
  const facts: KnowledgeRecord[] = [];
  const s = (t: string) => sanitizeText(t, repoRoot);

  if (map.endpoints.length > 0) {
    const list = map.endpoints.slice(0, 50).map((e) => `${e.method} ${e.path}`).join(", ");
    facts.push(record(s(`API surface (${map.endpoints.length} endpoints): ${list}`), ["contract", "endpoints"], now));
  }

  const models = map.nodes.filter((n) => n.kind === "model").map((n) => n.name);
  if (models.length > 0) {
    facts.push(record(s(`Data models (${models.length}): ${models.slice(0, 80).join(", ")}`), ["models", "schema"], now));
  }

  if (map.unresolvedImports.length > 0) {
    const list = map.unresolvedImports.slice(0, 30).map((u) => `${u.fromFile}→${u.specifier}`).join(", ");
    facts.push(record(s(`Unresolved imports (${map.unresolvedImports.length}): ${list}`), ["imports", "unresolved"], now));
  }

  const layerCounts = new Map<string, number>();
  for (const n of map.nodes) {
    if (n.kind !== "file" || !n.layer) continue;
    layerCounts.set(n.layer, (layerCounts.get(n.layer) ?? 0) + 1);
  }
  if (layerCounts.size > 0) {
    const dist = [...layerCounts.entries()].sort().map(([l, c]) => `${l}:${c}`).join(", ");
    facts.push(record(s(`Layer distribution (files): ${dist}`), ["layers"], now));
  }

  return facts;
}

async function dirExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Append new (deduped) code-map facts to the project's knowledge store.
 * Returns the number of records written (0 if no memory_bank or all duplicates).
 */
export async function emitCodeMapFacts(
  repoRoot: string,
  map: CodeMap,
  opts?: { now?: string },
): Promise<number> {
  try {
    const knowledgeDir = path.join(repoRoot, "memory_bank", "knowledge");
    if (!(await dirExists(knowledgeDir))) return 0; // only feed projects that already use SF memory

    const file = path.join(knowledgeDir, "code-map.jsonl");
    const existingIds = new Set<string>();
    try {
      const prior = await readFile(file, "utf-8");
      for (const line of prior.split("\n")) {
        if (!line.trim()) continue;
        try {
          existingIds.add((JSON.parse(line) as { id: string }).id);
        } catch {
          /* skip malformed line */
        }
      }
    } catch {
      /* no prior file */
    }

    const now = opts?.now ?? new Date().toISOString();
    const fresh = buildFacts(map, repoRoot, now).filter((r) => !existingIds.has(r.id));
    if (fresh.length === 0) return 0;

    await appendFile(file, fresh.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");
    return fresh.length;
  } catch {
    return 0; // never fail the build on a memory-feed problem
  }
}
