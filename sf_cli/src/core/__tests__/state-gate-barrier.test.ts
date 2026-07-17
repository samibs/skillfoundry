import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { StateKernel } from '../state.js';
import {
  GateBarrier,
  fromGateSummary,
  type SliceProposal,
  type GateVerdict,
} from '../state-gate-barrier.js';
import type { GateRunSummary } from '../gates.js';

const runDir = join(process.cwd(), '.tmp-test-gate-barrier');

beforeEach(() => {
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(runDir, { recursive: true });
});

afterEach(() => {
  rmSync(runDir, { recursive: true, force: true });
});

const pass: GateVerdict = { verdict: 'PASS', errors: [] };
const fail: GateVerdict = {
  verdict: 'FAIL',
  errors: [{ tier: 'T2', name: 'canary', detail: 'module failed to compile' }],
};

function proposal(over: Partial<SliceProposal> = {}): SliceProposal {
  return { slice: 'coder_state', owner: 'coder', data: { files: ['a.ts'] }, ...over };
}

describe('GateBarrier.commit — gates PASS (FR-005)', () => {
  it('commits the proposed data to the kernel when gates pass', async () => {
    const k = StateKernel.create(runDir, 'r');
    const barrier = new GateBarrier(k, () => pass);

    const res = await barrier.commit(proposal(), 0);

    expect(res.committed).toBe(true);
    expect(res.verdict).toBe('PASS');
    expect(res.slice.version).toBe(1);
    expect(k.getSlice('coder_state')?.files).toEqual(['a.ts']);
    // A passing agent write does NOT mark the run PASSING (run-level decision).
    expect(k.getBuildStatus()).toBe('UNKNOWN');
  });
});

describe('GateBarrier.commit — gates FAIL (FR-005 / §4.2)', () => {
  it('rejects the proposal, marks the slice FAILED, and flips build_status to FAILING', async () => {
    const k = StateKernel.create(runDir, 'r');
    const barrier = new GateBarrier(k, () => fail);

    const res = await barrier.commit(proposal(), 0);

    expect(res.committed).toBe(false);
    expect(res.verdict).toBe('FAIL');
    // Proposed payload was NOT merged...
    expect(k.getSlice('coder_state')?.files).toBeUndefined();
    // ...instead the slice carries structured error_logs.
    expect(k.getSlice('coder_state')?.status).toBe('FAILED');
    expect(k.getSlice('coder_state')?.error_logs).toEqual(fail.errors);
    expect(k.getBuildStatus()).toBe('FAILING');
  });

  it('an agent cannot self-certify: a failing gate wins over the proposed data', async () => {
    const k = StateKernel.create(runDir, 'r');
    // Agent tries to claim success in its own payload; gate says otherwise.
    const barrier = new GateBarrier(k, () => fail);
    const res = await barrier.commit(
      proposal({ data: { build_status: 'PASSING', files: [] } }),
      0,
    );
    expect(res.committed).toBe(false);
    expect(k.getBuildStatus()).toBe('FAILING');
  });
});

describe('GateBarrier — per-slice halt keeps siblings alive (FR-006)', () => {
  it('blocking coder_state leaves an already-committed tester_state untouched', async () => {
    const k = StateKernel.create(runDir, 'r');
    // A sibling slice commits fine through a passing barrier.
    const okBarrier = new GateBarrier(k, () => pass);
    await okBarrier.commit(
      { slice: 'tester_state', owner: 'tester', data: { coverage: 96 } },
      0,
    );
    // The coder slice is blocked.
    const badBarrier = new GateBarrier(k, () => fail);
    await badBarrier.commit(proposal(), 0);

    expect(k.getSlice('tester_state')?.coverage).toBe(96);
    expect(k.getSlice('tester_state')?.status).toBeUndefined();
    expect(k.getSlice('coder_state')?.status).toBe('FAILED');
  });
});

describe('GateBarrier — WARN handling', () => {
  it('treats WARN as a soft pass by default (commits)', async () => {
    const k = StateKernel.create(runDir, 'r');
    const barrier = new GateBarrier(k, () => ({ verdict: 'WARN', errors: [] }));
    const res = await barrier.commit(proposal(), 0);
    expect(res.committed).toBe(true);
    expect(res.verdict).toBe('WARN');
  });

  it('blocks WARN when strictWarn is enabled', async () => {
    const k = StateKernel.create(runDir, 'r');
    const barrier = new GateBarrier(k, () => ({ verdict: 'WARN', errors: [] }), {
      strictWarn: true,
    });
    const res = await barrier.commit(proposal(), 0);
    expect(res.committed).toBe(false);
    expect(k.getSlice('coder_state')?.status).toBe('FAILED');
  });
});

describe('GateBarrier — async validators & call fidelity', () => {
  it('awaits an async validator and passes the proposal to it', async () => {
    const k = StateKernel.create(runDir, 'r');
    const validator = vi.fn(async (_p: SliceProposal) => pass);
    const barrier = new GateBarrier(k, validator);
    const p = proposal();
    await barrier.commit(p, 0);
    expect(validator).toHaveBeenCalledOnce();
    expect(validator).toHaveBeenCalledWith(p);
  });
});

describe('fromGateSummary — adapter', () => {
  it('maps a FAIL summary to a verdict with only failing tiers as error logs', () => {
    const summary: GateRunSummary = {
      gates: [
        { tier: 'T1', name: 'syntax', status: 'pass', detail: 'ok', durationMs: 1 },
        { tier: 'T2', name: 'canary', status: 'fail', detail: 'ENOENT', durationMs: 2 },
        { tier: 'T3', name: 'adversarial', status: 'warn', detail: 'risky', durationMs: 3 },
      ],
      passed: 1,
      failed: 1,
      warned: 1,
      skipped: 0,
      totalMs: 6,
      verdict: 'FAIL',
    };
    const v = fromGateSummary(summary);
    expect(v.verdict).toBe('FAIL');
    expect(v.errors).toEqual([{ tier: 'T2', name: 'canary', detail: 'ENOENT' }]);
  });

  it('maps a clean PASS summary to an empty error list', () => {
    const summary: GateRunSummary = {
      gates: [{ tier: 'T1', name: 'syntax', status: 'pass', detail: 'ok', durationMs: 1 }],
      passed: 1,
      failed: 0,
      warned: 0,
      skipped: 0,
      totalMs: 1,
      verdict: 'PASS',
    };
    expect(fromGateSummary(summary)).toEqual({ verdict: 'PASS', errors: [] });
  });
});
