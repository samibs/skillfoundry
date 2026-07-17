import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { StateKernel } from '../state.js';
import { projectState, projectKernel } from '../state-projection.js';
import type { StateDocument } from '../state.js';

const runDir = join(process.cwd(), '.tmp-test-state-projection');

beforeEach(() => {
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(runDir, { recursive: true });
});
afterEach(() => {
  rmSync(runDir, { recursive: true, force: true });
});

function doc(over: Partial<StateDocument> = {}): StateDocument {
  return {
    schema_version: 1,
    run_id: 'forge-123',
    project_metadata: { build_status: 'PASSING', target: 'node-typescript' },
    slices: {},
    ...over,
  };
}

describe('projectState — success (FR-007 happy path)', () => {
  it('renders a compact one-block summary with per-slice metrics', () => {
    const d = doc({
      slices: {
        tester_state: { version: 1, owner: 'tester', coverage: 96, failures: 0 },
        coder_state: { version: 2, owner: 'coder', modified_files: ['a.ts', 'b.ts'] },
      },
    });
    const p = projectState(d);
    expect(p.mode).toBe('success');
    expect(p.text).toContain('✓ forge-123 (node-typescript) — build PASSING');
    expect(p.text).toContain('tester_state: coverage=96, failures=0');
    expect(p.text).toContain('coder_state: modified_files=[2]');
    // No control fields leak into the summary.
    expect(p.text).not.toContain('version=');
    expect(p.text).not.toContain('owner=');
    // No agent chatter, just derived metrics.
    expect(p.text.split('\n')).toHaveLength(3);
  });

  it('marks a spilled field compactly rather than dumping the blob', () => {
    const d = doc({
      slices: {
        coder_state: {
          version: 1,
          owner: 'coder',
          diff: { __spilled: true, ref: 'state/artifacts/abc', hash: 'sha256:abc', bytes: 4096 },
        },
      },
    });
    const p = projectState(d);
    expect(p.text).toContain('diff=<spilled 4096B>');
  });
});

describe('projectState — failure (FR-007 post-mortem)', () => {
  it('renders a post-mortem from a FAILED slice error_logs', () => {
    const d = doc({
      project_metadata: { build_status: 'FAILING' },
      slices: {
        coder_state: {
          version: 1,
          owner: 'coder',
          status: 'FAILED',
          error_logs: [
            { tier: 'T2', name: 'canary', detail: 'module failed to compile' },
            { tier: 'T1', name: 'syntax', detail: 'banned pattern: TODO' },
          ],
        },
        tester_state: { version: 1, owner: 'tester', coverage: 88 },
      },
    });
    const p = projectState(d);
    expect(p.mode).toBe('failure');
    expect(p.text).toContain('✗ forge-123 — build FAILING');
    expect(p.text).toContain('coder_state FAILED (owner: coder)');
    expect(p.text).toContain('- [T2] canary: module failed to compile');
    expect(p.text).toContain('- [T1] syntax: banned pattern: TODO');
    // The passing sibling is not part of the post-mortem.
    expect(p.text).not.toContain('tester_state');
  });

  it('treats build_status FAILING with no failed slice as a failure with a note', () => {
    const d = doc({ project_metadata: { build_status: 'FAILING' }, slices: {} });
    const p = projectState(d);
    expect(p.mode).toBe('failure');
    expect(p.text).toContain('no slice recorded a failure');
  });
});

describe('projectKernel — reads from disk', () => {
  it('projects a real kernel after a barrier-style FAILED write', () => {
    const k = StateKernel.create(runDir, 'forge-xyz');
    k.commitSlice(
      'coder_state',
      'coder',
      { status: 'FAILED', error_logs: [{ tier: 'T2', name: 'canary', detail: 'boom' }] },
      0,
    );
    k.setBuildStatus('FAILING');
    const p = projectKernel(k);
    expect(p.mode).toBe('failure');
    expect(p.text).toContain('coder_state FAILED');
    expect(p.text).toContain('boom');
  });
});
