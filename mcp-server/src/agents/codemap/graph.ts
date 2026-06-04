/**
 * Code Map — graph data model + builder (STORY-002).
 *
 * The shape persisted to `.skillfoundry/code-map.json` (PRD §5.2). Every array
 * field defaults to `[]` (CLAUDE.md array rule). Node ids are deterministic:
 * `<repo-relative-posix-path>#<name>@<line>` for symbols, and the bare path for
 * file nodes — identical input always yields identical ids.
 */

export type NodeKind = "file" | "function" | "method" | "class" | "export" | "model";

export type EdgeKind =
  | "imports"
  | "calls"
  | "contains"
  | "declares-route"
  | "declares-model";

export type Layer = "db" | "backend" | "frontend" | "shared";

export interface CodeNode {
  id: string;
  kind: NodeKind;
  name: string;
  /** Repo-relative POSIX path. Never absolute (determinism + sanitization). */
  file: string;
  /** 1-based line. */
  line: number;
  layer?: Layer;
  /** Declared fields, for `model` nodes where statically parseable (STORY-006). */
  fields?: { name: string; type: string }[];
  /** Populated only by the optional semantic pass (STORY-012); non-authoritative. */
  summary?: string;
  confidence?: "llm-hint";
}

export interface CodeEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

/** Import as found in source, before resolution (STORY-003 turns these into edges). */
export interface RawImport {
  fromFile: string;
  specifier: string;
  line: number;
}

export interface UnresolvedImport {
  fromFile: string;
  specifier: string;
  line: number;
}

export interface Endpoint {
  method: string;
  /** Canonical path (`:param` form). */
  path: string;
  /** Repo-relative file that declares the route. */
  file: string;
  handler: string | null;
  requestShape: Record<string, unknown> | null;
  responseShape: Record<string, unknown> | null;
}

export interface CodeMap {
  schemaVersion: string;
  /** git SHA the map was built from, or null for a non-git repo. */
  builtFromRevision: string | null;
  /** repo-relative path → sha256 of file bytes (drives incremental refresh). */
  fileHashes: Record<string, string>;
  nodes: CodeNode[];
  edges: CodeEdge[];
  endpoints: Endpoint[];
  unresolvedImports: UnresolvedImport[];
  warnings: string[];
  /**
   * Internal: raw (pre-resolution) imports retained so incremental refresh can
   * re-resolve the whole import graph while re-parsing only changed files
   * (STORY-004). Not part of the public contract surface.
   */
  rawImports: RawImport[];
}

export const SCHEMA_VERSION = "1.0";

export function emptyMap(): CodeMap {
  return {
    schemaVersion: SCHEMA_VERSION,
    builtFromRevision: null,
    fileHashes: {},
    nodes: [],
    edges: [],
    endpoints: [],
    unresolvedImports: [],
    warnings: [],
    rawImports: [],
  };
}

/** Stable id helpers — keep these the single source of truth for id formatting. */
export function fileNodeId(repoRelPath: string): string {
  return repoRelPath;
}

export function symbolNodeId(repoRelPath: string, name: string, line: number): string {
  return `${repoRelPath}#${name}@${line}`;
}

/**
 * Per-file extraction result. `nodes`/`edges` cover only this file; cross-file
 * `imports` edges are produced later by the resolver (STORY-003).
 */
export interface FileExtract {
  file: string;
  nodes: CodeNode[];
  edges: CodeEdge[];
  rawImports: RawImport[];
}

/** Accumulates per-file extracts into a CodeMap, deduping nodes/edges by identity. */
export class MapBuilder {
  private nodeIds = new Set<string>();
  private edgeKeys = new Set<string>();
  private endpointKeys = new Set<string>();
  readonly map: CodeMap = emptyMap();
  /** Retained for the resolver pass; not persisted verbatim. */
  readonly rawImports: RawImport[] = [];

  addEndpoint(ep: Endpoint): void {
    const key = `${ep.method} ${ep.path} ${ep.file} ${ep.handler ?? ""}`;
    if (this.endpointKeys.has(key)) return;
    this.endpointKeys.add(key);
    this.map.endpoints.push(ep);
  }

  addNode(node: CodeNode): void {
    if (this.nodeIds.has(node.id)) return;
    this.nodeIds.add(node.id);
    this.map.nodes.push(node);
  }

  addEdge(edge: CodeEdge): void {
    const key = `${edge.from}->${edge.to}:${edge.kind}`;
    if (this.edgeKeys.has(key)) return;
    this.edgeKeys.add(key);
    this.map.edges.push(edge);
  }

  addExtract(extract: FileExtract): void {
    for (const n of extract.nodes) this.addNode(n);
    for (const e of extract.edges) this.addEdge(e);
    this.rawImports.push(...extract.rawImports);
  }

  warn(message: string): void {
    if (!this.map.warnings.includes(message)) this.map.warnings.push(message);
  }

  /** Deterministic final ordering so serialized output is stable across runs. */
  finalize(): CodeMap {
    this.map.nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    this.map.edges.sort((a, b) => {
      const ak = `${a.from}->${a.to}:${a.kind}`;
      const bk = `${b.from}->${b.to}:${b.kind}`;
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });
    this.map.unresolvedImports.sort((a, b) => {
      const ak = `${a.fromFile}:${a.specifier}:${a.line}`;
      const bk = `${b.fromFile}:${b.specifier}:${b.line}`;
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });
    this.map.rawImports = [...this.rawImports].sort((a, b) => {
      const ak = `${a.fromFile}:${a.specifier}:${a.line}`;
      const bk = `${b.fromFile}:${b.specifier}:${b.line}`;
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });
    this.map.endpoints.sort((a, b) => {
      const ak = `${a.method} ${a.path} ${a.file}`;
      const bk = `${b.method} ${b.path} ${b.file}`;
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });
    return this.map;
  }
}
