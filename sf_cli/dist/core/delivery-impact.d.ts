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
    /**
     * Import specifiers that could not be resolved to a repository file — bare package
     * specifiers, aliases, generated modules. A high count means the graph understates
     * fan-out, so callers should widen rather than narrow.
     */
    unresolvedImports: number;
    builtAt: string;
}
/** Extract raw import specifiers from a source file. */
export declare function extractImports(content: string, ext: string): string[];
/**
 * Resolve an import specifier to a repository file.
 *
 * Only relative specifiers can point at first-party source; a bare specifier is a package
 * and is reported unresolved rather than guessed at.
 *
 * @param fromFile - Repo-relative path of the importing file.
 * @returns The repo-relative path of the imported file, or null.
 */
export declare function resolveImport(workDir: string, fromFile: string, specifier: string, known: Set<string>): string | null;
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
