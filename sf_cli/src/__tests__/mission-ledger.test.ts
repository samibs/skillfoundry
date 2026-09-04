import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  initAiTree, initLedger, readLedger, upsertMission, getMission, updateMission,
  setDimension, attachEvidence, setAcceptanceCriteria, setProvenance,
  openGap, closeGap, openGaps, readGaps, reconcileLedger,
  assertMissionId, isMissionStatus, isLedgerDimension,
  MISSION_STATUSES, LEDGER_DIMENSIONS,
  type AcceptanceCriterion,
} from '../core/mission-ledger.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

let tmp: string;

/** Write a file under the temp repo and return its repo-relative path. */
function touch(rel: string, content = '{}'): string {
  const abs = join(tmp, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content, 'utf-8');
  return rel;
}

/** Drive a mission to the point where acceptance PASS is provable. */
function missionReadyForAcceptance(id = 'STORY-001'): void {
  initLedger(tmp, 'demo', 'main');
  upsertMission(tmp, id, 'Demo mission');
  const guide = touch(`.ai/patches/${id}.md`, '# guide');
  const evidence = touch(`.ai/evidence/${id}/tests.json`, '{"payload":{}}');
  updateMission(tmp, id, (m) => {
    m.worker_sha = 'a'.repeat(40);
    m.patch_guide = guide;
  });
  attachEvidence(tmp, id, evidence);
  setAcceptanceCriteria(tmp, id, [
    { id: 'AC1', requirement: 'It works', disposition: 'PASS', evidence: [evidence] },
  ]);
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'sf-mission-ledger-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('mission id validation', () => {
  it('accepts conventional story ids', () => {
    expect(() => assertMissionId('STORY-001')).not.toThrow();
    expect(() => assertMissionId('AF-307.lifecycle')).not.toThrow();
  });

  it('rejects ids that would escape the artifact directory', () => {
    expect(() => assertMissionId('../etc/passwd')).toThrow(/Invalid mission ID/);
    expect(() => assertMissionId('a/b')).toThrow(/Invalid mission ID/);
    expect(() => assertMissionId('')).toThrow(/Invalid mission ID/);
  });
});

describe('taxonomy guards', () => {
  it('recognises every declared status and dimension', () => {
    for (const s of MISSION_STATUSES) expect(isMissionStatus(s)).toBe(true);
    for (const d of LEDGER_DIMENSIONS) expect(isLedgerDimension(d)).toBe(true);
  });

  it('rejects ad-hoc statuses', () => {
    expect(isMissionStatus('DONE')).toBe(false);
    expect(isMissionStatus('mostly-working')).toBe(false);
  });
});

describe('initialisation', () => {
  it('creates the artifact tree without empty placeholder files', () => {
    const dirs = initAiTree(tmp);
    for (const d of dirs) expect(existsSync(d)).toBe(true);
    expect(existsSync(join(tmp, '.ai', 'ledger.json'))).toBe(false);
  });

  it('starts every lifecycle dimension at NOT_STARTED', () => {
    initLedger(tmp, 'demo', 'main');
    const mission = upsertMission(tmp, 'STORY-001', 'Demo');
    for (const d of LEDGER_DIMENSIONS) expect(mission[d]).toBe('NOT_STARTED');
  });

  it('is idempotent — re-init keeps existing missions', () => {
    initLedger(tmp, 'demo', 'main');
    upsertMission(tmp, 'STORY-001', 'Demo');
    initLedger(tmp, 'other-name', 'develop');
    const ledger = readLedger(tmp)!;
    expect(ledger.project).toBe('demo');
    expect(ledger.missions['STORY-001']).toBeDefined();
  });

  it('throws on a corrupt ledger rather than silently replacing it', () => {
    initAiTree(tmp);
    writeFileSync(join(tmp, '.ai', 'ledger.json'), '{ not json', 'utf-8');
    expect(() => readLedger(tmp)).toThrow(/corrupt/);
  });
});

describe('dimension legality', () => {
  beforeEach(() => {
    initLedger(tmp, 'demo', 'main');
    upsertMission(tmp, 'STORY-001', 'Demo');
  });

  it('refuses a status that belongs to another phase', () => {
    expect(() => setDimension(tmp, 'STORY-001', 'implementation_status', 'PUBLISHED'))
      .toThrow(/not valid for implementation_status/);
    expect(() => setDimension(tmp, 'STORY-001', 'publication_status', 'PASS'))
      .toThrow(/not valid for publication_status/);
  });

  it('allows in-flight statuses without evidence', () => {
    const r = setDimension(tmp, 'STORY-001', 'implementation_status', 'IN_PROGRESS');
    expect(r.accepted).toBe(true);
    expect(getMission(tmp, 'STORY-001')!.implementation_status).toBe('IN_PROGRESS');
  });
});

describe('evidence-gated promotion (§30)', () => {
  it('refuses implementation COMPLETE without a worker commit', () => {
    initLedger(tmp, 'demo', 'main');
    upsertMission(tmp, 'STORY-001', 'Demo');

    const r = setDimension(tmp, 'STORY-001', 'implementation_status', 'COMPLETE');
    expect(r.accepted).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/worker_sha/);
    expect(getMission(tmp, 'STORY-001')!.implementation_status).toBe('NOT_STARTED');
  });

  it('refuses implementation COMPLETE when the patch guide is missing', () => {
    initLedger(tmp, 'demo', 'main');
    upsertMission(tmp, 'STORY-001', 'Demo');
    updateMission(tmp, 'STORY-001', (m) => { m.worker_sha = 'a'.repeat(40); });

    const r = setDimension(tmp, 'STORY-001', 'implementation_status', 'COMPLETE');
    expect(r.accepted).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/patch guide/);
  });

  it('accepts implementation COMPLETE once commit and guide both exist', () => {
    missionReadyForAcceptance();
    const r = setDimension(tmp, 'STORY-001', 'implementation_status', 'COMPLETE');
    expect(r.accepted).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('refuses acceptance PASS with no evidence on disk', () => {
    initLedger(tmp, 'demo', 'main');
    upsertMission(tmp, 'STORY-001', 'Demo');
    const r = setDimension(tmp, 'STORY-001', 'acceptance_status', 'PASS');
    expect(r.accepted).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/at least one evidence file/);
  });

  it('refuses acceptance PASS while any AC is unsatisfied', () => {
    missionReadyForAcceptance();
    setAcceptanceCriteria(tmp, 'STORY-001', [
      { id: 'AC1', requirement: 'works', disposition: 'PASS', evidence: [] },
      { id: 'AC2', requirement: 'also works', disposition: 'IMPLEMENTATION_GAP', evidence: [] },
    ]);
    const r = setDimension(tmp, 'STORY-001', 'acceptance_status', 'PASS');
    expect(r.accepted).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/AC2=IMPLEMENTATION_GAP/);
  });

  it('refuses acceptance PASS while a blocking gap is open', () => {
    missionReadyForAcceptance();
    openGap(tmp, {
      mission: 'STORY-001', type: 'EXTERNAL_VALIDATION',
      description: 'Needs staging run', blocks_acceptance: true,
    });
    const r = setDimension(tmp, 'STORY-001', 'acceptance_status', 'PASS');
    expect(r.accepted).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/GAP-001/);
  });

  it('accepts acceptance PASS once the gap is closed', () => {
    missionReadyForAcceptance();
    const gap = openGap(tmp, {
      mission: 'STORY-001', type: 'EVIDENCE', description: 'x', blocks_acceptance: true,
    });
    expect(setDimension(tmp, 'STORY-001', 'acceptance_status', 'PASS').accepted).toBe(false);
    closeGap(tmp, gap.id);
    expect(setDimension(tmp, 'STORY-001', 'acceptance_status', 'PASS').accepted).toBe(true);
  });

  it('blocks INTEGRATION_VALIDATED when the contribution is LOST', () => {
    missionReadyForAcceptance();
    setDimension(tmp, 'STORY-001', 'acceptance_status', 'PASS');
    setProvenance(tmp, 'STORY-001', {
      original_sha: 'a'.repeat(40),
      integration_sha: 'b'.repeat(40),
      integration_method: 'DIRECT_ANCESTRY',
      changed_file_manifest: ['src/x.ts'],
      final_tree_contribution: 'LOST',
      verified_at_utc: new Date().toISOString(),
    });
    const r = setDimension(tmp, 'STORY-001', 'integration_status', 'INTEGRATION_VALIDATED');
    expect(r.accepted).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/final_tree_contribution=LOST/);
  });

  it('blocks PUBLISHED until integration is validated and the remote is verified', () => {
    missionReadyForAcceptance();
    const r = setDimension(tmp, 'STORY-001', 'publication_status', 'PUBLISHED');
    expect(r.accepted).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/published_sha/);
    expect(r.blockers.join(' ')).toMatch(/INTEGRATION_VALIDATED/);
  });

  it('walks the full lifecycle to PUBLISHED when every proof exists', () => {
    missionReadyForAcceptance();
    expect(setDimension(tmp, 'STORY-001', 'implementation_status', 'COMPLETE').accepted).toBe(true);
    expect(setDimension(tmp, 'STORY-001', 'acceptance_status', 'PASS').accepted).toBe(true);

    setProvenance(tmp, 'STORY-001', {
      original_sha: 'a'.repeat(40),
      integration_sha: 'b'.repeat(40),
      integration_method: 'PROVEN_PATCH_EQUIVALENT_CHERRY_PICK',
      changed_file_manifest: ['src/x.ts'],
      final_tree_contribution: 'PRESERVED',
      verified_at_utc: new Date().toISOString(),
    });
    expect(setDimension(tmp, 'STORY-001', 'integration_status', 'INTEGRATION_VALIDATED').accepted).toBe(true);

    updateMission(tmp, 'STORY-001', (m) => {
      m.published_sha = 'c'.repeat(40);
      m.published_tree = 'd'.repeat(40);
    });
    expect(setDimension(tmp, 'STORY-001', 'publication_status', 'PUBLISHED').accepted).toBe(true);
  });

  it('records forced promotions along with the claims they bypassed', () => {
    initLedger(tmp, 'demo', 'main');
    upsertMission(tmp, 'STORY-001', 'Demo');
    const r = setDimension(tmp, 'STORY-001', 'implementation_status', 'COMPLETE', { force: true });
    expect(r.accepted).toBe(true);
    expect(r.blockers.length).toBeGreaterThan(0);
    expect(getMission(tmp, 'STORY-001')!.implementation_status).toBe('COMPLETE');
  });
});

describe('evidence attachment', () => {
  beforeEach(() => {
    initLedger(tmp, 'demo', 'main');
    upsertMission(tmp, 'STORY-001', 'Demo');
  });

  it('refuses a dangling evidence reference', () => {
    expect(() => attachEvidence(tmp, 'STORY-001', '.ai/evidence/STORY-001/nope.json'))
      .toThrow(/does not exist/);
  });

  it('refuses a path outside the repository', () => {
    expect(() => attachEvidence(tmp, 'STORY-001', '../../etc/hosts'))
      .toThrow(/escapes the repository/);
  });

  it('stores a repo-relative path and de-duplicates', () => {
    const rel = touch('.ai/evidence/STORY-001/tests.json');
    attachEvidence(tmp, 'STORY-001', rel);
    attachEvidence(tmp, 'STORY-001', join(tmp, rel));
    expect(getMission(tmp, 'STORY-001')!.evidence).toEqual([rel]);
  });
});

describe('acceptance criteria', () => {
  it('rejects a disposition outside the controlled vocabulary', () => {
    initLedger(tmp, 'demo', 'main');
    upsertMission(tmp, 'STORY-001', 'Demo');
    const bad = [{ id: 'AC1', requirement: 'x', disposition: 'probably fine', evidence: [] }];
    expect(() => setAcceptanceCriteria(tmp, 'STORY-001', bad as unknown as AcceptanceCriterion[]))
      .toThrow(/unknown disposition/);
  });
});

describe('gaps', () => {
  beforeEach(() => {
    initLedger(tmp, 'demo', 'main');
    upsertMission(tmp, 'STORY-001', 'Demo');
  });

  it('assigns sequential ids and links gaps to the mission', () => {
    const g1 = openGap(tmp, { mission: 'STORY-001', type: 'EVIDENCE', description: 'a', blocks_acceptance: true });
    const g2 = openGap(tmp, { mission: 'STORY-001', type: 'SECURITY', description: 'b', blocks_acceptance: false });
    expect(g1.id).toBe('GAP-001');
    expect(g2.id).toBe('GAP-002');
    expect(getMission(tmp, 'STORY-001')!.remaining_gaps).toEqual(['GAP-001', 'GAP-002']);
  });

  it('unlinks a gap from the mission when closed', () => {
    const g = openGap(tmp, { mission: 'STORY-001', type: 'EVIDENCE', description: 'a', blocks_acceptance: true });
    closeGap(tmp, g.id);
    expect(getMission(tmp, 'STORY-001')!.remaining_gaps).toEqual([]);
    expect(openGaps(tmp, 'STORY-001')).toEqual([]);
    expect(readGaps(tmp).gaps[0].status).toBe('CLOSED');
  });

  it('returns null for an unknown gap id', () => {
    expect(closeGap(tmp, 'GAP-999')).toBeNull();
  });
});

describe('reconciliation (§49)', () => {
  it('reports nothing when every claim is substantiated', () => {
    missionReadyForAcceptance();
    setDimension(tmp, 'STORY-001', 'implementation_status', 'COMPLETE');
    expect(reconcileLedger(tmp)).toEqual([]);
  });

  it('flags a terminal status whose evidence has since vanished', () => {
    missionReadyForAcceptance();
    setDimension(tmp, 'STORY-001', 'implementation_status', 'COMPLETE');
    rmSync(join(tmp, '.ai', 'patches', 'STORY-001.md'));

    const discrepancies = reconcileLedger(tmp);
    const fields = discrepancies.map((d) => d.field);
    expect(fields).toContain('patch_guide');
    expect(fields).toContain('implementation_status');
  });

  it('returns an empty list when there is no ledger at all', () => {
    expect(reconcileLedger(tmp)).toEqual([]);
  });
});

describe('atomic persistence', () => {
  it('leaves no temp files behind', () => {
    missionReadyForAcceptance();
    const raw = readFileSync(join(tmp, '.ai', 'ledger.json'), 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(existsSync(join(tmp, '.ai', `ledger.json.tmp-${process.pid}`))).toBe(false);
  });
});
