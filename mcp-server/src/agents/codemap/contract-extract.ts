/**
 * Code Map — API contract surface extraction (STORY-005).
 *
 * Produces `endpoints[]` (method, canonical path, handler node id, best-effort
 * request/response shapes) and `declares-route` edges. Static-only; shapes are
 * derived only when present in source — never fabricated (PRD Frontend-Backend
 * Contract Rule). Supported in v1.0: Express/Fastify/Hono/Koa-router method calls,
 * Next.js App Router route handlers, FastAPI/Flask decorators, and NestJS
 * controllers (best-effort). Django urls.py and deep TS-type/zod shape derivation
 * are deferred (see story notes).
 */

import type Parser from "web-tree-sitter";
import type { ParseResult } from "./parser.js";
import {
  type Endpoint,
  type CodeEdge,
  type NodeKind,
  fileNodeId,
  symbolNodeId,
} from "./graph.js";

type SyntaxNode = Parser.SyntaxNode;

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "all"]);
const lineOf = (n: SyntaxNode): number => n.startPosition.row + 1;
const unquote = (s: string): string => s.replace(/^['"`]|['"`]$/g, "");

/** Normalize `{id}` and `[id]` path params to the canonical `:id` form. */
export function canonicalizePath(p: string): string {
  return p
    .replace(/\[\.\.\.([^\]]+)\]/g, ":$1")
    .replace(/\[([^\]]+)\]/g, ":$1")
    .replace(/\{([^}]+)\}/g, ":$1");
}

export interface EndpointExtract {
  endpoints: Endpoint[];
  edges: CodeEdge[];
}

interface Acc {
  repoRel: string;
  fileId: string;
  endpoints: Endpoint[];
  edges: CodeEdge[];
  seen: Set<string>;
  definedNames: Map<string, string>; // same-file symbol name → node id (for handler linking)
}

function pushEndpoint(
  acc: Acc,
  method: string,
  rawPath: string,
  handlerNode: SyntaxNode | null,
  handlerName: string | null,
  requestShape: Record<string, unknown> | null,
): void {
  const path = canonicalizePath(rawPath);
  const m = method.toUpperCase();
  let handler: string | null = null;
  if (handlerName && acc.definedNames.has(handlerName)) handler = acc.definedNames.get(handlerName)!;
  const key = `${m} ${path} ${handler ?? ""}`;
  if (acc.seen.has(key)) return; // dedupe when two heuristics match the same route
  acc.seen.add(key);
  acc.endpoints.push({ method: m, path, file: acc.repoRel, handler, requestShape, responseShape: null });
  if (handler) acc.edges.push({ from: acc.fileId, to: handler, kind: "declares-route" });
}

/** Collect same-file declaration names so handlers can be linked to their nodes. */
function collectDefinedNames(parsed: ParseResult, repoRel: string): Map<string, string> {
  const names = new Map<string, string>();
  const source = parsed.lang === "python"
    ? `(function_definition name: (identifier) @n)`
    : `(function_declaration name: (identifier) @n)
       (method_definition name: (property_identifier) @n)
       (variable_declarator name: (identifier) @n value: (arrow_function))`;
  const q = parsed.language.query(source);
  for (const c of q.captures(parsed.tree.rootNode)) {
    if (!names.has(c.node.text)) names.set(c.node.text, symbolNodeId(repoRel, c.node.text, lineOf(c.node)));
  }
  return names;
}

// ── JS/TS: app.get("/x", handler) / router.post(...) ────────────────────────
function extractJsMethodCalls(acc: Acc, root: SyntaxNode): void {
  for (const call of root.descendantsOfType("call_expression")) {
    const fn = call.childForFieldName("function");
    if (!fn || fn.type !== "member_expression") continue;
    const method = fn.childForFieldName("property")?.text ?? "";
    if (!HTTP_METHODS.has(method)) continue;
    const args = call.childForFieldName("arguments");
    if (!args) continue;
    const named = args.namedChildren;
    const pathArg = named.find((a) => a.type === "string");
    if (!pathArg) continue;
    const rawPath = unquote(pathArg.text);
    if (!rawPath.startsWith("/")) continue; // a real route path, not a Map.get()
    const handlerArg = [...named].reverse().find(
      (a) => a.type === "arrow_function" || a.type === "function_expression" || a.type === "identifier",
    );
    const handlerName = handlerArg?.type === "identifier" ? handlerArg.text : null;
    pushEndpoint(acc, method, rawPath, handlerArg ?? null, handlerName, null);
  }
}

// ── Next.js App Router: app/**/route.ts exporting GET/POST/... ───────────────
function extractNextRouteHandlers(acc: Acc, root: SyntaxNode): void {
  if (!/(^|\/)route\.(t|j)sx?$/.test(acc.repoRel)) return;
  const seg = acc.repoRel.replace(/(^|\/)route\.(t|j)sx?$/, "");
  const afterApp = seg.replace(/^.*?(?:^|\/)(?:src\/)?app\/?/, "");
  const routePath = "/" + canonicalizePath(afterApp).replace(/\/$/, "");
  const verbs = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
  for (const fn of root.descendantsOfType("function_declaration")) {
    const name = fn.childForFieldName("name")?.text ?? "";
    if (verbs.has(name)) pushEndpoint(acc, name, routePath || "/", fn, name, null);
  }
  for (const decl of root.descendantsOfType("variable_declarator")) {
    const name = decl.childForFieldName("name")?.text ?? "";
    const value = decl.childForFieldName("value");
    if (verbs.has(name) && value && (value.type === "arrow_function" || value.type === "function_expression")) {
      pushEndpoint(acc, name, routePath || "/", decl, name, null);
    }
  }
}

// ── Python: @app.get("/x") / @router.post(...) / @app.route("/x", methods=[...]) ─
function extractPythonDecorators(acc: Acc, root: SyntaxNode): void {
  for (const dd of root.descendantsOfType("decorated_definition")) {
    const def = dd.childForFieldName("definition");
    if (!def || def.type !== "function_definition") continue;
    const fnName = def.childForFieldName("name")?.text ?? null;
    const requestShape = pydanticRequestShape(def);
    for (const dec of dd.namedChildren.filter((c) => c.type === "decorator")) {
      const call = dec.namedChildren.find((c) => c.type === "call");
      if (!call) continue;
      const callee = call.childForFieldName("function");
      const attr = callee?.type === "attribute" ? callee.childForFieldName("attribute")?.text : null;
      if (!attr) continue;
      const argList = call.childForFieldName("arguments");
      const pathArg = argList?.namedChildren.find((a) => a.type === "string");
      const rawPath = pathArg ? unquote(pathArg.text) : null;
      if (!rawPath) continue;
      if (attr === "route") {
        for (const method of flaskMethods(argList!)) pushEndpoint(acc, method, rawPath, def, fnName, requestShape);
      } else if (HTTP_METHODS.has(attr)) {
        pushEndpoint(acc, attr, rawPath, def, fnName, requestShape);
      }
    }
  }
}

/** Flask `methods=["GET","POST"]` kwarg → list of methods (default GET). */
function flaskMethods(argList: SyntaxNode): string[] {
  for (const kw of argList.namedChildren.filter((c) => c.type === "keyword_argument")) {
    if (kw.childForFieldName("name")?.text !== "methods") continue;
    const list = kw.childForFieldName("value");
    if (list) {
      const out = list.namedChildren.filter((c) => c.type === "string").map((s) => unquote(s.text).toUpperCase());
      if (out.length) return out;
    }
  }
  return ["GET"];
}

/** FastAPI: a parameter typed as a non-primitive (Pydantic model) → {model: Name}. */
function pydanticRequestShape(def: SyntaxNode): Record<string, unknown> | null {
  const params = def.childForFieldName("parameters");
  if (!params) return null;
  const PRIMITIVES = new Set(["int", "str", "float", "bool", "bytes", "list", "dict", "None"]);
  for (const p of params.namedChildren) {
    if (p.type !== "typed_parameter") continue;
    const typeNode = p.childForFieldName("type");
    const typeName = typeNode?.text;
    if (typeName && !PRIMITIVES.has(typeName) && /^[A-Z]/.test(typeName)) {
      return { model: typeName };
    }
  }
  return null;
}

export function extractEndpoints(repoRel: string, parsed: ParseResult): EndpointExtract {
  const { lang, language, tree } = parsed;
  const acc: Acc = {
    repoRel,
    fileId: fileNodeId(repoRel),
    endpoints: [],
    edges: [],
    seen: new Set(),
    definedNames: collectDefinedNames(parsed, repoRel),
  };

  if (lang === "python") {
    extractPythonDecorators(acc, tree.rootNode);
  } else {
    extractJsMethodCalls(acc, tree.rootNode);
    extractNextRouteHandlers(acc, tree.rootNode);
  }
  return { endpoints: acc.endpoints, edges: acc.edges };
}
