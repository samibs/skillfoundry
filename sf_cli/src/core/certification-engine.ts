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
  critical: 20, high: 15, medium: 10, low: 5, info: 2,
};

const CATEGORY_WEIGHTS: Record<string, number> = {
  security: 15, testing: 15, documentation: 10, dependencies: 10,
  license: 10, accessibility: 10, privacy: 10, architecture: 8,
  seo: 4, performance: 4, 'ci-cd': 4,
};

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '.next', '__pycache__',
  'venv', '.venv', 'vendor', 'coverage', '.cache',
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

function scanForPatterns(files: string[], patterns: RegExp[], skipTest = true): CertFinding[] {
  const findings: CertFinding[] = [];
  for (const file of files) {
    const rel = basename(file);
    if (skipTest && (/\.test\.|\.spec\.|__tests__|test[/\\]/i.test(file))) continue;
    if (/node_modules|dist[/\\]|build[/\\]|\.min\./i.test(file)) continue;

    const ext = extname(file).toLowerCase();
    if (!['.ts', '.tsx', '.js', '.jsx', '.py', '.cs', '.java', '.go', '.rb', '.php', '.html', '.vue', '.svelte'].includes(ext)) continue;

    const content = readSafe(file);
    if (!content) continue;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const pat of patterns) {
        if (pat.test(lines[i])) {
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

  // Check for PII in log statements
  const srcFiles = files.filter((f) => ['.ts', '.js', '.py', '.java', '.cs'].includes(extname(f).toLowerCase()));
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
