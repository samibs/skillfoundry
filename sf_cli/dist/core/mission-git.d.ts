/** Result of a git invocation. `ok` is false when git exited non-zero or was unavailable. */
export interface GitResult {
    ok: boolean;
    stdout: string;
    stderr: string;
}
/**
 * Run a git command with an explicit argument array.
 *
 * @param workDir - Directory to run git in. Resolved to an absolute path.
 * @param args - Git arguments, passed verbatim without shell interpretation.
 * @param input - Optional stdin payload (used for `git patch-id`).
 * @returns `{ ok, stdout, stderr }`. Never throws — a missing git binary or a
 *          non-zero exit is reported as `ok: false`.
 */
export declare function git(workDir: string, args: string[], input?: string): GitResult;
/** True when `workDir` is inside a git working tree. */
export declare function isGitRepo(workDir: string): boolean;
/** Absolute path of the working tree root, or null when not in a repo. */
export declare function topLevel(workDir: string): string | null;
/** Absolute path of the shared `.git` directory (the common dir for a linked worktree). */
export declare function commonGitDir(workDir: string): string | null;
/** Current branch name, or null when HEAD is detached. */
export declare function currentBranch(workDir: string): string | null;
/** Commit SHA of a revision (default HEAD), or null when it cannot be resolved. */
export declare function revParse(workDir: string, rev?: string): string | null;
/** Tree SHA of a revision (default HEAD). Two commits with different messages but
 *  identical content share a tree SHA — this is what proves content equivalence. */
export declare function treeSha(workDir: string, rev?: string): string | null;
/** Porcelain working-tree status, split into product and governance changes. */
export interface WorkingTreeStatus {
    /** True when no PRODUCT file is modified. Governance artifacts do not dirty the tree. */
    clean: boolean;
    /** Every raw porcelain line. */
    entries: string[];
    /** Porcelain lines touching product code — these block attestation (§1 rule 13). */
    productEntries: string[];
    /** Porcelain lines touching `.ai/` or `.skillfoundry/` — reported, not blocking. */
    governanceEntries: string[];
}
/**
 * Read the working-tree status.
 *
 * @returns Product and governance changes, separated. A repo that cannot be read
 *          reports `clean: false` — the protocol fails closed (§10).
 */
export declare function workingTreeStatus(workDir: string): WorkingTreeStatus;
/** One registered worktree as reported by `git worktree list --porcelain`. */
export interface WorktreeRecord {
    path: string;
    head: string | null;
    branch: string | null;
    bare: boolean;
    detached: boolean;
}
/**
 * Parse `git worktree list --porcelain` into structured records.
 *
 * This is the only acceptable proof that a directory is a real worktree. A copied
 * repository folder never appears here — see §3 ("a copied repository directory is
 * NOT acceptable").
 */
export declare function listWorktrees(workDir: string): WorktreeRecord[];
/**
 * Verify that `workDir` is a git-registered worktree.
 *
 * @returns `{ registered, record }`. `registered` is true only when the resolved
 *          top level appears in `git worktree list --porcelain`.
 */
export declare function isNativeWorktree(workDir: string): {
    registered: boolean;
    record?: WorktreeRecord;
};
/**
 * Compute the stable patch identity of a commit (§21).
 *
 * `git patch-id --stable` hashes the diff content independent of commit metadata,
 * blank lines, and hunk offsets. Two commits with the same patch ID are the same
 * contribution even after a cherry-pick onto a moved baseline.
 *
 * @param sha - Commit to identify.
 * @returns The patch ID hex string, or null when git cannot produce one (for example
 *          a merge commit or a root commit with no diff).
 */
export declare function stablePatchId(workDir: string, sha: string): string | null;
/**
 * Files changed by a commit relative to its first parent.
 *
 * @returns Repo-relative paths, sorted. Empty for a commit that changes nothing.
 */
export declare function changedFiles(workDir: string, sha: string): string[];
/**
 * Stable patch identity for a whole contribution range (§21).
 *
 * A contribution that spans several commits has no single commit patch-id. Hashing the
 * squashed `base..tip` diff gives one identity for the net change, so a contribution
 * replayed as one squashed commit still proves equivalent to the original series.
 *
 * @returns The patch ID, or null when the range is empty or git cannot produce one.
 */
export declare function rangePatchId(workDir: string, base: string, tip: string): string | null;
/** Commit SHAs in `base..tip`, oldest first. */
export declare function commitsBetween(workDir: string, base: string, tip: string): string[];
/** Files changed between two revisions. */
export declare function changedFilesBetween(workDir: string, from: string, to: string): string[];
/** True when `ancestor` is reachable from `descendant` (direct ancestry, §21). */
export declare function isAncestor(workDir: string, ancestor: string, descendant: string): boolean;
/** True when the repository has a commit identity configured (commit capability, §4). */
export declare function hasCommitIdentity(workDir: string): boolean;
/** Configured URL of a remote, or null when the remote does not exist. */
export declare function remoteUrl(workDir: string, remote?: string): string | null;
