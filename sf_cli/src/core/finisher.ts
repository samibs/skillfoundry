// Finisher — deterministic post-pipeline housekeeping.
// Runs 5 mechanical checks: version, test-count, architecture, changelog, git-clean.
// Zero AI cost. Auto-fixes what's mechanical, reports what needs human judgment.

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import type { FinisherCheckResult, FinisherCheckStatus, FinisherSummary } from '../types.js';

// ── Version helpers ────────────────────────────────────────────

/** Read the canonical version from .version file. */
export function readCanonicalVersion(workDir: string): string | null {
  const versionFile = join(workDir, '.version');
  if (!existsSync(versionFile)) return null;
  return readFileSync(versionFile, 'utf-8').trim();
}

/** Bump the patch component of a semver string. "2.0.14" → "2.0.15" */
export function bumpPatch(version: string): string {
  const parts = version.split('.');
  const last = parseInt(parts[parts.length - 1], 10);
  parts[parts.length - 1] = String(last + 1);
  return parts.join('.');
}

/** Version reference patterns in documentation files. */
const VERSION_REFS: { file: string; patterns: RegExp[] }[] = [
  {
    file: 'sf_cli/package.json',
    patterns: [/"version":\s*"(\d+\.\d+\.\d+)"/],
  },
  {
    file: 'README.md',
    patterns: [
      /version-(\d+\.\d+\.\d+)-blue/,              // badge
      /v(\d+\.\d+\.\d+)\s*$/m,                      // banner line
    ],
  },
  {
    file: 'docs/USER-GUIDE-CLI.md',
    patterns: [
      /\*\*v(\d+\.\d+\.\d+)\*\*/,                   // header blockquote
      /v(\d+\.\d+\.\d+)\s*—\s*February/,            // footer
    ],
  },
  {
    file: 'docs/TEST-SUITE-REFERENCE.md',
    patterns: [
      /\*\*Version:\*\*\s*(\d+\.\d+\.\d+)/,         // version field
      /SkillFoundry\s+v(\d+\.\d+\.\d+)/,            // footer
    ],
  },
];

/** Scan all version locations and return which ones match the expected version. */
export function checkVersionConsistency(
  workDir: string,
  expectedVersion: string,
): { location: string; file: string; found: string | null; matches: boolean }[] {
  const results: { location: string; file: string; found: string | null; matches: boolean }[] = [];

  for (const ref of VERSION_REFS) {
    const filePath = join(workDir, ref.file);
    if (!existsSync(filePath)) {
      results.push({ location: ref.file, file: ref.file, found: null, matches: false });
      continue;
    }
    const content = readFileSync(filePath, 'utf-8');
    for (const pattern of ref.patterns) {
      const match = content.match(pattern);
      const found = match ? match[1] : null;
      results.push({
        location: `${ref.file}:${pattern.source.slice(0, 30)}`,
        file: ref.file,
        found,
        matches: found === expectedVersion,
      });
    }
  }

  return results;
}

/** Fix version references: replace oldVersion with newVersion in all known locations. */
export function fixVersionReferences(
  workDir: string,
  oldVersion: string,
  newVersion: string,
): { file: string; updated: boolean }[] {
  const results: { file: string; updated: boolean }[] = [];
  const escaped = oldVersion.replace(/\./g, '\\.');

  // .version file
  const versionFile = join(workDir, '.version');
  if (existsSync(versionFile)) {
    writeFileSync(versionFile, newVersion + '\n', 'utf-8');
    results.push({ file: '.version', updated: true });
  }

  // package.json — parse and rewrite to preserve formatting
  const pkgFile = join(workDir, 'sf_cli/package.json');
  if (existsSync(pkgFile)) {
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf-8'));
    pkg.version = newVersion;
    writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    results.push({ file: 'sf_cli/package.json', updated: true });
  }

  // Text files — regex replace
  const textFiles = [
    'README.md',
    'docs/USER-GUIDE-CLI.md',
    'docs/TEST-SUITE-REFERENCE.md',
  ];

  for (const file of textFiles) {
    const filePath = join(workDir, file);
    if (!existsSync(filePath)) {
      results.push({ file, updated: false });
      continue;
    }
    const original = readFileSync(filePath, 'utf-8');
    const updated = original.replace(new RegExp(escaped, 'g'), newVersion);
    if (updated !== original) {
      writeFileSync(filePath, updated, 'utf-8');
      results.push({ file, updated: true });
    } else {
      results.push({ file, updated: false });
    }
  }

  return results;
}

/** Run the version check. In fix mode with storiesCompleted > 0, bumps patch first. */
export function runVersionCheck(
  workDir: string,
  mode: 'check' | 'fix',
  storiesCompleted: number,
): FinisherCheckResult {
  const start = Date.now();
  const currentVersion = readCanonicalVersion(workDir);

  if (!currentVersion) {
    return {
      check: 'version',
      status: 'error',
      detail: '.version file not found',
      fixed: false,
      durationMs: Date.now() - start,
    };
  }

  // In fix mode with completed stories, bump the patch version
  if (mode === 'fix' && storiesCompleted > 0) {
    const newVersion = bumpPatch(currentVersion);
    const fixResults = fixVersionReferences(workDir, currentVersion, newVersion);
    const updatedCount = fixResults.filter((r) => r.updated).length;

    return {
      check: 'version',
      status: 'ok',
      detail: `Bumped ${currentVersion} → ${newVersion} (${updatedCount} files updated)`,
      fixed: true,
      durationMs: Date.now() - start,
    };
  }

  // Check mode or no stories: just verify consistency
  const checks = checkVersionConsistency(workDir, currentVersion);
  const stale = checks.filter((c) => !c.matches);

  if (stale.length === 0) {
    return {
      check: 'version',
      status: 'ok',
      detail: `v${currentVersion} consistent across ${checks.length} locations`,
      fixed: false,
      durationMs: Date.now() - start,
    };
  }

  return {
    check: 'version',
    status: 'drift',
    detail: `v${currentVersion} stale in: ${stale.map((s) => s.file).join(', ')}`,
    fixed: false,
    durationMs: Date.now() - start,
  };
}

// ── Test count helpers ─────────────────────────────────────────

/** Get the actual test count by running vitest. Returns null if unavailable. */
export function getActualTestCount(workDir: string): number | null {
  try {
    const cliDir = join(workDir, 'sf_cli');
    const output = execSync('npx vitest run --reporter=json 2>/dev/null', {
      cwd: cliDir,
      timeout: 300_000,
      encoding: 'utf-8',
    });
    const json = JSON.parse(output);
    return typeof json.numTotalTests === 'number' ? json.numTotalTests : null;
  } catch {
    return null;
  }
}

/** Patterns where test counts appear in documentation. */
const TEST_COUNT_PATTERNS: { file: string; pattern: RegExp }[] = [
  { file: 'README.md', pattern: /(\d+)\+?\s*tests?\s*must\s*pass/i },
  { file: 'docs/USER-GUIDE-CLI.md', pattern: /(\d+)\s*tests?\s*across/i },
  { file: 'docs/TEST-SUITE-REFERENCE.md', pattern: /all\s+(\d+)\s+TypeScript/i },
  { file: 'docs/TEST-SUITE-REFERENCE.md', pattern: /TypeScript Unit Tests \((\d+) tests/ },
  { file: 'docs/TEST-SUITE-REFERENCE.md', pattern: /TypeScript Unit Tests\s*\|\s*(\d+)/ },
  { file: 'docs/TEST-SUITE-REFERENCE.md', pattern: /Run all (\d+) tests/ },
];

/** Scan docs for test count references and compare with actual count. */
export function checkTestCounts(
  workDir: string,
  actualCount: number,
): { file: string; found: number; expected: number }[] {
  const drifts: { file: string; found: number; expected: number }[] = [];

  for (const { file, pattern } of TEST_COUNT_PATTERNS) {
    const filePath = join(workDir, file);
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, 'utf-8');
    const match = content.match(pattern);
    if (match) {
      const found = parseInt(match[1], 10);
      if (found !== actualCount) {
        drifts.push({ file, found, expected: actualCount });
      }
    }
  }

  return drifts;
}

/** Fix test count references in docs by replacing old count with new. */
export function fixTestCounts(
  workDir: string,
  oldCount: number,
  newCount: number,
): { file: string; updated: boolean }[] {
  const results: { file: string; updated: boolean }[] = [];
  const files = new Set(TEST_COUNT_PATTERNS.map((p) => p.file));

  for (const file of files) {
    const filePath = join(workDir, file);
    if (!existsSync(filePath)) {
      results.push({ file, updated: false });
      continue;
    }
    const original = readFileSync(filePath, 'utf-8');
    // Replace the specific old count with new count in test-related contexts
    const updated = original.replace(
      new RegExp(`\\b${oldCount}(\\+?\\s*tests?)`, 'gi'),
      `${newCount}$1`,
    ).replace(
      new RegExp(`Tests \\(${oldCount} tests`, 'g'),
      `Tests (${newCount} tests`,
    ).replace(
      new RegExp(`Tests\\s*\\|\\s*${oldCount}`, 'g'),
      `Tests | ${newCount}`,
    ).replace(
      new RegExp(`all ${oldCount} TypeScript`, 'gi'),
      `all ${newCount} TypeScript`,
    ).replace(
      new RegExp(`Run all ${oldCount} tests`, 'g'),
      `Run all ${newCount} tests`,
    );

    if (updated !== original) {
      writeFileSync(filePath, updated, 'utf-8');
      results.push({ file, updated: true });
    } else {
      results.push({ file, updated: false });
    }
  }

  return results;
}

/** Run the test-count check. In fix mode, updates stale references. */
export function runTestCountCheck(
  workDir: string,
  mode: 'check' | 'fix',
): FinisherCheckResult {
  const start = Date.now();
  const actualCount = getActualTestCount(workDir);

  if (actualCount === null) {
    return {
      check: 'test-count',
      status: 'error',
      detail: 'Could not determine test count (vitest unavailable or failed)',
      fixed: false,
      durationMs: Date.now() - start,
    };
  }

  const drifts = checkTestCounts(workDir, actualCount);

  if (drifts.length === 0) {
    return {
      check: 'test-count',
      status: 'ok',
      detail: `${actualCount} tests — docs consistent`,
      fixed: false,
      durationMs: Date.now() - start,
    };
  }

  if (mode === 'fix') {
    // Find the most common old count to replace
    const oldCount = drifts[0].found;
    const fixResults = fixTestCounts(workDir, oldCount, actualCount);
    const updatedCount = fixResults.filter((r) => r.updated).length;

    return {
      check: 'test-count',
      status: 'ok',
      detail: `Updated ${oldCount} → ${actualCount} in ${updatedCount} files`,
      fixed: true,
      durationMs: Date.now() - start,
    };
  }

  return {
    check: 'test-count',
    status: 'drift',
    detail: `Actual: ${actualCount}, docs say: ${drifts.map((d) => `${d.file}=${d.found}`).join(', ')}`,
    fixed: false,
    durationMs: Date.now() - start,
  };
}

// ── Architecture listing helpers ───────────────────────────────

/** Scan src/core/ for all .ts files currently on disk. */
export function scanCoreModules(workDir: string): string[] {
  const coreDir = join(workDir, 'sf_cli/src/core');
  if (!existsSync(coreDir)) return [];
  return readdirSync(coreDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .sort();
}

/** Extract .ts filenames from the architecture tree diagram in USER-GUIDE-CLI.md. */
export function extractDocArchListing(workDir: string): string[] {
  const filePath = join(workDir, 'docs/USER-GUIDE-CLI.md');
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8');

  // Find the core/ section in the architecture tree
  const coreMatch = content.match(/│\s+├── core\/\n([\s\S]*?)(?=│\s+├── commands\/|│\s+├── hooks\/)/);
  if (!coreMatch) return [];

  const coreBlock = coreMatch[1];
  const files: string[] = [];
  const linePattern = /[├└]── (\w[\w.-]+\.ts)/g;
  let match;
  while ((match = linePattern.exec(coreBlock)) !== null) {
    files.push(match[1]);
  }
  return files.sort();
}

/** Compare on-disk modules with documented modules. */
export function diffArchListing(
  onDisk: string[],
  inDocs: string[],
): { missing: string[]; extra: string[] } {
  const diskSet = new Set(onDisk);
  const docsSet = new Set(inDocs);
  return {
    missing: onDisk.filter((f) => !docsSet.has(f)),   // on disk, not in docs
    extra: inDocs.filter((f) => !diskSet.has(f)),      // in docs, not on disk
  };
}

/** Run the architecture listing check. Report only — no auto-fix. */
export function runArchitectureCheck(
  workDir: string,
  _mode: 'check' | 'fix',
): FinisherCheckResult {
  const start = Date.now();
  const onDisk = scanCoreModules(workDir);
  const inDocs = extractDocArchListing(workDir);

  if (onDisk.length === 0) {
    return {
      check: 'architecture',
      status: 'error',
      detail: 'Could not scan sf_cli/src/core/',
      fixed: false,
      durationMs: Date.now() - start,
    };
  }

  const diff = diffArchListing(onDisk, inDocs);

  if (diff.missing.length === 0 && diff.extra.length === 0) {
    return {
      check: 'architecture',
      status: 'ok',
      detail: `${onDisk.length} modules — docs match`,
      fixed: false,
      durationMs: Date.now() - start,
    };
  }

  const parts: string[] = [];
  if (diff.missing.length > 0) parts.push(`missing from docs: ${diff.missing.join(', ')}`);
  if (diff.extra.length > 0) parts.push(`in docs but not on disk: ${diff.extra.join(', ')}`);

  return {
    check: 'architecture',
    status: 'drift',
    detail: parts.join('; '),
    fixed: false,
    durationMs: Date.now() - start,
  };
}

// ── Changelog helpers ──────────────────────────────────────────

/** Check whether the CHANGELOG.md has an entry for the given version. */
export function checkChangelogEntry(workDir: string, version: string): boolean {
  const filePath = join(workDir, 'CHANGELOG.md');
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, 'utf-8');
  const escaped = version.replace(/\./g, '\\.');
  return new RegExp(`^## \\[${escaped}\\]`, 'm').test(content);
}

/** Run the CHANGELOG check. In fix mode, inserts a placeholder heading if missing. */
export function runChangelogCheck(
  workDir: string,
  mode: 'check' | 'fix',
  version: string,
): FinisherCheckResult {
  const start = Date.now();
  const filePath = join(workDir, 'CHANGELOG.md');

  if (!existsSync(filePath)) {
    return {
      check: 'changelog',
      status: 'error',
      detail: 'CHANGELOG.md not found',
      fixed: false,
      durationMs: Date.now() - start,
    };
  }

  if (checkChangelogEntry(workDir, version)) {
    return {
      check: 'changelog',
      status: 'ok',
      detail: `[${version}] entry found`,
      fixed: false,
      durationMs: Date.now() - start,
    };
  }

  if (mode === 'fix') {
    const content = readFileSync(filePath, 'utf-8');
    const today = new Date().toISOString().slice(0, 10);
    const placeholder = `## [${version}] - ${today}\n\n### Changed\n\n`;
    // Insert before the first existing version heading
    const insertPoint = content.search(/^## \[/m);
    const updated = insertPoint >= 0
      ? content.slice(0, insertPoint) + placeholder + content.slice(insertPoint)
      : content + '\n' + placeholder;
    writeFileSync(filePath, updated, 'utf-8');

    return {
      check: 'changelog',
      status: 'ok',
      detail: `Inserted [${version}] placeholder`,
      fixed: true,
      durationMs: Date.now() - start,
    };
  }

  return {
    check: 'changelog',
    status: 'missing',
    detail: `No [${version}] entry in CHANGELOG.md`,
    fixed: false,
    durationMs: Date.now() - start,
  };
}

// ── Git clean helpers ──────────────────────────────────────────

/** Check for uncommitted changes. */
export function checkGitClean(workDir: string): { clean: boolean; summary: string } {
  try {
    const output = execSync('git status --porcelain', {
      cwd: workDir,
      encoding: 'utf-8',
      timeout: 10_000,
    }).trim();

    if (!output) {
      return { clean: true, summary: 'Working tree clean' };
    }

    const lines = output.split('\n');
    const modified = lines.filter((l) => l.startsWith(' M') || l.startsWith('M ')).length;
    const untracked = lines.filter((l) => l.startsWith('??')).length;
    const other = lines.length - modified - untracked;
    const parts: string[] = [];
    if (modified > 0) parts.push(`${modified} modified`);
    if (untracked > 0) parts.push(`${untracked} untracked`);
    if (other > 0) parts.push(`${other} other`);
    return { clean: false, summary: parts.join(', ') };
  } catch {
    return { clean: true, summary: 'Could not check git status' };
  }
}

/** Run the git-clean check. Never auto-fixes. */
export function runGitCleanCheck(
  workDir: string,
  _mode: 'check' | 'fix',
): FinisherCheckResult {
  const start = Date.now();
  const result = checkGitClean(workDir);

  return {
    check: 'git-clean',
    status: result.clean ? 'ok' : 'drift',
    detail: result.summary,
    fixed: false,
    durationMs: Date.now() - start,
  };
}

// ── Main entry point ───────────────────────────────────────────

export interface FinisherOptions {
  workDir: string;
  mode: 'check' | 'fix';
  storiesCompleted: number;
  onCheck?: (result: FinisherCheckResult) => void;
}

/**
 * Run all finisher checks in sequence.
 * Order: version → test-count → architecture → changelog → git-clean
 */
export async function runFinisher(options: FinisherOptions): Promise<FinisherSummary> {
  const totalStart = Date.now();
  const checks: FinisherCheckResult[] = [];

  // 1. Version (bumps first, so changelog can check the new version)
  const versionResult = runVersionCheck(options.workDir, options.mode, options.storiesCompleted);
  checks.push(versionResult);
  options.onCheck?.(versionResult);

  // Read the (possibly bumped) version for changelog check
  const currentVersion = readCanonicalVersion(options.workDir) || '0.0.0';

  // 2. Test count
  const testResult = runTestCountCheck(options.workDir, options.mode);
  checks.push(testResult);
  options.onCheck?.(testResult);

  // 3. Architecture listing
  const archResult = runArchitectureCheck(options.workDir, options.mode);
  checks.push(archResult);
  options.onCheck?.(archResult);

  // 4. Changelog
  const changelogResult = runChangelogCheck(options.workDir, options.mode, currentVersion);
  checks.push(changelogResult);
  options.onCheck?.(changelogResult);

  // 5. Git clean (last, after all fixes may have dirtied the tree)
  const gitResult = runGitCleanCheck(options.workDir, options.mode);
  checks.push(gitResult);
  options.onCheck?.(gitResult);

  // Aggregate
  const drifted = checks.filter((c) => c.status === 'drift' || c.status === 'missing').length;
  const fixed = checks.filter((c) => c.fixed).length;
  const ok = checks.filter((c) => c.status === 'ok').length;
  const errors = checks.filter((c) => c.status === 'error').length;

  // Determine new version if bump happened
  let newVersion: string | undefined;
  if (versionResult.fixed && versionResult.detail.includes('→')) {
    const match = versionResult.detail.match(/→\s*(\d+\.\d+\.\d+)/);
    if (match) newVersion = match[1];
  }

  return {
    checks,
    totalChecks: checks.length,
    drifted,
    fixed,
    ok,
    errors,
    durationMs: Date.now() - totalStart,
    newVersion,
  };
}
