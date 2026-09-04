// Governed Mission Protocol — baseline freshness, stable patch identity, provenance (§2, §21-§25).
//
// The question this module answers is the one that silently destroys parallel AI work:
// "Is the change the worker made actually still in the tree we are about to publish?"
//
// A commit SHA cannot answer it. A cherry-pick onto a moved baseline produces a
// different SHA for the same contribution, while a later authorized change can quietly
// overwrite a contribution whose SHA is still in the history. So provenance is proven
// two ways — direct ancestry, or `git patch-id --stable` equivalence — and then
// confirmed against the actual final tree.

import {
  git, revParse, treeSha, currentBranch, stablePatchId, changedFiles,
  changedFilesBetween, isAncestor, remoteUrl, rangePatchId, commitsBetween,
} from './mission-git.js';
import type { IntegrationMethod, FinalTreeContribution, ProvenanceRecord } from './mission-ledger.js';
import { getLogger } from '../utils/logger.js';

// ── Baseline freshness (§2) ───────────────────────────────────────────────────

/** How the local baseline relates to the authoritative remote branch. */
export type Freshness = 'CURRENT' | 'ADVANCED' | 'STALE' | 'DIVERGED' | 'UNKNOWN';

/** Why the authoritative branch moved. Classification precedes any reset (§2). */
export type AdvancementClass =
  | 'EXPECTED_ADVANCEMENT'
  | 'SAFE_FORWARD_ADVANCEMENT'
  | 'PARALLEL_PUBLICATION'
  | 'COLLIDING_ADVANCEMENT'
  | 'BASELINE_DRIFT'
  | 'UNEXPLAINED_DRIFT'
  | 'NOT_APPLICABLE';

/** The result of comparing the local baseline against the remote. */
export interface BaselineReport {
  branch: string | null;
  local_sha: string | null;
  local_tree: string | null;
  remote_ref: string | null;
  remote_sha: string | null;
  expected_sha?: string;
  freshness: Freshness;
  advancement: AdvancementClass;
  /** Commits on the remote that the local baseline does not have. */
  behind_by: number;
  /** Commits local has that the remote does not. */
  ahead_by: number;
  /** Files changed on the remote since the merge base — the collision surface. */
  remote_changed_files: string[];
  notes: string[];
}

/**
 * Classify the local baseline against the authoritative remote branch.
 *
 * Never fetches on its own — a network write is not implied by a read (§13). Pass
 * `fetch: true` only where the mission authorizes it.
 *
 * @param workDir - Repository root.
 * @param opts.branch - Branch to compare. Defaults to the checked-out branch.
 * @param opts.remote - Remote name. Defaults to `origin`.
 * @param opts.expectedSha - The baseline the mission was planned against, if known.
 * @param opts.fetch - Run `git fetch --all --prune` first.
 */
export function classifyBaseline(
  workDir: string,
  opts: { branch?: string; remote?: string; expectedSha?: string; fetch?: boolean } = {},
): BaselineReport {
  const remote = opts.remote ?? 'origin';
  const branch = opts.branch ?? currentBranch(workDir);
  const notes: string[] = [];

  if (opts.fetch) {
    const fetched = git(workDir, ['fetch', '--all', '--prune']);
    if (!fetched.ok) notes.push(`git fetch failed: ${fetched.stderr}`);
  }

  const localSha = revParse(workDir, 'HEAD');
  const localTree = treeSha(workDir, 'HEAD');

  if (!remoteUrl(workDir, remote)) {
    notes.push(`No "${remote}" remote configured — freshness cannot be established`);
    return {
      branch, local_sha: localSha, local_tree: localTree, remote_ref: null, remote_sha: null,
      expected_sha: opts.expectedSha, freshness: 'UNKNOWN', advancement: 'NOT_APPLICABLE',
      behind_by: 0, ahead_by: 0, remote_changed_files: [], notes,
    };
  }

  const remoteRef = branch ? `${remote}/${branch}` : null;
  const remoteSha = remoteRef ? revParse(workDir, remoteRef) : null;

  if (!remoteSha) {
    notes.push(`Remote ref ${remoteRef ?? '(none)'} not found — branch may be unpublished`);
    return {
      branch, local_sha: localSha, local_tree: localTree, remote_ref: remoteRef, remote_sha: null,
      expected_sha: opts.expectedSha, freshness: 'UNKNOWN', advancement: 'NOT_APPLICABLE',
      behind_by: 0, ahead_by: 0, remote_changed_files: [], notes,
    };
  }

  const counts = git(workDir, ['rev-list', '--left-right', '--count', `${remoteSha}...${localSha ?? 'HEAD'}`]);
  let behind = 0;
  let ahead = 0;
  if (counts.ok) {
    const [b, a] = counts.stdout.split(/\s+/).map((n) => parseInt(n, 10));
    behind = Number.isFinite(b) ? b : 0;
    ahead = Number.isFinite(a) ? a : 0;
  } else {
    notes.push('rev-list comparison failed — ahead/behind counts unavailable');
  }

  let freshness: Freshness;
  if (!localSha) freshness = 'UNKNOWN';
  else if (behind === 0 && ahead === 0) freshness = 'CURRENT';
  else if (behind === 0) freshness = 'ADVANCED';
  else if (ahead === 0) freshness = 'STALE';
  else freshness = 'DIVERGED';

  // What moved on the remote is the collision surface for a stale worker.
  let remoteChanged: string[] = [];
  if (behind > 0 && localSha) {
    const mergeBase = git(workDir, ['merge-base', localSha, remoteSha]);
    if (mergeBase.ok && mergeBase.stdout) {
      remoteChanged = changedFilesBetween(workDir, mergeBase.stdout, remoteSha);
    }
  }

  let advancement: AdvancementClass = 'NOT_APPLICABLE';
  if (behind > 0) {
    if (opts.expectedSha && opts.expectedSha === remoteSha) {
      advancement = 'EXPECTED_ADVANCEMENT';
    } else if (opts.expectedSha && localSha && !isAncestor(workDir, opts.expectedSha, localSha)) {
      advancement = 'BASELINE_DRIFT';
      notes.push(`Expected baseline ${opts.expectedSha.slice(0, 8)} is not an ancestor of HEAD`);
    } else if (ahead > 0) {
      advancement = 'PARALLEL_PUBLICATION';
    } else {
      advancement = 'SAFE_FORWARD_ADVANCEMENT';
    }
  }

  if (opts.expectedSha && localSha && opts.expectedSha !== localSha && advancement === 'NOT_APPLICABLE') {
    advancement = isAncestor(workDir, opts.expectedSha, localSha)
      ? 'SAFE_FORWARD_ADVANCEMENT'
      : 'UNEXPLAINED_DRIFT';
  }

  return {
    branch, local_sha: localSha, local_tree: localTree, remote_ref: remoteRef, remote_sha: remoteSha,
    expected_sha: opts.expectedSha, freshness, advancement, behind_by: behind, ahead_by: ahead,
    remote_changed_files: remoteChanged, notes,
  };
}

// ── Worker staleness (§23) ────────────────────────────────────────────────────

/** How a finished worker relates to a baseline that moved while it worked. */
export type WorkerStaleness =
  | 'CURRENT'
  | 'STALE_BUT_PATCH_EQUIVALENT'
  | 'STALE_WITH_COLLISION'
  | 'OBSOLETE'
  | 'UNKNOWN';

/** The read-only reconciliation verdict for a finished worker. */
export interface StalenessReport {
  classification: WorkerStaleness;
  worker_sha: string;
  worker_changed_files: string[];
  /** Files this worker touched that also moved on the target — the real collision set. */
  colliding_files: string[];
  already_integrated: boolean;
  reason: string;
}

/**
 * Reconcile a finished worker against the current target, read-only (§23).
 *
 * Never merges, resets, or rewrites. A shared file is not automatically a hard
 * collision, and a stale worker is never blindly integrated — the caller decides
 * after reading this verdict.
 *
 * @param workerSha - The worker's commit.
 * @param targetRef - The branch or SHA the contribution would land on.
 */
export function classifyWorkerStaleness(
  workDir: string,
  workerSha: string,
  targetRef: string,
): StalenessReport {
  const resolvedWorker = revParse(workDir, workerSha);
  const resolvedTarget = revParse(workDir, targetRef);

  if (!resolvedWorker || !resolvedTarget) {
    return {
      classification: 'UNKNOWN',
      worker_sha: workerSha,
      worker_changed_files: [],
      colliding_files: [],
      already_integrated: false,
      reason: `Could not resolve ${!resolvedWorker ? `worker ref "${workerSha}"` : `target ref "${targetRef}"`}`,
    };
  }

  const workerFiles = changedFiles(workDir, resolvedWorker);

  // Already in the target by ancestry — nothing to reconcile.
  if (isAncestor(workDir, resolvedWorker, resolvedTarget)) {
    return {
      classification: 'CURRENT',
      worker_sha: resolvedWorker,
      worker_changed_files: workerFiles,
      colliding_files: [],
      already_integrated: true,
      reason: 'Worker commit is an ancestor of the target (DIRECT_ANCESTRY)',
    };
  }

  const mergeBase = git(workDir, ['merge-base', resolvedWorker, resolvedTarget]);
  if (!mergeBase.ok || !mergeBase.stdout) {
    return {
      classification: 'UNKNOWN',
      worker_sha: resolvedWorker,
      worker_changed_files: workerFiles,
      colliding_files: [],
      already_integrated: false,
      reason: 'No merge base between worker and target — unrelated histories',
    };
  }

  // Patch-equivalence: the same contribution may already be in the target under a
  // different SHA (a cherry-pick). `git cherry` marks such commits with '-'.
  const cherry = git(workDir, ['cherry', resolvedTarget, resolvedWorker, mergeBase.stdout]);
  const patchEquivalent = cherry.ok && cherry.stdout.split('\n').some((l) => l.trim().startsWith('-'));

  const targetMoved = changedFilesBetween(workDir, mergeBase.stdout, resolvedTarget);
  const colliding = workerFiles.filter((f) => targetMoved.includes(f));

  if (patchEquivalent) {
    return {
      classification: 'STALE_BUT_PATCH_EQUIVALENT',
      worker_sha: resolvedWorker,
      worker_changed_files: workerFiles,
      colliding_files: colliding,
      already_integrated: true,
      reason: 'An equivalent patch is already present in the target (PROVEN_PATCH_EQUIVALENT_CHERRY_PICK)',
    };
  }

  if (colliding.length > 0) {
    return {
      classification: 'STALE_WITH_COLLISION',
      worker_sha: resolvedWorker,
      worker_changed_files: workerFiles,
      colliding_files: colliding,
      already_integrated: false,
      reason: `Target moved on ${colliding.length} file(s) this worker also changed: ${colliding.slice(0, 5).join(', ')}${colliding.length > 5 ? ' …' : ''}`,
    };
  }

  if (workerFiles.length === 0) {
    return {
      classification: 'OBSOLETE',
      worker_sha: resolvedWorker,
      worker_changed_files: [],
      colliding_files: [],
      already_integrated: false,
      reason: 'Worker commit changes no files — nothing to integrate',
    };
  }

  return {
    classification: 'CURRENT',
    worker_sha: resolvedWorker,
    worker_changed_files: workerFiles,
    colliding_files: [],
    already_integrated: false,
    reason: 'Target advanced but on disjoint files — safe forward integration',
  };
}

// ── Final-tree contribution (§22) ─────────────────────────────────────────────

/** The verified provenance chain plus the reasoning behind each classification. */
export interface ProvenanceVerification {
  record: ProvenanceRecord;
  /** True when the contribution is proven present and the chain is complete. */
  proven: boolean;
  blockers: string[];
}

/**
 * Control-plane files the mission tooling rewrites on every state change.
 *
 * These describe a contribution rather than constitute it, and they are necessarily
 * written *after* the commit that carries them: recording a worker SHA updates the
 * ledger, which the next `/mission report` updates again. Verifying them against the
 * final tree therefore always fails — the record can never contain its own future.
 *
 * Excluding them removes that recursion. Write-once artifacts (attestations, patch
 * guides, evidence) are NOT excluded: those must survive, and a missing one is a real
 * finding.
 */
const SELF_REFERENTIAL_ARTIFACTS = [
  /^\.ai\/ledger\.json$/,
  /^\.ai\/gaps\.json$/,
  // Generated reports are regenerated on demand from the ledger.
  /^\.ai\/design\/.*-report\.md$/,
];

/** True when a path is a mission control-plane file that rewrites itself. */
function isSelfReferential(path: string): boolean {
  return SELF_REFERENTIAL_ARTIFACTS.some((re) => re.test(path));
}

/** Options for {@link verifyProvenance}. */
export interface VerifyProvenanceOptions {
  /**
   * Base of a multi-commit contribution. When set, the contribution is `base..tip`
   * and the manifest is its net diff, rather than a single commit's changes.
   */
  base?: string;
  /**
   * Files a later authorized change was permitted to overwrite. Without this, an
   * overwritten file counts as LOST.
   */
  authorizedSupersedes?: string[];
  /**
   * Verify the mission's own mutable control-plane files too. Off by default — see
   * {@link SELF_REFERENTIAL_ARTIFACTS}. Turn it on only to audit the record itself.
   */
  includeGovernanceState?: boolean;
}

/**
 * Verify that a worker's contribution survives in the integration tree (§22).
 *
 * `LOST` and `UNKNOWN` block acceptance — the ledger refuses `INTEGRATION_VALIDATED`
 * for either. That is deliberate: the failure mode this catches is an integration
 * that reports success while a contribution was silently dropped by a conflict
 * resolution or a stale merge.
 *
 * A contribution is usually more than one commit. Pass `opts.base` (or a `base..tip`
 * range as `workerRef`) so the net effect of the whole series is verified; comparing
 * only the first commit reports every later refinement in the same branch as `LOST`.
 *
 * @param workerRef - The contribution tip, or a `base..tip` range.
 * @param integrationRef - The tree the contribution should now be part of.
 */
export function verifyProvenance(
  workDir: string,
  workerRef: string,
  integrationRef: string,
  opts: VerifyProvenanceOptions = {},
): ProvenanceVerification {
  const blockers: string[] = [];

  // Accept `base..tip` in the ref itself, so a range survives round-tripping through
  // a CLI flag or a ledger field without a second parameter.
  let tipRef = workerRef;
  let baseRef = opts.base;
  const rangeSplit = workerRef.indexOf('..');
  if (rangeSplit !== -1) {
    baseRef = workerRef.slice(0, rangeSplit);
    tipRef = workerRef.slice(rangeSplit + 2);
  }

  const resolvedWorker = revParse(workDir, tipRef);
  const resolvedIntegration = revParse(workDir, integrationRef);
  const resolvedBase = baseRef ? revParse(workDir, baseRef) : null;

  if (!resolvedWorker) {
    blockers.push(`Worker ref "${tipRef}" could not be resolved`);
  }
  if (!resolvedIntegration) {
    blockers.push(`Integration ref "${integrationRef}" could not be resolved`);
  }
  if (baseRef && !resolvedBase) {
    blockers.push(`Base ref "${baseRef}" could not be resolved`);
  }

  if (!resolvedWorker || !resolvedIntegration || (baseRef && !resolvedBase)) {
    return {
      record: {
        original_sha: resolvedWorker ?? tipRef,
        integration_method: 'UNKNOWN',
        changed_file_manifest: [],
        final_tree_contribution: 'UNKNOWN',
        verified_at_utc: new Date().toISOString(),
        notes: blockers.join('; '),
      },
      proven: false,
      blockers,
    };
  }

  // Manifest: the net diff across the range, or a single commit's changes.
  const rawManifest = resolvedBase
    ? changedFilesBetween(workDir, resolvedBase, resolvedWorker)
    : changedFiles(workDir, resolvedWorker);

  const excluded = opts.includeGovernanceState
    ? []
    : rawManifest.filter(isSelfReferential);
  const manifest = opts.includeGovernanceState
    ? rawManifest
    : rawManifest.filter((f) => !isSelfReferential(f));

  const patchId = (resolvedBase
    ? rangePatchId(workDir, resolvedBase, resolvedWorker)
    : stablePatchId(workDir, resolvedWorker)) ?? undefined;

  // Establish HOW the contribution reached the tree.
  let method: IntegrationMethod = 'UNKNOWN';
  if (isAncestor(workDir, resolvedWorker, resolvedIntegration)) {
    method = 'DIRECT_ANCESTRY';
  } else {
    const mergeBase = git(workDir, ['merge-base', resolvedWorker, resolvedIntegration]);
    if (mergeBase.ok && mergeBase.stdout) {
      if (resolvedBase) {
        // Every commit in the range must be accounted for in the target. `git cherry`
        // marks a replayed commit '-' and an unreplayed one '+'.
        const cherry = git(workDir, ['cherry', resolvedIntegration, resolvedWorker, resolvedBase]);
        const lines = cherry.ok
          ? cherry.stdout.split('\n').map((l) => l.trim()).filter(Boolean)
          : [];
        const unreplayed = lines.filter((l) => l.startsWith('+'));
        if (lines.length > 0 && unreplayed.length === 0) {
          method = 'PROVEN_PATCH_EQUIVALENT_CHERRY_PICK';
        } else if (unreplayed.length > 0) {
          blockers.push(
            `${unreplayed.length} of ${lines.length} commit(s) in the contribution range are not present in the integration tree`,
          );
        }
      } else {
        const cherry = git(workDir, ['cherry', resolvedIntegration, resolvedWorker, mergeBase.stdout]);
        if (cherry.ok && cherry.stdout.split('\n').some((l) => l.trim().startsWith('-'))) {
          method = 'PROVEN_PATCH_EQUIVALENT_CHERRY_PICK';
        }
      }
    }
  }

  // Establish WHETHER the content is actually there. Compare each file's blob in the
  // worker commit against the same path in the integration tree.
  const authorized = new Set(opts.authorizedSupersedes ?? []);
  const missing: string[] = [];
  const superseded: string[] = [];

  for (const file of manifest) {
    const workerBlob = git(workDir, ['rev-parse', `${resolvedWorker}:${file}`]);
    const integrationBlob = git(workDir, ['rev-parse', `${resolvedIntegration}:${file}`]);

    // The worker deleted the file; the integration tree agreeing it is gone is correct.
    if (!workerBlob.ok) {
      if (!integrationBlob.ok) continue;
      (authorized.has(file) ? superseded : missing).push(file);
      continue;
    }

    if (!integrationBlob.ok) {
      (authorized.has(file) ? superseded : missing).push(file);
      continue;
    }

    if (workerBlob.stdout !== integrationBlob.stdout) {
      (authorized.has(file) ? superseded : missing).push(file);
    }
  }

  let contribution: FinalTreeContribution;
  if (method === 'UNKNOWN' && missing.length === 0 && manifest.length > 0) {
    // The content matches but no ancestry or patch equivalence explains how it got
    // there. Present-but-unexplained is UNKNOWN, not PRESERVED (§22).
    contribution = 'UNKNOWN';
    blockers.push(
      'Contribution content is present but neither ancestry nor patch equivalence explains its path into the tree',
    );
  } else if (missing.length > 0) {
    contribution = 'LOST';
    blockers.push(
      `Contribution not present in the integration tree for: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ` (+${missing.length - 10} more)` : ''}`,
    );
  } else if (superseded.length > 0) {
    contribution = 'SUPERSEDED_BY_AUTHORIZED_CHANGE';
  } else if (manifest.length === 0) {
    // A contribution consisting only of control-plane state is a governed bookkeeping
    // commit. It carries no product content to verify, but it is not unexplained —
    // ancestry still proves how it reached the tree.
    if (excluded.length > 0 && method !== 'UNKNOWN') {
      contribution = 'PRESERVED';
    } else {
      contribution = 'UNKNOWN';
      blockers.push(
        excluded.length > 0
          ? 'Contribution contains only mission control-plane state, and its path into the tree is unexplained'
          : 'Contribution has an empty changed-file manifest — nothing to verify',
      );
    }
  } else {
    contribution = 'PRESERVED';
  }

  const notes: string[] = [];
  if (superseded.length > 0) notes.push(`Authorized supersede: ${superseded.join(', ')}`);
  if (excluded.length > 0) {
    notes.push(
      `Excluded self-referential control-plane files (they are rewritten after the commit that carries them): ${excluded.join(', ')}`,
    );
  }

  const record: ProvenanceRecord = {
    original_sha: resolvedWorker,
    base_sha: resolvedBase ?? undefined,
    contribution_range: resolvedBase ? `${resolvedBase}..${resolvedWorker}` : undefined,
    integration_sha: resolvedIntegration,
    integration_method: method,
    stable_patch_id: patchId,
    changed_file_manifest: manifest,
    excluded_artifacts: excluded.length > 0 ? excluded : undefined,
    final_tree_contribution: contribution,
    verified_at_utc: new Date().toISOString(),
    notes: notes.length > 0 ? notes.join(' | ') : undefined,
  };

  const proven = blockers.length === 0 && (contribution === 'PRESERVED' || contribution === 'SUPERSEDED_BY_AUTHORIZED_CHANGE');

  getLogger().info('mission', 'provenance_verified', {
    worker: resolvedWorker.slice(0, 8),
    base: resolvedBase?.slice(0, 8),
    integration: resolvedIntegration.slice(0, 8),
    commits: resolvedBase ? commitsBetween(workDir, resolvedBase, resolvedWorker).length : 1,
    method,
    contribution,
  });

  return { record, proven, blockers };
}

// ── Publication verification (§37) ────────────────────────────────────────────

/** The result of verifying that a push actually landed on the remote. */
export interface PublicationVerification {
  verified: boolean;
  remote_ref: string;
  remote_sha: string | null;
  remote_tree: string | null;
  expected_sha: string;
  /** Contribution files confirmed present at the remote SHA. */
  contribution_present: boolean;
  blockers: string[];
}

/**
 * Verify a publication against the remote (§37).
 *
 * A successful `git push` is not proof. This re-reads the remote ref and confirms both
 * the SHA and the contribution content. Anything short of that is `PUBLICATION_FAILED`.
 *
 * @param opts.fetch - Fetch before reading the remote ref. Defaults to true, since a
 *        stale remote-tracking ref would let a failed push read as verified.
 */
export function verifyPublication(
  workDir: string,
  opts: { branch: string; expectedSha: string; remote?: string; missionFiles?: string[]; fetch?: boolean },
): PublicationVerification {
  const remote = opts.remote ?? 'origin';
  const blockers: string[] = [];

  if (opts.fetch !== false) {
    const fetched = git(workDir, ['fetch', '--all', '--prune']);
    if (!fetched.ok) blockers.push(`git fetch failed before verification: ${fetched.stderr}`);
  }

  const remoteRef = `${remote}/${opts.branch}`;
  const remoteSha = revParse(workDir, remoteRef);
  const remoteTree = remoteSha ? treeSha(workDir, remoteRef) : null;

  if (!remoteSha) {
    blockers.push(`Remote ref ${remoteRef} does not exist — PUBLICATION_FAILED`);
    return {
      verified: false, remote_ref: remoteRef, remote_sha: null, remote_tree: null,
      expected_sha: opts.expectedSha, contribution_present: false, blockers,
    };
  }

  if (remoteSha !== opts.expectedSha && !isAncestor(workDir, opts.expectedSha, remoteSha)) {
    blockers.push(
      `Remote ${remoteRef} is at ${remoteSha.slice(0, 8)}; expected ${opts.expectedSha.slice(0, 8)} is not contained in it — PUBLICATION_FAILED`,
    );
  }

  let contributionPresent = true;
  for (const file of opts.missionFiles ?? []) {
    if (!git(workDir, ['rev-parse', `${remoteSha}:${file}`]).ok) {
      contributionPresent = false;
      blockers.push(`Expected contribution file "${file}" is not present at ${remoteRef}`);
    }
  }

  return {
    verified: blockers.length === 0,
    remote_ref: remoteRef,
    remote_sha: remoteSha,
    remote_tree: remoteTree,
    expected_sha: opts.expectedSha,
    contribution_present: contributionPresent,
    blockers,
  };
}

// ── Collision analysis (§7) ───────────────────────────────────────────────────

/** How two workers' write manifests relate. */
export type CollisionClass = 'NONE' | 'SOFT_OVERLAP' | 'SHARED_HOTSPOT' | 'DEPENDENCY' | 'HARD_COLLISION';

/** The relationship between two planned workers. */
export interface CollisionReport {
  worker_a: string;
  worker_b: string;
  classification: CollisionClass;
  shared_files: string[];
  hotspots: string[];
  recommendation: string;
}

/**
 * Files whose shared modification is an architectural collision, not a merge conflict.
 *
 * Two workers editing separate functions in a service file usually merge cleanly. Two
 * workers both redefining DI bootstrap, routing, or a migration sequence do not — they
 * invent competing implementations of the same primitive, and must be serialized.
 */
const ARCHITECTURAL_HOTSPOTS = [
  /(^|\/)Program\.cs$/i,
  /(^|\/)Startup\.cs$/i,
  /(^|\/)package\.json$/,
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock)$/,
  /(^|\/)(routes?|router)\.[tj]sx?$/i,
  /(^|\/)(app|main|index)\.module\.[tj]s$/i,
  /(^|\/)di\.[tj]s$/i,
  /(^|\/)container\.[tj]s$/i,
  /(^|\/)schema\.(prisma|sql|graphql)$/i,
  /(^|\/)migrations?\//i,
  /(^|\/)(auth|authorization|permissions?)\.[tj]s$/i,
  /(^|\/)store\.[tj]sx?$/i,
  /(^|\/)contracts?\//i,
];

/**
 * Classify the collision risk between two planned write manifests (§7).
 *
 * Run before parallel workers write, not after they conflict.
 *
 * @param manifestA - Files worker A expects to change (repo-relative).
 * @param manifestB - Files worker B expects to change.
 * @param opts.dependency - True when B consumes something A produces.
 */
export function analyzeCollision(
  workerA: string,
  manifestA: string[],
  workerB: string,
  manifestB: string[],
  opts: { dependency?: boolean } = {},
): CollisionReport {
  const setB = new Set(manifestB);
  const shared = manifestA.filter((f) => setB.has(f)).sort();
  const hotspots = shared.filter((f) => ARCHITECTURAL_HOTSPOTS.some((p) => p.test(f)));

  let classification: CollisionClass;
  let recommendation: string;

  if (opts.dependency) {
    classification = 'DEPENDENCY';
    recommendation = `${workerB} depends on ${workerA}. Run ${workerA} to completion first; do not launch ${workerB} merely because parallel capacity exists (§8).`;
  } else if (hotspots.length > 0) {
    classification = 'HARD_COLLISION';
    recommendation = `SERIALIZE. Both workers would redefine the same architectural primitive: ${hotspots.join(', ')}. Establish the shared primitive first, then run the dependent worker (§7).`;
  } else if (shared.length > 3) {
    classification = 'SHARED_HOTSPOT';
    recommendation = `${shared.length} shared files. Serialize, or split the manifests so each worker owns a disjoint set.`;
  } else if (shared.length > 0) {
    classification = 'SOFT_OVERLAP';
    recommendation = `Shared files (${shared.join(', ')}) are likely to merge cleanly, but integrate serially and verify provenance for both contributions.`;
  } else {
    classification = 'NONE';
    recommendation = 'Disjoint manifests — safe to run in parallel. Integration still happens serially (§24).';
  }

  return { worker_a: workerA, worker_b: workerB, classification, shared_files: shared, hotspots, recommendation };
}
