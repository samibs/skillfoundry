import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  classifyBaseline, classifyWorkerStaleness, verifyProvenance, verifyPublication,
  analyzeCollision,
} from '../core/mission-provenance.js';
import { stablePatchId, changedFiles, revParse, isAncestor } from '../core/mission-git.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

let root: string;
let repo: string;

function g(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

function commit(dir: string, file: string, content: string, message: string): string {
  const abs = join(dir, file);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content, 'utf-8');
  g(dir, 'add', '.');
  g(dir, 'commit', '-m', message);
  return g(dir, 'rev-parse', 'HEAD');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sf-mission-prov-'));
  repo = join(root, 'repo');
  mkdirSync(repo, { recursive: true });
  g(repo, 'init', '-b', 'main');
  g(repo, 'config', 'user.email', 'test@example.com');
  g(repo, 'config', 'user.name', 'Test Worker');
  commit(repo, 'README.md', '# demo\n', 'initial');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('stable patch identity (§21)', () => {
  it('is identical for a cherry-picked commit with a different SHA', () => {
    const base = revParse(repo, 'HEAD')!;
    g(repo, 'checkout', '-b', 'feature');
    const workerSha = commit(repo, 'src/feature.ts', 'export const x = 1;\n', 'feat: add x');
    const workerPatchId = stablePatchId(repo, workerSha);

    // Move main forward on an unrelated file, then replay the contribution.
    g(repo, 'checkout', 'main');
    commit(repo, 'docs/other.md', 'unrelated\n', 'docs: unrelated');
    g(repo, 'cherry-pick', workerSha);
    const integrationSha = revParse(repo, 'HEAD')!;

    expect(integrationSha).not.toBe(workerSha);
    expect(workerPatchId).toBeTruthy();
    expect(stablePatchId(repo, integrationSha)).toBe(workerPatchId);
    expect(base).toBeTruthy();
  });

  it('returns null for a commit with no diff', () => {
    g(repo, 'commit', '--allow-empty', '-m', 'empty');
    expect(stablePatchId(repo, revParse(repo, 'HEAD')!)).toBeNull();
  });
});

describe('changedFiles', () => {
  it('lists exactly the files a commit touched', () => {
    const sha = commit(repo, 'src/a.ts', 'a\n', 'feat: a');
    expect(changedFiles(repo, sha)).toEqual(['src/a.ts']);
  });
});

describe('classifyBaseline (§2)', () => {
  it('reports UNKNOWN with no remote configured', () => {
    const report = classifyBaseline(repo);
    expect(report.freshness).toBe('UNKNOWN');
    expect(report.notes.join(' ')).toMatch(/No "origin" remote/);
  });

  it('reports CURRENT when local matches the remote', () => {
    const bare = join(root, 'origin.git');
    g(root, 'init', '--bare', '-b', 'main', bare);
    g(repo, 'remote', 'add', 'origin', bare);
    g(repo, 'push', '-u', 'origin', 'main');

    const report = classifyBaseline(repo, { fetch: true });
    expect(report.freshness).toBe('CURRENT');
    expect(report.ahead_by).toBe(0);
    expect(report.behind_by).toBe(0);
  });

  it('reports ADVANCED when local is ahead of the remote', () => {
    const bare = join(root, 'origin.git');
    g(root, 'init', '--bare', '-b', 'main', bare);
    g(repo, 'remote', 'add', 'origin', bare);
    g(repo, 'push', '-u', 'origin', 'main');
    commit(repo, 'src/local.ts', 'local\n', 'feat: local only');

    const report = classifyBaseline(repo, { fetch: true });
    expect(report.freshness).toBe('ADVANCED');
    expect(report.ahead_by).toBe(1);
  });

  it('reports STALE and names the collision surface when the remote moved', () => {
    const bare = join(root, 'origin.git');
    g(root, 'init', '--bare', '-b', 'main', bare);
    g(repo, 'remote', 'add', 'origin', bare);
    g(repo, 'push', '-u', 'origin', 'main');

    // A second clone publishes ahead of us.
    const other = join(root, 'other');
    g(root, 'clone', bare, other);
    g(other, 'config', 'user.email', 'other@example.com');
    g(other, 'config', 'user.name', 'Other');
    commit(other, 'src/shared.ts', 'moved\n', 'feat: remote change');
    g(other, 'push');

    const report = classifyBaseline(repo, { fetch: true });
    expect(report.freshness).toBe('STALE');
    expect(report.behind_by).toBe(1);
    expect(report.remote_changed_files).toContain('src/shared.ts');
    expect(report.advancement).toBe('SAFE_FORWARD_ADVANCEMENT');
  });
});

describe('classifyWorkerStaleness (§23)', () => {
  it('reports CURRENT and already-integrated for an ancestor commit', () => {
    const sha = commit(repo, 'src/a.ts', 'a\n', 'feat: a');
    const r = classifyWorkerStaleness(repo, sha, 'main');
    expect(r.classification).toBe('CURRENT');
    expect(r.already_integrated).toBe(true);
  });

  it('detects a patch-equivalent cherry-pick', () => {
    g(repo, 'checkout', '-b', 'feature');
    const workerSha = commit(repo, 'src/feature.ts', 'export const x = 1;\n', 'feat: x');

    g(repo, 'checkout', 'main');
    commit(repo, 'docs/other.md', 'unrelated\n', 'docs: other');
    g(repo, 'cherry-pick', workerSha);

    const r = classifyWorkerStaleness(repo, workerSha, 'main');
    expect(r.classification).toBe('STALE_BUT_PATCH_EQUIVALENT');
    expect(r.already_integrated).toBe(true);
  });

  it('flags STALE_WITH_COLLISION when the target moved on a shared file', () => {
    g(repo, 'checkout', '-b', 'feature');
    const workerSha = commit(repo, 'src/shared.ts', 'worker version\n', 'feat: worker');

    g(repo, 'checkout', 'main');
    commit(repo, 'src/shared.ts', 'main version\n', 'feat: main');

    const r = classifyWorkerStaleness(repo, workerSha, 'main');
    expect(r.classification).toBe('STALE_WITH_COLLISION');
    expect(r.colliding_files).toContain('src/shared.ts');
  });

  it('reports CURRENT when the target advanced on disjoint files', () => {
    g(repo, 'checkout', '-b', 'feature');
    const workerSha = commit(repo, 'src/worker.ts', 'w\n', 'feat: worker');

    g(repo, 'checkout', 'main');
    commit(repo, 'src/other.ts', 'o\n', 'feat: other');

    const r = classifyWorkerStaleness(repo, workerSha, 'main');
    expect(r.classification).toBe('CURRENT');
    expect(r.already_integrated).toBe(false);
    expect(r.colliding_files).toEqual([]);
  });

  it('reports UNKNOWN for an unresolvable ref', () => {
    const r = classifyWorkerStaleness(repo, 'deadbeef', 'main');
    expect(r.classification).toBe('UNKNOWN');
    expect(r.reason).toMatch(/Could not resolve/);
  });
});

describe('verifyProvenance (§22)', () => {
  it('proves PRESERVED via direct ancestry', () => {
    const sha = commit(repo, 'src/a.ts', 'a\n', 'feat: a');
    const v = verifyProvenance(repo, sha, 'main');
    expect(v.proven).toBe(true);
    expect(v.record.final_tree_contribution).toBe('PRESERVED');
    expect(v.record.integration_method).toBe('DIRECT_ANCESTRY');
    expect(v.record.changed_file_manifest).toEqual(['src/a.ts']);
  });

  it('proves PRESERVED via a patch-equivalent cherry-pick', () => {
    g(repo, 'checkout', '-b', 'feature');
    const workerSha = commit(repo, 'src/feature.ts', 'export const x = 1;\n', 'feat: x');

    g(repo, 'checkout', 'main');
    commit(repo, 'docs/other.md', 'o\n', 'docs: other');
    g(repo, 'cherry-pick', workerSha);

    const v = verifyProvenance(repo, workerSha, 'main');
    expect(v.record.integration_method).toBe('PROVEN_PATCH_EQUIVALENT_CHERRY_PICK');
    expect(v.record.final_tree_contribution).toBe('PRESERVED');
    expect(v.proven).toBe(true);
  });

  it('detects LOST when the contribution never reached the tree', () => {
    g(repo, 'checkout', '-b', 'feature');
    const workerSha = commit(repo, 'src/feature.ts', 'export const x = 1;\n', 'feat: x');
    g(repo, 'checkout', 'main');

    const v = verifyProvenance(repo, workerSha, 'main');
    expect(v.record.final_tree_contribution).toBe('LOST');
    expect(v.proven).toBe(false);
    expect(v.blockers.join(' ')).toMatch(/src\/feature\.ts/);
  });

  it('detects LOST when a later change silently overwrote the contribution', () => {
    g(repo, 'checkout', '-b', 'feature');
    const workerSha = commit(repo, 'src/shared.ts', 'worker version\n', 'feat: worker');

    g(repo, 'checkout', 'main');
    g(repo, 'merge', '--no-edit', 'feature');
    // An unauthorized later change clobbers the worker's content.
    commit(repo, 'src/shared.ts', 'clobbered\n', 'chore: overwrite');

    const v = verifyProvenance(repo, workerSha, 'main');
    expect(v.record.final_tree_contribution).toBe('LOST');
    expect(v.proven).toBe(false);
  });

  it('reports SUPERSEDED_BY_AUTHORIZED_CHANGE when the overwrite was authorized', () => {
    g(repo, 'checkout', '-b', 'feature');
    const workerSha = commit(repo, 'src/shared.ts', 'worker version\n', 'feat: worker');

    g(repo, 'checkout', 'main');
    g(repo, 'merge', '--no-edit', 'feature');
    commit(repo, 'src/shared.ts', 'authorized rewrite\n', 'refactor: authorized');

    const v = verifyProvenance(repo, workerSha, 'main', { authorizedSupersedes: ['src/shared.ts'] });
    expect(v.record.final_tree_contribution).toBe('SUPERSEDED_BY_AUTHORIZED_CHANGE');
    expect(v.proven).toBe(true);
  });

  it('reports UNKNOWN for an unresolvable ref', () => {
    const v = verifyProvenance(repo, 'nope', 'main');
    expect(v.record.final_tree_contribution).toBe('UNKNOWN');
    expect(v.proven).toBe(false);
  });
});

describe('verifyPublication (§37)', () => {
  it('fails when the remote ref does not exist', () => {
    const r = verifyPublication(repo, {
      branch: 'main', expectedSha: revParse(repo, 'HEAD')!, fetch: false,
    });
    expect(r.verified).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/PUBLICATION_FAILED/);
  });

  it('verifies a real push, including contribution presence', () => {
    const bare = join(root, 'origin.git');
    g(root, 'init', '--bare', '-b', 'main', bare);
    g(repo, 'remote', 'add', 'origin', bare);
    commit(repo, 'src/a.ts', 'a\n', 'feat: a');
    g(repo, 'push', '-u', 'origin', 'main');

    const r = verifyPublication(repo, {
      branch: 'main',
      expectedSha: revParse(repo, 'HEAD')!,
      missionFiles: ['src/a.ts'],
      fetch: true,
    });
    expect(r.verified).toBe(true);
    expect(r.contribution_present).toBe(true);
    expect(r.remote_tree).toMatch(/^[0-9a-f]{40}$/);
  });

  it('fails when an expected contribution file is absent at the remote', () => {
    const bare = join(root, 'origin.git');
    g(root, 'init', '--bare', '-b', 'main', bare);
    g(repo, 'remote', 'add', 'origin', bare);
    g(repo, 'push', '-u', 'origin', 'main');

    const r = verifyPublication(repo, {
      branch: 'main',
      expectedSha: revParse(repo, 'HEAD')!,
      missionFiles: ['src/never-pushed.ts'],
      fetch: true,
    });
    expect(r.verified).toBe(false);
    expect(r.contribution_present).toBe(false);
  });

  it('accepts a remote that advanced past the expected SHA but still contains it', () => {
    const bare = join(root, 'origin.git');
    g(root, 'init', '--bare', '-b', 'main', bare);
    g(repo, 'remote', 'add', 'origin', bare);
    const expected = commit(repo, 'src/a.ts', 'a\n', 'feat: a');
    g(repo, 'push', '-u', 'origin', 'main');
    commit(repo, 'src/b.ts', 'b\n', 'feat: b');
    g(repo, 'push');

    const r = verifyPublication(repo, { branch: 'main', expectedSha: expected, fetch: true });
    expect(r.verified).toBe(true);
    expect(isAncestor(repo, expected, r.remote_sha!)).toBe(true);
  });
});

describe('analyzeCollision (§7)', () => {
  it('reports NONE for disjoint manifests', () => {
    const r = analyzeCollision('w1', ['src/a.ts'], 'w2', ['src/b.ts']);
    expect(r.classification).toBe('NONE');
    expect(r.shared_files).toEqual([]);
  });

  it('reports SOFT_OVERLAP for a small shared surface', () => {
    const r = analyzeCollision('w1', ['src/a.ts', 'src/x.ts'], 'w2', ['src/x.ts']);
    expect(r.classification).toBe('SOFT_OVERLAP');
    expect(r.shared_files).toEqual(['src/x.ts']);
  });

  it('escalates a shared architectural primitive to HARD_COLLISION', () => {
    const r = analyzeCollision('w1', ['src/routes.ts'], 'w2', ['src/routes.ts']);
    expect(r.classification).toBe('HARD_COLLISION');
    expect(r.hotspots).toEqual(['src/routes.ts']);
    expect(r.recommendation).toMatch(/SERIALIZE/);
  });

  it('treats a shared migrations directory as a hotspot', () => {
    const r = analyzeCollision(
      'w1', ['db/migrations/001_init.sql'],
      'w2', ['db/migrations/001_init.sql'],
    );
    expect(r.classification).toBe('HARD_COLLISION');
  });

  it('reports SHARED_HOTSPOT for a broad non-architectural overlap', () => {
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'];
    const r = analyzeCollision('w1', files, 'w2', files);
    expect(r.classification).toBe('SHARED_HOTSPOT');
  });

  it('reports DEPENDENCY when one worker consumes the other', () => {
    const r = analyzeCollision('w1', ['src/a.ts'], 'w2', ['src/b.ts'], { dependency: true });
    expect(r.classification).toBe('DEPENDENCY');
    expect(r.recommendation).toMatch(/depends on/);
  });
});
