/** Bump when extraction or resolution changes, so an older graph is rebuilt not trusted. */
export declare const IMPORT_GRAPH_VERSION = "1";
/** The reverse import graph plus what it could not resolve. */
export interface ImportGraph {
    version: string;
    /** Tree hash the graph was built from; a different tree means rebuild. */
    treeSha: string | null;
    /** Repo-relative file → repo-relative files that import it. */
    dependents: Record<string, string[]>;
    /** Files scanned. */
    fileCount: number;
    /** Path-alias patterns that were loaded and applied. */
    aliasPatterns: number;
    /**
     * Import specifiers that could not be resolved to a repository file — bare package
     * specifiers, aliases, generated modules. A high count means the graph understates
     * fan-out, so callers should widen rather than narrow.
     */
    unresolvedImports: number;
    builtAt: string;
}
/**
 * A resolved path-alias table.
 *
 * `@app/*` → `src/app/*` style mappings from `tsconfig.json` / `jsconfig.json`, plus the
 * bare `baseUrl` fallback. Without these an alias-heavy monorepo reports almost every
 * first-party import as unresolved, and the measured fan-out collapses to near zero —
 * which would quietly narrow test scope on exactly the codebases that need it widened.
 */
export interface AliasTable {
    /** Prefix (with any trailing `*` stripped) → candidate repo-relative prefixes. */
    patterns: Array<{
        prefix: string;
        wildcard: boolean;
        targets: string[];
    }>;
    /** Repo-relative baseUrl directories, for non-relative specifiers resolved against them. */
    baseUrls: string[];
}
/**
 * Load path aliases from the repository's TypeScript/JavaScript configs.
 *
 * Best-effort: an unreadable or exotic config yields no aliases rather than an error, and
 * the unresolved count then tells the caller the fan-out is a lower bound.
 */
export declare function loadAliasTable(workDir: string): AliasTable;
/**
 * Resolve a non-relative specifier through the alias table.
 *
 * @returns The repo-relative file, or null when no alias or baseUrl matches — in which
 *          case it is a genuine third-party package.
 */
export declare function resolveAlias(specifier: string, aliases: AliasTable, known: Set<string>): string | null;
/** Extract raw import specifiers from a source file. */
export declare function extractImports(content: string, ext: string): string[];
/**
 * Resolve an import specifier to a repository file.
 *
 * Relative specifiers resolve directly. A non-relative specifier is tried against the
 * project's path aliases before being written off as a third-party package, so a monorepo
 * using `@app/*` still produces a real dependency graph.
 *
 * @param fromFile - Repo-relative path of the importing file.
 * @param aliases - Alias table from {@link loadAliasTable}. Omit to skip alias resolution.
 * @returns The repo-relative path of the imported file, or null when it is genuinely external.
 */
export declare function resolveImport(workDir: string, fromFile: string, specifier: string, known: Set<string>, aliases?: AliasTable): string | null;
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
export declare function buildImportGraph(workDir: string, opts?: {
    force?: boolean;
}): ImportGraph;
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
/**
 * Measure how far a change reaches (§5, dependency impact).
 *
 * Walks the reverse import graph transitively from the changed files.
 *
 * @param opts.depth - Maximum hops. Defaults to 3.
 * @returns The dependent set and the caveats that qualify it.
 */
export declare function analyzeImpact(graph: ImportGraph, changedFiles: string[], opts?: {
    depth?: number;
}): ImpactAnalysis;
/**
 * Measure impact directly from a repository, building or reusing the graph as needed.
 *
 * This is the call `$tester` and the delivery runner make when they need a real fan-out
 * number instead of a supplied guess.
 */
export declare function measureImpact(workDir: string, changedFiles: string[], opts?: {
    depth?: number;
    force?: boolean;
}): ImpactAnalysis;
/** A readable explanation of the measured impact, for scope decisions and reports. */
export declare function describeImpact(impact: ImpactAnalysis): string;
