import { describe, it, expect } from 'vitest';
import {
  detectCommandType,
  compressOutput,
  compressGitStatus,
  compressGitOneshot,
  compressGitLog,
  compressGitDiff,
  compressTestRunner,
  compressBuildLint,
  compressPkgInstall,
  compressDocker,
  collapseRepeatedLines,
} from '../core/output-compressor.js';

// ─── detectCommandType ───────────────────────────────────────

describe('detectCommandType', () => {
  it('detects git status', () => {
    expect(detectCommandType('git status')).toBe('git-status');
    expect(detectCommandType('git status --short')).toBe('git-status');
  });

  it('detects git log', () => {
    expect(detectCommandType('git log -n 10')).toBe('git-log');
    expect(detectCommandType('git log --oneline')).toBe('git-log');
  });

  it('detects git diff', () => {
    expect(detectCommandType('git diff')).toBe('git-diff');
    expect(detectCommandType('git diff HEAD~1')).toBe('git-diff');
    expect(detectCommandType('git diff --staged')).toBe('git-diff');
  });

  it('detects git oneshot commands', () => {
    expect(detectCommandType('git push origin main')).toBe('git-oneshot');
    expect(detectCommandType('git pull')).toBe('git-oneshot');
    expect(detectCommandType('git commit -m "msg"')).toBe('git-oneshot');
    expect(detectCommandType('git add .')).toBe('git-oneshot');
    expect(detectCommandType('git checkout -b feat')).toBe('git-oneshot');
    expect(detectCommandType('git stash pop')).toBe('git-oneshot');
    expect(detectCommandType('git fetch origin')).toBe('git-oneshot');
    expect(detectCommandType('git merge main')).toBe('git-oneshot');
    expect(detectCommandType('git rebase main')).toBe('git-oneshot');
  });

  it('detects test runners', () => {
    expect(detectCommandType('npx vitest run')).toBe('test-runner');
    expect(detectCommandType('npm test')).toBe('test-runner');
    expect(detectCommandType('npx jest')).toBe('test-runner');
    expect(detectCommandType('pytest -v')).toBe('test-runner');
    expect(detectCommandType('cargo test')).toBe('test-runner');
    expect(detectCommandType('go test ./...')).toBe('test-runner');
  });

  it('detects build/lint tools', () => {
    expect(detectCommandType('npx tsc --noEmit')).toBe('build-lint');
    expect(detectCommandType('npx eslint src/')).toBe('build-lint');
    expect(detectCommandType('ruff check .')).toBe('build-lint');
  });

  it('detects package install', () => {
    expect(detectCommandType('npm install')).toBe('pkg-install');
    expect(detectCommandType('pnpm install')).toBe('pkg-install');
    expect(detectCommandType('pip install flask')).toBe('pkg-install');
    expect(detectCommandType('cargo build')).toBe('pkg-install');
  });

  it('detects docker commands', () => {
    expect(detectCommandType('docker ps')).toBe('docker');
    expect(detectCommandType('docker compose ps')).toBe('docker');
    expect(detectCommandType('kubectl get pods')).toBe('docker');
  });

  it('returns default for unknown commands', () => {
    expect(detectCommandType('echo hello')).toBe('default');
    expect(detectCommandType('ls -la')).toBe('default');
    expect(detectCommandType('cat file.txt')).toBe('default');
  });

  it('handles chained commands — uses last relevant segment', () => {
    expect(detectCommandType('cd src && git status')).toBe('git-status');
    expect(detectCommandType('git add . && git commit -m "x"')).toBe('git-oneshot');
    expect(detectCommandType('npm install && npm test')).toBe('test-runner');
  });

  it('npm test matches test-runner not pkg-install', () => {
    // Important ordering test
    expect(detectCommandType('npm test')).toBe('test-runner');
  });
});

// ─── compressGitStatus ───────────────────────────────────────

describe('compressGitStatus', () => {
  it('strips hint lines and section headers', () => {
    const input = `On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
\tmodified:   src/core/executor.ts
\tmodified:   src/core/runner.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
\tnew-file.ts

no changes added to commit (use "git add" and/or "git commit -a")`;

    const result = compressGitStatus(input);

    // Should keep branch info
    expect(result).toContain('On branch main');
    expect(result).toContain('Your branch is up to date');
    // Should keep file paths
    expect(result).toContain('modified:   src/core/executor.ts');
    expect(result).toContain('modified:   src/core/runner.ts');
    expect(result).toContain('new-file.ts');
    // Should NOT contain hints
    expect(result).not.toContain('use "git add');
    expect(result).not.toContain('use "git restore');
    // Should NOT contain section headers
    expect(result).not.toContain('Changes not staged');
    expect(result).not.toContain('Untracked files');

    // Should be significantly shorter
    expect(result.length).toBeLessThan(input.length * 0.6);
  });
});

// ─── compressGitOneshot ──────────────────────────────────────

describe('compressGitOneshot', () => {
  it('compresses git push to one-liner', () => {
    const input = `Enumerating objects: 5, done.
Counting objects: 100% (5/5), done.
Delta compression using up to 8 threads
Compressing objects: 100% (3/3), done.
Writing objects: 100% (3/3), 342 bytes | 342.00 KiB/s, done.
Total 3 (delta 2), reused 0 (delta 0)
To github.com:user/repo.git
   abc1234..def5678  main -> main`;

    const result = compressGitOneshot('git push origin main', input);
    expect(result).toContain('ok');
    expect(result).toContain('main');
    expect(result.split('\n').length).toBeLessThanOrEqual(2);
  });

  it('compresses git pull (up to date)', () => {
    const result = compressGitOneshot('git pull', 'Already up to date.\n');
    expect(result).toBe('Already up to date');
  });

  it('compresses git commit', () => {
    const input = `[main abc1234] feat: add compression
 3 files changed, 150 insertions(+), 10 deletions(-)
 create mode 100644 src/compressor.ts`;

    const result = compressGitOneshot('git commit -m "feat: add compression"', input);
    expect(result).toContain('[main abc1234]');
    expect(result.split('\n').length).toBe(1);
  });

  it('compresses git add to "ok"', () => {
    const result = compressGitOneshot('git add .', '');
    expect(result).toBe('ok');
  });

  it('compresses git fetch (no new)', () => {
    const result = compressGitOneshot('git fetch', '');
    expect(result).toBe('ok (no new objects)');
  });

  it('compresses git checkout', () => {
    const input = `Switched to branch 'feature'\nYour branch is up to date with 'origin/feature'.`;
    const result = compressGitOneshot('git checkout feature', input);
    expect(result).toContain('Switched to branch');
  });
});

// ─── compressGitLog ──────────────────────────────────────────

describe('compressGitLog', () => {
  it('reduces multi-line log to one-line-per-commit', () => {
    const input = `commit abc1234567890def
Author: User <user@example.com>
Date:   Mon Mar 10 12:00:00 2026 +0100

    feat: add output compression

commit def5678901234abc
Author: User <user@example.com>
Date:   Sun Mar 9 11:00:00 2026 +0100

    fix: resolve test failure

commit 111222333444555666
Merge: aaa bbb
Author: User <user@example.com>
Date:   Sat Mar 8 10:00:00 2026 +0100

    chore: merge main`;

    const result = compressGitLog(input);
    const lines = result.split('\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('abc1234 feat: add output compression');
    expect(lines[1]).toBe('def5678 fix: resolve test failure');
    expect(lines[2]).toBe('1112223 chore: merge main');
    // Should NOT contain Author/Date/Merge
    expect(result).not.toContain('Author:');
    expect(result).not.toContain('Date:');
    expect(result).not.toContain('Merge:');
  });
});

// ─── compressGitDiff ─────────────────────────────────────────

describe('compressGitDiff', () => {
  it('strips index/mode lines and collapses unchanged regions', () => {
    const input = `diff --git a/src/file.ts b/src/file.ts
index abc1234..def5678 100644
mode 100644
--- a/src/file.ts
+++ b/src/file.ts
@@ -1,10 +1,12 @@
 line 1
 line 2
 line 3
 line 4
 line 5
 line 6
 line 7
+new line here
 line 8`;

    const result = compressGitDiff(input, false);

    expect(result).toContain('diff --git');
    expect(result).toContain('+new line here');
    expect(result).not.toContain('index abc1234');
    expect(result).not.toContain('mode 100644');
    // Should have collapsed the long unchanged region
    expect(result).toContain('...');
    expect(result.length).toBeLessThan(input.length);
  });

  it('preserves full output on error', () => {
    const input = 'diff output with errors...';
    expect(compressGitDiff(input, true)).toBe(input);
  });
});

// ─── compressTestRunner ──────────────────────────────────────

describe('compressTestRunner', () => {
  it('reduces all-pass output to summary only', () => {
    const input = ` ✓ should do thing one (3ms)
 ✓ should do thing two (1ms)
 ✓ should do thing three (5ms)
 ✓ should do thing four (2ms)
 ✓ should do thing five (1ms)
 ✓ should do thing six (2ms)
 ✓ should do thing seven (1ms)
 ✓ should do thing eight (3ms)

 Tests  8 passed (8)
 Time  1.23s`;

    const result = compressTestRunner(input, false);
    expect(result).toContain('8 passed');
    expect(result).not.toContain('should do thing one');
    expect(result.length).toBeLessThan(input.length * 0.5);
  });

  it('keeps failure blocks when tests fail', () => {
    const input = ` ✓ should pass (1ms)
 ✓ should also pass (2ms)
 ✗ should fail
   AssertionError: expected 1 to equal 2
     at test.ts:42
 ✓ should pass again (1ms)

 Tests  1 failed | 3 passed (4)`;

    const result = compressTestRunner(input, true);
    expect(result).toContain('should fail');
    expect(result).toContain('AssertionError');
    expect(result).toContain('1 failed');
    // Should NOT contain passing test lines
    expect(result).not.toContain('should pass (1ms)');
    expect(result).not.toContain('should also pass');
    expect(result).not.toContain('should pass again');
  });

  it('handles pytest output format', () => {
    const input = `============================= test session starts ==============================
collected 5 items

test_auth.py::test_login PASSED
test_auth.py::test_logout PASSED
test_auth.py::test_register FAILED
FAILED test_auth.py::test_register - AssertionError
========================= 1 failed, 2 passed in 0.5s =========================`;

    const result = compressTestRunner(input, true);
    expect(result).toContain('FAILED');
    expect(result).toContain('1 failed, 2 passed');
  });

  it('handles cargo test output', () => {
    const input = `running 5 tests
test utils::test_parse ... ok
test utils::test_format ... ok
test utils::test_validate ... ok
test utils::test_convert ... ok
test utils::test_transform ... ok

test result: ok. 5 passed; 0 failed; 0 ignored`;

    const result = compressTestRunner(input, false);
    expect(result).toContain('5 passed');
    // Should not contain individual "... ok" lines
    expect(result).not.toContain('test_parse ... ok');
  });
});

// ─── compressBuildLint ───────────────────────────────────────

describe('compressBuildLint', () => {
  it('groups errors by file and deduplicates', () => {
    const input = `src/file.ts:10:5: error TS2322: Type 'string' is not assignable
src/file.ts:20:5: error TS2322: Type 'string' is not assignable
src/file.ts:30:5: error TS2345: Argument of type is wrong
src/other.ts:5:1: error TS2304: Cannot find name 'foo'

Found 4 errors.`;

    const result = compressBuildLint(input);
    expect(result).toContain('src/file.ts (3 issues)');
    expect(result).toContain('(x2)'); // deduplicated TS2322
    expect(result).toContain('src/other.ts (1 issue)');
    expect(result).toContain('Found 4 errors');
    expect(result.length).toBeLessThan(input.length);
  });
});

// ─── compressPkgInstall ──────────────────────────────────────

describe('compressPkgInstall', () => {
  it('strips progress and warnings, keeps summary', () => {
    const input = `npm warn deprecated inflight@1.0.6: This module is not supported
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
⠙ Resolving packages...
⠹ Downloading packages...

added 150 packages, and audited 151 packages in 5s

10 packages are looking for funding

found 0 vulnerabilities`;

    const result = compressPkgInstall(input);
    expect(result).toContain('added 150 packages');
    expect(result).toContain('found 0 vulnerabilities');
    expect(result).not.toContain('npm warn');
    expect(result).not.toContain('⠙');
    expect(result).not.toContain('⠹');
    expect(result.length).toBeLessThan(input.length * 0.5);
  });
});

// ─── compressDocker ──────────────────────────────────────────

describe('compressDocker', () => {
  it('compacts docker ps table', () => {
    const input = `CONTAINER ID   IMAGE          COMMAND       CREATED        STATUS        PORTS                    NAMES
abc123def456   nginx:latest   "nginx -g…"   2 hours ago    Up 2 hours    0.0.0.0:80->80/tcp       web
def456abc789   postgres:15    "docker-e…"   3 hours ago    Up 3 hours    0.0.0.0:5432->5432/tcp   db`;

    const result = compressDocker(input);
    expect(result).toContain('CONTAINER ID');
    expect(result).toContain('nginx');
    expect(result).toContain('postgres');
    // Should be more compact (fewer spaces)
    expect(result.length).toBeLessThanOrEqual(input.length);
  });
});

// ─── collapseRepeatedLines ───────────────────────────────────

describe('collapseRepeatedLines', () => {
  it('collapses 10+ identical lines', () => {
    const lines = ['Starting server...'];
    for (let i = 0; i < 50; i++) lines.push('Heartbeat OK');
    lines.push('Shutdown complete');

    const input = lines.join('\n');
    const result = collapseRepeatedLines(input);

    expect(result).toContain('Heartbeat OK');
    expect(result).toContain('repeated 50 times');
    expect(result).toContain('Shutdown complete');
    expect(result.split('\n').length).toBeLessThan(10);
  });

  it('passes through non-repetitive output unchanged', () => {
    const input = 'line 1\nline 2\nline 3\nline 4';
    expect(collapseRepeatedLines(input)).toBe(input);
  });
});

// ─── compressOutput (integration) ────────────────────────────

describe('compressOutput', () => {
  it('returns correct CompressionResult shape', () => {
    const result = compressOutput('git status', 'On branch main\n' + 'x'.repeat(300), false);
    expect(result).toHaveProperty('compressed');
    expect(result).toHaveProperty('originalBytes');
    expect(result).toHaveProperty('compressedBytes');
    expect(result).toHaveProperty('type');
    expect(result.type).toBe('git-status');
    expect(result.originalBytes).toBeGreaterThan(0);
    expect(result.compressedBytes).toBeLessThanOrEqual(result.originalBytes);
  });

  it('passes through small outputs unchanged', () => {
    const small = 'ok';
    const result = compressOutput('git push', small, false);
    expect(result.compressed).toBe(small);
    expect(result.type).toBe('default');
  });

  it('detects log-dedup for unrecognized commands with repetition', () => {
    const lines = ['echo starting'];
    for (let i = 0; i < 20; i++) lines.push('heartbeat check ok');
    lines.push('done');
    const input = lines.join('\n');

    const result = compressOutput('node server.js', input, false);
    expect(result.type).toBe('log-dedup');
    expect(result.compressedBytes).toBeLessThan(result.originalBytes);
  });

  it('preserves more on error for test runners', () => {
    const failOutput = `FAIL src/test.ts
 ✗ should work
   Error: expected true to be false
     at Object.<anonymous> (test.ts:5:10)

Tests  1 failed (1)`;

    const padded = failOutput + '\n' + 'x'.repeat(200); // pad to pass MIN_COMPRESS_SIZE
    const result = compressOutput('npm test', padded, true);
    expect(result.type).toBe('test-runner');
    expect(result.compressed).toContain('FAIL');
    expect(result.compressed).toContain('Error:');
  });

  it('compresses git push verbose output to one-liner', () => {
    const verbose = `Enumerating objects: 5, done.
Counting objects: 100% (5/5), done.
Delta compression using up to 8 threads
Compressing objects: 100% (3/3), done.
Writing objects: 100% (3/3), 500 bytes | 500.00 KiB/s, done.
Total 3 (delta 2), reused 0 (delta 0)
remote: Resolving deltas: 100% (2/2), completed with 2 local objects.
To github.com:user/repo.git
   aaa1111..bbb2222  main -> main`;

    const result = compressOutput('git push origin main', verbose, false);
    expect(result.type).toBe('git-oneshot');
    expect(result.compressed.split('\n').length).toBeLessThanOrEqual(2);
    expect(result.compressedBytes).toBeLessThan(result.originalBytes * 0.3);
  });
});
