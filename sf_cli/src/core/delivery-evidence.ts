// Delivery Efficiency — reusable validation evidence.
//
// One rule: **already proven + unchanged = do not prove again.**
//
// `gate-cache.ts` already caches a gate verdict per file hash. This is the same idea one
// level up: a whole validation *command* — a build, a test run, a lint pass, a security
// scan — recorded together with enough context to decide later whether it still holds.
//
// The conservative bias is deliberate. Reusing stale evidence silently ships an unproven
// change, which is far worse than paying for a re-run. So evidence is bound to the exact
// content of the files it depended on, and anything unclear invalidates.

import {
  existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { hashFile, hashString } from './gate-cache.js';
import { treeSha, revParse } from './mission-git.js';
import type { TestScope } from './delivery-policy.js';
import type { DeliveryBudgetLevel } from './delivery-budget.js';
import { getLogger } from '../utils/logger.js';

// ── Storage ───────────────────────────────────────────────────────────────────

const STORE_DIR = '.skillfoundry';
const STORE_FILE = 'delivery-evidence.json';
const LOCK_DIR = join('.skillfoundry', 'delivery-locks');

/**
 * Bump when the validity rules change, so evidence recorded under older semantics is
 * ignored rather than trusted. Mirrors `GATE_LOGIC_VERSION`.
 */
export const EVIDENCE_LOGIC_VERSION = '1';

/** Default lifetime of a claim on an in-flight validation, in ms. */
const DEFAULT_LOCK_TTL_MS = 30 * 60_000;

/** Kinds of validation whose result is worth reusing. */
export const VALIDATION_KINDS = [
  'build', 'test', 'lint', 'typecheck', 'security-scan', 'dependency-scan',
  'static-analysis', 'repo-scan', 'architecture-discovery', 'changed-file-analysis',
] as const;

export type ValidationKind = (typeof VALIDATION_KINDS)[number];

/** Runtime guard for the validation vocabulary. */
export function isValidationKind(value: unknown): value is ValidationKind {
  return typeof value === 'string' && (VALIDATION_KINDS as readonly string[]).includes(value);
}

/** A recorded validation result plus everything needed to judge whether it still holds. */
export interface EvidenceEntry {
  /** Deterministic key: kind + command + scope + logic version. */
  key: string;
  kind: ValidationKind;
  /** The exact command that produced this, for auditability and re-execution. */
  command: string;
  /** Test scope, when the validation was a test run. */
  scope?: TestScope;
  /** Repository root this was produced in. */
  repository: string;
  /** Commit the run was based on. */
  baseCommit: string | null;
  /** Repository tree hash at the time of the run. */
  treeSha: string | null;
  /**
   * Content hashes of the files this evidence depends on. Empty means the evidence is
   * repository-wide and validity is judged by `treeSha` instead — the conservative path.
   */
  fileHashes: Record<string, string>;
  /** Files the producing task had changed, for reporting. */
  changedFiles: string[];
  result: 'PASS' | 'FAIL';
  /** Exit code where one applies. */
  exitCode?: number | null;
  /** Wall-clock duration, used by `$cost` to price what reuse saved. */
  durationSeconds?: number;
  /** Task or mission that produced it. */
  producedBy: string;
  /** Agent that produced it. */
  producedByAgent?: string;
  /** Delivery budget in force when it was produced. */
  budget?: DeliveryBudgetLevel;
  createdAt: string;
  /** Path to a full log, referenced rather than inlined. */
  artifact?: string;
  /**
   * The result an in-process validation produced, so reuse can return it rather than
   * re-running the work to reconstruct it. Bounded — see `MAX_PAYLOAD_BYTES`. Absent when
   * the result was too large, in which case reuse can confirm the verdict but not replay
   * the detail, and the caller must decide whether that is enough.
   */
  payload?: unknown;
}

/**
 * Ceiling on an inlined in-process result. Evidence references large artifacts by path;
 * this is only for compact structured results such as a gate summary.
 */
const MAX_PAYLOAD_BYTES = 64 * 1024;

/** The on-disk evidence store. */
export interface EvidenceStore {
  version: string;
  updatedAt: string;
  entries: Record<string, EvidenceEntry>;
}

function storePath(workDir: string): string {
  return join(resolve(workDir), STORE_DIR, STORE_FILE);
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

/** Read the evidence store, returning an empty one when absent or unreadable. */
export function loadEvidenceStore(workDir: string): EvidenceStore {
  const p = storePath(workDir);
  const empty: EvidenceStore = {
    version: EVIDENCE_LOGIC_VERSION,
    updatedAt: new Date().toISOString(),
    entries: {},
  };
  if (!existsSync(p)) return empty;

  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as EvidenceStore;
    // Evidence recorded under different validity rules proves nothing about these ones.
    if (parsed.version !== EVIDENCE_LOGIC_VERSION) {
      getLogger().info('delivery', 'evidence_store_version_reset', {
        found: parsed.version, expected: EVIDENCE_LOGIC_VERSION,
      });
      return empty;
    }
    parsed.entries ??= {};
    return parsed;
  } catch {
    // A corrupt cache must never fail a run — it just proves nothing.
    return empty;
  }
}

/** Persist the evidence store. */
export function saveEvidenceStore(workDir: string, store: EvidenceStore): void {
  store.updatedAt = new Date().toISOString();
  writeJsonAtomic(storePath(workDir), store);
}

// ── Keys and hashing ──────────────────────────────────────────────────────────

/**
 * Deterministic identity for a validation.
 *
 * Two runs share a key when they are the same kind of check, the same command and the
 * same scope. Whether the *result* still applies is a separate question, answered by the
 * file hashes.
 */
export function evidenceKey(kind: ValidationKind, command: string, scope?: TestScope): string {
  return hashString(`${EVIDENCE_LOGIC_VERSION}::${kind}::${command}::${scope ?? '-'}`).slice(0, 32);
}

/**
 * Hash the files a validation depended on.
 *
 * A file that cannot be read is recorded as `<missing>` rather than skipped, so its later
 * appearance invalidates the evidence instead of going unnoticed.
 */
export function hashScopeFiles(workDir: string, files: string[]): Record<string, string> {
  const root = resolve(workDir);
  const out: Record<string, string> = {};
  for (const rel of files) {
    const abs = join(root, rel);
    try {
      out[rel] = statSync(abs).isFile() ? hashFile(abs) : '<not-a-file>';
    } catch {
      out[rel] = '<missing>';
    }
  }
  return out;
}

// ── Recording ─────────────────────────────────────────────────────────────────

/** What a caller supplies when recording a validation result. */
export interface RecordEvidenceInput {
  kind: ValidationKind;
  command: string;
  scope?: TestScope;
  result: 'PASS' | 'FAIL';
  exitCode?: number | null;
  durationSeconds?: number;
  /**
   * Files this validation's result depends on. Supply the narrowest honest set: the
   * narrower it is, the more often the evidence survives an unrelated change.
   * Omit for repository-wide validation, which is then bound to the tree hash.
   */
  scopeFiles?: string[];
  changedFiles?: string[];
  producedBy: string;
  producedByAgent?: string;
  budget?: DeliveryBudgetLevel;
  artifact?: string;
  /** Compact structured result to inline, so reuse can return it. Dropped if oversized. */
  payload?: unknown;
}

/**
 * Record a validation result so a later task can reuse it.
 *
 * Failures are recorded too: knowing a command failed against this exact state is as
 * useful as knowing it passed, and stops a second worker repeating it blindly.
 */
export function recordEvidence(workDir: string, input: RecordEvidenceInput): EvidenceEntry {
  const key = evidenceKey(input.kind, input.command, input.scope);
  const entry: EvidenceEntry = {
    key,
    kind: input.kind,
    command: input.command,
    scope: input.scope,
    repository: resolve(workDir),
    baseCommit: revParse(workDir, 'HEAD'),
    treeSha: treeSha(workDir, 'HEAD'),
    fileHashes: hashScopeFiles(workDir, input.scopeFiles ?? []),
    changedFiles: input.changedFiles ?? [],
    result: input.result,
    exitCode: input.exitCode,
    durationSeconds: input.durationSeconds,
    producedBy: input.producedBy,
    producedByAgent: input.producedByAgent,
    budget: input.budget,
    createdAt: new Date().toISOString(),
    artifact: input.artifact,
    payload: boundedPayload(input.payload),
  };

  const store = loadEvidenceStore(workDir);
  store.entries[key] = entry;
  saveEvidenceStore(workDir, store);

  getLogger().info('delivery', 'validation_executed', {
    kind: input.kind, scope: input.scope, result: input.result, key,
  });
  return entry;
}

/**
 * Keep a payload only when it is small enough to belong in the store.
 *
 * An oversized result is dropped rather than truncated: half a gate summary would be worse
 * than none, because a caller could act on it as though it were complete.
 */
function boundedPayload(payload: unknown): unknown {
  if (payload === undefined) return undefined;
  try {
    const size = Buffer.byteLength(JSON.stringify(payload), 'utf-8');
    if (size > MAX_PAYLOAD_BYTES) {
      getLogger().info('delivery', 'evidence_payload_dropped', { bytes: size });
      return undefined;
    }
    return payload;
  } catch {
    // Non-serialisable results (cycles, functions) simply are not reusable as values.
    return undefined;
  }
}

// ── Lookup and reuse ──────────────────────────────────────────────────────────

/** Why a lookup did or did not yield reusable evidence. */
export type EvidenceStatus = 'REUSABLE' | 'INVALIDATED' | 'MISS' | 'FAILED_PREVIOUSLY';

/** The verdict of an evidence lookup. */
export interface EvidenceLookup {
  status: EvidenceStatus;
  entry?: EvidenceEntry;
  /** Human-readable justification, suitable for a report. */
  reason: string;
  /** Files whose content changed since the evidence was recorded. */
  invalidatedBy?: string[];
}

/** A lookup query. */
export interface EvidenceQuery {
  kind: ValidationKind;
  command: string;
  scope?: TestScope;
  /**
   * Files the caller's change touches. Evidence is invalidated when any of these appears
   * in its recorded scope, even if content hashing would not catch it.
   */
  changedFiles?: string[];
  /** Maximum acceptable age. Omit for no age limit — content, not clock, decides validity. */
  maxAgeMs?: number;
}

/**
 * Decide whether an existing validation still proves what the caller needs (§3).
 *
 * Validity is judged by content, not by time:
 *
 *   - scoped evidence  → every recorded file must still hash the same
 *   - repo-wide evidence → the repository tree hash must be unchanged (conservative)
 *
 * A previous FAIL is reported as `FAILED_PREVIOUSLY` rather than reused as a pass — the
 * caller needs to know the command is known-broken at this state, not skip it.
 */
export function lookupEvidence(workDir: string, query: EvidenceQuery): EvidenceLookup {
  const key = evidenceKey(query.kind, query.command, query.scope);
  const store = loadEvidenceStore(workDir);
  const entry = store.entries[key];

  if (!entry) {
    return { status: 'MISS', reason: `No prior ${query.kind} evidence for this command and scope.` };
  }

  if (resolve(entry.repository) !== resolve(workDir)) {
    return {
      status: 'INVALIDATED',
      entry,
      reason: `Evidence was produced in a different repository (${entry.repository}).`,
    };
  }

  if (query.maxAgeMs !== undefined) {
    const age = Date.now() - new Date(entry.createdAt).getTime();
    if (age > query.maxAgeMs) {
      return {
        status: 'INVALIDATED',
        entry,
        reason: `Evidence is ${Math.round(age / 60_000)} minutes old, beyond the ${Math.round(query.maxAgeMs / 60_000)}-minute limit.`,
      };
    }
  }

  const scopedFiles = Object.keys(entry.fileHashes);

  // A caller's changed file that the evidence depended on invalidates it outright,
  // without waiting for a hash comparison to notice.
  const overlap = (query.changedFiles ?? []).filter((f) => scopedFiles.includes(f));
  if (overlap.length > 0) {
    const current = hashScopeFiles(workDir, overlap);
    const differing = overlap.filter((f) => current[f] !== entry.fileHashes[f]);
    if (differing.length > 0) {
      getLogger().info('delivery', 'evidence_invalidated', { key, files: differing.length });
      return {
        status: 'INVALIDATED',
        entry,
        reason: `${differing.length} file(s) this evidence depended on have changed.`,
        invalidatedBy: differing,
      };
    }
  }

  if (scopedFiles.length === 0) {
    // Repository-wide evidence: nothing narrower to check, so require an identical tree.
    const current = treeSha(workDir, 'HEAD');
    if (!current || !entry.treeSha || current !== entry.treeSha) {
      getLogger().info('delivery', 'evidence_invalidated', { key, reason: 'tree-changed' });
      return {
        status: 'INVALIDATED',
        entry,
        reason: 'Repository-wide evidence, and the repository tree has changed since it was recorded.',
      };
    }
  } else {
    const current = hashScopeFiles(workDir, scopedFiles);
    const differing = scopedFiles.filter((f) => current[f] !== entry.fileHashes[f]);
    if (differing.length > 0) {
      getLogger().info('delivery', 'evidence_invalidated', { key, files: differing.length });
      return {
        status: 'INVALIDATED',
        entry,
        reason: `${differing.length} of ${scopedFiles.length} scoped file(s) changed since the run.`,
        invalidatedBy: differing,
      };
    }
  }

  if (entry.result === 'FAIL') {
    return {
      status: 'FAILED_PREVIOUSLY',
      entry,
      reason: `This command already failed against this exact state (exit ${entry.exitCode ?? 'unknown'}). Fix the cause rather than re-running it unchanged.`,
    };
  }

  getLogger().info('delivery', 'evidence_reused', { key, kind: entry.kind, scope: entry.scope });
  return {
    status: 'REUSABLE',
    entry,
    reason:
      scopedFiles.length === 0
        ? `Repository tree unchanged since this ${entry.kind} passed — already proven.`
        : `All ${scopedFiles.length} scoped file(s) unchanged since this ${entry.kind} passed — already proven.`,
  };
}

/**
 * Drop evidence invalidated by a set of changed files (§3).
 *
 * Called after an integration merges contributions, so the gate does not reuse anything
 * the merge affected.
 *
 * @returns The keys removed.
 */
export function invalidateForFiles(workDir: string, changedFiles: string[]): string[] {
  if (changedFiles.length === 0) return [];

  const store = loadEvidenceStore(workDir);
  const changed = new Set(changedFiles);
  const removed: string[] = [];

  for (const [key, entry] of Object.entries(store.entries)) {
    const scoped = Object.keys(entry.fileHashes);
    // Repo-wide evidence cannot survive an arbitrary change; scoped evidence dies only
    // when one of its own files moved.
    const hit = scoped.length === 0 || scoped.some((f) => changed.has(f));
    if (hit) {
      delete store.entries[key];
      removed.push(key);
    }
  }

  if (removed.length > 0) {
    saveEvidenceStore(workDir, store);
    getLogger().info('delivery', 'evidence_invalidated', { count: removed.length, cause: 'integration' });
  }
  return removed;
}

/** Remove every recorded validation. */
export function clearEvidence(workDir: string): void {
  saveEvidenceStore(workDir, {
    version: EVIDENCE_LOGIC_VERSION,
    updatedAt: new Date().toISOString(),
    entries: {},
  });
}

// ── Validation deduplication (§4) ─────────────────────────────────────────────

/** The outcome of trying to claim an expensive validation. */
export interface ValidationClaim {
  granted: boolean;
  key: string;
  /** Who currently holds the claim, when it was not granted. */
  heldBy?: string;
  heldSince?: string;
  reason: string;
}

function lockPath(workDir: string, key: string): string {
  return join(resolve(workDir), LOCK_DIR, `${key}.lock`);
}

/**
 * Claim the right to run an expensive validation (§4).
 *
 * Three workers changing three unrelated features must not each run the full suite. The
 * first to claim a given validation runs it; the others are told who holds it and should
 * wait for the resulting evidence rather than duplicating the work.
 *
 * The claim is an exclusive file creation (`wx`), which is atomic on POSIX, so two
 * processes racing cannot both win. A stale claim past its TTL is reclaimed, so a crashed
 * worker cannot deadlock the wave.
 *
 * @param owner - Identifier of the claiming agent or task.
 * @param ttlMs - How long the claim is honored before being treated as abandoned.
 */
export function claimValidation(
  workDir: string,
  key: string,
  owner: string,
  ttlMs: number = DEFAULT_LOCK_TTL_MS,
): ValidationClaim {
  const path = lockPath(workDir, key);
  const dir = join(path, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const payload = JSON.stringify({ owner, at: new Date().toISOString(), pid: process.pid });

  try {
    writeFileSync(path, payload, { encoding: 'utf-8', flag: 'wx' });
    return { granted: true, key, reason: `Claimed by ${owner}.` };
  } catch {
    // Someone holds it — unless the claim is stale.
    try {
      const held = JSON.parse(readFileSync(path, 'utf-8')) as { owner: string; at: string };
      const age = Date.now() - new Date(held.at).getTime();

      // `>=` so a TTL of 0 means "always reclaim", and a claim exactly at its deadline is
      // treated as abandoned rather than lingering for one more millisecond.
      if (age >= ttlMs) {
        writeFileSync(path, payload, 'utf-8');
        getLogger().warn('delivery', 'stale_validation_claim_reclaimed', { key, previous: held.owner });
        return { granted: true, key, reason: `Reclaimed a stale claim held by ${held.owner}.` };
      }

      if (held.owner === owner) {
        return { granted: true, key, reason: 'Already held by this owner.' };
      }

      getLogger().info('delivery', 'duplicate_validation_prevented', { key, heldBy: held.owner, requestedBy: owner });
      return {
        granted: false,
        key,
        heldBy: held.owner,
        heldSince: held.at,
        reason: `${held.owner} is already running this validation — wait for its evidence instead of duplicating it.`,
      };
    } catch {
      // Unreadable lock: fail open rather than blocking a legitimate run.
      return { granted: true, key, reason: 'Existing claim was unreadable; proceeding.' };
    }
  }
}

/** Release a claim once the validation has finished and its evidence is recorded. */
export function releaseValidation(workDir: string, key: string): void {
  const path = lockPath(workDir, key);
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // A lock that cannot be removed expires by TTL.
  }
}

/** Claims currently held, for `$cost` reporting and orchestrator diagnostics. */
export function activeClaims(workDir: string): Array<{ key: string; owner: string; at: string }> {
  const dir = join(resolve(workDir), LOCK_DIR);
  if (!existsSync(dir)) return [];

  const out: Array<{ key: string; owner: string; at: string }> = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.lock')) continue;
    try {
      const held = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as { owner: string; at: string };
      out.push({ key: file.replace(/\.lock$/, ''), owner: held.owner, at: held.at });
    } catch {
      // Skip unreadable claims.
    }
  }
  return out;
}

// ── Reuse decision helper ─────────────────────────────────────────────────────

/** What an agent should do about a validation it is considering. */
export interface ValidationDecision {
  action: 'REUSE' | 'RUN' | 'WAIT' | 'FIX_FIRST';
  reason: string;
  evidence?: EvidenceEntry;
  claim?: ValidationClaim;
}

/**
 * The single call an agent makes before running an expensive validation.
 *
 * Combines reuse and deduplication so callers cannot accidentally implement one without
 * the other:
 *
 *   REUSE     — already proven against this exact state; skip it
 *   FIX_FIRST — already failed against this exact state; re-running proves nothing
 *   WAIT      — another worker is running it; consume its evidence
 *   RUN       — genuinely needed, and the claim is yours
 *
 * @param owner - The agent or task that would run it.
 */
export function decideValidation(
  workDir: string,
  query: EvidenceQuery,
  owner: string,
): ValidationDecision {
  const lookup = lookupEvidence(workDir, query);

  if (lookup.status === 'REUSABLE') {
    getLogger().info('delivery', 'validation_skipped_already_proven', {
      kind: query.kind, scope: query.scope,
    });
    return { action: 'REUSE', reason: lookup.reason, evidence: lookup.entry };
  }
  if (lookup.status === 'FAILED_PREVIOUSLY') {
    return { action: 'FIX_FIRST', reason: lookup.reason, evidence: lookup.entry };
  }

  const claim = claimValidation(workDir, evidenceKey(query.kind, query.command, query.scope), owner);
  if (!claim.granted) {
    return { action: 'WAIT', reason: claim.reason, claim };
  }

  return {
    action: 'RUN',
    reason: lookup.status === 'MISS' ? lookup.reason : `${lookup.reason} Re-running.`,
    claim,
  };
}

/** Stable digest of a set of changed files, for grouping evidence across workers. */
export function changedFilesDigest(files: string[]): string {
  return createHash('sha256').update([...files].sort().join('\n')).digest('hex').slice(0, 16);
}
