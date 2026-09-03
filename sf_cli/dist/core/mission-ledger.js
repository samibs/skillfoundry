// Governed Mission Protocol — `.ai/ledger.json`, the durable engineering truth ledger.
//
// SkillFoundry's run state (`.skillfoundry/runs/`) is ephemeral: it describes one
// execution and dies with it. The ledger is the opposite — it lives in the repository
// and survives the agent. A replacement worker with zero chat history reconstructs
// project state from git + ledger + attestations + patches + evidence.
//
// Two rules give the ledger its value, and both are enforced here rather than trusted
// to a prompt:
//
//   §29  A multi-dimensional lifecycle is never collapsed into one vague `status`.
//        Implementation, acceptance, integration, publication and external validation
//        advance independently.
//   §30  The ledger must never claim more than evidence proves. Every promotion to a
//        terminal status is gated on the artifact that would prove it — a worker SHA,
//        an evidence file, a provenance record, a verified remote SHA.
//
// Writes are atomic (temp + rename on the same filesystem) so a crash mid-write leaves
// the previous valid ledger intact.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { getLogger } from '../utils/logger.js';
// ── Layout ────────────────────────────────────────────────────────────────────
/** Root of the governed-mission artifact tree, relative to the repository root. */
export const AI_DIR = '.ai';
export const LEDGER_FILE = 'ledger.json';
export const GAPS_FILE = 'gaps.json';
export const ATTESTATIONS_DIR = 'attestations';
export const PATCHES_DIR = 'patches';
export const EVIDENCE_DIR = 'evidence';
export const DECISIONS_DIR = 'decisions';
export const DESIGN_DIR = 'design';
export const AGENTS_DIR = 'agents';
export const PROCESSES_DIR = 'processes';
export const LOGS_DIR = 'logs';
export const APP_CATALOG_FILE = 'app-catalog.json';
/** Current on-disk ledger schema version. Bump when the document shape changes. */
export const LEDGER_SCHEMA_VERSION = '1.0';
/** A mission ID is a bounded slug — it becomes a path segment, so it is validated. */
const MISSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/**
 * Validate a mission ID before it is used as a filename or object key.
 *
 * @throws {Error} When the ID is empty, over-long, or contains path separators.
 */
export function assertMissionId(missionId) {
    if (!MISSION_ID_PATTERN.test(missionId)) {
        throw new Error(`Invalid mission ID "${missionId}": expected 1-64 chars of [A-Za-z0-9._-] starting alphanumeric`);
    }
}
/** Absolute path to the `.ai` directory for a repository root. */
export function aiDir(workDir) {
    return join(resolve(workDir), AI_DIR);
}
/** Absolute path to `.ai/ledger.json`. */
export function ledgerPath(workDir) {
    return join(aiDir(workDir), LEDGER_FILE);
}
/** Absolute path to `.ai/gaps.json`. */
export function gapsPath(workDir) {
    return join(aiDir(workDir), GAPS_FILE);
}
/** Absolute path to a mission's evidence directory. */
export function evidenceDir(workDir, missionId) {
    assertMissionId(missionId);
    return join(aiDir(workDir), EVIDENCE_DIR, missionId);
}
// ── Status taxonomy (§28) ─────────────────────────────────────────────────────
/**
 * The controlled status vocabulary. Ambiguous ad-hoc statuses are rejected at the
 * type level and, for untyped callers, at runtime by {@link isMissionStatus}.
 */
export const MISSION_STATUSES = [
    'NOT_STARTED',
    'IN_PROGRESS',
    'IMPLEMENTATION_GAP',
    'BLOCKED_BY_STORY',
    'BLOCKED_BY_AUTHORIZATION',
    'BLOCKED_BY_INFRASTRUCTURE',
    'EVIDENCE_PARTIAL',
    'EXTERNAL_VALIDATION_REQUIRED',
    'FAIL',
    'PASS',
    'COMPLETE',
    'INTEGRATION_READY',
    'INTEGRATION_VALIDATED',
    'PUBLISHED',
    'NOT_APPLICABLE',
];
/** Runtime guard for the status taxonomy. */
export function isMissionStatus(value) {
    return typeof value === 'string' && MISSION_STATUSES.includes(value);
}
/** The five independent lifecycle dimensions tracked per mission (§29). */
export const LEDGER_DIMENSIONS = [
    'implementation_status',
    'acceptance_status',
    'integration_status',
    'publication_status',
    'external_validation_status',
];
/** Runtime guard for a lifecycle dimension name. */
export function isLedgerDimension(value) {
    return typeof value === 'string' && LEDGER_DIMENSIONS.includes(value);
}
/**
 * Statuses each dimension may legally hold. A dimension never accepts a status that
 * belongs to a different phase — `publication_status` can never be `PASS`, and
 * `implementation_status` can never be `PUBLISHED`.
 */
const ALLOWED_BY_DIMENSION = {
    implementation_status: [
        'NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTATION_GAP', 'BLOCKED_BY_STORY',
        'BLOCKED_BY_AUTHORIZATION', 'BLOCKED_BY_INFRASTRUCTURE', 'FAIL', 'COMPLETE',
        'NOT_APPLICABLE',
    ],
    acceptance_status: [
        'NOT_STARTED', 'IN_PROGRESS', 'EVIDENCE_PARTIAL', 'FAIL', 'PASS',
        'BLOCKED_BY_INFRASTRUCTURE', 'NOT_APPLICABLE',
    ],
    integration_status: [
        'NOT_STARTED', 'IN_PROGRESS', 'INTEGRATION_READY', 'INTEGRATION_VALIDATED',
        'FAIL', 'BLOCKED_BY_STORY', 'NOT_APPLICABLE',
    ],
    publication_status: [
        'NOT_STARTED', 'IN_PROGRESS', 'BLOCKED_BY_AUTHORIZATION', 'FAIL', 'PUBLISHED',
        'NOT_APPLICABLE',
    ],
    external_validation_status: [
        'NOT_STARTED', 'IN_PROGRESS', 'EXTERNAL_VALIDATION_REQUIRED', 'FAIL', 'PASS',
        'NOT_APPLICABLE',
    ],
};
/** The statuses that require proof before the ledger will record them (§30). */
const EVIDENCE_GATED = {
    implementation_status: ['COMPLETE'],
    acceptance_status: ['PASS'],
    integration_status: ['INTEGRATION_VALIDATED'],
    publication_status: ['PUBLISHED'],
};
// ── Acceptance criteria (§5) ──────────────────────────────────────────────────
/** Dispositions an acceptance criterion may end with. No AC may be left undecided. */
export const AC_DISPOSITIONS = [
    'PASS', 'FAIL', 'IMPLEMENTATION_GAP', 'EVIDENCE_PARTIAL',
    'EXTERNAL_VALIDATION_REQUIRED', 'BLOCKED_BY_STORY', 'BLOCKED_BY_AUTHORIZATION',
    'BLOCKED_BY_INFRASTRUCTURE', 'NOT_APPLICABLE',
];
/** Dispositions that satisfy acceptance. Anything else blocks `acceptance_status: PASS`. */
const AC_SATISFYING = ['PASS', 'NOT_APPLICABLE'];
// ── Execution plane (MULTI_AGENT_PROTOCOL §16-§18) ────────────────────────────
//
// A work item and a mission are the same object seen from two angles:
//
//   execution.*  — is this work scheduled, running, integrated?  (scheduler's view)
//   *_status     — is this claim proven?                          (evidence gate's view)
//
// Keeping them in one entry is deliberate. Two files describing the same work item is
// precisely the drift this protocol exists to prevent, and `reconcileLedger` cross-checks
// the planes against each other so neither can quietly contradict the other.
/** Work-item execution states. `IMPLEMENTED` is not `VERIFIED` (§17). */
export const EXECUTION_STATUSES = [
    'PLANNED', 'READY', 'BLOCKED', 'IN_PROGRESS', 'IMPLEMENTED', 'TESTING',
    'PASSED', 'FAILED', 'INTEGRATION_READY', 'INTEGRATED', 'VERIFIED', 'REJECTED',
];
/** Runtime guard for the execution vocabulary — no "mostly working" (§17). */
export function isExecutionStatus(value) {
    return typeof value === 'string' && EXECUTION_STATUSES.includes(value);
}
/**
 * Dependency strength (§6).
 *
 * HARD        — dependent work must not start.
 * SOFT        — may start against a stable documented contract.
 * INTEGRATION — may proceed independently; completion needs combined verification.
 */
export const DEPENDENCY_KINDS = ['HARD', 'SOFT', 'INTEGRATION'];
/** Runtime guard for dependency strength. */
export function isDependencyKind(value) {
    return typeof value === 'string' && DEPENDENCY_KINDS.includes(value);
}
/** Failure codes for recorded blockers (§35). */
export const FAILURE_CODES = [
    'REQUIREMENT_GAP', 'DEPENDENCY_BLOCKED', 'WORKTREE_INVALID', 'BASELINE_DRIFT',
    'WRITE_COLLISION', 'PATCH_CONFLICT', 'BUILD_FAILURE', 'TEST_FAILURE',
    'ENVIRONMENT_FAILURE', 'PORT_CONFLICT', 'PROCESS_CLEANUP_FAILURE',
    'SECURITY_FAILURE', 'INTEGRATION_CONFLICT',
];
/** Runtime guard for the failure-code vocabulary. */
export function isFailureCode(value) {
    return typeof value === 'string' && FAILURE_CODES.includes(value);
}
// ── Persistence ───────────────────────────────────────────────────────────────
function nowUtc() {
    return new Date().toISOString();
}
/** Write JSON atomically: same-filesystem temp file, then rename over the target. */
function writeJsonAtomic(filePath, value) {
    const dir = join(filePath, '..');
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.tmp-${process.pid}`;
    try {
        writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf-8');
        renameSync(tmp, filePath);
    }
    catch (err) {
        if (existsSync(tmp)) {
            try {
                unlinkSync(tmp);
            }
            catch { /* temp cleanup is best-effort */ }
        }
        throw err;
    }
}
/**
 * Create the `.ai/` artifact tree.
 *
 * Only directories are created. Empty placeholder files are never written — §48
 * forbids creating files purely to satisfy the directory shape.
 *
 * @param workDir - Repository root.
 * @returns Absolute paths of the directories that now exist.
 */
export function initAiTree(workDir) {
    const root = aiDir(workDir);
    const dirs = [
        root,
        join(root, ATTESTATIONS_DIR),
        join(root, PATCHES_DIR),
        join(root, EVIDENCE_DIR),
        join(root, DECISIONS_DIR),
        join(root, DESIGN_DIR),
        join(root, AGENTS_DIR),
        join(root, PROCESSES_DIR),
        // Frontend and backend runtime logs stay independently inspectable (§22).
        join(root, LOGS_DIR, 'frontend'),
        join(root, LOGS_DIR, 'backend'),
        join(root, LOGS_DIR, 'tests'),
        join(root, LOGS_DIR, 'orchestration'),
        join(root, LOGS_DIR, 'agents'),
    ];
    for (const d of dirs) {
        if (!existsSync(d))
            mkdirSync(d, { recursive: true });
    }
    return dirs;
}
/** True when the repository already carries a ledger. */
export function ledgerExists(workDir) {
    return existsSync(ledgerPath(workDir));
}
/**
 * Read `.ai/ledger.json`.
 *
 * @returns The ledger, or null when it does not exist.
 * @throws {Error} When the file exists but is not valid JSON — a corrupt ledger is a
 *         hard failure, never silently replaced with an empty one.
 */
export function readLedger(workDir) {
    const p = ledgerPath(workDir);
    if (!existsSync(p))
        return null;
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(p, 'utf-8'));
    }
    catch (err) {
        throw new Error(`.ai/ledger.json is corrupt and cannot be parsed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const ledger = parsed;
    if (!ledger || typeof ledger !== 'object' || typeof ledger.missions !== 'object') {
        throw new Error('.ai/ledger.json is malformed: missing "missions" object');
    }
    // Tolerate a ledger written before the execution plane existed. Missing collections
    // are normalised on read so callers never have to guard them.
    ledger.missions ??= {};
    ledger.waves ??= {};
    ledger.integrations ??= [];
    for (const mission of Object.values(ledger.missions)) {
        mission.execution ??= { dependencies: [], write_manifest: [], status: 'PLANNED', blockers: [] };
        mission.execution.dependencies ??= [];
        mission.execution.write_manifest ??= [];
        mission.execution.blockers ??= [];
    }
    return ledger;
}
/** Write the ledger, stamping `updated_at_utc`. */
export function writeLedger(workDir, ledger) {
    ledger.updated_at_utc = nowUtc();
    writeJsonAtomic(ledgerPath(workDir), ledger);
    getLogger().info('mission', 'ledger_written', {
        missions: Object.keys(ledger.missions).length,
    });
}
/**
 * Create a ledger for a repository, or return the existing one untouched.
 *
 * @param workDir - Repository root.
 * @param project - Project name recorded in the ledger.
 * @param authoritativeBranch - The branch that publication targets.
 */
export function initLedger(workDir, project, authoritativeBranch = 'main') {
    const existing = readLedger(workDir);
    if (existing)
        return existing;
    initAiTree(workDir);
    const ledger = {
        schema_version: LEDGER_SCHEMA_VERSION,
        project,
        authoritative_branch: authoritativeBranch,
        updated_at_utc: nowUtc(),
        missions: {},
        waves: {},
        integrations: [],
    };
    writeLedger(workDir, ledger);
    return ledger;
}
/** Load the ledger or fail with an actionable message. */
function requireLedger(workDir) {
    const ledger = readLedger(workDir);
    if (!ledger) {
        throw new Error('No .ai/ledger.json found. Run `/mission init <MISSION-ID>` first.');
    }
    return ledger;
}
/**
 * Register a mission, or return it if already present.
 *
 * A new mission starts at `NOT_STARTED` on every dimension. Nothing is assumed.
 */
export function upsertMission(workDir, missionId, title) {
    assertMissionId(missionId);
    const ledger = requireLedger(workDir);
    const existing = ledger.missions[missionId];
    if (existing) {
        if (title && existing.title !== title) {
            existing.title = title;
            existing.updated_at_utc = nowUtc();
            writeLedger(workDir, ledger);
        }
        return existing;
    }
    const mission = {
        title,
        implementation_status: 'NOT_STARTED',
        acceptance_status: 'NOT_STARTED',
        integration_status: 'NOT_STARTED',
        publication_status: 'NOT_STARTED',
        external_validation_status: 'NOT_STARTED',
        evidence: [],
        attestations: [],
        acceptance_criteria: [],
        remaining_gaps: [],
        execution: { dependencies: [], write_manifest: [], status: 'PLANNED', blockers: [] },
        created_at_utc: nowUtc(),
        updated_at_utc: nowUtc(),
    };
    ledger.missions[missionId] = mission;
    writeLedger(workDir, ledger);
    return mission;
}
/** Read one mission, or null when it is not registered. */
export function getMission(workDir, missionId) {
    assertMissionId(missionId);
    return readLedger(workDir)?.missions[missionId] ?? null;
}
/**
 * Apply a mutation to a mission and persist the ledger.
 *
 * @throws {Error} When the mission is not registered.
 */
export function updateMission(workDir, missionId, mutate) {
    assertMissionId(missionId);
    const ledger = requireLedger(workDir);
    const mission = ledger.missions[missionId];
    if (!mission) {
        throw new Error(`Mission "${missionId}" is not in the ledger. Run \`/mission init ${missionId}\`.`);
    }
    mutate(mission);
    mission.updated_at_utc = nowUtc();
    writeLedger(workDir, ledger);
    return mission;
}
/**
 * Determine what proof is missing before a status may be recorded.
 *
 * This is the heart of §30. The ledger refuses to record a terminal status until the
 * artifact that would prove it exists on disk. An agent cannot talk its way past it.
 *
 * @returns Human-readable blockers. Empty means the promotion is provable.
 */
function evidenceBlockers(workDir, missionId, mission, dimension, status, gaps) {
    const gated = EVIDENCE_GATED[dimension];
    if (!gated?.includes(status))
        return [];
    const blockers = [];
    if (dimension === 'implementation_status' && status === 'COMPLETE') {
        if (!mission.worker_sha) {
            blockers.push('implementation_status=COMPLETE requires worker_sha (a worker commit must exist)');
        }
        if (!mission.patch_guide || !existsSync(join(resolve(workDir), mission.patch_guide))) {
            blockers.push(`implementation_status=COMPLETE requires an existing patch guide (.ai/patches/${missionId}.md)`);
        }
    }
    if (dimension === 'acceptance_status' && status === 'PASS') {
        const present = mission.evidence.filter((e) => existsSync(join(resolve(workDir), e)));
        if (present.length === 0) {
            blockers.push('acceptance_status=PASS requires at least one evidence file that exists on disk');
        }
        if (mission.acceptance_criteria.length === 0) {
            blockers.push('acceptance_status=PASS requires a populated acceptance-criteria matrix');
        }
        const unsatisfied = mission.acceptance_criteria.filter((ac) => !AC_SATISFYING.includes(ac.disposition));
        if (unsatisfied.length > 0) {
            blockers.push(`acceptance_status=PASS blocked by unsatisfied AC dispositions: ${unsatisfied
                .map((ac) => `${ac.id}=${ac.disposition}`)
                .join(', ')}`);
        }
        const blocking = gaps.filter((g) => g.mission === missionId && g.status === 'OPEN' && g.blocks_acceptance);
        if (blocking.length > 0) {
            blockers.push(`acceptance_status=PASS blocked by open gaps: ${blocking.map((g) => g.id).join(', ')}`);
        }
    }
    if (dimension === 'integration_status' && status === 'INTEGRATION_VALIDATED') {
        if (!mission.integration_sha) {
            blockers.push('integration_status=INTEGRATION_VALIDATED requires integration_sha');
        }
        if (!mission.provenance) {
            blockers.push('integration_status=INTEGRATION_VALIDATED requires a provenance record');
        }
        else if (mission.provenance.final_tree_contribution === 'LOST' ||
            mission.provenance.final_tree_contribution === 'UNKNOWN') {
            blockers.push(`integration_status=INTEGRATION_VALIDATED blocked: final_tree_contribution=${mission.provenance.final_tree_contribution}`);
        }
        if (mission.acceptance_status !== 'PASS') {
            blockers.push(`integration_status=INTEGRATION_VALIDATED requires acceptance_status=PASS (currently ${mission.acceptance_status})`);
        }
    }
    if (dimension === 'publication_status' && status === 'PUBLISHED') {
        if (!mission.published_sha) {
            blockers.push('publication_status=PUBLISHED requires published_sha verified against the remote');
        }
        if (!mission.published_tree) {
            blockers.push('publication_status=PUBLISHED requires published_tree verified against the remote');
        }
        if (mission.integration_status !== 'INTEGRATION_VALIDATED') {
            blockers.push(`publication_status=PUBLISHED requires integration_status=INTEGRATION_VALIDATED (currently ${mission.integration_status})`);
        }
    }
    return blockers;
}
/**
 * Set one lifecycle dimension, refusing any status the evidence does not support.
 *
 * @param workDir - Repository root.
 * @param missionId - Registered mission ID.
 * @param dimension - Which lifecycle dimension to set.
 * @param status - Target status from the controlled taxonomy.
 * @param opts.force - Record the status despite missing evidence. Reserved for
 *        human override; the blockers are still returned so the caller can log them.
 * @returns The promotion result, including refusal reasons.
 * @throws {Error} When the mission is unknown or the status is illegal for the dimension.
 */
export function setDimension(workDir, missionId, dimension, status, opts = {}) {
    assertMissionId(missionId);
    if (!isLedgerDimension(dimension)) {
        throw new Error(`Unknown ledger dimension "${dimension}"`);
    }
    if (!isMissionStatus(status)) {
        throw new Error(`Unknown status "${status}". Allowed: ${MISSION_STATUSES.join(', ')}`);
    }
    if (!ALLOWED_BY_DIMENSION[dimension].includes(status)) {
        throw new Error(`Status "${status}" is not valid for ${dimension}. Allowed: ${ALLOWED_BY_DIMENSION[dimension].join(', ')}`);
    }
    const ledger = requireLedger(workDir);
    const mission = ledger.missions[missionId];
    if (!mission) {
        throw new Error(`Mission "${missionId}" is not in the ledger. Run \`/mission init ${missionId}\`.`);
    }
    const from = mission[dimension];
    const gaps = readGaps(workDir).gaps;
    const blockers = evidenceBlockers(workDir, missionId, mission, dimension, status, gaps);
    if (blockers.length > 0 && !opts.force) {
        getLogger().warn('mission', 'promotion_refused', { missionId, dimension, status, blockers: blockers.length });
        return { accepted: false, dimension, from, to: status, blockers };
    }
    mission[dimension] = status;
    mission.updated_at_utc = nowUtc();
    writeLedger(workDir, ledger);
    getLogger().info('mission', 'dimension_set', {
        missionId, dimension, from, to: status, forced: Boolean(opts.force && blockers.length),
    });
    return { accepted: true, dimension, from, to: status, blockers: opts.force ? blockers : [] };
}
/**
 * Attach an evidence reference to a mission.
 *
 * Only a repo-relative path that exists is recorded — a dangling evidence reference
 * would let the ledger claim proof it does not have.
 *
 * @param evidencePath - Absolute or repo-relative path to the evidence artifact.
 * @throws {Error} When the path does not exist or escapes the repository.
 */
export function attachEvidence(workDir, missionId, evidencePath) {
    const root = resolve(workDir);
    const abs = isAbsolute(evidencePath) ? resolve(evidencePath) : resolve(root, evidencePath);
    const rel = relative(root, abs);
    if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new Error(`Evidence path escapes the repository: ${evidencePath}`);
    }
    if (!existsSync(abs)) {
        throw new Error(`Evidence file does not exist: ${rel}`);
    }
    updateMission(workDir, missionId, (m) => {
        if (!m.evidence.includes(rel))
            m.evidence.push(rel);
    });
    return rel;
}
/** Record or replace the acceptance-criteria matrix for a mission (§5). */
export function setAcceptanceCriteria(workDir, missionId, criteria) {
    for (const ac of criteria) {
        if (!AC_DISPOSITIONS.includes(ac.disposition)) {
            throw new Error(`AC ${ac.id}: unknown disposition "${ac.disposition}". Allowed: ${AC_DISPOSITIONS.join(', ')}`);
        }
    }
    updateMission(workDir, missionId, (m) => {
        m.acceptance_criteria = criteria;
    });
}
/** Record the provenance chain for an integrated contribution (§22). */
export function setProvenance(workDir, missionId, record) {
    updateMission(workDir, missionId, (m) => {
        m.provenance = record;
        m.stable_patch_id = record.stable_patch_id ?? m.stable_patch_id;
        m.integration_sha = record.integration_sha ?? m.integration_sha;
    });
}
// ── Gaps persistence ──────────────────────────────────────────────────────────
/** Read `.ai/gaps.json`, returning an empty document when the file is absent. */
export function readGaps(workDir) {
    const p = gapsPath(workDir);
    if (!existsSync(p)) {
        return { schema_version: LEDGER_SCHEMA_VERSION, updated_at_utc: nowUtc(), gaps: [] };
    }
    try {
        const doc = JSON.parse(readFileSync(p, 'utf-8'));
        doc.gaps ??= [];
        return doc;
    }
    catch (err) {
        throw new Error(`.ai/gaps.json is corrupt: ${err instanceof Error ? err.message : String(err)}`);
    }
}
/** Persist the gaps document. */
export function writeGaps(workDir, doc) {
    doc.updated_at_utc = nowUtc();
    writeJsonAtomic(gapsPath(workDir), doc);
}
/**
 * Open a gap and, when it blocks acceptance, link it to the mission.
 *
 * @returns The created gap, with a generated `GAP-NNN` ID.
 */
export function openGap(workDir, input) {
    assertMissionId(input.mission);
    const doc = readGaps(workDir);
    const nextNum = doc.gaps.reduce((max, g) => {
        const m = /^GAP-(\d+)$/.exec(g.id);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0) + 1;
    const gap = {
        id: `GAP-${String(nextNum).padStart(3, '0')}`,
        mission: input.mission,
        type: input.type,
        description: input.description,
        status: 'OPEN',
        blocks_acceptance: input.blocks_acceptance,
        evidence: input.evidence ?? [],
        created_at_utc: nowUtc(),
    };
    doc.gaps.push(gap);
    writeGaps(workDir, doc);
    if (getMission(workDir, input.mission)) {
        updateMission(workDir, input.mission, (m) => {
            if (!m.remaining_gaps.includes(gap.id))
                m.remaining_gaps.push(gap.id);
        });
    }
    return gap;
}
/**
 * Close a gap and unlink it from its mission.
 *
 * @returns The closed gap, or null when the ID is unknown.
 */
export function closeGap(workDir, gapId) {
    const doc = readGaps(workDir);
    const gap = doc.gaps.find((g) => g.id === gapId);
    if (!gap)
        return null;
    gap.status = 'CLOSED';
    gap.closed_at_utc = nowUtc();
    writeGaps(workDir, doc);
    if (getMission(workDir, gap.mission)) {
        updateMission(workDir, gap.mission, (m) => {
            m.remaining_gaps = m.remaining_gaps.filter((id) => id !== gapId);
        });
    }
    return gap;
}
/** Open gaps for a mission, or across the whole project when `missionId` is omitted. */
export function openGaps(workDir, missionId) {
    return readGaps(workDir).gaps.filter((g) => g.status === 'OPEN' && (!missionId || g.mission === missionId));
}
// ── Execution plane operations ────────────────────────────────────────────────
/**
 * Statuses an execution transition must justify, and what justifies them.
 *
 * These mirror the governance gates but on the scheduling axis: a worker cannot declare
 * itself INTEGRATION_READY without a commit (§32), and cannot be INTEGRATED or VERIFIED
 * without the governance plane having proven it.
 */
const EXECUTION_GATED = {
    INTEGRATION_READY: (m) => {
        const blockers = [];
        if (!m.worker_sha)
            blockers.push('INTEGRATION_READY requires a worker commit (§32) — none recorded');
        if (m.execution.blockers.length > 0) {
            blockers.push(`INTEGRATION_READY blocked by recorded blockers: ${m.execution.blockers.join(', ')}`);
        }
        return blockers;
    },
    INTEGRATED: (m) => m.integration_status === 'INTEGRATION_VALIDATED'
        ? []
        : [`INTEGRATED requires integration_status=INTEGRATION_VALIDATED (currently ${m.integration_status})`],
    VERIFIED: (m) => m.acceptance_status === 'PASS'
        ? []
        : [`VERIFIED requires acceptance_status=PASS (currently ${m.acceptance_status}) — IMPLEMENTED is not VERIFIED (§17)`],
};
/**
 * Move a work item along the execution axis (§17, §18).
 *
 * Terminal transitions are cross-checked against the governance plane, so the scheduler
 * cannot mark work INTEGRATED that the evidence gate has not validated.
 *
 * @param opts.force - Record the transition anyway. Blockers are still returned.
 * @throws {Error} When the mission is unknown or the status is outside the vocabulary.
 */
export function setExecutionStatus(workDir, missionId, status, opts = {}) {
    if (!isExecutionStatus(status)) {
        throw new Error(`Unknown execution status "${status}". Allowed: ${EXECUTION_STATUSES.join(', ')}`);
    }
    const mission = getMission(workDir, missionId);
    if (!mission) {
        throw new Error(`Mission "${missionId}" is not in the ledger. Run \`/mission init ${missionId}\`.`);
    }
    const from = mission.execution.status;
    const blockers = EXECUTION_GATED[status]?.(mission) ?? [];
    if (blockers.length > 0 && !opts.force) {
        getLogger().warn('mission', 'execution_transition_refused', { missionId, status, blockers: blockers.length });
        return { accepted: false, from, to: status, blockers };
    }
    updateMission(workDir, missionId, (m) => { m.execution.status = status; });
    getLogger().info('mission', 'execution_status_set', { missionId, from, to: status });
    return { accepted: true, from, to: status, blockers: opts.force ? blockers : [] };
}
/** Assign scheduling and ownership facts to a work item (§8, §11, §16). */
export function setExecutionPlan(workDir, missionId, plan) {
    for (const dep of plan.dependencies ?? []) {
        if (!isDependencyKind(dep.kind)) {
            throw new Error(`Dependency on "${dep.on}": unknown kind "${dep.kind}". Allowed: ${DEPENDENCY_KINDS.join(', ')}`);
        }
        if (dep.on === missionId) {
            throw new Error(`Work item "${missionId}" cannot depend on itself`);
        }
    }
    const mission = updateMission(workDir, missionId, (m) => {
        m.execution = { ...m.execution, ...plan };
    });
    return mission.execution;
}
/**
 * Record a blocker against a work item (§35).
 *
 * Failures are recorded, never disguised as partial success. Recording one also drops
 * the item to BLOCKED unless it has already failed outright.
 */
export function recordBlocker(workDir, missionId, code, detail) {
    if (!isFailureCode(code)) {
        throw new Error(`Unknown failure code "${code}". Allowed: ${FAILURE_CODES.join(', ')}`);
    }
    const entry = `${code}: ${detail}`;
    updateMission(workDir, missionId, (m) => {
        if (!m.execution.blockers.includes(entry))
            m.execution.blockers.push(entry);
        if (m.execution.status !== 'FAILED' && m.execution.status !== 'REJECTED') {
            m.execution.status = 'BLOCKED';
        }
    });
}
/** Clear a work item's blockers once they are genuinely resolved. */
export function clearBlockers(workDir, missionId) {
    updateMission(workDir, missionId, (m) => { m.execution.blockers = []; });
}
/** Record the exact authoritative baseline the current plan was built against (§11, §34). */
export function setBaseline(workDir, baseline) {
    const ledger = requireLedger(workDir);
    ledger.baseline = { ...baseline, resolved_at_utc: nowUtc() };
    ledger.authoritative_sha = baseline.sha;
    ledger.authoritative_tree = baseline.tree;
    writeLedger(workDir, ledger);
}
/**
 * Dispatch a wave: record its members, stamp each item, and make it the active wave (§7).
 *
 * Only one wave is active at a time — dispatching a new one while another is unfinished
 * is refused, because overlapping waves reintroduce exactly the collisions wave planning
 * exists to prevent.
 *
 * @throws {Error} When a member is unknown, or another wave is still open.
 */
export function dispatchWave(workDir, waveId, items) {
    const ledger = requireLedger(workDir);
    if (ledger.active_wave && ledger.active_wave !== waveId && !ledger.waves[ledger.active_wave]?.completed_at_utc) {
        throw new Error(`Wave "${ledger.active_wave}" is still active. Complete it before dispatching "${waveId}" — ` +
            'only one wave runs at a time (§7).');
    }
    const unknown = items.filter((i) => !ledger.missions[i]);
    if (unknown.length > 0) {
        throw new Error(`Unknown work item(s) for wave ${waveId}: ${unknown.join(', ')}`);
    }
    const wave = { items: [...items], created_at_utc: nowUtc() };
    ledger.waves[waveId] = wave;
    ledger.active_wave = waveId;
    for (const id of items) {
        const mission = ledger.missions[id];
        mission.execution.wave = waveId;
        if (mission.execution.status === 'PLANNED' || mission.execution.status === 'READY') {
            mission.execution.status = 'READY';
        }
        mission.updated_at_utc = nowUtc();
    }
    writeLedger(workDir, ledger);
    getLogger().info('mission', 'wave_dispatched', { waveId, items: items.length });
    return wave;
}
/** Work items in a wave that are not yet resolved (§39). */
export function unresolvedWaveItems(workDir, waveId) {
    const ledger = readLedger(workDir);
    const wave = ledger?.waves[waveId];
    if (!ledger || !wave)
        return [];
    const resolved = ['INTEGRATED', 'BLOCKED', 'REJECTED', 'VERIFIED'];
    return wave.items.filter((id) => {
        const mission = ledger.missions[id];
        return mission ? !resolved.includes(mission.execution.status) : true;
    });
}
/**
 * Close a wave (§39).
 *
 * A wave completes only when every item is INTEGRATED, BLOCKED, REJECTED or VERIFIED.
 * No worker may remain ambiguously IN_PROGRESS.
 *
 * @returns The unresolved items when the wave cannot close; empty on success.
 */
export function completeWave(workDir, waveId) {
    const unresolved = unresolvedWaveItems(workDir, waveId);
    if (unresolved.length > 0)
        return unresolved;
    const ledger = requireLedger(workDir);
    const wave = ledger.waves[waveId];
    if (!wave)
        throw new Error(`Unknown wave "${waveId}"`);
    wave.completed_at_utc = nowUtc();
    if (ledger.active_wave === waveId)
        ledger.active_wave = undefined;
    writeLedger(workDir, ledger);
    getLogger().info('mission', 'wave_completed', { waveId, items: wave.items.length });
    return [];
}
/** Append an integration record and advance the recorded baseline (§33). */
export function recordIntegration(workDir, entry) {
    const ledger = requireLedger(workDir);
    ledger.integrations.push({ ...entry, integrated_at_utc: nowUtc() });
    if (entry.resulting_baseline_sha && ledger.baseline) {
        ledger.baseline = { ...ledger.baseline, sha: entry.resulting_baseline_sha, resolved_at_utc: nowUtc() };
        ledger.authoritative_sha = entry.resulting_baseline_sha;
    }
    writeLedger(workDir, ledger);
}
/**
 * Compare ledger claims against the filesystem.
 *
 * Truth order §49: the repository tree and immutable evidence outrank the ledger. When
 * they disagree, the ledger is stale and must be corrected — reality is never rewritten
 * to match the ledger.
 *
 * @returns Every claim the repository cannot substantiate.
 */
export function reconcileLedger(workDir) {
    const ledger = readLedger(workDir);
    if (!ledger)
        return [];
    const root = resolve(workDir);
    const discrepancies = [];
    const gaps = readGaps(workDir).gaps;
    for (const [id, mission] of Object.entries(ledger.missions)) {
        for (const ev of mission.evidence) {
            if (!existsSync(join(root, ev))) {
                discrepancies.push({
                    mission: id, field: 'evidence', claim: ev, reality: 'file does not exist',
                });
            }
        }
        if (mission.patch_guide && !existsSync(join(root, mission.patch_guide))) {
            discrepancies.push({
                mission: id, field: 'patch_guide', claim: mission.patch_guide, reality: 'file does not exist',
            });
        }
        for (const att of mission.attestations) {
            if (!existsSync(join(root, att))) {
                discrepancies.push({
                    mission: id, field: 'attestations', claim: att, reality: 'file does not exist',
                });
            }
        }
        // The two planes must agree. A scheduler that says INTEGRATED while the evidence
        // gate says otherwise is exactly the drift a single ledger is meant to expose.
        const exec = mission.execution;
        if (exec.status === 'INTEGRATED' && mission.integration_status !== 'INTEGRATION_VALIDATED') {
            discrepancies.push({
                mission: id, field: 'execution.status', claim: 'INTEGRATED',
                reality: `integration_status is ${mission.integration_status}, not INTEGRATION_VALIDATED`,
            });
        }
        if (exec.status === 'VERIFIED' && mission.acceptance_status !== 'PASS') {
            discrepancies.push({
                mission: id, field: 'execution.status', claim: 'VERIFIED',
                reality: `acceptance_status is ${mission.acceptance_status}, not PASS`,
            });
        }
        if (exec.status === 'INTEGRATION_READY' && !mission.worker_sha) {
            discrepancies.push({
                mission: id, field: 'execution.status', claim: 'INTEGRATION_READY',
                reality: 'no worker commit recorded (§32)',
            });
        }
        for (const dep of exec.dependencies) {
            if (!ledger.missions[dep.on]) {
                discrepancies.push({
                    mission: id, field: 'execution.dependencies', claim: dep.on,
                    reality: 'dependency is not a registered work item',
                });
            }
        }
        // A terminal status whose proof has since vanished is a stale claim, not a pass.
        for (const dimension of LEDGER_DIMENSIONS) {
            const status = mission[dimension];
            const blockers = evidenceBlockers(workDir, id, mission, dimension, status, gaps);
            for (const blocker of blockers) {
                discrepancies.push({
                    mission: id, field: dimension, claim: status, reality: blocker,
                });
            }
        }
    }
    return discrepancies;
}
//# sourceMappingURL=mission-ledger.js.map