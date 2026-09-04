import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  attestWorker, readAttestation, listAttestations, gateOnAttestation,
  attestationDrift, environmentFingerprint, isAgentKind,
} from '../core/mission-attestation.js';
import { initLedger, upsertMission } from '../core/mission-ledger.js';
import { isNativeWorktree, listWorktrees, hasCommitIdentity } from '../core/mission-git.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

let root: string;
let repo: string;

function g(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

/** Create a git repo with one commit and a local identity. */
function makeRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  g(dir, 'init', '-b', 'main');
  g(dir, 'config', 'user.email', 'test@example.com');
  g(dir, 'config', 'user.name', 'Test Worker');
  writeFileSync(join(dir, 'README.md'), '# demo\n', 'utf-8');
  g(dir, 'add', '.');
  g(dir, 'commit', '-m', 'initial');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sf-mission-attest-'));
  repo = join(root, 'repo');
  makeRepo(repo);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('environment fingerprint', () => {
  it('is stable, bounded, and free of paths or usernames', () => {
    const fp = environmentFingerprint();
    expect(fp).toBe(environmentFingerprint());
    expect(fp.length).toBeLessThan(80);
    expect(fp).not.toContain('/');
    expect(fp).not.toContain(process.env.USER ?? '__no_user__');
  });
});

describe('agent taxonomy', () => {
  it('accepts known agents and rejects invented ones', () => {
    expect(isAgentKind('claude')).toBe(true);
    expect(isAgentKind('human')).toBe(true);
    expect(isAgentKind('some-new-bot')).toBe(false);
  });
});

describe('native worktree detection (§3)', () => {
  it('recognises the main checkout as a registered worktree', () => {
    expect(isNativeWorktree(repo).registered).toBe(true);
    expect(listWorktrees(repo).length).toBe(1);
  });

  it('recognises a linked worktree created by git', () => {
    const linked = join(root, 'wt-story-1');
    g(repo, 'worktree', 'add', '-b', 'agent/STORY-001', linked, 'main');
    expect(isNativeWorktree(linked).registered).toBe(true);
    expect(listWorktrees(linked).length).toBe(2);
  });

  it('does NOT recognise a copied repository folder', () => {
    const copied = join(root, 'copied');
    mkdirSync(copied, { recursive: true });
    writeFileSync(join(copied, 'README.md'), '# copy\n', 'utf-8');
    // A directory that merely looks like a repo is not a worktree.
    expect(isNativeWorktree(copied).registered).toBe(false);
  });
});

describe('attestWorker', () => {
  it('rejects a malformed worker name', () => {
    expect(() => attestWorker(repo, { missionId: 'STORY-001', worker: '../evil', agent: 'claude' }))
      .toThrow(/Invalid worker name/);
  });

  it('blocks the repository main checkout unless explicitly allowed (§1 rule 4)', () => {
    const a = attestWorker(repo, { missionId: 'STORY-001', worker: 'w1', agent: 'claude' });
    expect(a.status).toBe('FAIL');
    expect(a.blockers.join(' ')).toMatch(/main checkout/);
  });

  it('passes in the main checkout when the mission allows it', () => {
    const a = attestWorker(repo, {
      missionId: 'STORY-001', worker: 'w1', agent: 'claude', allowMainWorktree: true,
    });
    expect(a.status).toBe('PASS');
    expect(a.blockers).toEqual([]);
    expect(a.native_worktree_registered).toBe(true);
    expect(a.branch).toBe('main');
    expect(a.head_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(a.tree_sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('passes in a linked worktree with no special flags', () => {
    const linked = join(root, 'wt-story-1');
    g(repo, 'worktree', 'add', '-b', 'agent/STORY-001', linked, 'main');
    const a = attestWorker(linked, { missionId: 'STORY-001', worker: 'w1', agent: 'claude' });
    expect(a.status).toBe('PASS');
    expect(a.branch).toBe('agent/STORY-001');
  });

  it('blocks a dirty working tree (§1 rule 13)', () => {
    const linked = join(root, 'wt-dirty');
    g(repo, 'worktree', 'add', '-b', 'agent/dirty', linked, 'main');
    writeFileSync(join(linked, 'scratch.txt'), 'uncommitted\n', 'utf-8');

    const a = attestWorker(linked, { missionId: 'STORY-001', worker: 'w1', agent: 'claude' });
    expect(a.status).toBe('FAIL');
    expect(a.working_tree_clean).toBe(false);
    expect(a.blockers.join(' ')).toMatch(/dirty/);
  });

  it('allows a dirty tree only when explicitly authorized', () => {
    const linked = join(root, 'wt-dirty2');
    g(repo, 'worktree', 'add', '-b', 'agent/dirty2', linked, 'main');
    writeFileSync(join(linked, 'scratch.txt'), 'uncommitted\n', 'utf-8');

    const a = attestWorker(linked, {
      missionId: 'STORY-001', worker: 'w1', agent: 'claude', allowDirty: true,
    });
    expect(a.status).toBe('PASS');
    expect(a.working_tree_clean).toBe(false);
  });

  it('classifies a missing required asset as an environment defect (§41)', () => {
    const linked = join(root, 'wt-assets');
    g(repo, 'worktree', 'add', '-b', 'agent/assets', linked, 'main');

    const a = attestWorker(linked, {
      missionId: 'STORY-001', worker: 'w1', agent: 'claude',
      requiredAssets: ['docs/stories/STORY-001.md'],
    });
    expect(a.status).toBe('FAIL');
    expect(a.required_assets_present).toBe(false);
    expect(a.blockers.join(' ')).toMatch(/ENVIRONMENT_DEFECT/);
  });

  it('fails outside a git repository', () => {
    const plain = join(root, 'not-a-repo');
    mkdirSync(plain, { recursive: true });
    const a = attestWorker(plain, { missionId: 'STORY-001', worker: 'w1', agent: 'human' });
    expect(a.status).toBe('FAIL');
    expect(a.blockers.join(' ')).toMatch(/not inside a git working tree/);
  });

  it('records base_sha when a base ref is supplied', () => {
    const linked = join(root, 'wt-base');
    g(repo, 'worktree', 'add', '-b', 'agent/base', linked, 'main');
    const a = attestWorker(linked, {
      missionId: 'STORY-001', worker: 'w1', agent: 'claude', baseRef: 'main',
    });
    expect(a.base_sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('warns, without blocking, when there is no remote', () => {
    const a = attestWorker(repo, {
      missionId: 'STORY-001', worker: 'w1', agent: 'claude', allowMainWorktree: true,
    });
    expect(a.warnings.join(' ')).toMatch(/No `origin` remote/);
    expect(a.status).toBe('PASS');
  });

  it('persists a FAIL attestation — a recorded failure is itself evidence', () => {
    attestWorker(repo, { missionId: 'STORY-001', worker: 'w1', agent: 'claude' });
    const path = join(repo, '.ai', 'attestations', 'STORY-001-w1.json');
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf-8')).status).toBe('FAIL');
  });
});

describe('readAttestation / listAttestations', () => {
  it('returns null when nothing was attested', () => {
    expect(readAttestation(repo, 'STORY-001', 'nobody')).toBeNull();
    expect(listAttestations(repo, 'STORY-001')).toEqual([]);
  });

  it('lists only the attestations for the requested mission', () => {
    attestWorker(repo, { missionId: 'STORY-001', worker: 'w1', agent: 'claude', allowMainWorktree: true });
    attestWorker(repo, { missionId: 'STORY-001', worker: 'w2', agent: 'codex', allowMainWorktree: true });
    attestWorker(repo, { missionId: 'STORY-002', worker: 'w3', agent: 'human', allowMainWorktree: true });

    const listed = listAttestations(repo, 'STORY-001');
    expect(listed.map((a) => a.worker).sort()).toEqual(['w1', 'w2']);
  });

  it('ignores a corrupt attestation file rather than throwing', () => {
    attestWorker(repo, { missionId: 'STORY-001', worker: 'w1', agent: 'claude', allowMainWorktree: true });
    writeFileSync(join(repo, '.ai', 'attestations', 'STORY-001-broken.json'), '{ nope', 'utf-8');
    expect(listAttestations(repo, 'STORY-001').length).toBe(1);
  });
});

describe('gateOnAttestation (§4 — no writes before attestation)', () => {
  it('blocks when nothing has been attested', () => {
    const gate = gateOnAttestation(repo, 'STORY-001');
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/No attestation recorded/);
  });

  it('blocks when the only attestation FAILED', () => {
    attestWorker(repo, { missionId: 'STORY-001', worker: 'w1', agent: 'claude' });
    const gate = gateOnAttestation(repo, 'STORY-001');
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/Attestation FAILED/);
  });

  it('allows once a PASS attestation exists', () => {
    attestWorker(repo, { missionId: 'STORY-001', worker: 'w1', agent: 'claude', allowMainWorktree: true });
    const gate = gateOnAttestation(repo, 'STORY-001');
    expect(gate.allowed).toBe(true);
    expect(gate.attestation?.worker).toBe('w1');
  });

  it('scopes the gate to a named worker', () => {
    attestWorker(repo, { missionId: 'STORY-001', worker: 'w1', agent: 'claude', allowMainWorktree: true });
    expect(gateOnAttestation(repo, 'STORY-001', 'w1').allowed).toBe(true);
    expect(gateOnAttestation(repo, 'STORY-001', 'w2').allowed).toBe(false);
  });
});

describe('attestationDrift', () => {
  it('reports no drift immediately after attesting', () => {
    const a = attestWorker(repo, {
      missionId: 'STORY-001', worker: 'w1', agent: 'claude', allowMainWorktree: true,
    });
    expect(attestationDrift(repo, a)).toEqual([]);
  });

  it('detects a branch switch since the attestation', () => {
    const a = attestWorker(repo, {
      missionId: 'STORY-001', worker: 'w1', agent: 'claude', allowMainWorktree: true,
    });
    g(repo, 'checkout', '-b', 'other');
    expect(attestationDrift(repo, a).join(' ')).toMatch(/Branch changed/);
  });

  it('detects a worker that moved to a different directory', () => {
    const a = attestWorker(repo, {
      missionId: 'STORY-001', worker: 'w1', agent: 'claude', allowMainWorktree: true,
    });
    const linked = join(root, 'wt-moved');
    g(repo, 'worktree', 'add', '-b', 'agent/moved', linked, 'main');
    expect(attestationDrift(linked, a).join(' ')).toMatch(/attested in .* but is now operating in/);
  });
});

describe('ledger integration', () => {
  it('links the attestation into the mission record', () => {
    initLedger(repo, 'demo', 'main');
    upsertMission(repo, 'STORY-001', 'Demo');
    attestWorker(repo, { missionId: 'STORY-001', worker: 'w1', agent: 'claude', allowMainWorktree: true });

    const path = join(repo, '.ai', 'attestations', 'STORY-001-w1.json');
    expect(existsSync(path)).toBe(true);
    expect(resolve(path).startsWith(resolve(repo))).toBe(true);
  });
});

describe('commit capability', () => {
  it('is true when git identity is configured', () => {
    expect(hasCommitIdentity(repo)).toBe(true);
  });
});
