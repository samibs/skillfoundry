/**
 * RegForge Certification Engine — Static analysis pipeline for project certification.
 *
 * 11 audit categories, weighted scoring, grade computation (A-F),
 * HTML report generation, and DB persistence. No LLM calls.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename, extname, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

// ── Types ───────────────────────────────────────────────────────

export interface CertFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  title: string;
  description: string;
  file?: string;
  line?: number;
  recommendation: string;
}

export interface CategoryResult {
  category: string;
  score: number;
  pass: boolean;
  weight: number;
  findings: CertFinding[];
  durationMs: number;
}

export type CertGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface CertificationResult {
  id: string;
  projectPath: string;
  projectName: string;
  grade: CertGrade;
  overallScore: number;
  categories: CategoryResult[];
  totalFindings: number;
  findingsBySeverity: Record<string, number>;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface CertificationOptions {
  projectPath: string;
  categories?: string[];
}

// ── Constants ───────────────────────────────────────────────────

const LINE = '\u2501';
const SEVERITY_DEDUCTION: Record<string, number> = {
  critical: 20, high: 15, medium: 10, low: 5, info: 0,
};

const CATEGORY_WEIGHTS: Record<string, number> = {
  security: 15, testing: 15, documentation: 10, dependencies: 10,
  license: 10, accessibility: 10, privacy: 10, architecture: 8,
  seo: 4, performance: 4, 'ci-cd': 4,
};

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '.next', '__pycache__',
  'venv', '.venv', 'vendor', 'coverage', '.cache', 'data',
]);

// ── File Scanning Utilities ─────────────────────────────────────

function walkFiles(dir: string, maxDepth = 4, depth = 0): string[] {
  if (depth > maxDepth || !existsSync(dir)) return [];
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkFiles(full, maxDepth, depth + 1));
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  } catch { /* permission denied, etc. */ }
  return files;
}

function readSafe(path: string): string {
  try { return readFileSync(path, 'utf-8'); } catch { return ''; }
}

function fileExists(dir: string, ...names: string[]): boolean {
  return names.some((n) => existsSync(join(dir, n)));
}

function countByExt(files: string[], ...exts: string[]): number {
  return files.filter((f) => exts.includes(extname(f).toLowerCase())).length;
}

/**
 * Files that contain security patterns as definitions/samples (not actual vulnerabilities).
 * These are excluded from security scanning to prevent false positives.
 */
const SECURITY_SCAN_EXCLUDE_FILES = new Set([
  'quality-benchmark.ts',    // intentional bad-pattern samples for gate testing
  'semgrep-scanner.ts',      // contains regex pattern definitions
  'certification-engine.ts', // contains regex patterns as scan rules (self-referential)
  'team-config.ts',          // contains banned_patterns list as strings
  'migrate-platform-memory.ts', // contains historical incident descriptions
]);

/**
 * Files where innerHTML is expected (HTML rendering, not user-input injection).
 * These get a reduced severity (info instead of high) since the content is
 * server-generated, not user-supplied.
 */
const INNERHTML_SAFE_CONTEXTS = new Set([
  'dashboard.html',          // server-rendered dashboard UI
  'trace-viewer.html',       // dev-only trace viewer
  'report.html',             // generated report output
  'regforge-report.html',    // certification report output
  'app.js',                  // marketing site UI rendering
]);

/**
 * Files that map environment variable names (not values).
 */
const CREDENTIAL_MAP_FILES = new Set([
  'credentials.ts',          // maps env var names like ANTHROPIC_API_KEY
]);

function scanForPatterns(files: string[], patterns: RegExp[], skipTest = true): CertFinding[] {
  const findings: CertFinding[] = [];
  for (const file of files) {
    const rel = basename(file);

    // Skip test files
    if (skipTest && (/\.test\.|\.spec\.|__tests__|test[/\\]/i.test(file))) continue;
    // Skip build artifacts, scripts, and generated content
    if (/node_modules|dist[/\\]|build[/\\]|\.min\.|scripts[/\\]|data[/\\]/i.test(file)) continue;
    // Skip files that define patterns (not use them)
    if (SECURITY_SCAN_EXCLUDE_FILES.has(rel)) continue;

    const ext = extname(file).toLowerCase();
    if (!['.ts', '.tsx', '.js', '.jsx', '.py', '.cs', '.java', '.go', '.rb', '.php', '.html', '.vue', '.svelte'].includes(ext)) continue;

    const content = readSafe(file);
    if (!content) continue;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pat of patterns) {
        if (!pat.test(line)) continue;

        // Context-aware severity reduction
        const isInnerHtml = /innerHTML|dangerouslySetInnerHTML/.test(pat.source);
        const isCredentialMap = /API_KEY|SECRET|TOKEN|PASSWORD/.test(pat.source);

        // innerHTML in known server-rendered HTML files → info (not high)
        if (isInnerHtml && INNERHTML_SAFE_CONTEXTS.has(rel)) {
          findings.push({
            severity: 'info',
            category: 'security',
            title: `innerHTML in server-rendered HTML`,
            description: `innerHTML usage in ${rel}:${i + 1} (server-generated content, not user input)`,
            file: rel,
            line: i + 1,
            recommendation: 'Verify content is sanitized server-side; consider textContent for plain text',
          });
          continue;
        }

        // Credential env var name mappings → info (not high)
        if (isCredentialMap && CREDENTIAL_MAP_FILES.has(rel)) {
          // Skip entirely — these are env var name constants, not secret values
          continue;
        }

        // Check if the line is a comment or string pattern definition
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) continue;
        // Skip regex literal definitions (pattern is being defined, not used)
        if (/new RegExp\(|\/.*\/[gimsuy]*/.test(trimmed) && /pattern|regex|match|detect|scan/i.test(trimmed)) continue;

        findings.push({
          severity: 'high',
          category: 'security',
          title: `Pattern match: ${pat.source.slice(0, 40)}`,
          description: `Suspicious pattern in ${rel}:${i + 1}`,
          file: rel,
          line: i + 1,
          recommendation: 'Review and remediate this pattern',
        });
      }
    }
  }
  return findings;
}

// ── Category Analyzers ──────────────────────────────────────────

export function auditSecurity(projectPath: string): CategoryResult {
  const start = Date.now();
  const files = walkFiles(projectPath);
  const findings: CertFinding[] = [];

  const patterns = [
    /(?:API_KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*['"][^'"]{8,}/i,
    /\beval\s*\(/,
    /\.innerHTML\s*=/,
    /dangerouslySetInnerHTML/,
    /\bexec\s*\(\s*['"`]/,
    /\+\s*['"](?:SELECT|INSERT|UPDATE|DELETE)\b/i,
    /crypto\.createHash\s*\(\s*['"]md5['"]\)/,
  ];

  findings.push(...scanForPatterns(files, patterns));

  // Check for .env with secrets
  if (existsSync(join(projectPath, '.env'))) {
    const env = readSafe(join(projectPath, '.env'));
    if (/(?:KEY|SECRET|TOKEN|PASSWORD)\s*=\s*\S{8,}/i.test(env)) {
      findings.push({ severity: 'critical', category: 'security', title: '.env contains secrets', description: 'Secrets detected in .env file', file: '.env', recommendation: 'Use .env.example with placeholders, add .env to .gitignore' });
    }
  }

  if (!fileExists(projectPath, '.gitignore')) {
    findings.push({ severity: 'high', category: 'security', title: 'No .gitignore', description: 'Missing .gitignore file', recommendation: 'Add .gitignore to exclude sensitive files' });
  }

  const score = Math.max(0, 100 - findings.reduce((s, f) => s + SEVERITY_DEDUCTION[f.severity], 0));
  return { category: 'security', score, pass: score >= 50, weight: CATEGORY_WEIGHTS.security, findings, durationMs: Date.now() - start };
}

export function auditDocumentation(projectPath: string): CategoryResult {
  const start = Date.now();
  const findings: CertFinding[] = [];

  const docs = [
    { file: 'README.md', severity: 'critical' as const, title: 'No README.md' },
    { file: 'CHANGELOG.md', severity: 'medium' as const, title: 'No CHANGELOG.md' },
    { file: 'LICENSE', severity: 'high' as const, title: 'No LICENSE file' },
  ];

  for (const d of docs) {
    if (!fileExists(projectPath, d.file)) {
      findings.push({ severity: d.severity, category: 'documentation', title: d.title, description: `${d.file} not found`, recommendation: `Add ${d.file}` });
    } else {
      const content = readSafe(join(projectPath, d.file));
      if (content.length < 50) {
        findings.push({ severity: 'medium', category: 'documentation', title: `${d.file} is nearly empty`, description: `${d.file} has ${content.length} characters`, recommendation: `Populate ${d.file} with meaningful content` });
      }
    }
  }

  if (!existsSync(join(projectPath, 'docs')) && !existsSync(join(projectPath, 'doc'))) {
    findings.push({ severity: 'low', category: 'documentation', title: 'No docs/ directory', description: 'No dedicated documentation folder', recommendation: 'Consider adding a docs/ directory' });
  }

  const score = Math.max(0, 100 - findings.reduce((s, f) => s + SEVERITY_DEDUCTION[f.severity], 0));
  return { category: 'documentation', score, pass: score >= 50, weight: CATEGORY_WEIGHTS.documentation, findings, durationMs: Date.now() - start };
}

export function auditTesting(projectPath: string): CategoryResult {
  const start = Date.now();
  const findings: CertFinding[] = [];
  const files = walkFiles(projectPath);

  const testFiles = files.filter((f) => /\.test\.|\.spec\.|_test\.|Tests?\./i.test(f));
  const srcFiles = files.filter((f) => ['.ts', '.tsx', '.js', '.jsx', '.py', '.cs', '.java', '.go'].includes(extname(f).toLowerCase()) && !/\.test\.|\.spec\.|_test\./i.test(f));

  if (testFiles.length === 0) {
    findings.push({ severity: 'critical', category: 'testing', title: 'No test files found', description: 'Project has zero test files', recommendation: 'Add test files matching *.test.* or *.spec.* patterns' });
  } else {
    const ratio = srcFiles.length > 0 ? testFiles.length / srcFiles.length : 0;
    if (ratio < 0.3) {
      findings.push({ severity: 'high', category: 'testing', title: 'Low test coverage ratio', description: `${testFiles.length} tests vs ${srcFiles.length} source files (${(ratio * 100).toFixed(0)}%)`, recommendation: 'Aim for at least 1 test file per 3 source files' });
    }
  }

  const hasConfig = fileExists(projectPath, 'jest.config.js', 'jest.config.ts', 'vitest.config.ts', 'vitest.config.js', 'pytest.ini', 'setup.cfg', '.mocharc.yml');
  if (!hasConfig && testFiles.length > 0) {
    findings.push({ severity: 'low', category: 'testing', title: 'No test framework config', description: 'Tests exist but no framework configuration found', recommendation: 'Add test framework configuration (jest.config, vitest.config, etc.)' });
  }

  const score = Math.max(0, 100 - findings.reduce((s, f) => s + SEVERITY_DEDUCTION[f.severity], 0));
  return { category: 'testing', score, pass: score >= 50, weight: CATEGORY_WEIGHTS.testing, findings, durationMs: Date.now() - start };
}

export function auditDependencies(projectPath: string): CategoryResult {
  const start = Date.now();
  const findings: CertFinding[] = [];

  const hasPkgJson = existsSync(join(projectPath, 'package.json'));
  const hasReqTxt = existsSync(join(projectPath, 'requirements.txt'));

  if (!hasPkgJson && !hasReqTxt) {
    findings.push({ severity: 'medium', category: 'dependencies', title: 'No dependency manifest', description: 'No package.json or requirements.txt', recommendation: 'Add a dependency manifest' });
  }

  if (hasPkgJson) {
    const pkg = readSafe(join(projectPath, 'package.json'));
    if (pkg.includes('"*"')) {
      findings.push({ severity: 'high', category: 'dependencies', title: 'Wildcard version detected', description: 'package.json contains "*" version ranges', recommendation: 'Pin dependency versions' });
    }

    if (!fileExists(projectPath, 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb')) {
      findings.push({ severity: 'medium', category: 'dependencies', title: 'No lockfile', description: 'No package-lock.json, yarn.lock, or pnpm-lock.yaml', recommendation: 'Commit a lockfile for reproducible builds' });
    }
  }

  const score = Math.max(0, 100 - findings.reduce((s, f) => s + SEVERITY_DEDUCTION[f.severity], 0));
  return { category: 'dependencies', score, pass: score >= 50, weight: CATEGORY_WEIGHTS.dependencies, findings, durationMs: Date.now() - start };
}

export function auditLicense(projectPath: string): CategoryResult {
  const start = Date.now();
  const findings: CertFinding[] = [];

  if (!fileExists(projectPath, 'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE')) {
    findings.push({ severity: 'critical', category: 'license', title: 'No LICENSE file', description: 'Project has no license file', recommendation: 'Add a LICENSE file (MIT, Apache-2.0, etc.)' });
  } else {
    const license = readSafe(join(projectPath, existsSync(join(projectPath, 'LICENSE')) ? 'LICENSE' : 'LICENSE.md'));
    const spdx = ['MIT', 'Apache-2.0', 'GPL-3.0', 'GPL-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MPL-2.0', 'LGPL-3.0', 'AGPL-3.0', 'Unlicense'];
    const detected = spdx.find((s) => license.includes(s.replace('-', ' ')) || license.includes(s));
    if (!detected) {
      findings.push({ severity: 'medium', category: 'license', title: 'Unrecognized license', description: 'License file does not match common SPDX identifiers', recommendation: 'Use a standard SPDX-compatible license' });
    }
  }

  const score = Math.max(0, 100 - findings.reduce((s, f) => s + SEVERITY_DEDUCTION[f.severity], 0));
  return { category: 'license', score, pass: score >= 50, weight: CATEGORY_WEIGHTS.license, findings, durationMs: Date.now() - start };
}

export function auditAccessibility(projectPath: string): CategoryResult {
  const start = Date.now();
  const findings: CertFinding[] = [];
  const files = walkFiles(projectPath);
  const htmlFiles = files.filter((f) => ['.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte'].includes(extname(f).toLowerCase()));

  if (htmlFiles.length === 0) {
    return { category: 'accessibility', score: 100, pass: true, weight: CATEGORY_WEIGHTS.accessibility, findings: [{ severity: 'info', category: 'accessibility', title: 'No HTML/UI files found', description: 'Skipped — no HTML/JSX/TSX files', recommendation: 'N/A' }], durationMs: Date.now() - start };
  }

  for (const file of htmlFiles.slice(0, 50)) {
    const content = readSafe(file);
    const rel = relative(projectPath, file);

    if (/<img\b(?![^>]*\balt\s*=)[^>]*>/i.test(content)) {
      findings.push({ severity: 'high', category: 'accessibility', title: 'Image without alt text', description: `<img> missing alt attribute in ${rel}`, file: rel, recommendation: 'Add alt="description" to all <img> tags' });
    }
    if (/<input\b(?![^>]*(?:aria-label|aria-labelledby))[^>]*>/i.test(content) && !/<label\b/i.test(content)) {
      findings.push({ severity: 'medium', category: 'accessibility', title: 'Input without label', description: `Form input missing label/aria-label in ${rel}`, file: rel, recommendation: 'Add <label> or aria-label to form inputs' });
    }
    if (/<html\b(?![^>]*\blang\s*=)/i.test(content)) {
      findings.push({ severity: 'medium', category: 'accessibility', title: 'Missing lang attribute', description: `<html> missing lang attribute in ${rel}`, file: rel, recommendation: 'Add lang="en" (or appropriate language) to <html>' });
    }
    if (/<head\b/i.test(content) && !/<meta\s+name=["']viewport["']/i.test(content)) {
      findings.push({ severity: 'high', category: 'accessibility', title: 'Missing viewport meta (not mobile-friendly)', description: `No viewport meta tag in ${rel} — page will not be responsive`, file: rel, recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1.0">' });
    }
  }

  const score = Math.max(0, 100 - findings.reduce((s, f) => s + SEVERITY_DEDUCTION[f.severity], 0));
  return { category: 'accessibility', score, pass: score >= 50, weight: CATEGORY_WEIGHTS.accessibility, findings, durationMs: Date.now() - start };
}

export function auditPrivacy(projectPath: string): CategoryResult {
  const start = Date.now();
  const findings: CertFinding[] = [];
  const files = walkFiles(projectPath);

  const hasPrivacyPolicy = files.some((f) => /privacy/i.test(basename(f)));
  if (!hasPrivacyPolicy) {
    findings.push({ severity: 'high', category: 'privacy', title: 'No privacy policy', description: 'No privacy policy file or page found', recommendation: 'Add a privacy policy (required for GDPR compliance)' });
  }

  // Check for PII in log statements (skip test files, scripts, and scanner definitions)
  const srcFiles = files.filter((f) =>
    ['.ts', '.js', '.py', '.java', '.cs'].includes(extname(f).toLowerCase()) &&
    !/\.test\.|\.spec\.|__tests__|test[/\\]|scripts[/\\]/i.test(f) &&
    !SECURITY_SCAN_EXCLUDE_FILES.has(basename(f)),
  );
  for (const file of srcFiles.slice(0, 100)) {
    const content = readSafe(file);
    if (/console\.log\(.*(?:email|password|ssn|phone|credit.?card)/i.test(content)) {
      findings.push({ severity: 'critical', category: 'privacy', title: 'PII in log statements', description: `Potential PII logged in ${relative(projectPath, file)}`, file: relative(projectPath, file), recommendation: 'Never log PII — redact sensitive fields' });
    }
  }

  if (existsSync(join(projectPath, '.env')) && !fileExists(projectPath, '.env.example')) {
    findings.push({ severity: 'medium', category: 'privacy', title: 'No .env.example', description: '.env exists but no .env.example template', recommendation: 'Add .env.example with placeholder values' });
  }

  const score = Math.max(0, 100 - findings.reduce((s, f) => s + SEVERITY_DEDUCTION[f.severity], 0));
  return { category: 'privacy', score, pass: score >= 50, weight: CATEGORY_WEIGHTS.privacy, findings, durationMs: Date.now() - start };
}

export function auditArchitecture(projectPath: string): CategoryResult {
  const start = Date.now();
  const findings: CertFinding[] = [];
  const files = walkFiles(projectPath);

  const hasSrcDir = existsSync(join(projectPath, 'src')) || existsSync(join(projectPath, 'lib')) || existsSync(join(projectPath, 'app'));
  if (!hasSrcDir && files.length > 20) {
    findings.push({ severity: 'medium', category: 'architecture', title: 'No src/ directory', description: 'Source files are not organized in a dedicated directory', recommendation: 'Organize source code in src/, lib/, or app/' });
  }

  // Check for oversized files
  for (const file of files) {
    try {
      const stat = statSync(file);
      if (stat.size > 50_000 && ['.ts', '.js', '.py', '.java', '.cs'].includes(extname(file).toLowerCase())) {
        findings.push({ severity: 'medium', category: 'architecture', title: 'Oversized file', description: `${relative(projectPath, file)} is ${(stat.size / 1000).toFixed(0)}KB`, file: relative(projectPath, file), recommendation: 'Split into smaller modules (<500 lines recommended)' });
      }
    } catch { /* skip */ }
  }

  if (!fileExists(projectPath, '.editorconfig', '.prettierrc', '.eslintrc.js', '.eslintrc.json', 'biome.json')) {
    findings.push({ severity: 'low', category: 'architecture', title: 'No code style config', description: 'No linter or formatter configuration found', recommendation: 'Add ESLint, Prettier, or Biome config' });
  }

  const score = Math.max(0, 100 - findings.reduce((s, f) => s + SEVERITY_DEDUCTION[f.severity], 0));
  return { category: 'architecture', score, pass: score >= 50, weight: CATEGORY_WEIGHTS.architecture, findings, durationMs: Date.now() - start };
}

export function auditSeo(projectPath: string): CategoryResult {
  const start = Date.now();
  const findings: CertFinding[] = [];
  const files = walkFiles(projectPath);
  const htmlFiles = files.filter((f) => extname(f).toLowerCase() === '.html');

  if (htmlFiles.length === 0) {
    return { category: 'seo', score: 100, pass: true, weight: CATEGORY_WEIGHTS.seo, findings: [{ severity: 'info', category: 'seo', title: 'No HTML files', description: 'SEO checks skipped — no HTML files', recommendation: 'N/A' }], durationMs: Date.now() - start };
  }

  if (!fileExists(projectPath, 'robots.txt')) {
    findings.push({ severity: 'medium', category: 'seo', title: 'No robots.txt', description: 'Missing robots.txt for search crawlers', recommendation: 'Add robots.txt' });
  }

  for (const file of htmlFiles.slice(0, 10)) {
    const content = readSafe(file);
    const rel = relative(projectPath, file);
    if (!/<meta\s+name=["']description["']/i.test(content)) {
      findings.push({ severity: 'medium', category: 'seo', title: 'Missing meta description', description: `No <meta name="description"> in ${rel}`, file: rel, recommendation: 'Add meta description tag' });
    }
    if (!/<meta\s+name=["']viewport["']/i.test(content)) {
      findings.push({ severity: 'medium', category: 'seo', title: 'Missing viewport meta', description: `No viewport meta tag in ${rel}`, file: rel, recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1.0">' });
    }
  }

  const score = Math.max(0, 100 - findings.reduce((s, f) => s + SEVERITY_DEDUCTION[f.severity], 0));
  return { category: 'seo', score, pass: score >= 50, weight: CATEGORY_WEIGHTS.seo, findings, durationMs: Date.now() - start };
}

export function auditPerformance(projectPath: string): CategoryResult {
  const start = Date.now();
  const findings: CertFinding[] = [];
  const files = walkFiles(projectPath);

  // Check for large images
  for (const file of files) {
    if (['.png', '.jpg', '.jpeg', '.gif', '.bmp'].includes(extname(file).toLowerCase())) {
      try {
        const stat = statSync(file);
        if (stat.size > 500_000) {
          findings.push({ severity: 'medium', category: 'performance', title: 'Large image file', description: `${relative(projectPath, file)} is ${(stat.size / 1_000_000).toFixed(1)}MB`, file: relative(projectPath, file), recommendation: 'Compress images or use WebP format' });
        }
      } catch { /* skip */ }
    }
  }

  // Check for synchronous file reads in source
  const srcFiles = files.filter((f) => ['.ts', '.js'].includes(extname(f).toLowerCase()) && !/\.test\.|\.spec\./i.test(f));
  for (const file of srcFiles.slice(0, 50)) {
    const content = readSafe(file);
    if (/readFileSync|writeFileSync/.test(content) && !/test|spec|script|cli|bin/i.test(file)) {
      findings.push({ severity: 'low', category: 'performance', title: 'Synchronous file I/O', description: `Sync file operation in ${relative(projectPath, file)}`, file: relative(projectPath, file), recommendation: 'Use async fs operations in hot paths' });
    }
  }

  const score = Math.max(0, 100 - findings.reduce((s, f) => s + SEVERITY_DEDUCTION[f.severity], 0));
  return { category: 'performance', score, pass: score >= 50, weight: CATEGORY_WEIGHTS.performance, findings, durationMs: Date.now() - start };
}

export function auditCiCd(projectPath: string): CategoryResult {
  const start = Date.now();
  const findings: CertFinding[] = [];

  const hasCi = fileExists(projectPath, '.github/workflows') ||
    existsSync(join(projectPath, '.github', 'workflows')) ||
    fileExists(projectPath, '.gitlab-ci.yml', 'azure-pipelines.yml', 'Jenkinsfile', '.circleci/config.yml', '.travis.yml');

  if (!hasCi) {
    findings.push({ severity: 'high', category: 'ci-cd', title: 'No CI/CD configuration', description: 'No CI pipeline detected', recommendation: 'Add GitHub Actions, GitLab CI, or similar' });
  }

  if (!fileExists(projectPath, '.gitignore')) {
    findings.push({ severity: 'medium', category: 'ci-cd', title: 'No .gitignore', description: 'Missing .gitignore', recommendation: 'Add .gitignore' });
  }

  if (!fileExists(projectPath, 'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml')) {
    findings.push({ severity: 'info', category: 'ci-cd', title: 'No Docker configuration', description: 'No Dockerfile or docker-compose found', recommendation: 'Consider adding Docker for reproducible deployments' });
  }

  const score = Math.max(0, 100 - findings.reduce((s, f) => s + SEVERITY_DEDUCTION[f.severity], 0));
  return { category: 'ci-cd', score, pass: score >= 50, weight: CATEGORY_WEIGHTS['ci-cd'], findings, durationMs: Date.now() - start };
}

// ── Category Registry ───────────────────────────────────────────

const CATEGORY_MAP: Record<string, (p: string) => CategoryResult> = {
  security: auditSecurity,
  documentation: auditDocumentation,
  testing: auditTesting,
  dependencies: auditDependencies,
  license: auditLicense,
  accessibility: auditAccessibility,
  privacy: auditPrivacy,
  architecture: auditArchitecture,
  seo: auditSeo,
  performance: auditPerformance,
  'ci-cd': auditCiCd,
};

export function getAllCategories(): string[] {
  return Object.keys(CATEGORY_MAP);
}

// ── Grading ─────────────────────────────────────────────────────

export function computeGrade(score: number): CertGrade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export function computeOverallScore(categories: CategoryResult[]): number {
  const totalWeight = categories.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) return 0;
  return categories.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight;
}

// ── Main Runner ─────────────────────────────────────────────────

export function runCertification(options: CertificationOptions): CertificationResult {
  const startTime = Date.now();
  const startedAt = new Date().toISOString();
  const projectPath = options.projectPath;
  const projectName = basename(projectPath);
  const id = randomUUID();

  const categoryNames = options.categories || getAllCategories();
  const categories: CategoryResult[] = [];

  for (const name of categoryNames) {
    const fn = CATEGORY_MAP[name];
    if (!fn) continue;
    categories.push(fn(projectPath));
  }

  const overallScore = computeOverallScore(categories);
  const grade = computeGrade(overallScore);
  const allFindings = categories.flatMap((c) => c.findings);
  const findingsBySeverity: Record<string, number> = {};
  for (const f of allFindings) {
    findingsBySeverity[f.severity] = (findingsBySeverity[f.severity] || 0) + 1;
  }

  return {
    id,
    projectPath,
    projectName,
    grade,
    overallScore,
    categories,
    totalFindings: allFindings.length,
    findingsBySeverity,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };
}

// ── DB Persistence ──────────────────────────────────────────────

export function insertCertificationRun(db: Database.Database, result: CertificationResult): void {
  db.prepare(`
    INSERT INTO certification_runs
      (id, project_path, project_name, grade, overall_score, total_findings,
       critical_count, high_count, medium_count, low_count,
       duration_ms, started_at, completed_at, categories_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    result.id, result.projectPath, result.projectName,
    result.grade, result.overallScore, result.totalFindings,
    result.findingsBySeverity.critical || 0,
    result.findingsBySeverity.high || 0,
    result.findingsBySeverity.medium || 0,
    result.findingsBySeverity.low || 0,
    result.durationMs, result.startedAt, result.completedAt,
    JSON.stringify(result.categories.map((c) => ({ category: c.category, score: c.score, pass: c.pass }))),
  );

  const stmt = db.prepare(`
    INSERT INTO certification_findings (run_id, category, severity, title, description, file, line, recommendation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const cat of result.categories) {
    for (const f of cat.findings) {
      stmt.run(result.id, f.category, f.severity, f.title, f.description, f.file || null, f.line || null, f.recommendation);
    }
  }
}

export function getCertificationRun(db: Database.Database, runId: string): CertificationResult | null {
  const row = db.prepare('SELECT * FROM certification_runs WHERE id = ?').get(runId) as any;
  if (!row) return null;

  const findings = db.prepare('SELECT * FROM certification_findings WHERE run_id = ?').all(runId) as CertFinding[];

  return {
    id: row.id,
    projectPath: row.project_path,
    projectName: row.project_name,
    grade: row.grade,
    overallScore: row.overall_score,
    categories: JSON.parse(row.categories_json || '[]'),
    totalFindings: row.total_findings,
    findingsBySeverity: { critical: row.critical_count, high: row.high_count, medium: row.medium_count, low: row.low_count },
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
  };
}

export function getCertificationHistory(db: Database.Database, limit = 20): Array<{ id: string; project_name: string; grade: string; overall_score: number; total_findings: number; completed_at: string }> {
  return db.prepare('SELECT id, project_name, grade, overall_score, total_findings, completed_at FROM certification_runs ORDER BY completed_at DESC LIMIT ?').all(limit) as any[];
}

// ── Formatting ──────────────────────────────────────────────────

const GRADE_COLOR: Record<string, string> = { A: '\x1b[32m', B: '\x1b[36m', C: '\x1b[33m', D: '\x1b[33m', F: '\x1b[31m' };
const NC = '\x1b[0m';

export function formatCertificationReport(result: CertificationResult): string {
  const lines: string[] = [];
  lines.push('RegForge Certification Report');
  lines.push(LINE.repeat(60));
  lines.push(`  Project:  ${result.projectName}`);
  lines.push(`  Grade:    ${GRADE_COLOR[result.grade] || ''}${result.grade}${NC} (${result.overallScore.toFixed(1)}/100)`);
  lines.push(`  Findings: ${result.totalFindings} (${result.findingsBySeverity.critical || 0} critical, ${result.findingsBySeverity.high || 0} high, ${result.findingsBySeverity.medium || 0} medium, ${result.findingsBySeverity.low || 0} low)`);
  lines.push(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
  lines.push('');

  lines.push('  Category Scores:');
  lines.push('  ' + '\u2500'.repeat(56));
  for (const cat of result.categories) {
    const icon = cat.pass ? '\u2713' : '\u2717';
    const bar = '\u2588'.repeat(Math.round(cat.score / 5)) + '\u2591'.repeat(20 - Math.round(cat.score / 5));
    lines.push(`    ${icon} ${cat.category.padEnd(18)} ${String(cat.score).padStart(3)}/100 ${bar} ${cat.findings.length} findings`);
  }

  // Critical/High findings
  const urgent = result.categories.flatMap((c) => c.findings).filter((f) => f.severity === 'critical' || f.severity === 'high');
  if (urgent.length > 0) {
    lines.push('');
    lines.push('  Critical & High Findings:');
    lines.push('  ' + '\u2500'.repeat(56));
    for (const f of urgent.slice(0, 20)) {
      const sev = f.severity === 'critical' ? '\x1b[31mCRIT\x1b[0m' : '\x1b[33mHIGH\x1b[0m';
      lines.push(`    [${sev}] ${f.title}`);
      if (f.file) lines.push(`           ${f.file}${f.line ? ':' + f.line : ''}`);
      lines.push(`           Fix: ${f.recommendation}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function generateHtmlReport(result: CertificationResult): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const gradeColor: Record<string, string> = { A: '#22c55e', B: '#06b6d4', C: '#eab308', D: '#f97316', F: '#ef4444' };

  const catRows = result.categories.map((c) => `
    <tr>
      <td>${esc(c.category)}</td>
      <td style="font-weight:bold;color:${c.pass ? '#22c55e' : '#ef4444'}">${c.pass ? 'PASS' : 'FAIL'}</td>
      <td>${c.score}/100</td>
      <td><div style="background:#1e293b;border-radius:4px;overflow:hidden;height:20px"><div style="background:${c.score >= 75 ? '#22c55e' : c.score >= 50 ? '#eab308' : '#ef4444'};width:${c.score}%;height:100%"></div></div></td>
      <td>${c.findings.length}</td>
    </tr>`).join('');

  const findingRows = result.categories.flatMap((c) => c.findings)
    .filter((f) => f.severity !== 'info')
    .sort((a, b) => SEVERITY_DEDUCTION[b.severity] - SEVERITY_DEDUCTION[a.severity])
    .slice(0, 50)
    .map((f) => `
    <tr>
      <td><span class="sev-${f.severity}">${esc(f.severity.toUpperCase())}</span></td>
      <td>${esc(f.category)}</td>
      <td>${esc(f.title)}</td>
      <td>${f.file ? esc(f.file) + (f.line ? ':' + f.line : '') : ''}</td>
      <td>${esc(f.recommendation)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="description" content="RegForge certification report — project audit with grade and findings.">
<title>RegForge Certification — ${esc(result.projectName)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem}
  .container{max-width:1000px;margin:0 auto}
  .header{text-align:center;margin-bottom:2rem}
  .grade{font-size:5rem;font-weight:900;color:${gradeColor[result.grade] || '#94a3b8'};text-shadow:0 0 30px ${gradeColor[result.grade] || '#94a3b8'}40}
  .score{font-size:1.5rem;color:#94a3b8}
  table{width:100%;border-collapse:collapse;margin:1rem 0}
  th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #1e293b}
  th{color:#94a3b8;font-weight:600}
  h2{color:#f8fafc;margin:2rem 0 1rem;border-bottom:2px solid #334155;padding-bottom:0.5rem}
  .sev-critical{color:#ef4444;font-weight:700} .sev-high{color:#f97316;font-weight:600}
  .sev-medium{color:#eab308} .sev-low{color:#22d3ee} .sev-info{color:#94a3b8}
  .meta{color:#64748b;margin:0.5rem 0}
  .badge{display:inline-block;padding:4px 12px;border-radius:12px;font-size:0.85rem;font-weight:600}
  .pass{background:#22c55e20;color:#22c55e} .fail{background:#ef444420;color:#ef4444}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>RegForge Certification</h1>
    <div class="grade">${result.grade}</div>
    <div class="score">${result.overallScore.toFixed(1)} / 100</div>
    <p class="meta">${esc(result.projectName)} &bull; ${result.completedAt.slice(0, 10)} &bull; ${result.totalFindings} findings &bull; ${(result.durationMs / 1000).toFixed(1)}s</p>
  </div>

  <h2>Category Scores</h2>
  <table>
    <tr><th>Category</th><th>Status</th><th>Score</th><th>Bar</th><th>Findings</th></tr>
    ${catRows}
  </table>

  <h2>Findings (${result.totalFindings})</h2>
  <table>
    <tr><th>Severity</th><th>Category</th><th>Title</th><th>File</th><th>Recommendation</th></tr>
    ${findingRows}
  </table>

  <p class="meta" style="text-align:center;margin-top:2rem">Generated by SkillFoundry Certification Engine &bull; regforge.eu</p>
</div>
</body>
</html>`;
}

// ── Markdown Report ─────────────────────────────────────────────

export function generateMarkdownReport(result: CertificationResult): string {
  const gradeEmoji: Record<string, string> = { A: '🟢', B: '🔵', C: '🟡', D: '🟠', F: '🔴' };
  const sevEmoji: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: 'ℹ️' };
  const lines: string[] = [];

  lines.push(`# RegForge Certification Report`);
  lines.push('');
  lines.push(`> **Project**: ${result.projectName}  `);
  lines.push(`> **Grade**: ${gradeEmoji[result.grade] || ''} **${result.grade}** (${result.overallScore.toFixed(1)}/100)  `);
  lines.push(`> **Date**: ${result.completedAt.slice(0, 10)}  `);
  lines.push(`> **Findings**: ${result.totalFindings} (${result.findingsBySeverity.critical || 0} critical, ${result.findingsBySeverity.high || 0} high, ${result.findingsBySeverity.medium || 0} medium, ${result.findingsBySeverity.low || 0} low)  `);
  lines.push(`> **Duration**: ${(result.durationMs / 1000).toFixed(1)}s`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Category Scores
  lines.push('## Category Scores');
  lines.push('');
  lines.push('| Category | Status | Score | Findings |');
  lines.push('|----------|--------|-------|----------|');
  for (const cat of result.categories) {
    const status = cat.pass ? '✅ PASS' : '❌ FAIL';
    lines.push(`| **${cat.category}** | ${status} | ${cat.score}/100 | ${cat.findings.length} |`);
  }
  lines.push('');

  // Detailed Findings by Category
  lines.push('---');
  lines.push('');
  lines.push('## Detailed Findings');
  lines.push('');

  for (const cat of result.categories) {
    if (cat.findings.length === 0) continue;
    lines.push(`### ${cat.category.charAt(0).toUpperCase() + cat.category.slice(1)} (${cat.score}/100)`);
    lines.push('');

    for (const f of cat.findings) {
      lines.push(`#### ${sevEmoji[f.severity] || ''} ${f.severity.toUpperCase()}: ${f.title}`);
      lines.push('');
      lines.push(`**What was found**: ${f.description}`);
      if (f.file) lines.push(`**Location**: \`${f.file}${f.line ? ':' + f.line : ''}\``);
      lines.push('');
      lines.push(`**Why this matters**: `);
      switch (f.severity) {
        case 'critical': lines.push('This is a showstopper that could lead to data breaches, system compromise, or regulatory violations. Must be fixed before any release.'); break;
        case 'high': lines.push('This represents a significant risk that attackers or auditors will flag. Should be fixed in the current sprint.'); break;
        case 'medium': lines.push('This is a best-practice violation that reduces code quality and maintainability. Plan to fix within the next release cycle.'); break;
        case 'low': lines.push('This is a minor improvement opportunity. Fix when convenient.'); break;
        default: lines.push('Informational — no action required, but worth noting.'); break;
      }
      lines.push('');
      lines.push(`**How to fix**: ${f.recommendation}`);
      lines.push('');

      // Add concrete example where possible
      if (f.category === 'security' && f.title.includes('innerHTML')) {
        lines.push('**Example fix**:');
        lines.push('```diff');
        lines.push('- element.innerHTML = userContent;');
        lines.push('+ element.textContent = userContent;');
        lines.push('+ // Or use a sanitizer: DOMPurify.sanitize(userContent)');
        lines.push('```');
      } else if (f.category === 'security' && f.title.includes('eval')) {
        lines.push('**Example fix**:');
        lines.push('```diff');
        lines.push('- const result = eval(expression);');
        lines.push('+ const result = new Function("return " + expression)();');
        lines.push('+ // Or better: use a safe expression parser');
        lines.push('```');
      } else if (f.category === 'security' && f.title.includes('SECRET')) {
        lines.push('**Example fix**:');
        lines.push('```diff');
        lines.push('- const API_KEY = "sk-abc123...";');
        lines.push('+ const API_KEY = process.env.API_KEY;');
        lines.push('```');
      } else if (f.category === 'accessibility' && f.title.includes('alt')) {
        lines.push('**Example fix**:');
        lines.push('```diff');
        lines.push('- <img src="photo.jpg">');
        lines.push('+ <img src="photo.jpg" alt="Team photo at the 2026 hackathon">');
        lines.push('```');
      } else if (f.category === 'accessibility' && f.title.includes('label')) {
        lines.push('**Example fix**:');
        lines.push('```diff');
        lines.push('- <input type="text" name="email">');
        lines.push('+ <label for="email">Email address</label>');
        lines.push('+ <input type="text" id="email" name="email">');
        lines.push('```');
      } else if (f.category === 'privacy' && f.title.includes('PII')) {
        lines.push('**Example fix**:');
        lines.push('```diff');
        lines.push('- console.log("User email:", user.email);');
        lines.push('+ console.log("User logged in:", user.id);');
        lines.push('+ // Never log PII — use anonymized identifiers');
        lines.push('```');
      }
      lines.push('');
    }
  }

  // Remediation Roadmap
  const allFindings = result.categories.flatMap((c) => c.findings).filter((f) => f.severity !== 'info');
  const sorted = allFindings.sort((a, b) => SEVERITY_DEDUCTION[b.severity] - SEVERITY_DEDUCTION[a.severity]);

  if (sorted.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Remediation Roadmap');
    lines.push('');
    lines.push('Priority-ordered list of fixes:');
    lines.push('');
    sorted.forEach((f, i) => {
      lines.push(`${i + 1}. **[${f.severity.toUpperCase()}]** ${f.title} — ${f.recommendation}`);
    });
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`*Generated by SkillFoundry Certification Engine — [regforge.eu](https://regforge.eu)*`);

  return lines.join('\n');
}

// ── Word-Compatible HTML Report ─────────────────────────────────

export function generateWordReport(result: CertificationResult): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const gradeColor: Record<string, string> = { A: '#22c55e', B: '#06b6d4', C: '#eab308', D: '#f97316', F: '#ef4444' };

  const catRows = result.categories.map((c) => `
    <tr>
      <td style="padding:8px;border:1px solid #ddd;font-weight:bold">${esc(c.category)}</td>
      <td style="padding:8px;border:1px solid #ddd;color:${c.pass ? '#22c55e' : '#ef4444'};font-weight:bold">${c.pass ? 'PASS' : 'FAIL'}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center">${c.score}/100</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:center">${c.findings.length}</td>
    </tr>`).join('');

  const findingSections = result.categories
    .filter((c) => c.findings.length > 0)
    .map((c) => {
      const rows = c.findings.map((f) => `
        <tr>
          <td style="padding:6px;border:1px solid #ddd;color:${f.severity === 'critical' ? '#ef4444' : f.severity === 'high' ? '#f97316' : '#333'};font-weight:${f.severity === 'critical' || f.severity === 'high' ? 'bold' : 'normal'}">${esc(f.severity.toUpperCase())}</td>
          <td style="padding:6px;border:1px solid #ddd">${esc(f.title)}</td>
          <td style="padding:6px;border:1px solid #ddd;font-size:0.9em">${f.file ? esc(f.file) : ''}</td>
          <td style="padding:6px;border:1px solid #ddd;font-size:0.9em">${esc(f.recommendation)}</td>
        </tr>`).join('');
      return `<h3 style="color:#1e293b;margin-top:20px">${esc(c.category)} (${c.score}/100)</h3>
      <table style="width:100%;border-collapse:collapse;margin:10px 0">
        <tr style="background:#f1f5f9"><th style="padding:6px;border:1px solid #ddd;text-align:left">Severity</th><th style="padding:6px;border:1px solid #ddd;text-align:left">Finding</th><th style="padding:6px;border:1px solid #ddd;text-align:left">File</th><th style="padding:6px;border:1px solid #ddd;text-align:left">Recommendation</th></tr>
        ${rows}
      </table>`;
    }).join('\n');

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="en">
<head>
<meta charset="UTF-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="SkillFoundry RegForge">
<style>
  body{font-family:Calibri,Arial,sans-serif;color:#1e293b;padding:40px;max-width:900px;margin:0 auto;line-height:1.6}
  h1{color:#0f172a;font-size:28pt;text-align:center;margin-bottom:5px}
  h2{color:#334155;font-size:18pt;border-bottom:2px solid #e2e8f0;padding-bottom:8px;margin-top:30px}
  h3{color:#475569;font-size:14pt}
  .grade-box{text-align:center;margin:20px 0;padding:30px;border:3px solid ${gradeColor[result.grade] || '#94a3b8'};border-radius:12px;background:${gradeColor[result.grade] || '#94a3b8'}10}
  .grade-letter{font-size:72pt;font-weight:900;color:${gradeColor[result.grade] || '#94a3b8'}}
  .grade-score{font-size:18pt;color:#64748b}
  table{width:100%;border-collapse:collapse}
  .meta{color:#64748b;text-align:center;font-size:10pt;margin-top:40px}
</style>
</head>
<body>
  <h1>RegForge Certification Report</h1>
  <p style="text-align:center;color:#64748b;font-size:12pt">${esc(result.projectName)} &bull; ${result.completedAt.slice(0, 10)} &bull; ${result.totalFindings} findings</p>

  <div class="grade-box">
    <div class="grade-letter">${result.grade}</div>
    <div class="grade-score">${result.overallScore.toFixed(1)} / 100</div>
    <p style="color:#64748b;margin-top:10px">${result.findingsBySeverity.critical || 0} critical &bull; ${result.findingsBySeverity.high || 0} high &bull; ${result.findingsBySeverity.medium || 0} medium &bull; ${result.findingsBySeverity.low || 0} low</p>
  </div>

  <h2>Category Scores</h2>
  <table style="width:100%;border-collapse:collapse">
    <tr style="background:#f1f5f9"><th style="padding:8px;border:1px solid #ddd;text-align:left">Category</th><th style="padding:8px;border:1px solid #ddd;text-align:left">Status</th><th style="padding:8px;border:1px solid #ddd;text-align:center">Score</th><th style="padding:8px;border:1px solid #ddd;text-align:center">Findings</th></tr>
    ${catRows}
  </table>

  <h2>Detailed Findings</h2>
  ${findingSections}

  <p class="meta">Generated by SkillFoundry Certification Engine &bull; regforge.eu</p>
</body>
</html>`;
}

// ── Remediation PRD Generator ───────────────────────────────────

export function generateRemediationPrd(result: CertificationResult): string {
  const date = new Date().toISOString().slice(0, 10);
  const allFindings = result.categories.flatMap((c) => c.findings).filter((f) => f.severity !== 'info');
  const sorted = allFindings.sort((a, b) => SEVERITY_DEDUCTION[b.severity] - SEVERITY_DEDUCTION[a.severity]);
  const criticalCount = sorted.filter((f) => f.severity === 'critical').length;
  const highCount = sorted.filter((f) => f.severity === 'high').length;

  const lines: string[] = [];
  lines.push(`# PRD: RegForge Certification Remediation — ${result.projectName}`);
  lines.push('');
  lines.push(`**Date**: ${date}  `);
  lines.push(`**Current Grade**: ${result.grade} (${result.overallScore.toFixed(1)}/100)  `);
  lines.push(`**Target Grade**: A (90+/100)  `);
  lines.push(`**Findings to Fix**: ${sorted.length} (${criticalCount} critical, ${highCount} high)  `);
  lines.push(`**Generated by**: RegForge Certification Engine`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Problem Statement
  lines.push('## Problem Statement');
  lines.push('');
  const failedCats = result.categories.filter((c) => !c.pass);
  if (failedCats.length > 0) {
    lines.push(`The project failed ${failedCats.length} certification categories: ${failedCats.map((c) => c.category).join(', ')}. `);
  }
  lines.push(`A RegForge certification audit found ${sorted.length} actionable findings across ${result.categories.filter((c) => c.findings.length > 0).length} categories. `);
  lines.push(`The project currently scores ${result.overallScore.toFixed(1)}/100 (Grade ${result.grade}). The goal is to reach Grade A (90+) by remediating all critical and high findings, and addressing medium findings where feasible.`);
  lines.push('');

  // User Stories
  lines.push('## User Stories');
  lines.push('');

  let storyNum = 1;
  const categoryGroups = new Map<string, typeof sorted>();
  for (const f of sorted) {
    const group = categoryGroups.get(f.category) || [];
    group.push(f);
    categoryGroups.set(f.category, group);
  }

  for (const [category, findings] of categoryGroups) {
    const catResult = result.categories.find((c) => c.category === category);
    const priority = findings.some((f) => f.severity === 'critical') ? 'P0' : findings.some((f) => f.severity === 'high') ? 'P1' : 'P2';

    lines.push(`### Story ${storyNum}: Fix ${category} findings (${priority})`);
    lines.push('');
    lines.push(`**As a** developer,  `);
    lines.push(`**I want to** remediate all ${category} findings,  `);
    lines.push(`**So that** the ${category} category score improves from ${catResult?.score || 0}/100 to 90+/100.`);
    lines.push('');
    lines.push('**Acceptance Criteria**:');
    lines.push('');

    for (const f of findings) {
      lines.push(`- [ ] **[${f.severity.toUpperCase()}]** ${f.title}: ${f.recommendation}${f.file ? ` (in \`${f.file}\`)` : ''}`);
    }

    lines.push('');
    lines.push(`**Definition of Done**: Re-run \`/certify --category ${category}\` and confirm score >= 90.`);
    lines.push('');
    storyNum++;
  }

  // Out of Scope
  lines.push('## Out of Scope');
  lines.push('');
  lines.push('- Info-level findings (informational, no score impact)');
  lines.push('- New feature development');
  lines.push('- Performance optimization beyond the audit checklist');
  lines.push('');

  // Risks
  lines.push('## Risks');
  lines.push('');
  if (criticalCount > 0) {
    lines.push(`- **Critical findings** (${criticalCount}): These may indicate active security vulnerabilities. Prioritize immediately.`);
  }
  lines.push('- Some security findings may be false positives (test fixtures, pattern strings). Verify before fixing.');
  lines.push('- Architecture changes (file splitting) may require import updates across the codebase.');
  lines.push('');

  // Success Criteria
  lines.push('## Success Criteria');
  lines.push('');
  lines.push(`- [ ] \`/certify\` returns Grade A (90+/100)`);
  lines.push('- [ ] Zero critical findings');
  lines.push('- [ ] Zero high findings');
  lines.push('- [ ] All tests pass after remediation');
  lines.push('');

  return lines.join('\n');
}

