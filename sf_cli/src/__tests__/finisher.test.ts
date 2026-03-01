import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock child_process so we can control execSync for vitest + git calls
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';

import {
  readCanonicalVersion,
  bumpPatch,
  checkVersionConsistency,
  fixVersionReferences,
  runVersionCheck,
  getActualTestCount,
  checkTestCounts,
  fixTestCounts,
  runTestCountCheck,
  scanCoreModules,
  extractDocArchListing,
  diffArchListing,
  runArchitectureCheck,
  checkChangelogEntry,
  runChangelogCheck,
  checkGitClean,
  runGitCleanCheck,
  runFinisher,
} from '../core/finisher.js';

const TEST_DIR = join(tmpdir(), 'sf-finisher-test-' + Date.now());

beforeEach(() => {
  vi.clearAllMocks();
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// ── Version helpers ──────────────────────────────────────────

describe('bumpPatch', () => {
  it('increments patch version', () => {
    expect(bumpPatch('2.0.14')).toBe('2.0.15');
  });

  it('handles rollover past 9', () => {
    expect(bumpPatch('1.0.9')).toBe('1.0.10');
  });

  it('handles single-digit version', () => {
    expect(bumpPatch('0.0.0')).toBe('0.0.1');
  });
});

describe('readCanonicalVersion', () => {
  it('reads version from .version file', () => {
    writeFileSync(join(TEST_DIR, '.version'), '2.0.14\n');
    expect(readCanonicalVersion(TEST_DIR)).toBe('2.0.14');
  });

  it('returns null when .version does not exist', () => {
    expect(readCanonicalVersion(TEST_DIR)).toBeNull();
  });

  it('trims whitespace from version', () => {
    writeFileSync(join(TEST_DIR, '.version'), '  3.1.5  \n');
    expect(readCanonicalVersion(TEST_DIR)).toBe('3.1.5');
  });
});

describe('checkVersionConsistency', () => {
  it('detects consistent versions across all locations', () => {
    // Create all version-bearing files
    mkdirSync(join(TEST_DIR, 'sf_cli'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'sf_cli/package.json'), JSON.stringify({ version: '2.0.14' }), 'utf-8');
    writeFileSync(join(TEST_DIR, 'README.md'), 'version-2.0.14-blue\nv2.0.14\n');
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'docs/USER-GUIDE-CLI.md'), '**v2.0.14**\nv2.0.14 — February 2026');
    writeFileSync(join(TEST_DIR, 'docs/TEST-SUITE-REFERENCE.md'), '**Version:** 2.0.14\nSkillFoundry v2.0.14');

    const results = checkVersionConsistency(TEST_DIR, '2.0.14');
    const allMatch = results.every((r) => r.matches);
    expect(allMatch).toBe(true);
  });

  it('detects version drift', () => {
    mkdirSync(join(TEST_DIR, 'sf_cli'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'sf_cli/package.json'), JSON.stringify({ version: '2.0.13' }), 'utf-8');

    const results = checkVersionConsistency(TEST_DIR, '2.0.14');
    const drifted = results.filter((r) => !r.matches && r.found !== null);
    expect(drifted.length).toBeGreaterThan(0);
    expect(drifted[0].found).toBe('2.0.13');
  });

  it('reports missing files', () => {
    // No files created — all should be missing
    const results = checkVersionConsistency(TEST_DIR, '2.0.14');
    const missing = results.filter((r) => r.found === null);
    expect(missing.length).toBeGreaterThan(0);
  });
});

describe('fixVersionReferences', () => {
  beforeEach(() => {
    mkdirSync(join(TEST_DIR, 'sf_cli'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true });
    writeFileSync(join(TEST_DIR, '.version'), '2.0.14\n');
    writeFileSync(join(TEST_DIR, 'sf_cli/package.json'), JSON.stringify({ version: '2.0.14' }, null, 2));
    writeFileSync(join(TEST_DIR, 'README.md'), 'version-2.0.14-blue\nv2.0.14\n');
    writeFileSync(join(TEST_DIR, 'docs/USER-GUIDE-CLI.md'), '**v2.0.14**\nv2.0.14 — February');
    writeFileSync(join(TEST_DIR, 'docs/TEST-SUITE-REFERENCE.md'), '**Version:** 2.0.14\nSkillFoundry v2.0.14');
  });

  it('updates all version locations', () => {
    const results = fixVersionReferences(TEST_DIR, '2.0.14', '2.0.15');
    const updated = results.filter((r) => r.updated);
    expect(updated.length).toBe(5); // .version, package.json, README, USER-GUIDE, TEST-SUITE

    // Verify .version
    expect(readFileSync(join(TEST_DIR, '.version'), 'utf-8').trim()).toBe('2.0.15');

    // Verify package.json
    const pkg = JSON.parse(readFileSync(join(TEST_DIR, 'sf_cli/package.json'), 'utf-8'));
    expect(pkg.version).toBe('2.0.15');

    // Verify README
    const readme = readFileSync(join(TEST_DIR, 'README.md'), 'utf-8');
    expect(readme).toContain('2.0.15');
    expect(readme).not.toContain('2.0.14');
  });

  it('skips missing files without errors', () => {
    // Remove docs dir
    rmSync(join(TEST_DIR, 'docs'), { recursive: true, force: true });

    const results = fixVersionReferences(TEST_DIR, '2.0.14', '2.0.15');
    // .version and package.json should still update
    const updated = results.filter((r) => r.updated);
    expect(updated.length).toBe(3); // .version, package.json, README
  });
});

describe('runVersionCheck', () => {
  it('returns error when .version file is missing', () => {
    const result = runVersionCheck(TEST_DIR, 'check', 0);
    expect(result.check).toBe('version');
    expect(result.status).toBe('error');
    expect(result.detail).toContain('.version file not found');
  });

  it('reports consistent in check mode', () => {
    writeFileSync(join(TEST_DIR, '.version'), '2.0.14\n');
    mkdirSync(join(TEST_DIR, 'sf_cli'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'sf_cli/package.json'), JSON.stringify({ version: '2.0.14' }));
    writeFileSync(join(TEST_DIR, 'README.md'), 'version-2.0.14-blue\nv2.0.14\n');
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'docs/USER-GUIDE-CLI.md'), '**v2.0.14**\nv2.0.14 — February');
    writeFileSync(join(TEST_DIR, 'docs/TEST-SUITE-REFERENCE.md'), '**Version:** 2.0.14\nSkillFoundry v2.0.14');

    const result = runVersionCheck(TEST_DIR, 'check', 0);
    expect(result.status).toBe('ok');
    expect(result.fixed).toBe(false);
  });

  it('bumps version in fix mode when stories completed > 0', () => {
    writeFileSync(join(TEST_DIR, '.version'), '2.0.14\n');
    mkdirSync(join(TEST_DIR, 'sf_cli'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'sf_cli/package.json'), JSON.stringify({ version: '2.0.14' }));
    writeFileSync(join(TEST_DIR, 'README.md'), 'v2.0.14\n');
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'docs/USER-GUIDE-CLI.md'), '**v2.0.14**');
    writeFileSync(join(TEST_DIR, 'docs/TEST-SUITE-REFERENCE.md'), '**Version:** 2.0.14');

    const result = runVersionCheck(TEST_DIR, 'fix', 5);
    expect(result.status).toBe('ok');
    expect(result.fixed).toBe(true);
    expect(result.detail).toContain('2.0.14 → 2.0.15');

    // Verify bump happened
    expect(readFileSync(join(TEST_DIR, '.version'), 'utf-8').trim()).toBe('2.0.15');
  });

  it('does not bump in fix mode when 0 stories completed', () => {
    writeFileSync(join(TEST_DIR, '.version'), '2.0.14\n');

    const result = runVersionCheck(TEST_DIR, 'fix', 0);
    expect(result.fixed).toBe(false);

    // Version should remain unchanged
    expect(readFileSync(join(TEST_DIR, '.version'), 'utf-8').trim()).toBe('2.0.14');
  });
});

// ── Test count helpers ───────────────────────────────────────

describe('getActualTestCount', () => {
  it('parses vitest JSON output', () => {
    vi.mocked(execSync).mockReturnValue(JSON.stringify({ numTotalTests: 328 }));
    expect(getActualTestCount(TEST_DIR)).toBe(328);
  });

  it('returns null when vitest fails', () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('vitest not found'); });
    expect(getActualTestCount(TEST_DIR)).toBeNull();
  });

  it('returns null when JSON has no numTotalTests', () => {
    vi.mocked(execSync).mockReturnValue(JSON.stringify({ otherField: true }));
    expect(getActualTestCount(TEST_DIR)).toBeNull();
  });
});

describe('checkTestCounts', () => {
  it('returns empty when docs match actual count', () => {
    writeFileSync(join(TEST_DIR, 'README.md'), '328 tests must pass');
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'docs/USER-GUIDE-CLI.md'), '328 tests across');
    writeFileSync(join(TEST_DIR, 'docs/TEST-SUITE-REFERENCE.md'), 'all 328 TypeScript\nTypeScript Unit Tests (328 tests\nTypeScript Unit Tests | 328\nRun all 328 tests');

    const drifts = checkTestCounts(TEST_DIR, 328);
    expect(drifts).toHaveLength(0);
  });

  it('detects drift when docs have stale count', () => {
    writeFileSync(join(TEST_DIR, 'README.md'), '308 tests must pass');

    const drifts = checkTestCounts(TEST_DIR, 328);
    expect(drifts.length).toBeGreaterThan(0);
    expect(drifts[0].found).toBe(308);
    expect(drifts[0].expected).toBe(328);
  });
});

describe('fixTestCounts', () => {
  it('replaces old count with new count in docs', () => {
    writeFileSync(join(TEST_DIR, 'README.md'), '308 tests must pass');
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'docs/USER-GUIDE-CLI.md'), '308 tests across all files');
    writeFileSync(join(TEST_DIR, 'docs/TEST-SUITE-REFERENCE.md'), 'Run all 308 tests');

    const results = fixTestCounts(TEST_DIR, 308, 328);
    const updated = results.filter((r) => r.updated);
    expect(updated.length).toBe(3);

    expect(readFileSync(join(TEST_DIR, 'README.md'), 'utf-8')).toContain('328 tests must pass');
    expect(readFileSync(join(TEST_DIR, 'docs/USER-GUIDE-CLI.md'), 'utf-8')).toContain('328 tests across');
  });
});

describe('runTestCountCheck', () => {
  it('returns error when vitest unavailable', () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('nope'); });
    const result = runTestCountCheck(TEST_DIR, 'check');
    expect(result.check).toBe('test-count');
    expect(result.status).toBe('error');
  });

  it('reports ok when docs match', () => {
    vi.mocked(execSync).mockReturnValue(JSON.stringify({ numTotalTests: 328 }));
    writeFileSync(join(TEST_DIR, 'README.md'), '328 tests must pass');
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'docs/USER-GUIDE-CLI.md'), '328 tests across');
    writeFileSync(join(TEST_DIR, 'docs/TEST-SUITE-REFERENCE.md'), 'all 328 TypeScript');

    const result = runTestCountCheck(TEST_DIR, 'check');
    expect(result.status).toBe('ok');
    expect(result.fixed).toBe(false);
  });

  it('fixes drift in fix mode', () => {
    vi.mocked(execSync).mockReturnValue(JSON.stringify({ numTotalTests: 328 }));
    writeFileSync(join(TEST_DIR, 'README.md'), '308 tests must pass');

    const result = runTestCountCheck(TEST_DIR, 'fix');
    expect(result.status).toBe('ok');
    expect(result.fixed).toBe(true);
    expect(readFileSync(join(TEST_DIR, 'README.md'), 'utf-8')).toContain('328 tests must pass');
  });
});

// ── Architecture listing helpers ─────────────────────────────

describe('scanCoreModules', () => {
  it('lists .ts files in core directory', () => {
    const coreDir = join(TEST_DIR, 'sf_cli/src/core');
    mkdirSync(coreDir, { recursive: true });
    writeFileSync(join(coreDir, 'pipeline.ts'), '');
    writeFileSync(join(coreDir, 'gates.ts'), '');
    writeFileSync(join(coreDir, 'finisher.ts'), '');

    const modules = scanCoreModules(TEST_DIR);
    expect(modules).toEqual(['finisher.ts', 'gates.ts', 'pipeline.ts']);
  });

  it('returns empty array for missing directory', () => {
    expect(scanCoreModules(TEST_DIR)).toEqual([]);
  });

  it('excludes .d.ts declaration files', () => {
    const coreDir = join(TEST_DIR, 'sf_cli/src/core');
    mkdirSync(coreDir, { recursive: true });
    writeFileSync(join(coreDir, 'pipeline.ts'), '');
    writeFileSync(join(coreDir, 'pipeline.d.ts'), '');

    const modules = scanCoreModules(TEST_DIR);
    expect(modules).toEqual(['pipeline.ts']);
  });
});

describe('extractDocArchListing', () => {
  it('parses .ts filenames from architecture tree', () => {
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'docs/USER-GUIDE-CLI.md'), `
# Architecture

\`\`\`
│   ├── core/
│   │   ├── pipeline.ts
│   │   ├── gates.ts
│   │   └── finisher.ts
│   ├── commands/
│   │   └── forge.ts
\`\`\`
`);

    const files = extractDocArchListing(TEST_DIR);
    expect(files).toEqual(['finisher.ts', 'gates.ts', 'pipeline.ts']);
  });

  it('returns empty array when file is missing', () => {
    expect(extractDocArchListing(TEST_DIR)).toEqual([]);
  });
});

describe('diffArchListing', () => {
  it('detects modules missing from docs', () => {
    const result = diffArchListing(
      ['finisher.ts', 'gates.ts', 'pipeline.ts'],
      ['gates.ts', 'pipeline.ts'],
    );
    expect(result.missing).toEqual(['finisher.ts']);
    expect(result.extra).toEqual([]);
  });

  it('detects modules in docs but not on disk', () => {
    const result = diffArchListing(
      ['gates.ts', 'pipeline.ts'],
      ['gates.ts', 'old-module.ts', 'pipeline.ts'],
    );
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual(['old-module.ts']);
  });

  it('returns empty arrays when lists match', () => {
    const result = diffArchListing(
      ['gates.ts', 'pipeline.ts'],
      ['gates.ts', 'pipeline.ts'],
    );
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual([]);
  });
});

describe('runArchitectureCheck', () => {
  it('reports drift when modules missing from docs', () => {
    // Create on-disk modules
    const coreDir = join(TEST_DIR, 'sf_cli/src/core');
    mkdirSync(coreDir, { recursive: true });
    writeFileSync(join(coreDir, 'pipeline.ts'), '');
    writeFileSync(join(coreDir, 'gates.ts'), '');
    writeFileSync(join(coreDir, 'finisher.ts'), '');

    // Create docs with only 2 modules
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'docs/USER-GUIDE-CLI.md'), `
│   ├── core/
│   │   ├── pipeline.ts
│   │   └── gates.ts
│   ├── commands/
`);

    const result = runArchitectureCheck(TEST_DIR, 'fix');
    expect(result.status).toBe('drift');
    expect(result.detail).toContain('finisher.ts');
    expect(result.fixed).toBe(false); // Architecture never auto-fixes
  });

  it('reports ok when listing matches', () => {
    const coreDir = join(TEST_DIR, 'sf_cli/src/core');
    mkdirSync(coreDir, { recursive: true });
    writeFileSync(join(coreDir, 'pipeline.ts'), '');
    writeFileSync(join(coreDir, 'gates.ts'), '');

    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'docs/USER-GUIDE-CLI.md'), `
│   ├── core/
│   │   ├── pipeline.ts
│   │   └── gates.ts
│   ├── commands/
`);

    const result = runArchitectureCheck(TEST_DIR, 'check');
    expect(result.status).toBe('ok');
  });
});

// ── Changelog helpers ────────────────────────────────────────

describe('checkChangelogEntry', () => {
  it('returns true when version entry exists', () => {
    writeFileSync(join(TEST_DIR, 'CHANGELOG.md'), '# Changelog\n\n## [2.0.14] - 2026-02-25\n\n### Changed\n- Stuff\n');
    expect(checkChangelogEntry(TEST_DIR, '2.0.14')).toBe(true);
  });

  it('returns false when version entry is missing', () => {
    writeFileSync(join(TEST_DIR, 'CHANGELOG.md'), '# Changelog\n\n## [2.0.13] - 2026-02-20\n\n### Changed\n- Old stuff\n');
    expect(checkChangelogEntry(TEST_DIR, '2.0.14')).toBe(false);
  });

  it('returns false when CHANGELOG.md does not exist', () => {
    expect(checkChangelogEntry(TEST_DIR, '2.0.14')).toBe(false);
  });
});

describe('runChangelogCheck', () => {
  it('reports ok when entry exists', () => {
    writeFileSync(join(TEST_DIR, 'CHANGELOG.md'), '# Changelog\n\n## [2.0.14] - 2026-02-25\n\n### Changed\n');
    const result = runChangelogCheck(TEST_DIR, 'check', '2.0.14');
    expect(result.status).toBe('ok');
    expect(result.fixed).toBe(false);
  });

  it('reports missing in check mode when entry absent', () => {
    writeFileSync(join(TEST_DIR, 'CHANGELOG.md'), '# Changelog\n\n## [2.0.13] - 2026-02-20\n');
    const result = runChangelogCheck(TEST_DIR, 'check', '2.0.14');
    expect(result.status).toBe('missing');
    expect(result.fixed).toBe(false);
  });

  it('inserts placeholder in fix mode when entry absent', () => {
    writeFileSync(join(TEST_DIR, 'CHANGELOG.md'), '# Changelog\n\n## [2.0.13] - 2026-02-20\n\n### Changed\n- Old\n');
    const result = runChangelogCheck(TEST_DIR, 'fix', '2.0.14');
    expect(result.status).toBe('ok');
    expect(result.fixed).toBe(true);
    expect(result.detail).toContain('[2.0.14] placeholder');

    const content = readFileSync(join(TEST_DIR, 'CHANGELOG.md'), 'utf-8');
    expect(content).toContain('## [2.0.14]');
    // Existing entry should still be there
    expect(content).toContain('## [2.0.13]');
  });

  it('returns error when CHANGELOG.md is missing', () => {
    const result = runChangelogCheck(TEST_DIR, 'fix', '2.0.14');
    expect(result.status).toBe('error');
  });
});

// ── Git clean helpers ────────────────────────────────────────

describe('checkGitClean', () => {
  it('reports clean when no changes', () => {
    vi.mocked(execSync).mockReturnValue('');
    const result = checkGitClean(TEST_DIR);
    expect(result.clean).toBe(true);
  });

  it('reports dirty with modified file counts', () => {
    vi.mocked(execSync).mockReturnValue(' M src/types.ts\n M src/core/pipeline.ts\n?? newfile.ts\n');
    const result = checkGitClean(TEST_DIR);
    expect(result.clean).toBe(false);
    expect(result.summary).toContain('2 modified');
    expect(result.summary).toContain('1 untracked');
  });
});

describe('runGitCleanCheck', () => {
  it('never sets fixed to true', () => {
    vi.mocked(execSync).mockReturnValue(' M file.ts\n');
    const result = runGitCleanCheck(TEST_DIR, 'fix');
    expect(result.fixed).toBe(false);
    expect(result.status).toBe('drift');
  });

  it('reports ok when clean', () => {
    vi.mocked(execSync).mockReturnValue('');
    const result = runGitCleanCheck(TEST_DIR, 'check');
    expect(result.status).toBe('ok');
  });
});

// ── Integration: runFinisher ─────────────────────────────────

describe('runFinisher', () => {
  it('runs all 5 checks and returns summary', async () => {
    // Setup minimal files
    writeFileSync(join(TEST_DIR, '.version'), '2.0.14\n');
    writeFileSync(join(TEST_DIR, 'CHANGELOG.md'), '# Changelog\n\n## [2.0.14] - 2026-02-25\n');

    // Mock execSync for vitest (test count) and git
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('vitest')) {
        return JSON.stringify({ numTotalTests: 328 });
      }
      if (typeof cmd === 'string' && cmd.includes('git status')) {
        return '';
      }
      return '';
    });

    const summary = await runFinisher({
      workDir: TEST_DIR,
      mode: 'check',
      storiesCompleted: 0,
    });

    expect(summary.totalChecks).toBe(5);
    expect(summary.checks).toHaveLength(5);
    expect(summary.checks.map((c) => c.check)).toEqual([
      'version', 'test-count', 'architecture', 'changelog', 'git-clean',
    ]);
  });

  it('fires onCheck callback for each check', async () => {
    writeFileSync(join(TEST_DIR, '.version'), '2.0.14\n');
    writeFileSync(join(TEST_DIR, 'CHANGELOG.md'), '# Changelog\n\n## [2.0.14] - 2026-02-25\n');

    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('vitest')) {
        return JSON.stringify({ numTotalTests: 100 });
      }
      return '';
    });

    const onCheck = vi.fn();

    await runFinisher({
      workDir: TEST_DIR,
      mode: 'check',
      storiesCompleted: 0,
      onCheck,
    });

    expect(onCheck).toHaveBeenCalledTimes(5);
    expect(onCheck).toHaveBeenCalledWith(expect.objectContaining({ check: 'version' }));
    expect(onCheck).toHaveBeenCalledWith(expect.objectContaining({ check: 'git-clean' }));
  });

  it('aggregates summary counts correctly', async () => {
    // Version ok, test-count error, architecture drift, changelog missing, git ok
    writeFileSync(join(TEST_DIR, '.version'), '2.0.14\n');
    // No CHANGELOG = error, no core dir = architecture error

    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('vitest')) {
        throw new Error('no vitest');
      }
      if (typeof cmd === 'string' && cmd.includes('git status')) {
        return '';
      }
      return '';
    });

    const summary = await runFinisher({
      workDir: TEST_DIR,
      mode: 'check',
      storiesCompleted: 0,
    });

    // Should have a mix of ok, error, missing statuses
    expect(summary.ok + summary.drifted + summary.errors).toBe(5);
  });

  it('bumps version in fix mode and reports newVersion', async () => {
    writeFileSync(join(TEST_DIR, '.version'), '2.0.14\n');
    mkdirSync(join(TEST_DIR, 'sf_cli'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'sf_cli/package.json'), JSON.stringify({ version: '2.0.14' }));
    writeFileSync(join(TEST_DIR, 'README.md'), 'v2.0.14\n');
    mkdirSync(join(TEST_DIR, 'docs'), { recursive: true });
    writeFileSync(join(TEST_DIR, 'docs/USER-GUIDE-CLI.md'), '**v2.0.14**');
    writeFileSync(join(TEST_DIR, 'docs/TEST-SUITE-REFERENCE.md'), '**Version:** 2.0.14');
    writeFileSync(join(TEST_DIR, 'CHANGELOG.md'), '# Changelog\n\n## [2.0.14] - 2026-02-25\n');

    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('vitest')) {
        return JSON.stringify({ numTotalTests: 328 });
      }
      if (typeof cmd === 'string' && cmd.includes('git status')) {
        return '';
      }
      return '';
    });

    const summary = await runFinisher({
      workDir: TEST_DIR,
      mode: 'fix',
      storiesCompleted: 3,
    });

    expect(summary.newVersion).toBe('2.0.15');
    expect(readFileSync(join(TEST_DIR, '.version'), 'utf-8').trim()).toBe('2.0.15');
  });

  it('check mode does not modify files', async () => {
    writeFileSync(join(TEST_DIR, '.version'), '2.0.14\n');
    writeFileSync(join(TEST_DIR, 'CHANGELOG.md'), '# Changelog\n\n## [2.0.13] - 2026-02-20\n');

    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('vitest')) {
        return JSON.stringify({ numTotalTests: 328 });
      }
      if (typeof cmd === 'string' && cmd.includes('git status')) {
        return '';
      }
      return '';
    });

    await runFinisher({
      workDir: TEST_DIR,
      mode: 'check',
      storiesCompleted: 5,
    });

    // Version should NOT have been bumped
    expect(readFileSync(join(TEST_DIR, '.version'), 'utf-8').trim()).toBe('2.0.14');
    // Changelog should NOT have been modified
    expect(readFileSync(join(TEST_DIR, 'CHANGELOG.md'), 'utf-8')).not.toContain('[2.0.14]');
  });
});
