// Governed Mission Protocol — worker attestation (§4).
//
// Attestation and evidence answer different questions, and conflating them is how
// governed history rots:
//
//   Attestation → "Where, and under what execution conditions, did the worker operate?"
//   Evidence    → "What proves the implementation satisfies the requirement?"
//
// A worker attests immediately BEFORE its first product write. The attestation is
// machine-collected from git and the process environment — an agent cannot assert its
// way to a PASS. Failing attestation is a hard stop: the protocol's most common real
// failure is a worker that believed it was in an isolated worktree while it was in
// fact writing into a copied folder, a dirty tree, or the main checkout shared with
// another worker.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { platform, arch, release } from 'node:os';
import {
  isGitRepo, topLevel, commonGitDir, currentBranch, revParse, treeSha,
  workingTreeStatus, isNativeWorktree, hasCommitIdentity, remoteUrl,
} from './mission-git.js';
import { aiDir, ATTESTATIONS_DIR, assertMissionId } from './mission-ledger.js';
import { getLogger } from '../utils/logger.js';

/** Agent identifiers the protocol recognises. `human` covers direct developer work. */
export const AGENT_KINDS = [
  'claude', 'codex', 'copilot', 'cursor', 'grok', 'gemini', 'human', 'unknown',
] as const;

export type AgentKind = (typeof AGENT_KINDS)[number];

/** Runtime guard for the agent taxonomy. */
export function isAgentKind(value: unknown): value is AgentKind {
  return typeof value === 'string' && (AGENT_KINDS as readonly string[]).includes(value);
}

/**
 * A worker's attested execution environment, written to
 * `.ai/attestations/<MISSION-ID>-<worker>.json`.
 */
export interface Attestation {
  mission_id: string;
  worker: string;
  agent: AgentKind;
  timestamp_utc: string;
  repository_top_level: string;
  worktree_path: string;
  native_worktree_registered: boolean;
  branch: string | null;
  head_sha: string | null;
  base_sha: string | null;
  tree_sha: string | null;
  working_tree_clean: boolean;
  commit_capability_verified: boolean;
  required_assets_present: boolean;
  /** Bounded, non-identifying hash of the toolchain. Never contains secrets (§11). */
  environment_fingerprint: string;
  status: 'PASS' | 'FAIL';
  /** Why the attestation failed. Empty on PASS. */
  blockers: string[];
  /** Non-blocking observations, e.g. a missing remote on a local-only repo. */
  warnings: string[];
}

/** Inputs for {@link attestWorker}. */
export interface AttestOptions {
  missionId: string;
  /** Short worker name; becomes part of the attestation filename. */
  worker: string;
  agent: AgentKind;
  /** Baseline the worker branched from. Recorded as `base_sha` when resolvable. */
  baseRef?: string;
  /**
   * Files that must exist before the worker may write — for example the story file
   * or a config the mission depends on. A missing asset is an ENVIRONMENT_DEFECT,
   * not a reason to modify product code (§41).
   */
  requiredAssets?: string[];
  /**
   * Allow attestation from the repository's main checkout instead of a linked
   * worktree. Single-worker missions legitimately run in place; parallel waves must
   * not (§1 rule 4).
   */
  allowMainWorktree?: boolean;
  /** Permit a dirty tree. Off by default — §1 rule 13 forbids a dirty baseline. */
  allowDirty?: boolean;
}

const WORKER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/;

/**
 * Build a bounded fingerprint of the execution environment.
 *
 * Only coarse, non-identifying facts are hashed: node version, platform, arch, kernel
 * release, and the CI provider when present. No paths, usernames, tokens, or env
 * values are included, so the fingerprint is safe to commit.
 */
export function environmentFingerprint(): string {
  const ci =
    (process.env.GITHUB_ACTIONS && 'github') ||
    (process.env.GITLAB_CI && 'gitlab') ||
    (process.env.TF_BUILD && 'azdo') ||
    (process.env.CIRCLECI && 'circleci') ||
    'local';

  const material = [`node:${process.version}`, `os:${platform()}`, `arch:${arch()}`, `kernel:${release()}`, `ci:${ci}`].join('|');
  const digest = createHash('sha256').update(material).digest('hex').slice(0, 16);
  return `${platform()}-${arch()}-node${process.version.replace(/^v/, '').split('.')[0]}-${ci}-${digest}`;
}

/** Absolute path where a worker's attestation is stored. */
export function attestationPath(workDir: string, missionId: string, worker: string): string {
  assertMissionId(missionId);
  return join(aiDir(workDir), ATTESTATIONS_DIR, `${missionId}-${worker}.json`);
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  const dir = join(filePath, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf-8');
    renameSync(tmp, filePath);
  } catch (err) {
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch { /* best-effort */ }
    }
    throw err;
  }
}

/**
 * Collect and persist a worker attestation.
 *
 * Every field is read from git or the process — nothing is taken on the worker's word.
 * The attestation is written whether it passes or fails, because a recorded FAIL is
 * itself the evidence that explains why a mission stopped.
 *
 * @param workDir - The directory the worker intends to write in.
 * @param opts - Mission, worker identity, and the environment constraints to enforce.
 * @returns The attestation, including `status` and the blockers behind a FAIL.
 * @throws {Error} When the mission ID or worker name is malformed.
 */
export function attestWorker(workDir: string, opts: AttestOptions): Attestation {
  assertMissionId(opts.missionId);
  if (!WORKER_NAME_PATTERN.test(opts.worker)) {
    throw new Error(
      `Invalid worker name "${opts.worker}": expected 1-48 chars of [A-Za-z0-9._-] starting alphanumeric`,
    );
  }

  const blockers: string[] = [];
  const warnings: string[] = [];
  const resolvedWorkDir = resolve(workDir);

  // 1. It must be a git repository at all.
  if (!isGitRepo(resolvedWorkDir)) {
    blockers.push(`${resolvedWorkDir} is not inside a git working tree — governed missions require git provenance`);
  }

  const top = topLevel(resolvedWorkDir);
  const worktreeCheck = isNativeWorktree(resolvedWorkDir);

  // 2. Native worktree registration — the copied-folder trap (§3).
  if (!worktreeCheck.registered) {
    blockers.push(
      'This directory is not registered in `git worktree list --porcelain`. ' +
      'A copied repository folder is not a worktree. Create one with `git worktree add`.',
    );
  }

  // 3. Isolation: a linked worktree unless the mission explicitly permits the main one.
  const common = commonGitDir(resolvedWorkDir);
  const isMainWorktree = Boolean(top && common && resolve(common) === resolve(join(top, '.git')));
  if (isMainWorktree && !opts.allowMainWorktree) {
    blockers.push(
      'Worker is attesting in the repository main checkout. Parallel workers must each own ' +
      'a linked worktree (§1 rule 4). Pass --allow-main for a single-worker mission.',
    );
  }

  // 4. Clean baseline (§1 rule 13). Only PRODUCT changes disqualify a baseline —
  //    uncommitted governance artifacts under .ai/ are the protocol's own output.
  const status = workingTreeStatus(resolvedWorkDir);
  if (!status.clean && !opts.allowDirty) {
    const n = status.productEntries.length;
    const sample = status.productEntries.slice(0, 5).join('; ');
    blockers.push(
      `Working tree is dirty (${n} product entr${n === 1 ? 'y' : 'ies'}): ${sample}` +
      `${n > 5 ? ' …' : ''}. A dirty tree is not a valid implementation baseline.`,
    );
  }
  if (status.governanceEntries.length > 0) {
    warnings.push(
      `${status.governanceEntries.length} uncommitted governance artifact(s) under .ai/ or .skillfoundry/ — ` +
      'commit them so the ledger survives this worktree',
    );
  }

  // 5. Commit capability — a worker that cannot commit is not integration-ready (§20).
  const canCommit = hasCommitIdentity(resolvedWorkDir);
  if (!canCommit) {
    blockers.push('git user.name / user.email are not configured — this worker cannot produce a commit');
  }

  // 6. Required assets. Missing ones are environment defects, never a reason to
  //    improvise product code (§41).
  const missingAssets = (opts.requiredAssets ?? []).filter(
    (a) => !existsSync(resolve(resolvedWorkDir, a)),
  );
  if (missingAssets.length > 0) {
    blockers.push(`Required assets missing: ${missingAssets.join(', ')} (ENVIRONMENT_DEFECT — fix the environment, not the product)`);
  }

  if (!remoteUrl(resolvedWorkDir)) {
    warnings.push('No `origin` remote configured — publication cannot be verified from this repository');
  }

  const head = revParse(resolvedWorkDir, 'HEAD');
  const base = opts.baseRef ? revParse(resolvedWorkDir, opts.baseRef) : null;
  if (opts.baseRef && !base) {
    warnings.push(`Base ref "${opts.baseRef}" could not be resolved — base_sha recorded as null`);
  }

  const attestation: Attestation = {
    mission_id: opts.missionId,
    worker: opts.worker,
    agent: opts.agent,
    timestamp_utc: new Date().toISOString(),
    repository_top_level: top ?? resolvedWorkDir,
    worktree_path: resolvedWorkDir,
    native_worktree_registered: worktreeCheck.registered,
    branch: currentBranch(resolvedWorkDir),
    head_sha: head,
    base_sha: base,
    tree_sha: treeSha(resolvedWorkDir, 'HEAD'),
    working_tree_clean: status.clean,
    commit_capability_verified: canCommit,
    required_assets_present: missingAssets.length === 0,
    environment_fingerprint: environmentFingerprint(),
    status: blockers.length === 0 ? 'PASS' : 'FAIL',
    blockers,
    warnings,
  };

  const path = attestationPath(resolvedWorkDir, opts.missionId, opts.worker);
  writeJsonAtomic(path, attestation);

  getLogger().info('mission', 'attestation_written', {
    missionId: opts.missionId, worker: opts.worker, status: attestation.status, blockers: blockers.length,
  });

  return attestation;
}

/** Read one attestation, or null when it has not been written. */
export function readAttestation(workDir: string, missionId: string, worker: string): Attestation | null {
  const path = attestationPath(workDir, missionId, worker);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Attestation;
  } catch {
    return null;
  }
}

/** Every attestation recorded for a mission, in filename order. */
export function listAttestations(workDir: string, missionId: string): Attestation[] {
  assertMissionId(missionId);
  const dir = join(aiDir(workDir), ATTESTATIONS_DIR);
  if (!existsSync(dir)) return [];

  const prefix = `${missionId}-`;
  const out: Attestation[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.startsWith(prefix) || !name.endsWith('.json')) continue;
    try {
      out.push(JSON.parse(readFileSync(join(dir, name), 'utf-8')) as Attestation);
    } catch {
      // A corrupt attestation is reported by `gateOnAttestation` as "not attested",
      // which is the safe reading — it proves nothing.
    }
  }
  return out;
}

/** The verdict of the pre-write attestation gate. */
export interface AttestationGate {
  allowed: boolean;
  reason: string;
  attestation?: Attestation;
}

/**
 * Enforce "no source writes before attestation" (§4).
 *
 * Call this before a worker's first product write. It fails closed: an absent,
 * unreadable, or FAIL attestation all block equally, because none of them prove the
 * worker is in a sound environment.
 *
 * @param worker - When omitted, any PASS attestation for the mission unblocks.
 */
export function gateOnAttestation(
  workDir: string,
  missionId: string,
  worker?: string,
): AttestationGate {
  const attestations = worker
    ? [readAttestation(workDir, missionId, worker)].filter((a): a is Attestation => a !== null)
    : listAttestations(workDir, missionId);

  if (attestations.length === 0) {
    return {
      allowed: false,
      reason: worker
        ? `No attestation for worker "${worker}" on mission ${missionId}. Run \`/mission attest ${missionId} --worker ${worker}\` before writing product code.`
        : `No attestation recorded for mission ${missionId}. Run \`/mission attest ${missionId}\` before writing product code.`,
    };
  }

  const passing = attestations.find((a) => a.status === 'PASS');
  if (!passing) {
    const first = attestations[0];
    return {
      allowed: false,
      reason: `Attestation FAILED for mission ${missionId}: ${first.blockers.join(' | ')}`,
      attestation: first,
    };
  }

  return {
    allowed: true,
    reason: `Attested: ${passing.worker} (${passing.agent}) on ${passing.branch ?? 'detached HEAD'} @ ${(passing.head_sha ?? 'unknown').slice(0, 8)}`,
    attestation: passing,
  };
}

/**
 * Report whether an attestation still describes the current environment.
 *
 * An attestation taken an hour and forty commits ago no longer proves anything about
 * where the worker is now.
 *
 * @returns Drift reasons. Empty means the attestation still holds.
 */
export function attestationDrift(workDir: string, attestation: Attestation): string[] {
  const drift: string[] = [];
  const resolvedWorkDir = resolve(workDir);

  if (resolve(attestation.worktree_path) !== resolvedWorkDir) {
    drift.push(
      `Worker attested in ${attestation.worktree_path} but is now operating in ${resolvedWorkDir}`,
    );
  }

  const branch = currentBranch(resolvedWorkDir);
  if (attestation.branch && branch && attestation.branch !== branch) {
    drift.push(`Branch changed since attestation: ${attestation.branch} → ${branch}`);
  }

  if (!isNativeWorktree(resolvedWorkDir).registered && attestation.native_worktree_registered) {
    drift.push('Directory is no longer a registered git worktree');
  }

  return drift;
}

/** Repo-relative path of an attestation, for recording in the ledger. */
export function relativeAttestationPath(workDir: string, missionId: string, worker: string): string {
  return relative(resolve(workDir), attestationPath(workDir, missionId, worker));
}
