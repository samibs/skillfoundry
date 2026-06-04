/**
 * Code Map — DB/model node extraction (STORY-006).
 *
 * Prisma schemas are parsed with a dedicated block parser (they are not JS).
 * Drizzle / Mongoose / TypeORM / SQLAlchemy models are detected from the
 * tree-sitter tree. Each model becomes a `model` node with a `declares-model`
 * edge from its file; field lists are captured where statically parseable.
 */

import type Parser from "web-tree-sitter";
import { readFile } from "fs/promises";
import path from "path";
import type { ParseResult } from "./parser.js";
import {
  type CodeNode,
  type CodeEdge,
  fileNodeId,
  symbolNodeId,
} from "./graph.js";

type SyntaxNode = Parser.SyntaxNode;
const lineOf = (n: SyntaxNode): number => n.startPosition.row + 1;
const unquote = (s: string): string => s.replace(/^['"`]|['"`]$/g, "");

export interface ModelExtract {
  nodes: CodeNode[];
  edges: CodeEdge[];
}

function addModel(out: ModelExtract, repoRel: string, name: string, line: number, fields: { name: string; type: string }[]): void {
  const id = symbolNodeId(repoRel, name, line);
  out.nodes.push({ id, kind: "model", name, file: repoRel, line, fields });
  out.edges.push({ from: fileNodeId(repoRel), to: id, kind: "declares-model" });
}

// ── Prisma: `model X { field Type ... }` ─────────────────────────────────────
export async function extractPrismaModels(repoRoot: string, relFiles: string[]): Promise<ModelExtract> {
  const out: ModelExtract = { nodes: [], edges: [] };
  for (const rel of relFiles) {
    if (!rel.endsWith(".prisma")) continue;
    let text: string;
    try {
      text = await readFile(path.join(repoRoot, rel), "utf-8");
    } catch {
      continue;
    }
    const re = /(^|\n)\s*model\s+(\w+)\s*\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const name = m[2];
      const line = text.slice(0, m.index + m[1].length).split("\n").length;
      const fields: { name: string; type: string }[] = [];
      for (const raw of m[3].split("\n")) {
        const t = raw.trim();
        if (!t || t.startsWith("//") || t.startsWith("@@")) continue;
        const parts = t.split(/\s+/);
        if (parts.length >= 2 && /^\w+$/.test(parts[0])) {
          fields.push({ name: parts[0], type: parts[1] });
        }
      }
      addModel(out, rel, name, line, fields);
    }
  }
  return out;
}

// ── JS/TS: Drizzle pgTable/sqliteTable, Mongoose new Schema, TypeORM @Entity ──
function objectFields(objNode: SyntaxNode | null): { name: string; type: string }[] {
  if (!objNode || objNode.type !== "object") return [];
  const fields: { name: string; type: string }[] = [];
  for (const pair of objNode.namedChildren.filter((c) => c.type === "pair")) {
    const key = pair.childForFieldName("key");
    const value = pair.childForFieldName("value");
    if (!key) continue;
    const name = unquote(key.text);
    let type = value?.type ?? "unknown";
    if (value?.type === "call_expression") {
      type = value.childForFieldName("function")?.text ?? "call";
    }
    fields.push({ name, type });
  }
  return fields;
}

const DRIZZLE_FACTORIES = new Set(["pgTable", "sqliteTable", "mysqlTable"]);

function extractJsModels(out: ModelExtract, repoRel: string, root: SyntaxNode): void {
  for (const decl of root.descendantsOfType("variable_declarator")) {
    const name = decl.childForFieldName("name")?.text;
    const value = decl.childForFieldName("value");
    if (!name || !value) continue;

    // Drizzle: const users = pgTable("users", { ... })
    if (value.type === "call_expression") {
      const fnName = value.childForFieldName("function")?.text ?? "";
      if (DRIZZLE_FACTORIES.has(fnName)) {
        const args = value.childForFieldName("arguments");
        const obj = args?.namedChildren.find((a) => a.type === "object") ?? null;
        addModel(out, repoRel, name, lineOf(decl), objectFields(obj));
        continue;
      }
    }
    // Mongoose: const userSchema = new Schema({ ... })
    if (value.type === "new_expression") {
      const ctor = value.childForFieldName("constructor")?.text ?? "";
      if (ctor === "Schema" || ctor.endsWith(".Schema")) {
        const args = value.childForFieldName("arguments");
        const obj = args?.namedChildren.find((a) => a.type === "object") ?? null;
        addModel(out, repoRel, name, lineOf(decl), objectFields(obj));
      }
    }
  }

  // TypeORM: @Entity() class User { ... }
  for (const cls of root.descendantsOfType("class_declaration")) {
    const parent = cls.parent;
    const decorated = parent?.type === "decorated_definition" ? parent : cls;
    const hasEntity = decorated.descendantsOfType("decorator").some((d) => /(^|\W)Entity\b/.test(d.text));
    if (hasEntity) {
      const name = cls.childForFieldName("name")?.text;
      if (name) addModel(out, repoRel, name, lineOf(cls), []);
    }
  }
}

// ── Python: SQLAlchemy declarative models (class … (Base)) ───────────────────
function extractPyModels(out: ModelExtract, repoRel: string, root: SyntaxNode): void {
  for (const cls of root.descendantsOfType("class_definition")) {
    const supers = cls.childForFieldName("superclasses");
    const bases = supers ? supers.text : "";
    const tablename = cls.descendantsOfType("assignment").some((a) => a.text.startsWith("__tablename__"));
    if (/\bBase\b|\bModel\b/.test(bases) || tablename) {
      const name = cls.childForFieldName("name")?.text;
      if (name) addModel(out, repoRel, name, lineOf(cls), []);
    }
  }
}

/** Per-file (tree-based) model extraction. Prisma is handled separately by file. */
export function extractModelsFromTree(repoRel: string, parsed: ParseResult): ModelExtract {
  const out: ModelExtract = { nodes: [], edges: [] };
  if (parsed.lang === "python") {
    extractPyModels(out, repoRel, parsed.tree.rootNode);
  } else {
    extractJsModels(out, repoRel, parsed.tree.rootNode);
  }
  return out;
}
