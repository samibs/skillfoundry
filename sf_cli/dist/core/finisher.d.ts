import type { FinisherCheckResult, FinisherSummary } from '../types.js';
/** Read the canonical version from .version file. */
export declare function readCanonicalVersion(workDir: string): string | null;
/** Bump the patch component of a semver string. "2.0.14" → "2.0.15" */
export declare function bumpPatch(version: string): string;
/** Scan all version locations and return which ones match the expected version. */
export declare function checkVersionConsistency(workDir: string, expectedVersion: string): {
    location: string;
    file: string;
    found: string | null;
    matches: boolean;
}[];
/** Fix version references: replace oldVersion with newVersion in all known locations. */
export declare function fixVersionReferences(workDir: string, oldVersion: string, newVersion: string): {
    file: string;
    updated: boolean;
}[];
/** Run the version check. In fix mode with storiesCompleted > 0, bumps patch first. */
export declare function runVersionCheck(workDir: string, mode: 'check' | 'fix', storiesCompleted: number): FinisherCheckResult;
/** Get the actual test count by running vitest. Returns null if unavailable. */
export declare function getActualTestCount(workDir: string): number | null;
/** Scan docs for test count references and compare with actual count. */
export declare function checkTestCounts(workDir: string, actualCount: number): {
    file: string;
    found: number;
    expected: number;
}[];
/** Fix test count references in docs by replacing old count with new. */
export declare function fixTestCounts(workDir: string, oldCount: number, newCount: number): {
    file: string;
    updated: boolean;
}[];
/** Run the test-count check. In fix mode, updates stale references. */
export declare function runTestCountCheck(workDir: string, mode: 'check' | 'fix'): FinisherCheckResult;
/** Scan src/core/ for all .ts files currently on disk. */
export declare function scanCoreModules(workDir: string): string[];
/** Extract .ts filenames from the architecture tree diagram in USER-GUIDE-CLI.md. */
export declare function extractDocArchListing(workDir: string): string[];
/** Compare on-disk modules with documented modules. */
export declare function diffArchListing(onDisk: string[], inDocs: string[]): {
    missing: string[];
    extra: string[];
};
/** Run the architecture listing check. Report only — no auto-fix. */
export declare function runArchitectureCheck(workDir: string, _mode: 'check' | 'fix'): FinisherCheckResult;
/** Check whether the CHANGELOG.md has an entry for the given version. */
export declare function checkChangelogEntry(workDir: string, version: string): boolean;
/** Run the CHANGELOG check. In fix mode, inserts a placeholder heading if missing. */
export declare function runChangelogCheck(workDir: string, mode: 'check' | 'fix', version: string): FinisherCheckResult;
/** Check for uncommitted changes. */
export declare function checkGitClean(workDir: string): {
    clean: boolean;
    summary: string;
};
/** Run the git-clean check. Never auto-fixes. */
export declare function runGitCleanCheck(workDir: string, _mode: 'check' | 'fix'): FinisherCheckResult;
export interface FinisherOptions {
    workDir: string;
    mode: 'check' | 'fix';
    storiesCompleted: number;
    onCheck?: (result: FinisherCheckResult) => void;
}
/**
 * Run all finisher checks in sequence.
 * Order: version → test-count → architecture → changelog → git-clean
 */
export declare function runFinisher(options: FinisherOptions): Promise<FinisherSummary>;
