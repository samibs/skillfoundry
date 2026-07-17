import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  StateKernel,
  StaleVersionError,
  WriteAuthorityError,
  SpillError,
  isSpilledRef,
  STATE_SCHEMA_VERSION,
  type SpilledRef,
  type StateDocument,
} from '../state.js';

const runDir = join(process.cwd(), '.tmp-test-state-kernel');

beforeEach(() => {
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(runDir, { recursive: true });
});

afterEach(() => {
  rmSync(runDir, { recursive: true, force: true });
});

function readDoc(): StateDocument {
  return JSON.parse(
    readFileSync(join(runDir, 'state', 'state.json'), 'utf-8'),
  ) as StateDocument;
}

describe('StateKernel.create (FR-001)', () => {
  it('initializes a schema-valid state.json with empty slices in a dedicated state/ dir', () => {
    const k = StateKernel.create(runDir, 'run-123', { target: 'node-typescript' });

    expect(existsSync(join(runDir, 'state', 'state.json'))).toBe(true);
    expect(existsSync(join(runDir, 'state', 'artifacts'))).toBe(true);

    const doc = readDoc();
    expect(doc.schema_version).toBe(STATE_SCHEMA_VERSION);
    expect(doc.run_id).toBe('run-123');
    expect(doc.project_metadata.build_status).toBe('UNKNOWN');
    expect(doc.project_metadata.target).toBe('node-typescript');
    expect(doc.slices).toEqual({});
    expect(k.path).toContain(join('state', 'state.json'));
  });

  it('refuses to clobber an existing state document', () => {
    StateKernel.create(runDir, 'run-1');
    expect(() => StateKernel.create(runDir, 'run-1')).toThrow(/already exists/);
  });

  it('open() reattaches to an existing run and exists() reports presence', () => {
    expect(StateKernel.exists(runDir)).toBe(false);
    StateKernel.create(runDir, 'run-1');
    expect(StateKernel.exists(runDir)).toBe(true);
    const reopened = StateKernel.open(runDir);
    expect(reopened.load().run_id).toBe('run-1');
  });

  it('open() throws when no state exists', () => {
    expect(() => StateKernel.open(runDir)).toThrow(/No state document/);
  });
});

describe('StateKernel.commitSlice — versioning & write authority (FR-009)', () => {
  it('creates a slice from expectedVersion 0 and stamps owner + version 1', () => {
    const k = StateKernel.create(runDir, 'r');
    const slice = k.commitSlice('tester_state', 'tester', { coverage: 96 }, 0);
    expect(slice.version).toBe(1);
    expect(slice.owner).toBe('tester');
    expect(slice.coverage).toBe(96);
    expect(k.getSlice('tester_state')?.version).toBe(1);
  });

  it('increments version on each successful commit', () => {
    const k = StateKernel.create(runDir, 'r');
    k.commitSlice('coder_state', 'coder', { files: ['a.ts'] }, 0);
    const v2 = k.commitSlice('coder_state', 'coder', { files: ['a.ts', 'b.ts'] }, 1);
    expect(v2.version).toBe(2);
  });

  it('rejects a stale-version write with StaleVersionError', () => {
    const k = StateKernel.create(runDir, 'r');
    k.commitSlice('tester_state', 'tester', { runs: 1 }, 0); // now version 1
    expect(() => k.commitSlice('tester_state', 'tester', { runs: 2 }, 0)).toThrow(
      StaleVersionError,
    );
  });

  it('rejects a write from an agent that does not own the slice', () => {
    const k = StateKernel.create(runDir, 'r');
    k.commitSlice('tester_state', 'tester', { runs: 1 }, 0);
    expect(() =>
      k.commitSlice('tester_state', 'security', { runs: 2 }, 1),
    ).toThrow(WriteAuthorityError);
  });

  it('allows concurrent writes to DISJOINT slices (cross-slice independence)', () => {
    const k = StateKernel.create(runDir, 'r');
    const t = k.commitSlice('tester_state', 'tester', { failures: 0 }, 0);
    const s = k.commitSlice('security_state', 'security', { critical_vulns: 0 }, 0);
    expect(t.version).toBe(1);
    expect(s.version).toBe(1);
    const doc = readDoc();
    expect(Object.keys(doc.slices).sort()).toEqual([
      'security_state',
      'tester_state',
    ]);
  });
});

describe('StateKernel.updateSlice — CAS rebase recovery (FR-009)', () => {
  it('re-reads, rebases and commits after a concurrent write moved the version', () => {
    const k = StateKernel.create(runDir, 'r');
    k.commitSlice('coder_state', 'coder', { count: 1 }, 0); // version 1

    let firstPass = true;
    const result = k.updateSlice('coder_state', 'coder', (current) => {
      // Simulate a concurrent writer bumping the slice on the first attempt only,
      // forcing a StaleVersionError and a rebase onto the newer version.
      if (firstPass) {
        firstPass = false;
        k.commitSlice('coder_state', 'coder', { count: 99 }, 1); // now version 2
      }
      const count = (current.count as number) ?? 0;
      return { count: count + 1 };
    });

    // The mutator's final rebase saw count=99 → committed 100 at version 3.
    expect(result.count).toBe(100);
    expect(result.version).toBe(3);
  });

  it('throws after exhausting maxAttempts under sustained contention', () => {
    const k = StateKernel.create(runDir, 'r');
    k.commitSlice('coder_state', 'coder', { count: 0 }, 0);
    expect(() =>
      k.updateSlice(
        'coder_state',
        'coder',
        (current) => {
          // Always bump the version out from under the commit.
          const v = k.getSlice('coder_state')!.version;
          k.commitSlice('coder_state', 'coder', { count: (current.count as number) ?? 0 }, v);
          return { count: 1 };
        },
        2,
      ),
    ).toThrow(/exhausted 2 attempts/);
  });
});

describe('StateKernel — refs not blobs / spill (FR-002)', () => {
  it('spills an oversized string field to state/artifacts and replaces it with a pointer', () => {
    const k = StateKernel.create(runDir, 'r', {}, { maxFieldBytes: 16 });
    const big = 'x'.repeat(1000);
    const slice = k.commitSlice('coder_state', 'coder', { diff: big, note: 'small' }, 0);

    expect(isSpilledRef(slice.diff)).toBe(true);
    const ref = slice.diff as SpilledRef;
    expect(ref.bytes).toBe(1000);
    expect(ref.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(ref.ref).toContain(join('state', 'artifacts'));
    // Small field passes through untouched.
    expect(slice.note).toBe('small');
    // Artifact content is recoverable and matches.
    expect(k.readArtifact(ref)).toBe(big);
    // The stored state.json contains only the pointer, not the blob.
    expect(JSON.stringify(readDoc())).not.toContain(big);
  });

  it('leaves within-limit and non-string fields unchanged', () => {
    const k = StateKernel.create(runDir, 'r', {}, { maxFieldBytes: 8192 });
    const slice = k.commitSlice(
      'tester_state',
      'tester',
      { coverage: 96, name: 'short', passed: true },
      0,
    );
    expect(slice.coverage).toBe(96);
    expect(slice.name).toBe('short');
    expect(slice.passed).toBe(true);
  });

  it('rejects the write with SpillError only when the disk spill fails', () => {
    const k = StateKernel.create(runDir, 'r', {}, { maxFieldBytes: 4 });
    // Remove the artifacts dir AND block its recreation by placing a file where the
    // directory should be, so writeFileSync into it fails.
    rmSync(join(runDir, 'state', 'artifacts'), { recursive: true, force: true });
    // Recreate as a *file*, not a dir → writes under it throw ENOTDIR.
    mkdirSync(join(runDir, 'state'), { recursive: true });
    writeFileSync(join(runDir, 'state', 'artifacts'), 'blocker');
    expect(() =>
      k.commitSlice('coder_state', 'coder', { diff: 'toolong' }, 0),
    ).toThrow(SpillError);
  });
});

describe('StateKernel — determinism boundary (§4.2)', () => {
  it('build_status starts UNKNOWN and only setBuildStatus can change it', () => {
    const k = StateKernel.create(runDir, 'r');
    expect(k.getBuildStatus()).toBe('UNKNOWN');
    // An agent slice cannot carry build_status into project_metadata.
    k.commitSlice('coder_state', 'coder', { build_status: 'PASSING' }, 0);
    expect(k.getBuildStatus()).toBe('UNKNOWN'); // unchanged by agent data
    k.setBuildStatus('PASSING');
    expect(k.getBuildStatus()).toBe('PASSING');
  });
});

describe('StateKernel — atomic persistence & crash safety (§4.3)', () => {
  it('never leaves a lingering temp file after a commit', () => {
    const k = StateKernel.create(runDir, 'r');
    k.commitSlice('coder_state', 'coder', { files: ['a.ts'] }, 0);
    expect(existsSync(join(runDir, 'state', 'state.json.tmp'))).toBe(false);
    expect(existsSync(join(runDir, 'state', 'state.json'))).toBe(true);
  });

  it('persists across a fresh kernel instance (disk is the source of truth)', () => {
    const k1 = StateKernel.create(runDir, 'r');
    k1.commitSlice('tester_state', 'tester', { coverage: 88 }, 0);
    const k2 = StateKernel.open(runDir);
    expect(k2.getSlice('tester_state')?.coverage).toBe(88);
  });
});
