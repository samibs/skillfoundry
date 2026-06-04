/**
 * Code Map — node/edge extraction from a parsed tree (STORY-002).
 *
 * Deterministic, source-only. Produces function/method/class/export nodes,
 * `contains` edges (file→symbol), same-file `calls` edges (only when the callee
 * resolves to a symbol defined in the same file — cross-file/dynamic calls are
 * out of scope per PRD §7.3), and raw imports for the resolver (STORY-003).
 */

import type Parser from "web-tree-sitter";
import type { ParseResult, SupportedLang } from "./parser.js";
import {
  type CodeNode,
  type CodeEdge,
  type RawImport,
  type FileExtract,
  type NodeKind,
  fileNodeId,
  symbolNodeId,
} from "./graph.js";

type SyntaxNode = Parser.SyntaxNode;

const lineOf = (n: SyntaxNode): number => n.startPosition.row + 1;
const unquote = (s: string): string => s.replace(/^['"`]|['"`]$/g, "");

/** Build the declaration/import/call query for a language. */
function querySource(lang: SupportedLang): string {
  if (lang === "python") {
    return `
      (function_definition name: (identifier) @function)
      (class_definition name: (identifier) @class)
      (import_statement (dotted_name) @import)
      (import_statement (aliased_import (dotted_name) @import))
      (import_from_statement module_name: (dotted_name) @import)
      (import_from_statement module_name: (relative_import) @import)
      (call function: (identifier) @call)
      (call function: (attribute attribute: (identifier) @call))
    `;
  }
  // typescript | tsx | javascript
  const className = lang === "javascript" ? "identifier" : "type_identifier";
  return `
    (function_declaration name: (identifier) @function)
    (generator_function_declaration name: (identifier) @function)
    (variable_declarator name: (identifier) @function value: (arrow_function))
    (variable_declarator name: (identifier) @function value: (function_expression))
    (class_declaration name: (${className}) @class)
    (method_definition name: (property_identifier) @method)
    (import_statement source: (string) @import)
    (export_statement source: (string) @import)
    (export_statement) @export
    (call_expression function: (identifier) @call)
    (call_expression function: (member_expression property: (property_identifier) @call))
  `;
}

interface Span {
  id: string;
  startIndex: number;
  endIndex: number;
}

export function extractFile(
  repoRelPath: string,
  parsed: ParseResult,
): FileExtract {
  const { lang, language, tree } = parsed;
  const nodes: CodeNode[] = [];
  const edges: CodeEdge[] = [];
  const rawImports: RawImport[] = [];

  const fileId = fileNodeId(repoRelPath);
  nodes.push({ id: fileId, kind: "file", name: repoRelPath, file: repoRelPath, line: 1 });

  const query = language.query(querySource(lang));
  const captures = query.captures(tree.rootNode);

  // First pass: class spans (needed to classify Python methods).
  const classSpans: Span[] = [];
  for (const c of captures) {
    if (c.name !== "class") continue;
    const decl = c.node.parent ?? c.node;
    classSpans.push({ id: "", startIndex: decl.startIndex, endIndex: decl.endIndex });
  }
  const inClass = (n: SyntaxNode): boolean =>
    classSpans.some((s) => n.startIndex >= s.startIndex && n.endIndex <= s.endIndex);

  // Second pass: declaration nodes (function/method/class) + exports.
  const definedNames = new Map<string, string>(); // name → node id (first definition wins)
  const symbolSpans: Span[] = []; // function/method spans for caller resolution

  const addSymbol = (kind: NodeKind, name: string, nameNode: SyntaxNode): void => {
    const line = lineOf(nameNode);
    const id = symbolNodeId(repoRelPath, name, line);
    nodes.push({ id, kind, name, file: repoRelPath, line });
    edges.push({ from: fileId, to: id, kind: "contains" });
    if (!definedNames.has(name)) definedNames.set(name, id);
    if (kind === "function" || kind === "method") {
      const decl = nameNode.parent ?? nameNode;
      symbolSpans.push({ id, startIndex: decl.startIndex, endIndex: decl.endIndex });
    }
  };

  for (const c of captures) {
    const node = c.node;
    switch (c.name) {
      case "function": {
        // Python: a function inside a class body is a method.
        const kind: NodeKind = lang === "python" && inClass(node) ? "method" : "function";
        addSymbol(kind, node.text, node);
        break;
      }
      case "method":
        addSymbol("method", node.text, node);
        break;
      case "class":
        addSymbol("class", node.text, node);
        break;
      case "import": {
        const spec = lang === "python" ? node.text : unquote(node.text);
        if (spec) rawImports.push({ fromFile: repoRelPath, specifier: spec, line: lineOf(node) });
        break;
      }
      case "export": {
        // Only re-export specifiers (`export { a, b }`) become export nodes;
        // `export function/class/const` are already captured as their own symbols.
        for (const spec of node.descendantsOfType("export_specifier")) {
          const nameNode = spec.childForFieldName("name") ?? spec.firstChild;
          if (!nameNode) continue;
          const name = nameNode.text;
          const line = lineOf(nameNode);
          nodes.push({
            id: symbolNodeId(repoRelPath, `export:${name}`, line),
            kind: "export",
            name,
            file: repoRelPath,
            line,
          });
        }
        break;
      }
      // "call" handled in the third pass (needs definedNames complete).
      default:
        break;
    }
  }

  // Third pass: same-file call edges. Caller = innermost enclosing function/method.
  const enclosingId = (index: number): string => {
    let best: Span | null = null;
    for (const s of symbolSpans) {
      if (index >= s.startIndex && index <= s.endIndex) {
        if (!best || s.endIndex - s.startIndex < best.endIndex - best.startIndex) best = s;
      }
    }
    return best ? best.id : fileId;
  };

  for (const c of captures) {
    if (c.name !== "call") continue;
    const calleeId = definedNames.get(c.node.text);
    if (!calleeId) continue; // only statically-resolvable, same-file targets
    const fromId = enclosingId(c.node.startIndex);
    if (fromId !== calleeId) edges.push({ from: fromId, to: calleeId, kind: "calls" });
  }

  return { file: repoRelPath, nodes, edges, rawImports };
}
