/**
 * /mission — Governed Development Mission Protocol.
 *
 * Implements the operator surface for `agents/_governed-mission-protocol.md`. Every
 * subcommand writes a machine-readable artifact under `.ai/` that outlives the agent
 * that produced it, so a replacement worker with no chat history can reconstruct
 * project state from git + ledger + attestations + patches + evidence.
 *
 * Usage:
 *   /mission init <ID> --title "..."        Register a mission and scaffold .ai/
 *   /mission attest <ID> [--worker w]       Attest the worker environment (before writes)
 *   /mission baseline [--fetch]             Classify baseline freshness vs the remote
 *   /mission evidence <ID> --kind tests --run "npm test"
 *   /mission ac <ID> --file criteria.json   Load the acceptance-criteria matrix
 *   /mission commit <ID> --sha <sha>        Record the worker commit + stable patch ID
 *   /mission provenance <ID> --worker <sha> --integration <ref>
 *   /mission publish-check <ID> --branch main --sha <sha>
 *   /mission set <ID> <dimension> <STATUS>  Evidence-gated lifecycle promotion
 *   /mission gap open|close|list
 *   /mission collide --a name:f1,f2 --b name:f3,f4
 *   /mission verify <ID>                    Definition-of-Done gate
 *   /mission report <ID>                    Structured final report
 *   /mission reconcile                      Ledger vs. repository truth
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, basename, relative } from 'node:path';
import type { SlashCommand, SessionContext } from '../types.js';
import {
  initLedger, upsertMission, getMission, updateMission, readLedger, setDimension,
  attachEvidence, setAcceptanceCriteria, setProvenance, openGap, closeGap, openGaps,
  readGaps, reconcileLedger, initAiTree, aiDir, evidenceDir, assertMissionId,
  isLedgerDimension, isMissionStatus, LEDGER_DIMENSIONS, MISSION_STATUSES,
  PATCHES_DIR, AC_DISPOSITIONS,
  setExecutionStatus, setExecutionPlan, recordBlocker, clearBlockers, setBaseline,
  dispatchWave, completeWave, unresolvedWaveItems, recordIntegration,
  isExecutionStatus, isDependencyKind, isFailureCode,
  EXECUTION_STATUSES, FAILURE_CODES, DEPENDENCY_KINDS,
  type AcceptanceCriterion, type LedgerMission, type GapType, type LedgerDimension,
  type ExecutionStatus, type Dependency, type DependencyKind, type FailureCode,
} from '../core/mission-ledger.js';
import {
  registerAgent, releaseAgent, listAgents, activeAgents, readAgent,
  planWave, integrationOrder, buildDependencyGraph, evaluateEligibility,
  orchestrationSummary, sharedWorktreeViolations,
  type AgentMode,
} from '../core/mission-orchestration.js';
import {
  readCatalog, upsertApplication, detectPortConflicts, serviceForPort,
  registerProcess, listProcesses, listAllProcesses, stopOwnedProcesses,
  orphanedProcesses, pruneProcessRecords, verifyProcessOwnership, isProcessAlive,
} from '../core/mission-processes.js';
import {
  attestWorker, gateOnAttestation, listAttestations, relativeAttestationPath,
  isAgentKind, type AgentKind,
} from '../core/mission-attestation.js';
import {
  classifyBaseline, classifyWorkerStaleness, verifyProvenance, verifyPublication,
  analyzeCollision,
} from '../core/mission-provenance.js';
import {
  runValidatedCommand, writeEvidence, readEvidence, isCleanValidation, classifyFailure,
  isEvidenceKind, type EvidenceKind, type CommandEvidence,
} from '../core/mission-evidence.js';
import {
  stablePatchId, changedFiles, changedFilesBetween, revParse, treeSha, currentBranch,
  isGitRepo, topLevel, commitsBetween, rangePatchId,
} from '../core/mission-git.js';

// ── Arg parsing ───────────────────────────────────────────────────────────────

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | true>;
}

/**
 * Parse `sub ARG --flag value --other=value --bool "quoted value"`.
 *
 * Quoting is honoured so a `--run "npm test -- --coverage"` payload survives intact.
 */
function parseArgs(raw: string): ParsedArgs {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }

  const positional: string[] = [];
  const flags: Record<string, string | true> = {};

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.startsWith('--')) {
      positional.push(t);
      continue;
    }
    const body = t.slice(2);
    if (body.includes('=')) {
      const idx = body.indexOf('=');
      flags[body.slice(0, idx)] = body.slice(idx + 1);
      continue;
    }
    const next = tokens[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[body] = next;
      i++;
    } else {
      flags[body] = true;
    }
  }

  return { positional, flags };
}

function flagString(flags: Record<string, string | true>, name: string): string | undefined {
  const v = flags[name];
  return typeof v === 'string' ? v : undefined;
}

function flagList(flags: Record<string, string | true>, name: string): string[] {
  const v = flagString(flags, name);
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

// ── Output helpers ────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function ok(s: string): string { return `${GREEN}✓${RESET} ${s}`; }
function bad(s: string): string { return `${RED}✗${RESET} ${s}`; }
function warn(s: string): string { return `${YELLOW}⚠${RESET} ${s}`; }
function head(s: string): string { return `\n  ${BOLD}${s}${RESET}\n  ${'─'.repeat(s.length)}`; }

/** Colour a lifecycle status by whether it is terminal, blocking, or in flight. */
function statusColor(status: string): string {
  if (['COMPLETE', 'PASS', 'INTEGRATION_VALIDATED', 'PUBLISHED'].includes(status)) return `${GREEN}${status}${RESET}`;
  if (status.startsWith('BLOCKED') || status === 'FAIL' || status === 'IMPLEMENTATION_GAP') return `${RED}${status}${RESET}`;
  if (['EVIDENCE_PARTIAL', 'EXTERNAL_VALIDATION_REQUIRED', 'INTEGRATION_READY'].includes(status)) return `${YELLOW}${status}${RESET}`;
  return `${DIM}${status}${RESET}`;
}

function requireMissionId(positional: string[], sub: string): string {
  const id = positional[1];
  if (!id) throw new Error(`Usage: /mission ${sub} <MISSION-ID> …`);
  assertMissionId(id);
  return id;
}

// ── Patch guide (§14) ─────────────────────────────────────────────────────────

/** Repo-relative path of a mission's patch guide. */
function patchGuidePath(workDir: string, missionId: string): string {
  return join('.ai', PATCHES_DIR, `${missionId}.md`);
}

/**
 * Scaffold `.ai/patches/<ID>.md` with the baseline facts already filled in.
 *
 * The scaffold carries real values read from git — it is a document to complete, not
 * an empty placeholder file (§48).
 */
function scaffoldPatchGuide(workDir: string, missionId: string, title: string): string {
  const rel = patchGuidePath(workDir, missionId);
  const abs = join(resolve(workDir), rel);
  if (existsSync(abs)) return rel;

  const dir = join(abs, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const sha = revParse(workDir, 'HEAD') ?? 'unresolved';
  const tree = treeSha(workDir, 'HEAD') ?? 'unresolved';
  const branch = currentBranch(workDir) ?? 'detached HEAD';

  const body = `# ${missionId} Patch Guide

> Describes this contribution. It does not replace git history (§14).

## Purpose

${title}

## Requirement

<!-- Authoritative story / AC references. Do not infer additional product requirements. -->

## Baseline

- SHA: \`${sha}\`
- Tree: \`${tree}\`
- Branch: \`${branch}\`

## Worker

- Agent:
- Branch: \`${branch}\`
- Worktree:

## Changed Files

<!-- One bullet per file: reason, requirement it serves, behavior changed. -->

## Architecture

- Existing primitive reused:
- New primitive:
- Why required:

## Security

- Authentication impact:
- Authorization impact:
- Isolation impact:
- Secret impact:

## Database

- Migration:
- Rollback:
- Data compatibility:

## Tests

- Focused:
- Regression:
- Integration:

## Evidence

<!-- Reference .ai/evidence/${missionId}/*.json — never paste log bodies here. -->

## Known Gaps

<!-- "None", or reference GAP-NNN in .ai/gaps.json. Never silently omit one. -->

## Non-Goals

## Rollback

<!-- How this contribution can be reverted safely. -->
`;

  writeFileSync(abs, body, 'utf-8');
  return rel;
}

// ── Definition of Done (§45) ──────────────────────────────────────────────────

/** One Definition-of-Done gate and its evaluated result. */
interface DodGate {
  label: string;
  passed: boolean;
  detail: string;
  /** Gates that do not apply are reported, never silently dropped. */
  applicable: boolean;
}

/**
 * Evaluate the Definition of Done for a mission (§45).
 *
 * Distinguishes WORKER DONE / ACCEPTANCE DONE / INTEGRATION DONE / PUBLICATION DONE —
 * a mission that is implemented but unpublished is reported as exactly that, never as
 * a blanket "complete" (§27).
 */
function evaluateDod(workDir: string, missionId: string, mission: LedgerMission): DodGate[] {
  const root = resolve(workDir);
  const gates: DodGate[] = [];
  const attestations = listAttestations(workDir, missionId);
  const passingAttestation = attestations.find((a) => a.status === 'PASS');

  gates.push({
    label: 'AC matrix complete',
    applicable: true,
    passed: mission.acceptance_criteria.length > 0 &&
      mission.acceptance_criteria.every((ac) => (AC_DISPOSITIONS as readonly string[]).includes(ac.disposition)),
    detail: mission.acceptance_criteria.length === 0
      ? 'No acceptance criteria recorded — every AC must end with a disposition (§5)'
      : `${mission.acceptance_criteria.length} AC(s), all dispositioned`,
  });

  gates.push({
    label: 'Worker attestation recorded',
    applicable: true,
    passed: Boolean(passingAttestation),
    detail: passingAttestation
      ? `${passingAttestation.worker} (${passingAttestation.agent}) — native worktree ${passingAttestation.native_worktree_registered ? 'verified' : 'NOT verified'}`
      : attestations.length > 0
        ? `${attestations.length} attestation(s) recorded, none PASS`
        : 'No attestation — no source writes were authorized (§4)',
  });

  gates.push({
    label: 'Worker commit created',
    applicable: true,
    passed: Boolean(mission.worker_sha),
    detail: mission.worker_sha
      ? `${mission.worker_sha.slice(0, 12)}`
      : 'No worker commit — NOT_INTEGRATION_READY (§20)',
  });

  gates.push({
    label: 'Stable patch identity recorded',
    applicable: true,
    passed: Boolean(mission.stable_patch_id),
    detail: mission.stable_patch_id ? mission.stable_patch_id.slice(0, 16) : 'Not computed (§21)',
  });

  gates.push({
    label: 'Patch guide updated',
    applicable: true,
    passed: Boolean(mission.patch_guide && existsSync(join(root, mission.patch_guide))),
    detail: mission.patch_guide ?? 'Missing (§14)',
  });

  const presentEvidence = mission.evidence.filter((e) => existsSync(join(root, e)));
  gates.push({
    label: 'Evidence persisted',
    applicable: true,
    passed: presentEvidence.length > 0,
    detail: `${presentEvidence.length}/${mission.evidence.length} referenced evidence file(s) present`,
  });

  const tests = readEvidence<CommandEvidence>(workDir, missionId, 'tests');
  gates.push({
    label: 'Normal termination proven',
    applicable: Boolean(tests),
    passed: Boolean(tests?.payload?.normal_termination),
    detail: tests
      ? tests.payload.normal_termination
        ? `Exited normally in ${tests.payload.duration_seconds}s`
        : 'Test host did not terminate normally — this is NOT a clean validation (§17)'
      : 'No test evidence recorded',
  });

  gates.push({
    label: 'No owned orphan processes',
    applicable: Boolean(tests),
    passed: tests ? tests.payload.orphan_check !== 'ORPHANS_DETECTED' : false,
    detail: tests
      ? tests.payload.orphan_check === 'ORPHANS_DETECTED'
        ? (tests.payload.orphan_detail ?? 'Orphans detected')
        : `Orphan check: ${tests.payload.orphan_check}`
      : 'No test evidence recorded',
  });

  const blocking = openGaps(workDir, missionId).filter((g) => g.blocks_acceptance);
  gates.push({
    label: 'Unresolved gaps explicit',
    applicable: true,
    passed: blocking.length === 0,
    detail: blocking.length === 0
      ? `${openGaps(workDir, missionId).length} open non-blocking gap(s)`
      : `Blocking gaps: ${blocking.map((g) => g.id).join(', ')}`,
  });

  gates.push({
    label: 'Provenance established',
    applicable: mission.integration_status !== 'NOT_STARTED',
    passed: Boolean(mission.provenance &&
      (mission.provenance.final_tree_contribution === 'PRESERVED' ||
       mission.provenance.final_tree_contribution === 'SUPERSEDED_BY_AUTHORIZED_CHANGE')),
    detail: mission.provenance
      ? `final_tree_contribution=${mission.provenance.final_tree_contribution} via ${mission.provenance.integration_method}`
      : 'Not integrated yet',
  });

  gates.push({
    label: 'Remote publication verified',
    applicable: mission.publication_status !== 'NOT_STARTED',
    passed: Boolean(mission.published_sha && mission.published_tree),
    detail: mission.published_sha
      ? `${mission.published_sha.slice(0, 12)} / tree ${(mission.published_tree ?? '').slice(0, 12)}`
      : 'Not published (§35 — integration does not authorize publication)',
  });

  return gates;
}

/** Pick the single explicit final disposition for a mission (§39). */
function finalDisposition(mission: LedgerMission, dodBlockers: number): string {
  if (mission.publication_status === 'PUBLISHED') return 'PUBLISHED — COMPLETE';
  if (mission.integration_status === 'INTEGRATION_VALIDATED') return 'INTEGRATION_VALIDATED — READY_FOR_PUBLICATION';
  if (mission.implementation_status === 'FAIL' || mission.acceptance_status === 'FAIL') return 'FAILED — DO_NOT_INTEGRATE';
  if (mission.implementation_status === 'IMPLEMENTATION_GAP') return 'IMPLEMENTATION_GAP — REMEDIATION_REQUIRED';
  if (mission.implementation_status.startsWith('BLOCKED')) return mission.implementation_status;
  if (mission.external_validation_status === 'EXTERNAL_VALIDATION_REQUIRED') return 'EXTERNAL_VALIDATION_REQUIRED';
  if (mission.acceptance_status === 'EVIDENCE_PARTIAL') return 'EVIDENCE_PARTIAL — VALIDATION_REQUIRED';
  if (mission.implementation_status === 'COMPLETE' && dodBlockers === 0) return 'COMPLETE — INTEGRATION_READY';
  if (mission.implementation_status === 'COMPLETE') return 'EVIDENCE_PARTIAL — VALIDATION_REQUIRED';
  return `IN_PROGRESS (implementation=${mission.implementation_status})`;
}

// ── Subcommand handlers ───────────────────────────────────────────────────────

function handleInit(workDir: string, args: ParsedArgs): string {
  const missionId = requireMissionId(args.positional, 'init');
  const title = flagString(args.flags, 'title') ?? missionId;
  const branch = flagString(args.flags, 'branch') ?? currentBranch(workDir) ?? 'main';
  const project = flagString(args.flags, 'project') ?? basename(resolve(workDir));

  initAiTree(workDir);
  initLedger(workDir, project, branch);
  upsertMission(workDir, missionId, title);
  const guide = scaffoldPatchGuide(workDir, missionId, title);
  updateMission(workDir, missionId, (m) => { m.patch_guide = guide; });

  const lines = [
    head(`Mission ${missionId} registered`),
    ok(`Ledger:      .ai/ledger.json (project "${project}", authoritative branch "${branch}")`),
    ok(`Patch guide: ${guide}`),
    ok(`Artifacts:   .ai/{attestations,patches,evidence,decisions,design}/`),
    '',
    `  ${DIM}All five lifecycle dimensions start at NOT_STARTED. Nothing is assumed.${RESET}`,
    `  ${DIM}Next: /mission attest ${missionId} --worker <name> --agent claude${RESET}`,
    '',
  ];
  return lines.join('\n');
}

function handleAttest(workDir: string, args: ParsedArgs): string {
  const missionId = requireMissionId(args.positional, 'attest');
  const worker = flagString(args.flags, 'worker') ?? 'worker';
  const agentRaw = flagString(args.flags, 'agent') ?? 'claude';
  const agent: AgentKind = isAgentKind(agentRaw) ? agentRaw : 'unknown';

  const attestation = attestWorker(workDir, {
    missionId,
    worker,
    agent,
    baseRef: flagString(args.flags, 'base'),
    requiredAssets: flagList(args.flags, 'require'),
    allowMainWorktree: args.flags['allow-main'] === true || args.flags['allow-main'] === 'true',
    allowDirty: args.flags['allow-dirty'] === true || args.flags['allow-dirty'] === 'true',
  });

  if (getMission(workDir, missionId)) {
    const rel = relativeAttestationPath(workDir, missionId, worker);
    updateMission(workDir, missionId, (m) => {
      if (!m.attestations.includes(rel)) m.attestations.push(rel);
      if (m.implementation_status === 'NOT_STARTED' && attestation.status === 'PASS') {
        m.implementation_status = 'IN_PROGRESS';
      }
    });
  }

  const lines = [head(`Attestation — ${missionId} / ${worker}`)];
  lines.push(`  Agent:              ${attestation.agent}`);
  lines.push(`  Worktree:           ${attestation.worktree_path}`);
  lines.push(`  Native worktree:    ${attestation.native_worktree_registered ? ok('registered') : bad('NOT registered')}`);
  lines.push(`  Branch:             ${attestation.branch ?? DIM + 'detached HEAD' + RESET}`);
  lines.push(`  HEAD:               ${attestation.head_sha?.slice(0, 12) ?? 'unknown'}`);
  lines.push(`  Tree:               ${attestation.tree_sha?.slice(0, 12) ?? 'unknown'}`);
  lines.push(`  Working tree clean: ${attestation.working_tree_clean ? ok('yes') : bad('no')}`);
  lines.push(`  Commit capability:  ${attestation.commit_capability_verified ? ok('verified') : bad('unverified')}`);
  lines.push(`  Fingerprint:        ${attestation.environment_fingerprint}`);
  lines.push('');

  for (const w of attestation.warnings) lines.push(`  ${warn(w)}`);

  if (attestation.status === 'PASS') {
    lines.push(`  ${ok(`${BOLD}PASS${RESET} — source writes are authorized for this mission`)}`);
  } else {
    lines.push(`  ${bad(`${BOLD}FAIL${RESET} — no source writes until these are resolved:`)}`);
    for (const b of attestation.blockers) lines.push(`    ${RED}·${RESET} ${b}`);
  }
  lines.push('');
  return lines.join('\n');
}

function handleBaseline(workDir: string, args: ParsedArgs): string {
  const report = classifyBaseline(workDir, {
    branch: flagString(args.flags, 'branch'),
    remote: flagString(args.flags, 'remote'),
    expectedSha: flagString(args.flags, 'expect'),
    fetch: args.flags.fetch === true || args.flags.fetch === 'true',
  });

  const lines = [head('Authoritative baseline')];
  lines.push(`  Branch:      ${report.branch ?? DIM + 'detached' + RESET}`);
  lines.push(`  Local SHA:   ${report.local_sha?.slice(0, 12) ?? 'unknown'}`);
  lines.push(`  Local tree:  ${report.local_tree?.slice(0, 12) ?? 'unknown'}`);
  lines.push(`  Remote ref:  ${report.remote_ref ?? DIM + 'none' + RESET}`);
  lines.push(`  Remote SHA:  ${report.remote_sha?.slice(0, 12) ?? DIM + 'unknown' + RESET}`);
  if (report.expected_sha) lines.push(`  Expected:    ${report.expected_sha.slice(0, 12)}`);
  lines.push(`  Freshness:   ${statusColor(report.freshness)}`);
  lines.push(`  Advancement: ${report.advancement}`);
  lines.push(`  Ahead/behind: ${report.ahead_by} / ${report.behind_by}`);

  if (report.remote_changed_files.length > 0) {
    lines.push('');
    lines.push(`  ${BOLD}Collision surface${RESET} — ${report.remote_changed_files.length} file(s) moved on the remote:`);
    for (const f of report.remote_changed_files.slice(0, 15)) lines.push(`    ${DIM}·${RESET} ${f}`);
    if (report.remote_changed_files.length > 15) {
      lines.push(`    ${DIM}… +${report.remote_changed_files.length - 15} more${RESET}`);
    }
  }

  for (const n of report.notes) lines.push(`  ${warn(n)}`);

  if (report.freshness === 'STALE' || report.freshness === 'DIVERGED') {
    lines.push('');
    lines.push(`  ${warn('The authoritative branch advanced. Do NOT reset backwards — inspect and classify first (§2).')}`);
  }
  lines.push('');
  return lines.join('\n');
}

async function handleEvidence(workDir: string, args: ParsedArgs): Promise<string> {
  const missionId = requireMissionId(args.positional, 'evidence');
  const kindRaw = flagString(args.flags, 'kind') ?? 'tests';
  if (!isEvidenceKind(kindRaw)) {
    throw new Error(`Unknown evidence kind "${kindRaw}". Allowed: acceptance, tests, validation, security, provenance, closeout, baseline`);
  }
  const kind: EvidenceKind = kindRaw;

  const runCmd = flagString(args.flags, 'run');
  const fromFile = flagString(args.flags, 'file');

  if (!runCmd && !fromFile) {
    throw new Error('Provide either --run "<command>" to execute and record, or --file <path.json> to import a payload.');
  }

  if (fromFile) {
    const abs = resolve(workDir, fromFile);
    if (!existsSync(abs)) throw new Error(`Payload file not found: ${fromFile}`);
    const payload = JSON.parse(readFileSync(abs, 'utf-8')) as unknown;
    const rel = writeEvidence(workDir, missionId, kind, payload);
    attachEvidence(workDir, missionId, rel);
    return `\n  ${ok(`Evidence recorded: ${rel}`)}\n`;
  }

  const timeoutMs = Number(flagString(args.flags, 'timeout') ?? '') * 1000 || undefined;
  const [command, ...cmdArgs] = runCmd!.split(/\s+/);

  // In a monorepo the ledger lives at the repository root while the test command must
  // run inside a package. --cwd separates the two; evidence still lands in the root ledger.
  const runCwd = resolve(workDir, flagString(args.flags, 'cwd') ?? '.');
  if (!existsSync(runCwd)) {
    throw new Error(`--cwd directory does not exist: ${flagString(args.flags, 'cwd')}`);
  }

  const evidence = await runValidatedCommand({
    command,
    args: cmdArgs,
    cwd: runCwd,
    timeoutMs,
    label: `${missionId}-${kind}`,
  });

  const rel = writeEvidence(workDir, missionId, kind, {
    ...evidence,
    // Normalise the artifact path so it resolves from the repository root.
    raw_artifact: relative(workDir, resolve(runCwd, evidence.raw_artifact)),
  });
  attachEvidence(workDir, missionId, rel);

  const clean = isCleanValidation(evidence, { expectTests: kind === 'tests' });
  const lines = [head(`Validation evidence — ${missionId} / ${kind}`)];
  lines.push(`  Command:            ${evidence.command} ${evidence.args.join(' ')}`);
  lines.push(`  Exit code:          ${evidence.exit_code ?? 'null'}`);
  lines.push(`  Duration:           ${evidence.duration_seconds}s`);
  if (evidence.passed !== undefined) {
    lines.push(`  Tests:              ${evidence.passed} passed, ${evidence.failed ?? 0} failed, ${evidence.skipped ?? 0} skipped`);
  }
  lines.push(`  Normal termination: ${evidence.normal_termination ? ok('yes') : bad('NO')}`);
  lines.push(`  Orphan check:       ${evidence.orphan_check === 'CLEAN' ? ok('CLEAN') : evidence.orphan_check === 'ORPHANS_DETECTED' ? bad('ORPHANS_DETECTED') : warn(evidence.orphan_check)}`);
  lines.push(`  Raw log:            ${evidence.raw_artifact} ${DIM}(outside git — referenced, not inlined)${RESET}`);
  lines.push(`  Evidence:           ${rel}`);
  lines.push('');

  if (clean.clean) {
    lines.push(`  ${ok(`${BOLD}CLEAN VALIDATION${RESET}`)}`);
  } else {
    lines.push(`  ${bad(`${BOLD}NOT A CLEAN VALIDATION${RESET}`)}`);
    for (const r of clean.reasons) lines.push(`    ${RED}·${RESET} ${r}`);

    const failure = classifyFailure(evidence.output_tail, evidence.exit_code);
    lines.push('');
    lines.push(`  ${BOLD}Failure classification${RESET} (${failure.confidence} confidence)`);
    lines.push(`    Class:    ${failure.classification}`);
    lines.push(`    Signal:   ${failure.signal}`);
    lines.push(`    Guidance: ${failure.guidance}`);
  }
  lines.push('');
  return lines.join('\n');
}

function handleAc(workDir: string, args: ParsedArgs): string {
  const missionId = requireMissionId(args.positional, 'ac');
  const file = flagString(args.flags, 'file');
  if (!file) throw new Error('Usage: /mission ac <MISSION-ID> --file <criteria.json>');

  const abs = resolve(workDir, file);
  if (!existsSync(abs)) throw new Error(`Criteria file not found: ${file}`);

  const parsed = JSON.parse(readFileSync(abs, 'utf-8')) as unknown;
  const criteria = (Array.isArray(parsed) ? parsed : (parsed as { criteria?: unknown }).criteria) as AcceptanceCriterion[];
  if (!Array.isArray(criteria)) {
    throw new Error('Criteria file must be a JSON array, or an object with a "criteria" array.');
  }

  setAcceptanceCriteria(workDir, missionId, criteria);

  const lines = [head(`Acceptance matrix — ${missionId}`)];
  for (const ac of criteria) {
    const icon = ac.disposition === 'PASS' || ac.disposition === 'NOT_APPLICABLE' ? ok('') : bad('');
    lines.push(`  ${icon} ${ac.id.padEnd(6)} ${statusColor(ac.disposition).padEnd(40)} ${ac.requirement.slice(0, 60)}`);
  }
  lines.push('');
  lines.push(`  ${DIM}Every AC carries a disposition. None may disappear from the final report (§5).${RESET}`);
  lines.push('');
  return lines.join('\n');
}

function handleCommit(workDir: string, args: ParsedArgs): string {
  const missionId = requireMissionId(args.positional, 'commit');
  const shaArg = flagString(args.flags, 'sha') ?? 'HEAD';
  const sha = revParse(workDir, shaArg);
  if (!sha) throw new Error(`Could not resolve "${shaArg}" to a commit.`);

  // Recording the base makes the contribution a range, so re-running `/mission commit`
  // after further work verifies the whole series rather than just the latest commit.
  const baseArg = flagString(args.flags, 'base');
  const base = baseArg ? revParse(workDir, baseArg) : getMission(workDir, missionId)?.execution.base_sha;
  if (baseArg && !base) throw new Error(`Could not resolve base ref "${baseArg}" to a commit.`);

  const patchId = base ? rangePatchId(workDir, base, sha) : stablePatchId(workDir, sha);
  const files = base ? changedFilesBetween(workDir, base, sha) : changedFiles(workDir, sha);

  updateMission(workDir, missionId, (m) => {
    m.worker_sha = sha;
    if (base) m.execution.base_sha = base;
    if (patchId) m.stable_patch_id = patchId;
  });

  const lines = [head(`Worker commit — ${missionId}`)];
  lines.push(`  SHA:              ${sha}`);
  if (base) {
    lines.push(`  Base:             ${base}`);
    lines.push(`  Contribution:     ${commitsBetween(workDir, base, sha).length} commit(s)`);
  }
  lines.push(`  Stable patch ID:  ${patchId ?? warn('not computable (merge or root commit)')}`);
  lines.push(`  Changed files:    ${files.length}`);
  for (const f of files.slice(0, 20)) lines.push(`    ${DIM}·${RESET} ${f}`);
  if (files.length > 20) lines.push(`    ${DIM}… +${files.length - 20} more${RESET}`);
  lines.push('');
  lines.push(`  ${DIM}A commit is not acceptance. Record evidence, then promote implementation_status.${RESET}`);
  lines.push('');
  return lines.join('\n');
}

function handleProvenance(workDir: string, args: ParsedArgs): string {
  const missionId = requireMissionId(args.positional, 'provenance');
  const mission = getMission(workDir, missionId);
  if (!mission) throw new Error(`Mission "${missionId}" is not registered.`);

  const workerSha = flagString(args.flags, 'worker') ?? mission.worker_sha;
  const integration = flagString(args.flags, 'integration') ?? 'HEAD';
  if (!workerSha) throw new Error('No worker SHA. Run `/mission commit <ID>` first, or pass --worker <sha>.');

  // A contribution is usually more than one commit. Default the range base to the
  // baseline the worker branched from, so later refinements in the same branch are
  // verified as part of the contribution instead of reading as LOST.
  const base = flagString(args.flags, 'base') ?? mission.execution.base_sha;

  // Staleness compares the tip; strip any range prefix the caller passed in --worker.
  const tip = workerSha.includes('..') ? workerSha.slice(workerSha.indexOf('..') + 2) : workerSha;
  const staleness = classifyWorkerStaleness(workDir, tip, integration);
  const verification = verifyProvenance(workDir, workerSha, integration, {
    base: workerSha.includes('..') ? undefined : base,
    authorizedSupersedes: flagList(args.flags, 'authorized-supersedes'),
    includeGovernanceState:
      args.flags['include-governance-state'] === true ||
      args.flags['include-governance-state'] === 'true',
  });

  const commitCount = verification.record.base_sha
    ? commitsBetween(workDir, verification.record.base_sha, verification.record.original_sha).length
    : 1;

  setProvenance(workDir, missionId, verification.record);
  const rel = writeEvidence(workDir, missionId, 'provenance', {
    staleness,
    verification: verification.record,
    proven: verification.proven,
    blockers: verification.blockers,
  });
  attachEvidence(workDir, missionId, rel);

  const rec = verification.record;
  const lines = [head(`Provenance — ${missionId}`)];
  if (rec.contribution_range) {
    lines.push(`  Contribution:     ${rec.base_sha?.slice(0, 12)}..${rec.original_sha.slice(0, 12)} (${commitCount} commit(s))`);
  } else {
    lines.push(`  Worker SHA:       ${rec.original_sha.slice(0, 12)}`);
  }
  lines.push(`  Integration SHA:  ${rec.integration_sha?.slice(0, 12) ?? 'unknown'}`);
  lines.push(`  Method:           ${rec.integration_method}`);
  lines.push(`  Stable patch ID:  ${rec.stable_patch_id ?? DIM + 'n/a' + RESET}`);
  lines.push(`  Staleness:        ${statusColor(staleness.classification)} — ${staleness.reason}`);
  lines.push(`  Final tree:       ${statusColor(rec.final_tree_contribution)}`);
  lines.push(`  Manifest:         ${rec.changed_file_manifest.length} file(s)`);
  if (rec.excluded_artifacts?.length) {
    lines.push(`  Excluded:         ${rec.excluded_artifacts.length} self-referential control-plane file(s)`);
    for (const f of rec.excluded_artifacts) lines.push(`    ${DIM}·${RESET} ${f}`);
  }
  lines.push(`  Evidence:         ${rel}`);
  lines.push('');

  if (staleness.colliding_files.length > 0) {
    lines.push(`  ${warn(`Colliding files (${staleness.colliding_files.length}):`)}`);
    for (const f of staleness.colliding_files.slice(0, 10)) lines.push(`    ${YELLOW}·${RESET} ${f}`);
    lines.push('');
  }

  if (verification.proven) {
    lines.push(`  ${ok(`${BOLD}PROVENANCE PASS${RESET} — contribution verified in the integration tree`)}`);
  } else {
    lines.push(`  ${bad(`${BOLD}PROVENANCE BLOCKED${RESET}`)}`);
    for (const b of verification.blockers) lines.push(`    ${RED}·${RESET} ${b}`);
    lines.push('');
    lines.push(`  ${DIM}LOST or UNKNOWN blocks acceptance (§22). Never modify product code to make an obsolete worker fit.${RESET}`);
  }
  lines.push('');
  return lines.join('\n');
}

function handlePublishCheck(workDir: string, args: ParsedArgs): string {
  const missionId = requireMissionId(args.positional, 'publish-check');
  const mission = getMission(workDir, missionId);
  if (!mission) throw new Error(`Mission "${missionId}" is not registered.`);

  const branch = flagString(args.flags, 'branch') ?? readLedger(workDir)?.authoritative_branch ?? 'main';
  const expectedSha = flagString(args.flags, 'sha') ?? mission.integration_sha ?? revParse(workDir, 'HEAD');
  if (!expectedSha) throw new Error('Could not determine the SHA to verify. Pass --sha <sha>.');

  const result = verifyPublication(workDir, {
    branch,
    expectedSha,
    remote: flagString(args.flags, 'remote'),
    missionFiles: mission.provenance?.changed_file_manifest,
    fetch: args.flags['no-fetch'] !== true,
  });

  if (result.verified && result.remote_sha) {
    updateMission(workDir, missionId, (m) => {
      m.published_sha = result.remote_sha!;
      m.published_tree = result.remote_tree ?? undefined;
    });
  }

  const lines = [head(`Remote verification — ${missionId}`)];
  lines.push(`  Remote ref:       ${result.remote_ref}`);
  lines.push(`  Remote SHA:       ${result.remote_sha?.slice(0, 12) ?? bad('missing')}`);
  lines.push(`  Remote tree:      ${result.remote_tree?.slice(0, 12) ?? DIM + 'unknown' + RESET}`);
  lines.push(`  Expected SHA:     ${result.expected_sha.slice(0, 12)}`);
  lines.push(`  Contribution:     ${result.contribution_present ? ok('present') : bad('NOT present')}`);
  lines.push('');

  if (result.verified) {
    lines.push(`  ${ok(`${BOLD}PUBLICATION VERIFIED${RESET}`)}`);
    lines.push(`  ${DIM}published_sha and published_tree recorded. You may now set publication_status=PUBLISHED.${RESET}`);
  } else {
    lines.push(`  ${bad(`${BOLD}PUBLICATION_FAILED${RESET}`)}`);
    for (const b of result.blockers) lines.push(`    ${RED}·${RESET} ${b}`);
    lines.push('');
    lines.push(`  ${DIM}A successful push is not proof of publication (§37).${RESET}`);
  }
  lines.push('');
  return lines.join('\n');
}

function handleSet(workDir: string, args: ParsedArgs): string {
  const missionId = requireMissionId(args.positional, 'set');
  const dimension = args.positional[2];
  const status = args.positional[3];

  if (!dimension || !status) {
    throw new Error(
      `Usage: /mission set <MISSION-ID> <dimension> <STATUS>\n` +
      `  dimensions: ${LEDGER_DIMENSIONS.join(', ')}\n` +
      `  statuses:   ${MISSION_STATUSES.join(', ')}`,
    );
  }
  if (!isLedgerDimension(dimension)) {
    throw new Error(`Unknown dimension "${dimension}". Allowed: ${LEDGER_DIMENSIONS.join(', ')}`);
  }
  if (!isMissionStatus(status)) {
    throw new Error(`Unknown status "${status}". Allowed: ${MISSION_STATUSES.join(', ')}`);
  }

  const force = args.flags.force === true || args.flags.force === 'true';
  const result = setDimension(workDir, missionId, dimension as LedgerDimension, status, { force });

  const lines = [head(`Ledger — ${missionId}`)];
  if (result.accepted) {
    lines.push(`  ${ok(`${result.dimension}: ${result.from} → ${statusColor(result.to)}`)}`);
    if (force && result.blockers.length > 0) {
      lines.push('');
      lines.push(`  ${warn('FORCED despite unproven claims — these are now recorded discrepancies:')}`);
      for (const b of result.blockers) lines.push(`    ${YELLOW}·${RESET} ${b}`);
    }
  } else {
    lines.push(`  ${bad(`Refused: ${result.dimension} stays ${result.from}`)}`);
    lines.push('');
    lines.push(`  ${BOLD}The ledger must never claim more than evidence proves (§30):${RESET}`);
    for (const b of result.blockers) lines.push(`    ${RED}·${RESET} ${b}`);
  }
  lines.push('');
  return lines.join('\n');
}

function handleGap(workDir: string, args: ParsedArgs): string {
  const action = args.positional[1] ?? 'list';

  if (action === 'open') {
    const mission = flagString(args.flags, 'mission');
    const description = flagString(args.flags, 'desc');
    const type = (flagString(args.flags, 'type') ?? 'IMPLEMENTATION') as GapType;
    if (!mission || !description) {
      throw new Error('Usage: /mission gap open --mission <ID> --type <TYPE> --desc "..." [--blocks]');
    }
    const gap = openGap(workDir, {
      mission,
      type,
      description,
      blocks_acceptance: args.flags.blocks === true || args.flags.blocks === 'true',
      evidence: flagList(args.flags, 'evidence'),
    });
    return `\n  ${ok(`${gap.id} opened (${gap.type}${gap.blocks_acceptance ? ', BLOCKS ACCEPTANCE' : ''})`)}\n  ${DIM}${gap.description}${RESET}\n`;
  }

  if (action === 'close') {
    const id = args.positional[2] ?? flagString(args.flags, 'id');
    if (!id) throw new Error('Usage: /mission gap close <GAP-ID>');
    const gap = closeGap(workDir, id);
    return gap
      ? `\n  ${ok(`${gap.id} closed`)}\n`
      : `\n  ${bad(`No gap "${id}" found`)}\n`;
  }

  const doc = readGaps(workDir);
  const gaps = doc.gaps.filter((g) => (args.flags.all === true ? true : g.status === 'OPEN'));
  const lines = [head(`Gaps (${gaps.length})`)];
  if (gaps.length === 0) {
    lines.push(`  ${DIM}No open gaps.${RESET}`);
  } else {
    for (const g of gaps) {
      const icon = g.blocks_acceptance ? bad('') : warn('');
      lines.push(`  ${icon} ${g.id}  ${g.mission.padEnd(16)} ${g.type.padEnd(22)} ${g.description.slice(0, 60)}`);
    }
    lines.push('');
    lines.push(`  ${DIM}UNKNOWN never becomes PASS (§33). Blocking gaps prevent acceptance_status=PASS.${RESET}`);
  }
  lines.push('');
  return lines.join('\n');
}

function handleCollide(args: ParsedArgs): string {
  const a = flagString(args.flags, 'a');
  const b = flagString(args.flags, 'b');
  if (!a || !b) {
    throw new Error('Usage: /mission collide --a "workerA:src/x.ts,src/y.ts" --b "workerB:src/y.ts"');
  }

  const [nameA, filesA = ''] = a.split(':');
  const [nameB, filesB = ''] = b.split(':');

  const report = analyzeCollision(
    nameA,
    filesA.split(',').map((s) => s.trim()).filter(Boolean),
    nameB,
    filesB.split(',').map((s) => s.trim()).filter(Boolean),
    { dependency: args.flags.dependency === true || args.flags.dependency === 'true' },
  );

  const lines = [head(`Collision analysis — ${report.worker_a} × ${report.worker_b}`)];
  lines.push(`  Classification: ${statusColor(report.classification)}`);
  lines.push(`  Shared files:   ${report.shared_files.length}`);
  for (const f of report.shared_files.slice(0, 15)) {
    const isHot = report.hotspots.includes(f);
    lines.push(`    ${isHot ? RED + '!' + RESET : DIM + '·' + RESET} ${f}${isHot ? `  ${RED}architectural hotspot${RESET}` : ''}`);
  }
  lines.push('');
  lines.push(`  ${BOLD}Recommendation${RESET}`);
  lines.push(`  ${report.recommendation}`);
  lines.push('');
  return lines.join('\n');
}

function handleVerify(workDir: string, args: ParsedArgs): string {
  const missionId = requireMissionId(args.positional, 'verify');
  const mission = getMission(workDir, missionId);
  if (!mission) throw new Error(`Mission "${missionId}" is not registered.`);

  const gates = evaluateDod(workDir, missionId, mission);
  const applicable = gates.filter((g) => g.applicable);
  const failed = applicable.filter((g) => !g.passed);

  const lines = [head(`Definition of Done — ${missionId}`)];
  for (const g of gates) {
    if (!g.applicable) {
      lines.push(`  ${DIM}○ ${g.label.padEnd(32)} NOT_APPLICABLE — ${g.detail}${RESET}`);
      continue;
    }
    lines.push(`  ${g.passed ? ok('') : bad('')} ${g.label.padEnd(32)} ${g.detail}`);
  }

  lines.push('');
  lines.push(`  ${BOLD}Lifecycle${RESET}`);
  for (const d of LEDGER_DIMENSIONS) {
    lines.push(`    ${d.padEnd(28)} ${statusColor(mission[d])}`);
  }

  lines.push('');
  lines.push(`  ${BOLD}Disposition:${RESET} ${finalDisposition(mission, failed.length)}`);
  if (failed.length > 0) {
    lines.push(`  ${DIM}${failed.length}/${applicable.length} applicable gate(s) unmet. A worker saying "done" is not evidence (§50).${RESET}`);
  }
  lines.push('');
  return lines.join('\n');
}

function handleReport(workDir: string, args: ParsedArgs): string {
  const missionId = requireMissionId(args.positional, 'report');
  const mission = getMission(workDir, missionId);
  if (!mission) throw new Error(`Mission "${missionId}" is not registered.`);

  const ledger = readLedger(workDir);
  const baseline = classifyBaseline(workDir, { fetch: false });
  const attestations = listAttestations(workDir, missionId);
  const gates = evaluateDod(workDir, missionId, mission);
  const failed = gates.filter((g) => g.applicable && !g.passed);
  const tests = readEvidence<CommandEvidence>(workDir, missionId, 'tests');

  const md: string[] = [];
  md.push(`# ${missionId} — Implementation Report`);
  md.push('');
  md.push(`**${mission.title}**`);
  md.push('');

  md.push('## Baseline');
  md.push('');
  md.push('```text');
  md.push(`Authoritative branch: ${ledger?.authoritative_branch ?? 'unknown'}`);
  md.push(`SHA:                  ${baseline.local_sha ?? 'unknown'}`);
  md.push(`Tree:                 ${baseline.local_tree ?? 'unknown'}`);
  md.push(`Freshness:            ${baseline.freshness}`);
  md.push(`Parallel advancement: ${baseline.advancement}`);
  md.push('```');
  md.push('');

  md.push('## Worker');
  md.push('');
  md.push('```text');
  if (attestations.length === 0) {
    md.push('No attestation recorded — source writes were never authorized (§4)');
  } else {
    for (const a of attestations) {
      md.push(`Agent:       ${a.agent} (${a.worker})`);
      md.push(`Worktree:    ${a.worktree_path}`);
      md.push(`Branch:      ${a.branch ?? 'detached HEAD'}`);
      md.push(`Attestation: ${a.status}${a.blockers.length ? ` — ${a.blockers.join('; ')}` : ''}`);
      md.push('');
    }
  }
  md.push('```');
  md.push('');

  md.push('## Acceptance Criteria');
  md.push('');
  if (mission.acceptance_criteria.length === 0) {
    md.push('_No acceptance-criteria matrix recorded. Every AC must end with a disposition (§5)._');
  } else {
    md.push('| AC | Result | Evidence | Note |');
    md.push('|---|---|---|---|');
    for (const ac of mission.acceptance_criteria) {
      md.push(`| ${ac.id} | ${ac.disposition} | ${ac.evidence.join(', ') || '—'} | ${ac.note ?? ''} |`);
    }
  }
  md.push('');

  md.push('## Validation');
  md.push('');
  md.push('```text');
  if (tests) {
    md.push(`Command:            ${tests.payload.command} ${tests.payload.args.join(' ')}`);
    md.push(`Exit code:          ${tests.payload.exit_code ?? 'null'}`);
    md.push(`Passed/failed:      ${tests.payload.passed ?? '—'} / ${tests.payload.failed ?? '—'}`);
    md.push(`Duration:           ${tests.payload.duration_seconds}s`);
    md.push(`Normal termination: ${tests.payload.normal_termination}`);
    md.push(`Orphans:            ${tests.payload.orphan_check}`);
    md.push(`Raw artifact:       ${tests.payload.raw_artifact}`);
  } else {
    md.push('No test evidence recorded.');
  }
  md.push('```');
  md.push('');

  md.push('## Git');
  md.push('');
  md.push('```text');
  md.push(`Worker SHA:      ${mission.worker_sha ?? 'none — NOT_INTEGRATION_READY'}`);
  md.push(`Stable patch ID: ${mission.stable_patch_id ?? 'not computed'}`);
  md.push(`Integration SHA: ${mission.integration_sha ?? 'not integrated'}`);
  md.push(`Published SHA:   ${mission.published_sha ?? 'not published'}`);
  md.push('```');
  md.push('');

  md.push('## Integration');
  md.push('');
  md.push('```text');
  if (mission.provenance) {
    md.push(`Method:                  ${mission.provenance.integration_method}`);
    md.push(`Final-tree contribution: ${mission.provenance.final_tree_contribution}`);
    md.push(`Manifest:                ${mission.provenance.changed_file_manifest.length} file(s)`);
    md.push(`Verified at:             ${mission.provenance.verified_at_utc}`);
  } else {
    md.push('No provenance record — integration not verified.');
  }
  md.push('```');
  md.push('');

  md.push('## Ledger');
  md.push('');
  md.push('```text');
  for (const d of LEDGER_DIMENSIONS) {
    md.push(`${d.replace(/_status$/, '').padEnd(22)} ${mission[d]}`);
  }
  md.push(`remaining gaps         ${mission.remaining_gaps.length === 0 ? 'none' : mission.remaining_gaps.join(', ')}`);
  md.push('```');
  md.push('');

  md.push('## Evidence');
  md.push('');
  if (mission.evidence.length === 0 && mission.attestations.length === 0) {
    md.push('_No evidence recorded._');
  } else {
    for (const a of mission.attestations) md.push(`- \`${a}\``);
    for (const e of mission.evidence) md.push(`- \`${e}\``);
    if (mission.patch_guide) md.push(`- \`${mission.patch_guide}\``);
  }
  md.push('');

  md.push('## Recommendation');
  md.push('');
  md.push('```text');
  md.push(finalDisposition(mission, failed.length));
  md.push('```');
  md.push('');

  if (failed.length > 0) {
    md.push('### Unmet Definition-of-Done gates');
    md.push('');
    for (const g of failed) md.push(`- **${g.label}** — ${g.detail}`);
    md.push('');
  }

  const out = md.join('\n');
  const outFile = flagString(args.flags, 'out');
  if (outFile) {
    const abs = resolve(workDir, outFile);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, out, 'utf-8');
    return `\n  ${ok(`Report written: ${outFile}`)}\n`;
  }
  return `\n${out}\n`;
}

function handleReconcile(workDir: string): string {
  const discrepancies = reconcileLedger(workDir);
  const lines = [head('Ledger reconciliation')];

  if (discrepancies.length === 0) {
    lines.push(`  ${ok('Ledger claims are substantiated by the repository.')}`);
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`  ${bad(`${discrepancies.length} unsubstantiated claim(s)`)}`);
  lines.push('');
  for (const d of discrepancies) {
    lines.push(`  ${RED}·${RESET} ${d.mission} / ${d.field}`);
    lines.push(`      claims:  ${d.claim}`);
    lines.push(`      reality: ${d.reality}`);
  }
  lines.push('');
  lines.push(`  ${DIM}Truth order §49: the repository tree and immutable evidence outrank the ledger.${RESET}`);
  lines.push(`  ${DIM}The ledger is stale. Correct the ledger — never rewrite reality to match it.${RESET}`);
  lines.push('');
  return lines.join('\n');
}

function handleStatus(workDir: string): string {
  const ledger = readLedger(workDir);
  if (!ledger) {
    return `\n  ${warn('No .ai/ledger.json in this repository.')}\n  ${DIM}Run /mission init <MISSION-ID> --title "..." to start governed tracking.${RESET}\n`;
  }

  const entries = Object.entries(ledger.missions);
  const lines = [head(`Mission ledger — ${ledger.project}`)];
  lines.push(`  Authoritative branch: ${ledger.authoritative_branch}`);
  lines.push(`  Missions:             ${entries.length}`);
  lines.push(`  Updated:              ${ledger.updated_at_utc}`);
  lines.push('');

  if (entries.length === 0) {
    lines.push(`  ${DIM}No missions registered yet.${RESET}`);
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`  ${DIM}${'MISSION'.padEnd(18)}${'IMPL'.padEnd(14)}${'ACCEPT'.padEnd(12)}${'INTEGRATION'.padEnd(22)}${'PUBLICATION'}${RESET}`);
  for (const [id, m] of entries) {
    lines.push(
      `  ${id.padEnd(18)}` +
      `${statusColor(m.implementation_status)}${' '.repeat(Math.max(1, 14 - m.implementation_status.length))}` +
      `${statusColor(m.acceptance_status)}${' '.repeat(Math.max(1, 12 - m.acceptance_status.length))}` +
      `${statusColor(m.integration_status)}${' '.repeat(Math.max(1, 22 - m.integration_status.length))}` +
      `${statusColor(m.publication_status)}`,
    );
  }

  const gaps = openGaps(workDir);
  if (gaps.length > 0) {
    lines.push('');
    lines.push(`  ${warn(`${gaps.length} open gap(s), ${gaps.filter((g) => g.blocks_acceptance).length} blocking acceptance`)}`);
  }
  lines.push('');
  return lines.join('\n');
}

function handleGate(workDir: string, args: ParsedArgs): string {
  const missionId = requireMissionId(args.positional, 'gate');
  const gate = gateOnAttestation(workDir, missionId, flagString(args.flags, 'worker'));
  return gate.allowed
    ? `\n  ${ok(`WRITES AUTHORIZED — ${gate.reason}`)}\n`
    : `\n  ${bad(`WRITES BLOCKED — ${gate.reason}`)}\n`;
}

// ── Execution-plane handlers (MULTI_AGENT_PROTOCOL) ───────────────────────────

function handleAgent(workDir: string, args: ParsedArgs): string {
  const action = args.positional[1] ?? 'list';

  if (action === 'register') {
    const name = args.positional[2] ?? flagString(args.flags, 'name');
    const workItem = flagString(args.flags, 'item');
    if (!name || !workItem) {
      throw new Error('Usage: /mission agent register <name> --item <WORK-ITEM> [--platform p] [--role r] [--mode WRITE] [--worktree path] [--branch b]');
    }

    const modeRaw = (flagString(args.flags, 'mode') ?? 'WRITE').toUpperCase();
    if (modeRaw !== 'WRITE' && modeRaw !== 'READ_ONLY') {
      throw new Error(`Unknown agent mode "${modeRaw}". Allowed: WRITE, READ_ONLY`);
    }

    // Convention: <platform>-<role>-<work-item>. Derive the parts when not given.
    const parts = name.split('-');
    const result = registerAgent(workDir, {
      name,
      platform: flagString(args.flags, 'platform') ?? parts[0] ?? 'unknown',
      role: flagString(args.flags, 'role') ?? parts[1] ?? 'worker',
      workItem,
      mode: modeRaw as AgentMode,
      repository: flagString(args.flags, 'repository'),
      branch: flagString(args.flags, 'branch'),
      worktree: flagString(args.flags, 'worktree'),
      baseSha: flagString(args.flags, 'base'),
    }, { force: args.flags.force === true || args.flags.force === 'true' });

    if (!result.registered) {
      const lines = [head(`Agent registration refused — ${name}`)];
      for (const b of result.blockers) lines.push(`  ${bad(b)}`);
      lines.push('');
      return lines.join('\n');
    }

    // Keep the ledger's execution block in step with the registry.
    if (getMission(workDir, workItem)) {
      setExecutionPlan(workDir, workItem, {
        agent: name,
        branch: result.agent!.branch,
        worktree: result.agent!.worktree,
        base_sha: result.agent!.baseSha,
      });
    }

    const a = result.agent!;
    const lines = [head(`Agent registered — ${a.name}`)];
    lines.push(`  Platform:  ${a.platform}`);
    lines.push(`  Role:      ${a.role}`);
    lines.push(`  Work item: ${a.workItem}`);
    lines.push(`  Mode:      ${a.mode}`);
    lines.push(`  Branch:    ${a.branch ?? DIM + 'none' + RESET}`);
    lines.push(`  Worktree:  ${a.worktree ?? DIM + 'none' + RESET}`);
    lines.push(`  Base SHA:  ${a.baseSha?.slice(0, 12) ?? warn('not resolved')}`);
    if (result.blockers.length > 0) {
      lines.push('');
      lines.push(`  ${warn('FORCED despite:')}`);
      for (const b of result.blockers) lines.push(`    ${YELLOW}·${RESET} ${b}`);
    }
    lines.push('');
    return lines.join('\n');
  }

  if (action === 'release') {
    const name = args.positional[2] ?? flagString(args.flags, 'name');
    if (!name) throw new Error('Usage: /mission agent release <name> [--status COMPLETED|FAILED]');

    const statusRaw = (flagString(args.flags, 'status') ?? 'RELEASED').toUpperCase();
    if (!['COMPLETED', 'RELEASED', 'FAILED'].includes(statusRaw)) {
      throw new Error(`Unknown release status "${statusRaw}". Allowed: COMPLETED, RELEASED, FAILED`);
    }

    // §21 — a worker cannot report clean completion while owned orphans remain.
    const orphans = orphanedProcesses(workDir, name);
    if (orphans.length > 0 && args.flags.force !== true) {
      const lines = [head(`Release refused — ${name}`)];
      lines.push(`  ${bad(`${orphans.length} owned process(es) still running:`)}`);
      for (const o of orphans) lines.push(`    ${RED}·${RESET} pid ${o.pid}  ${o.command} ${o.args.join(' ')}`.slice(0, 110));
      lines.push('');
      lines.push(`  ${DIM}Run /mission proc stop ${name} first. A worker cannot report clean completion${RESET}`);
      lines.push(`  ${DIM}while owned orphan processes remain (§21).${RESET}`);
      lines.push('');
      return lines.join('\n');
    }

    const released = releaseAgent(workDir, name, statusRaw as 'COMPLETED' | 'RELEASED' | 'FAILED');
    return released
      ? `\n  ${ok(`${name} released (${released.status})`)}\n`
      : `\n  ${bad(`No agent "${name}" registered`)}\n`;
  }

  if (action === 'show') {
    const name = args.positional[2];
    if (!name) throw new Error('Usage: /mission agent show <name>');
    const a = readAgent(workDir, name);
    if (!a) return `\n  ${bad(`No agent "${name}" registered`)}\n`;
    return `\n${JSON.stringify(a, null, 2)}\n`;
  }

  const agents = args.flags.all === true ? listAgents(workDir) : activeAgents(workDir);
  const lines = [head(`Agents (${agents.length}${args.flags.all === true ? ' total' : ' active'})`)];

  if (agents.length === 0) {
    lines.push(`  ${DIM}No agents registered. Anonymous subagents are prohibited during orchestrated execution (§8).${RESET}`);
  } else {
    lines.push(`  ${DIM}${'NAME'.padEnd(30)}${'MODE'.padEnd(11)}${'ITEM'.padEnd(14)}${'STATUS'.padEnd(11)}WORKTREE${RESET}`);
    for (const a of agents) {
      lines.push(
        `  ${a.name.padEnd(30)}${a.mode.padEnd(11)}${a.workItem.padEnd(14)}${a.status.padEnd(11)}${a.worktree ?? '—'}`,
      );
    }
  }

  const violations = sharedWorktreeViolations(workDir);
  if (violations.length > 0) {
    lines.push('');
    lines.push(`  ${bad('SHARED WORKTREE VIOLATION — parallel writers never share a working directory (§1 rule 1)')}`);
    for (const v of violations) {
      lines.push(`    ${RED}·${RESET} ${v.worktree}`);
      lines.push(`      claimed by: ${v.agents.join(', ')}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function handlePlan(workDir: string, args: ParsedArgs): string {
  const missionId = args.positional[1];
  if (!missionId) throw new Error('Usage: /mission plan <WORK-ITEM> [--depends "AF-301:HARD,AF-302:SOFT"] [--writes "src/a.ts,src/b.ts"] [--prd P] [--story S]');
  assertMissionId(missionId);

  const dependencies: Dependency[] = flagList(args.flags, 'depends').map((token) => {
    const [on, kindRaw = 'HARD'] = token.split(':');
    const kind = kindRaw.toUpperCase();
    if (!isDependencyKind(kind)) {
      throw new Error(`Dependency "${token}": unknown kind "${kindRaw}". Allowed: ${DEPENDENCY_KINDS.join(', ')}`);
    }
    return { on, kind: kind as DependencyKind };
  });

  const plan: Parameters<typeof setExecutionPlan>[2] = {};
  if (args.flags.depends !== undefined) plan.dependencies = dependencies;
  if (args.flags.writes !== undefined) plan.write_manifest = flagList(args.flags, 'writes');
  if (args.flags.prd !== undefined) plan.prd = flagString(args.flags, 'prd');
  if (args.flags.story !== undefined) plan.story = flagString(args.flags, 'story');
  if (args.flags.wave !== undefined) plan.wave = flagString(args.flags, 'wave');

  const execution = setExecutionPlan(workDir, missionId, plan);

  const lines = [head(`Execution plan — ${missionId}`)];
  lines.push(`  PRD / story:    ${execution.prd ?? '—'} / ${execution.story ?? '—'}`);
  lines.push(`  Status:         ${statusColor(execution.status)}`);
  lines.push(`  Dependencies:   ${execution.dependencies.length === 0 ? DIM + 'none' + RESET : execution.dependencies.map((d) => `${d.on}(${d.kind})`).join(', ')}`);
  lines.push(`  Write manifest: ${execution.write_manifest.length} file(s)`);
  for (const f of execution.write_manifest.slice(0, 15)) lines.push(`    ${DIM}·${RESET} ${f}`);
  lines.push('');

  const verdict = evaluateEligibility(readLedger(workDir)!, missionId);
  lines.push(verdict.eligible
    ? `  ${ok('Wave-eligible')}`
    : `  ${warn('Not wave-eligible:')}`);
  for (const r of verdict.reasons) lines.push(`    ${YELLOW}·${RESET} ${r}`);
  lines.push('');
  return lines.join('\n');
}

function handleWave(workDir: string, args: ParsedArgs): string {
  const action = args.positional[1] ?? 'status';

  if (action === 'plan') {
    const maxItems = flagString(args.flags, 'max') ? parseInt(flagString(args.flags, 'max')!, 10) : undefined;
    const plan = planWave(workDir, { maxItems, only: flagList(args.flags, 'only').length ? flagList(args.flags, 'only') : undefined });

    const lines = [head('Next executable wave')];

    if (plan.cycles.length > 0) {
      lines.push(`  ${bad('Dependency cycle(s) detected — nothing can be scheduled until they are broken:')}`);
      for (const cycle of plan.cycles) lines.push(`    ${RED}·${RESET} ${cycle.join(' → ')}`);
      lines.push('');
      return lines.join('\n');
    }

    lines.push(`  ${BOLD}Dispatch (${plan.items.length})${RESET}`);
    if (plan.items.length === 0) {
      lines.push(`    ${DIM}Nothing is currently eligible.${RESET}`);
    }
    for (const i of plan.items) lines.push(`    ${GREEN}·${RESET} ${i}`);

    if (plan.deferred.length > 0) {
      lines.push('');
      lines.push(`  ${BOLD}Deferred to a later wave (${plan.deferred.length})${RESET}`);
      for (const d of plan.deferred) {
        lines.push(`    ${YELLOW}·${RESET} ${d.workItem}`);
        lines.push(`      ${DIM}${d.reason}${RESET}`);
      }
    }

    if (plan.ineligible.length > 0) {
      lines.push('');
      lines.push(`  ${BOLD}Not eligible (${plan.ineligible.length})${RESET}`);
      for (const v of plan.ineligible) {
        lines.push(`    ${DIM}·${RESET} ${v.workItem}: ${v.reasons[0]}`);
      }
    }

    lines.push('');
    if (plan.items.length > 0) {
      lines.push(`  ${DIM}Dispatch with: /mission wave dispatch WAVE-XX --items ${plan.items.join(',')}${RESET}`);
    }
    lines.push('');
    return lines.join('\n');
  }

  if (action === 'dispatch') {
    const waveId = args.positional[2];
    const items = flagList(args.flags, 'items');
    if (!waveId || items.length === 0) {
      throw new Error('Usage: /mission wave dispatch <WAVE-ID> --items "AF-101,AF-201"');
    }

    const wave = dispatchWave(workDir, waveId, items);
    const lines = [head(`Wave ${waveId} dispatched`)];
    for (const i of wave.items) lines.push(`  ${ok(i)}`);
    lines.push('');
    lines.push(`  ${DIM}One wave runs at a time. Integration is serial and follows dependency order (§24, §33).${RESET}`);
    lines.push('');
    return lines.join('\n');
  }

  if (action === 'complete') {
    const waveId = args.positional[2] ?? readLedger(workDir)?.active_wave;
    if (!waveId) throw new Error('Usage: /mission wave complete <WAVE-ID>');

    const unresolved = completeWave(workDir, waveId);
    if (unresolved.length === 0) {
      return `\n  ${ok(`Wave ${waveId} complete`)}\n`;
    }

    const lines = [head(`Wave ${waveId} cannot close`)];
    lines.push(`  ${bad('No worker may remain ambiguously IN_PROGRESS (§39). Unresolved:')}`);
    for (const id of unresolved) {
      const m = getMission(workDir, id);
      lines.push(`    ${RED}·${RESET} ${id.padEnd(16)} ${m ? statusColor(m.execution.status) : 'unknown'}`);
    }
    lines.push('');
    return lines.join('\n');
  }

  if (action === 'order') {
    const ledger = readLedger(workDir);
    if (!ledger) throw new Error('No ledger. Run /mission init first.');
    const items = flagList(args.flags, 'items').length
      ? flagList(args.flags, 'items')
      : (ledger.active_wave ? ledger.waves[ledger.active_wave]?.items ?? [] : []);

    const ordered = integrationOrder(ledger, items);
    const lines = [head('Serial integration order (§33)')];
    ordered.forEach((id, i) => lines.push(`  ${String(i + 1).padStart(2)}. ${id}`));
    lines.push('');
    lines.push(`  ${DIM}Integration order follows dependencies, not worker completion time.${RESET}`);
    lines.push('');
    return lines.join('\n');
  }

  const summary = orchestrationSummary(workDir);
  const lines = [head('Orchestration status')];
  lines.push(`  Active wave:   ${summary.active_wave ?? DIM + 'none' + RESET}`);
  lines.push(`  Baseline SHA:  ${summary.baseline_sha?.slice(0, 12) ?? DIM + 'not recorded' + RESET}`);
  lines.push(`  Active agents: ${summary.active_agents}`);

  if (summary.unresolved_items.length > 0) {
    lines.push('');
    lines.push(`  ${BOLD}Unresolved in the active wave${RESET}`);
    for (const id of summary.unresolved_items) {
      const m = getMission(workDir, id);
      lines.push(`    ${YELLOW}·${RESET} ${id.padEnd(16)} ${m ? statusColor(m.execution.status) : ''}`);
    }
  }
  if (summary.shared_worktree_violations.length > 0) {
    lines.push('');
    lines.push(`  ${bad('Shared worktree violation(s):')}`);
    for (const v of summary.shared_worktree_violations) {
      lines.push(`    ${RED}·${RESET} ${v.worktree} — ${v.agents.join(', ')}`);
    }
  }
  if (summary.dangling_dependencies.length > 0) {
    lines.push('');
    lines.push(`  ${warn('Dangling dependencies (unknown work items are not assumed away, §6):')}`);
    for (const d of summary.dangling_dependencies) lines.push(`    ${YELLOW}·${RESET} ${d.from} → ${d.to}`);
  }
  if (summary.cycles.length > 0) {
    lines.push('');
    lines.push(`  ${bad('Dependency cycle(s):')}`);
    for (const c of summary.cycles) lines.push(`    ${RED}·${RESET} ${c.join(' → ')}`);
  }
  lines.push('');
  return lines.join('\n');
}

function handleExec(workDir: string, args: ParsedArgs): string {
  const missionId = requireMissionId(args.positional, 'exec');
  const status = args.positional[2];

  if (!status) {
    throw new Error(`Usage: /mission exec <WORK-ITEM> <STATUS>\n  statuses: ${EXECUTION_STATUSES.join(', ')}`);
  }
  if (!isExecutionStatus(status)) {
    throw new Error(`Unknown execution status "${status}". Allowed: ${EXECUTION_STATUSES.join(', ')}`);
  }

  const force = args.flags.force === true || args.flags.force === 'true';
  const result = setExecutionStatus(workDir, missionId, status as ExecutionStatus, { force });

  const lines = [head(`Execution — ${missionId}`)];
  if (result.accepted) {
    lines.push(`  ${ok(`${result.from} → ${statusColor(result.to)}`)}`);
    if (force && result.blockers.length > 0) {
      lines.push('');
      lines.push(`  ${warn('FORCED despite:')}`);
      for (const b of result.blockers) lines.push(`    ${YELLOW}·${RESET} ${b}`);
    }
  } else {
    lines.push(`  ${bad(`Refused: stays ${result.from}`)}`);
    for (const b of result.blockers) lines.push(`    ${RED}·${RESET} ${b}`);
  }
  lines.push('');
  return lines.join('\n');
}

function handleBlock(workDir: string, args: ParsedArgs): string {
  const missionId = requireMissionId(args.positional, 'block');

  if (args.flags.clear === true) {
    clearBlockers(workDir, missionId);
    return `\n  ${ok(`Blockers cleared for ${missionId}`)}\n`;
  }

  const code = args.positional[2];
  const detail = flagString(args.flags, 'detail') ?? '';
  if (!code) {
    throw new Error(`Usage: /mission block <WORK-ITEM> <CODE> --detail "..."\n  codes: ${FAILURE_CODES.join(', ')}`);
  }
  if (!isFailureCode(code)) {
    throw new Error(`Unknown failure code "${code}". Allowed: ${FAILURE_CODES.join(', ')}`);
  }

  recordBlocker(workDir, missionId, code as FailureCode, detail);
  return `\n  ${ok(`${missionId} blocked: ${code}`)}\n  ${DIM}Failures are recorded, not disguised as partial success (§35).${RESET}\n`;
}

function handleCatalog(workDir: string, args: ParsedArgs): string {
  const action = args.positional[1] ?? 'list';

  if (action === 'add') {
    const name = args.positional[2] ?? flagString(args.flags, 'name');
    const repository = flagString(args.flags, 'repository') ?? workDir;
    if (!name) {
      throw new Error('Usage: /mission catalog add <app> --repository <path> --service "frontend:frontend:4200" --service "backend:backend:5063,7024"');
    }

    // --service name:path:port,port  (repeatable via comma-separated --services)
    const specs = [
      ...(typeof args.flags.service === 'string' ? [args.flags.service] : []),
      ...flagList(args.flags, 'services'),
    ];
    const services = specs.map((spec) => {
      const [svcName, svcPath = '.', portsRaw = ''] = spec.split(':');
      if (!svcName) throw new Error(`Malformed --service "${spec}". Expected name:path:port[,port]`);
      return {
        name: svcName,
        path: svcPath,
        ports: portsRaw.split(',').map((p) => parseInt(p.trim(), 10)).filter((n) => Number.isInteger(n)),
      };
    });

    const catalog = upsertApplication(workDir, { name, repository, services });
    const conflicts = detectPortConflicts(catalog);

    const lines = [head(`Catalog — ${name}`)];
    lines.push(`  Repository: ${repository}`);
    for (const svc of services) {
      lines.push(`  ${ok(`${svc.name.padEnd(12)} ${svc.path.padEnd(20)} ports ${svc.ports.join(', ') || '—'}`)}`);
    }
    if (conflicts.length > 0) {
      lines.push('');
      lines.push(`  ${bad('PORT_CONFLICT:')}`);
      for (const c of conflicts) lines.push(`    ${RED}·${RESET} port ${c.port} claimed by ${c.claimants.join(', ')}`);
    }
    lines.push('');
    return lines.join('\n');
  }

  if (action === 'port') {
    const port = parseInt(args.positional[2] ?? '', 10);
    if (!Number.isInteger(port)) throw new Error('Usage: /mission catalog port <number>');
    const found = serviceForPort(readCatalog(workDir), port);
    return found
      ? `\n  ${ok(`Port ${port} → ${found.application}/${found.service.name} (${found.service.path})`)}\n`
      : `\n  ${warn(`Port ${port} is not claimed in the catalog`)}\n`;
  }

  const catalog = readCatalog(workDir);
  const lines = [head(`Application catalog (${catalog.applications.length})`)];

  if (catalog.applications.length === 0) {
    lines.push(`  ${DIM}Empty. Agents must consult the catalog before starting or killing services (§19).${RESET}`);
  }
  for (const app of catalog.applications) {
    lines.push(`  ${BOLD}${app.name}${RESET}  ${DIM}${app.repository}${RESET}`);
    for (const svc of app.services) {
      lines.push(`    ${svc.name.padEnd(12)} ${svc.path.padEnd(20)} ports ${svc.ports.join(', ') || '—'}`);
    }
  }

  const conflicts = detectPortConflicts(catalog);
  if (conflicts.length > 0) {
    lines.push('');
    lines.push(`  ${bad('PORT_CONFLICT:')}`);
    for (const c of conflicts) lines.push(`    ${RED}·${RESET} port ${c.port} claimed by ${c.claimants.join(', ')}`);
  }
  lines.push('');
  return lines.join('\n');
}

async function handleProc(workDir: string, args: ParsedArgs): Promise<string> {
  const action = args.positional[1] ?? 'list';

  if (action === 'register') {
    const pid = parseInt(flagString(args.flags, 'pid') ?? '', 10);
    const agent = flagString(args.flags, 'agent');
    const workItem = flagString(args.flags, 'item');
    const command = flagString(args.flags, 'command');
    if (!Number.isInteger(pid) || !agent || !workItem || !command) {
      throw new Error('Usage: /mission proc register --pid N --agent <name> --item <WORK-ITEM> --command "npm run dev" [--ports 4200]');
    }

    const [cmd, ...cmdArgs] = command.split(/\s+/);
    const record = registerProcess(workDir, {
      pid, command: cmd, args: cmdArgs,
      cwd: flagString(args.flags, 'cwd') ?? workDir,
      ports: flagList(args.flags, 'ports').map((p) => parseInt(p, 10)).filter(Number.isInteger),
      agent, workItem,
    });

    const lines = [head(`Process registered — pid ${record.pid}`)];
    lines.push(`  Owner:    ${record.agent} (${record.workItem})`);
    lines.push(`  Command:  ${record.command} ${record.args.join(' ')}`);
    lines.push(`  Ports:    ${record.ports.join(', ') || '—'}`);
    lines.push(`  Identity: ${record.identity ? ok('captured') : warn('not captured — cleanup will refuse to signal this PID')}`);
    lines.push('');
    return lines.join('\n');
  }

  if (action === 'stop') {
    const agent = args.positional[2] ?? flagString(args.flags, 'agent');
    if (!agent) throw new Error('Usage: /mission proc stop <agent> [--force]');

    const outcomes = await stopOwnedProcesses(workDir, agent, {
      force: args.flags.force === true || args.flags.force === 'true',
    });

    const lines = [head(`Stopping processes owned by ${agent}`)];
    if (outcomes.length === 0) lines.push(`  ${DIM}No processes recorded for this agent.${RESET}`);
    for (const o of outcomes) {
      const icon = o.result === 'stopped' ? ok('') : o.result === 'already-exited' ? `${DIM}○${RESET}` : o.result === 'refused' ? warn('') : bad('');
      lines.push(`  ${icon} pid ${String(o.pid).padEnd(8)} ${o.result.padEnd(15)} ${o.command.padEnd(14)} ${o.detail}`);
    }
    lines.push('');
    lines.push(`  ${DIM}Ownership is verified before any signal. Broad machine-wide killing is prohibited (§21).${RESET}`);
    lines.push('');
    return lines.join('\n');
  }

  if (action === 'prune') {
    const agent = args.positional[2] ?? flagString(args.flags, 'agent');
    if (!agent) throw new Error('Usage: /mission proc prune <agent>');
    const removed = pruneProcessRecords(workDir, agent);
    return `\n  ${ok(`${removed} stopped record(s) pruned`)}\n`;
  }

  if (action === 'orphans') {
    const orphans = orphanedProcesses(workDir, flagString(args.flags, 'agent'));
    const lines = [head(`Orphaned processes (${orphans.length})`)];
    if (orphans.length === 0) {
      lines.push(`  ${ok('None. No owned process outlived its agent.')}`);
    }
    for (const o of orphans) {
      lines.push(`  ${bad(`pid ${String(o.pid).padEnd(8)} ${o.agent.padEnd(28)} ${o.command} ${o.args.join(' ')}`.slice(0, 110))}`);
    }
    lines.push('');
    return lines.join('\n');
  }

  const agent = flagString(args.flags, 'agent');
  const records = agent ? listProcesses(workDir, agent) : listAllProcesses(workDir);
  const lines = [head(`Owned processes (${records.length})`)];

  if (records.length === 0) {
    lines.push(`  ${DIM}None recorded. Every process an agent starts must have an owner (§20).${RESET}`);
  } else {
    lines.push(`  ${DIM}${'PID'.padEnd(9)}${'STATUS'.padEnd(10)}${'ALIVE'.padEnd(7)}${'OWNER'.padEnd(28)}COMMAND${RESET}`);
    for (const r of records) {
      const alive = isProcessAlive(r.pid);
      const safety = alive ? verifyProcessOwnership(r) : { safe: false, reason: 'exited' };
      lines.push(
        `  ${String(r.pid).padEnd(9)}${r.status.padEnd(10)}${(alive ? 'yes' : 'no').padEnd(7)}${r.agent.padEnd(28)}${r.command} ${r.args.join(' ')}`.slice(0, 130),
      );
      if (alive && !safety.safe) {
        lines.push(`    ${warn(safety.reason)}`);
      }
    }
  }
  lines.push('');
  return lines.join('\n');
}

function handleIntegrate(workDir: string, args: ParsedArgs): string {
  const missionId = requireMissionId(args.positional, 'integrate');
  const mission = getMission(workDir, missionId);
  if (!mission) throw new Error(`Mission "${missionId}" is not registered.`);
  if (!mission.provenance) {
    throw new Error(`No provenance record for ${missionId}. Run \`/mission provenance ${missionId} --integration <ref>\` first (§33).`);
  }

  const integrationSha = mission.provenance.integration_sha;
  if (!integrationSha) throw new Error(`Provenance for ${missionId} has no integration SHA.`);

  recordIntegration(workDir, {
    work_item: missionId,
    wave: mission.execution.wave,
    integration_sha: integrationSha,
    method: mission.provenance.integration_method,
    resulting_baseline_sha: flagString(args.flags, 'baseline') ?? revParse(workDir, 'HEAD') ?? undefined,
  });

  const transition = setExecutionStatus(workDir, missionId, 'INTEGRATED', {
    force: args.flags.force === true || args.flags.force === 'true',
  });

  const lines = [head(`Integration recorded — ${missionId}`)];
  lines.push(`  Integration SHA: ${integrationSha.slice(0, 12)}`);
  lines.push(`  Method:          ${mission.provenance.integration_method}`);
  lines.push(`  Final tree:      ${statusColor(mission.provenance.final_tree_contribution)}`);
  lines.push('');
  if (transition.accepted) {
    lines.push(`  ${ok(`Execution status → INTEGRATED`)}`);
  } else {
    lines.push(`  ${bad('Execution status NOT advanced:')}`);
    for (const b of transition.blockers) lines.push(`    ${RED}·${RESET} ${b}`);
  }
  lines.push('');
  return lines.join('\n');
}

function handleBaselineSet(workDir: string, args: ParsedArgs): string {
  const ledger = readLedger(workDir);
  if (!ledger) throw new Error('No ledger. Run /mission init first.');

  const branch = flagString(args.flags, 'branch') ?? currentBranch(workDir) ?? ledger.authoritative_branch;
  const sha = flagString(args.flags, 'sha') ?? revParse(workDir, branch) ?? revParse(workDir, 'HEAD');
  if (!sha) throw new Error(`Could not resolve a SHA for "${branch}".`);

  setBaseline(workDir, { branch, sha, tree: treeSha(workDir, sha) ?? undefined });
  return `\n  ${ok(`Baseline recorded: ${branch} @ ${sha.slice(0, 12)}`)}\n  ${DIM}The ledger holds the exact SHA, never a moving branch name (§11).${RESET}\n`;
}

function usage(): string {
  return [
    head('Governed Development Mission Protocol'),
    '  Implement → Test → Iterate → Validate → Evidence → Integrate → Publish',
    '',
    `  ${BOLD}Setup${RESET}`,
    '    /mission init <ID> --title "..."          Register mission, scaffold .ai/',
    '    /mission attest <ID> --worker w --agent claude   Prove the worker environment',
    '    /mission gate <ID>                        Are source writes authorized?',
    '',
    `  ${BOLD}Baseline & integration${RESET}`,
    '    /mission baseline [--fetch] [--expect sha]',
    '    /mission collide --a "w1:f1,f2" --b "w2:f2"',
    '    /mission commit <ID> [--sha HEAD] [--base <ref>]   Worker SHA + patch ID',
    '    /mission provenance <ID> --integration <ref> [--base <ref>]',
    '    /mission publish-check <ID> --branch main --sha <sha>',
    '',
    `  ${BOLD}Evidence & acceptance${RESET}`,
    '    /mission evidence <ID> --kind tests --run "npm test" [--cwd sf_cli]',
    '    /mission evidence <ID> --kind security --file report.json',
    '    /mission ac <ID> --file criteria.json',
    '    /mission gap open --mission <ID> --type EVIDENCE --desc "..." [--blocks]',
    '    /mission gap list | /mission gap close <GAP-ID>',
    '',
    `  ${BOLD}Multi-agent orchestration${RESET}`,
    '    /mission set-baseline [--branch main]      Pin the exact baseline SHA',
    '    /mission plan <ID> --depends "A:HARD,B:SOFT" --writes "src/a.ts"',
    '    /mission agent register <name> --item <ID> --worktree <path> --mode WRITE',
    '    /mission agent list [--all] | agent release <name>',
    '    /mission wave plan [--max N]              Next collision-free wave',
    '    /mission wave dispatch WAVE-01 --items "A,B"',
    '    /mission wave order | wave complete | wave status',
    '    /mission exec <ID> <EXECUTION-STATUS>     PLANNED…VERIFIED',
    '    /mission block <ID> <FAILURE-CODE> --detail "..."',
    '    /mission integrate <ID>                   Record integration + advance status',
    '',
    `  ${BOLD}Runtime ownership${RESET}`,
    '    /mission catalog add <app> --service "frontend:frontend:4200"',
    '    /mission catalog list | catalog port 4200',
    '    /mission proc register --pid N --agent <a> --item <ID> --command "npm run dev"',
    '    /mission proc list | proc orphans | proc stop <agent> [--force]',
    '',
    `  ${BOLD}Ledger${RESET}`,
    '    /mission set <ID> <dimension> <STATUS> [--force]',
    '    /mission verify <ID>                      Definition-of-Done gate',
    '    /mission report <ID> [--out path.md]      Structured final report',
    '    /mission reconcile                        Ledger vs. repository truth',
    '    /mission status                           Ledger overview',
    '',
    `  ${DIM}A commit is not acceptance. An integration is not a publication.${RESET}`,
    `  ${DIM}A publication without remote verification is not proven.${RESET}`,
    `  ${DIM}Parallel implementation is not parallel merging.${RESET}`,
    '',
  ].join('\n');
}

// ── Command ───────────────────────────────────────────────────────────────────

export const missionCommand: SlashCommand = {
  name: 'mission',
  description: 'Governed mission protocol — ledger, attestation, evidence, provenance, waves, agents, processes',
  usage: '/mission <init|attest|gate|baseline|set-baseline|evidence|ac|commit|provenance|publish-check|set|gap|collide|verify|report|reconcile|status|plan|agent|wave|exec|block|integrate|catalog|proc>',

  execute: async (rawArgs: string, session: SessionContext): Promise<string> => {
    const args = parseArgs(rawArgs);
    const sub = args.positional[0] ?? 'status';

    // The `.ai/` control plane belongs to the repository, not to whichever package
    // directory the session happens to sit in. Resolving to the git top level means
    // `/mission` behaves identically from a monorepo package and from the root.
    const workDir = topLevel(session.workDir) ?? session.workDir;

    try {
      if (sub !== 'status' && sub !== 'help' && !isGitRepo(workDir)) {
        return `\n  ${bad('Not a git repository.')}\n  ${DIM}Governed missions require git provenance — the ledger is meaningless without it.${RESET}\n`;
      }

      switch (sub) {
        case 'init':          return handleInit(workDir, args);
        case 'attest':        return handleAttest(workDir, args);
        case 'gate':          return handleGate(workDir, args);
        case 'baseline':      return handleBaseline(workDir, args);
        case 'evidence':      return await handleEvidence(workDir, args);
        case 'ac':            return handleAc(workDir, args);
        case 'commit':        return handleCommit(workDir, args);
        case 'provenance':    return handleProvenance(workDir, args);
        case 'publish-check': return handlePublishCheck(workDir, args);
        case 'set':           return handleSet(workDir, args);
        case 'gap':           return handleGap(workDir, args);
        case 'collide':       return handleCollide(args);
        case 'verify':        return handleVerify(workDir, args);
        case 'report':        return handleReport(workDir, args);
        case 'reconcile':     return handleReconcile(workDir);
        case 'status':        return handleStatus(workDir);
        case 'agent':         return handleAgent(workDir, args);
        case 'plan':          return handlePlan(workDir, args);
        case 'wave':          return handleWave(workDir, args);
        case 'exec':          return handleExec(workDir, args);
        case 'block':         return handleBlock(workDir, args);
        case 'catalog':       return handleCatalog(workDir, args);
        case 'proc':          return await handleProc(workDir, args);
        case 'integrate':     return handleIntegrate(workDir, args);
        case 'set-baseline':  return handleBaselineSet(workDir, args);
        case 'help':          return usage();
        default:
          return `\n  ${bad(`Unknown subcommand "${sub}"`)}\n${usage()}`;
      }
    } catch (err) {
      // Failures are reported with the exact next action, never as a vague excuse (§40).
      return `\n  ${bad(err instanceof Error ? err.message : String(err))}\n`;
    }
  },
};
