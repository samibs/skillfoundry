// Governed Mission Protocol — git primitives.
//
// Every fact the mission protocol asserts about a repository (baseline SHA, native
// worktree registration, working-tree cleanliness, stable patch identity) is read
// from git itself, never from an agent's narrative. See
// `agents/_governed-mission-protocol.md` §2, §3, §21.
//
// All git invocations go through execFileSync with an argument array — never a shell
// string — so a branch or path containing shell metacharacters cannot inject a command.

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Result of a git invocation. `ok` is false when git exited non-zero or was unavailable. */
export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

const GIT_TIMEOUT_MS = 15_000;
const MAX_BUFFER = 16 * 1024 * 1024;

/**
 * Run a git command with an explicit argument array.
 *
 * @param workDir - Directory to run git in. Resolved to an absolute path.
 * @param args - Git arguments, passed verbatim without shell interpretation.
 * @param input - Optional stdin payload (used for `git patch-id`).
 * @param opts.preserveOutput - Return stdout verbatim instead of trimmed. Required for
 *        fixed-column formats: `git status --porcelain` encodes state in columns 1-2, so
 *        trimming eats the leading space of an unstaged entry (` M path` → `M path`) and
 *        every subsequent column offset is wrong by one.
 * @returns `{ ok, stdout, stderr }`. Never throws — a missing git binary or a
 *          non-zero exit is reported as `ok: false`.
 */
export function git(
  workDir: string,
  args: string[],
  input?: string,
  opts: { preserveOutput?: boolean } = {},
): GitResult {
  try {
    const stdout = execFileSync('git', args, {
      cwd: resolve(workDir),
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
      input,
    });
    return { ok: true, stdout: opts.preserveOutput ? stdout : stdout.trim(), stderr: '' };
  } catch (err) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
    return {
      ok: false,
      stdout: typeof e.stdout === 'string' ? e.stdout.trim() : (e.stdout?.toString() ?? '').trim(),
      stderr:
        (typeof e.stderr === 'string' ? e.stderr : (e.stderr?.toString() ?? '')).trim() ||
        (e.message ?? 'git invocation failed'),
    };
  }
}

/** True when `workDir` is inside a git working tree. */
export function isGitRepo(workDir: string): boolean {
  return git(workDir, ['rev-parse', '--is-inside-work-tree']).stdout === 'true';
}

/** Absolute path of the working tree root, or null when not in a repo. */
export function topLevel(workDir: string): string | null {
  const r = git(workDir, ['rev-parse', '--show-toplevel']);
  return r.ok && r.stdout ? r.stdout : null;
}

/** Absolute path of the shared `.git` directory (the common dir for a linked worktree). */
export function commonGitDir(workDir: string): string | null {
  const r = git(workDir, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return r.ok && r.stdout ? r.stdout : null;
}

/** Current branch name, or null when HEAD is detached. */
export function currentBranch(workDir: string): string | null {
  const r = git(workDir, ['branch', '--show-current']);
  return r.ok && r.stdout ? r.stdout : null;
}

/** Commit SHA of a revision (default HEAD), or null when it cannot be resolved. */
export function revParse(workDir: string, rev: string = 'HEAD'): string | null {
  const r = git(workDir, ['rev-parse', rev]);
  return r.ok && /^[0-9a-f]{40}$/.test(r.stdout) ? r.stdout : null;
}

/** Tree SHA of a revision (default HEAD). Two commits with different messages but
 *  identical content share a tree SHA — this is what proves content equivalence. */
export function treeSha(workDir: string, rev: string = 'HEAD'): string | null {
  const r = git(workDir, ['rev-parse', `${rev}^{tree}`]);
  return r.ok && /^[0-9a-f]{40}$/.test(r.stdout) ? r.stdout : null;
}

/**
 * Paths that hold governance artifacts rather than product code.
 *
 * The mission protocol writes into these directories itself — the ledger, attestations,
 * evidence, raw logs. If they counted toward working-tree cleanliness, `/mission init`
 * would dirty the tree and the very next `/mission attest` would fail on the artifacts
 * the protocol just created. So they are tracked separately: reported, never a blocker.
 */
const GOVERNANCE_PREFIXES = ['.ai/', '.skillfoundry/'];

/** Extract the path from one `git status --porcelain` line, handling renames and quoting. */
function porcelainPath(line: string): string {
  // Format: XY<space>path, or XY<space>old -> new for renames/copies.
  const body = line.length > 3 ? line.slice(3) : line;
  const arrow = body.indexOf(' -> ');
  const raw = arrow === -1 ? body : body.slice(arrow + 4);
  return raw.replace(/^"|"$/g, '');
}

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
  /**
   * Repo-relative paths, already parsed out of the porcelain columns.
   *
   * Callers need this rather than re-parsing `entries`: those are trimmed for display, so
   * a fixed-column `slice(3)` over them silently eats the first character of the path.
   */
  paths: string[];
}

/**
 * Read the working-tree status.
 *
 * @param opts.untrackedFiles - `'normal'` (default) collapses an untracked directory to a
 *        single entry, which is cheaper and enough for a cleanliness check. `'all'` lists
 *        every untracked file individually — required when the caller needs the actual
 *        file set, since `src/` tells you nothing about which files changed.
 * @returns Product and governance changes, separated. A repo that cannot be read
 *          reports `clean: false` — the protocol fails closed (§10).
 */
export function workingTreeStatus(
  workDir: string,
  opts: { untrackedFiles?: 'normal' | 'all' } = {},
): WorkingTreeStatus {
  const args = ['status', '--porcelain'];
  if (opts.untrackedFiles === 'all') args.push('--untracked-files=all');
  // Verbatim: porcelain state lives in columns 1-2, so a trim corrupts every path.
  const r = git(workDir, args, undefined, { preserveOutput: true });
  if (!r.ok) {
    const entries = ['<git status unavailable>'];
    return { clean: false, entries, productEntries: entries, governanceEntries: [], paths: [] };
  }

  const entries = r.stdout.split('\n').filter((l) => l.trim().length > 0);
  const productEntries: string[] = [];
  const governanceEntries: string[] = [];
  const paths: string[] = [];

  for (const line of entries) {
    const path = porcelainPath(line);
    paths.push(path);
    if (GOVERNANCE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      governanceEntries.push(line.trim());
    } else {
      productEntries.push(line.trim());
    }
  }

  return {
    clean: productEntries.length === 0,
    entries: entries.map((l) => l.trim()),
    productEntries,
    governanceEntries,
    paths,
  };
}

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
export function listWorktrees(workDir: string): WorktreeRecord[] {
  const r = git(workDir, ['worktree', 'list', '--porcelain']);
  if (!r.ok) return [];

  const records: WorktreeRecord[] = [];
  let current: Partial<WorktreeRecord> | null = null;

  const flush = (): void => {
    if (current?.path) {
      records.push({
        path: current.path,
        head: current.head ?? null,
        branch: current.branch ?? null,
        bare: current.bare ?? false,
        detached: current.detached ?? false,
      });
    }
    current = null;
  };

  for (const line of r.stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('worktree ')) {
      flush();
      current = { path: trimmed.slice('worktree '.length) };
    } else if (!current) {
      continue;
    } else if (trimmed.startsWith('HEAD ')) {
      current.head = trimmed.slice('HEAD '.length);
    } else if (trimmed.startsWith('branch ')) {
      current.branch = trimmed.slice('branch '.length).replace(/^refs\/heads\//, '');
    } else if (trimmed === 'bare') {
      current.bare = true;
    } else if (trimmed === 'detached') {
      current.detached = true;
    }
  }
  flush();

  return records;
}

/**
 * Verify that `workDir` is a git-registered worktree.
 *
 * @returns `{ registered, record }`. `registered` is true only when the resolved
 *          top level appears in `git worktree list --porcelain`.
 */
export function isNativeWorktree(workDir: string): { registered: boolean; record?: WorktreeRecord } {
  const top = topLevel(workDir);
  if (!top) return { registered: false };
  const resolvedTop = resolve(top);
  const record = listWorktrees(workDir).find((w) => resolve(w.path) === resolvedTop);
  return { registered: Boolean(record), record };
}

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
export function stablePatchId(workDir: string, sha: string): string | null {
  const show = git(workDir, ['show', '--no-color', '--patch', sha]);
  if (!show.ok || !show.stdout) return null;
  const id = git(workDir, ['patch-id', '--stable'], show.stdout + '\n');
  if (!id.ok || !id.stdout) return null;
  const first = id.stdout.split('\n')[0]?.trim() ?? '';
  const patchId = first.split(/\s+/)[0];
  return /^[0-9a-f]{6,64}$/.test(patchId) ? patchId : null;
}

/**
 * Files changed by a commit relative to its first parent.
 *
 * @returns Repo-relative paths, sorted. Empty for a commit that changes nothing.
 */
export function changedFiles(workDir: string, sha: string): string[] {
  const r = git(workDir, ['show', '--name-only', '--pretty=format:', sha]);
  if (!r.ok) return [];
  return r.stdout.split('\n').map((l) => l.trim()).filter(Boolean).sort();
}

/** Files changed between two revisions. */
export function changedFilesBetween(workDir: string, from: string, to: string): string[] {
  const r = git(workDir, ['diff', '--name-only', `${from}..${to}`]);
  if (!r.ok) return [];
  return r.stdout.split('\n').map((l) => l.trim()).filter(Boolean).sort();
}

/** True when `ancestor` is reachable from `descendant` (direct ancestry, §21). */
export function isAncestor(workDir: string, ancestor: string, descendant: string): boolean {
  return git(workDir, ['merge-base', '--is-ancestor', ancestor, descendant]).ok;
}

/** True when the repository has a commit identity configured (commit capability, §4). */
export function hasCommitIdentity(workDir: string): boolean {
  const name = git(workDir, ['config', '--get', 'user.name']);
  const email = git(workDir, ['config', '--get', 'user.email']);
  return name.ok && Boolean(name.stdout) && email.ok && Boolean(email.stdout);
}

/** Configured URL of a remote, or null when the remote does not exist. */
export function remoteUrl(workDir: string, remote: string = 'origin'): string | null {
  const r = git(workDir, ['config', '--get', `remote.${remote}.url`]);
  return r.ok && r.stdout ? r.stdout : null;
}
