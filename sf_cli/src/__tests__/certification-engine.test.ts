import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import {
  auditSecurity,
  auditDocumentation,
  auditTesting,
  auditDependencies,
  auditLicense,
  auditAccessibility,
  auditPrivacy,
  auditArchitecture,
  auditSeo,
  auditPerformance,
  auditCiCd,
  auditContracts,
  auditAuthorization,
  auditErrorHandling,
  auditSupplyChain,
  computeGrade,
  computeOverallScore,
  runCertification,
  insertCertificationRun,
  getCertificationRun,
  getCertificationHistory,
  formatCertificationReport,
  generateHtmlReport,
  getAllCategories,
} from '../core/certification-engine.js';
import { initDatabase } from '../core/dashboard-db.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cert-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeProject(files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    const full = join(tmpDir, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
}

// ── Grading ─────────────────────────────────────────────────────

describe('computeGrade', () => {
  it('returns A for 90+', () => { expect(computeGrade(95)).toBe('A'); });
  it('returns B for 75-89', () => { expect(computeGrade(80)).toBe('B'); });
  it('returns C for 60-74', () => { expect(computeGrade(65)).toBe('C'); });
  it('returns D for 40-59', () => { expect(computeGrade(45)).toBe('D'); });
  it('returns F for <40', () => { expect(computeGrade(20)).toBe('F'); });
  it('boundary: 90 is A', () => { expect(computeGrade(90)).toBe('A'); });
  it('boundary: 89 is B', () => { expect(computeGrade(89)).toBe('B'); });
});

describe('computeOverallScore', () => {
  it('computes weighted average', () => {
    const cats = [
      { category: 'a', score: 100, pass: true, weight: 10, findings: [], durationMs: 0 },
      { category: 'b', score: 50, pass: true, weight: 10, findings: [], durationMs: 0 },
    ];
    expect(computeOverallScore(cats)).toBe(75);
  });

  it('returns 0 for empty', () => {
    expect(computeOverallScore([])).toBe(0);
  });
});

// ── Security ────────────────────────────────────────────────────

describe('auditSecurity', () => {
  it('passes clean project', () => {
    makeProject({ 'src/app.ts': 'const x = 1;', '.gitignore': 'node_modules' });
    const result = auditSecurity(tmpDir);
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('detects hardcoded secrets in .env', () => {
    makeProject({ '.env': 'API_KEY=sk-12345678901234567890', '.gitignore': '' });
    const result = auditSecurity(tmpDir);
    expect(result.findings.some(f => f.title.includes('.env'))).toBe(true);
  });

  it('detects eval usage', () => {
    makeProject({ 'src/bad.ts': 'eval("code")', '.gitignore': '' });
    const result = auditSecurity(tmpDir);
    expect(result.findings.some(f => f.description.includes('bad.ts'))).toBe(true);
  });

  it('flags missing .gitignore', () => {
    makeProject({ 'src/app.ts': 'const x = 1;' });
    const result = auditSecurity(tmpDir);
    expect(result.findings.some(f => f.title.includes('.gitignore'))).toBe(true);
  });
});

// ── Documentation ───────────────────────────────────────────────

describe('auditDocumentation', () => {
  it('passes with all docs', () => {
    makeProject({ 'README.md': 'Project description with enough content here to pass the length check.', 'CHANGELOG.md': 'Version history with enough content to pass.', 'LICENSE': 'MIT License full text here enough to pass.', 'docs/guide.md': 'guide' });
    const result = auditDocumentation(tmpDir);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.pass).toBe(true);
  });

  it('fails with no README', () => {
    makeProject({ 'src/app.ts': '' });
    const result = auditDocumentation(tmpDir);
    expect(result.findings.some(f => f.title.includes('README'))).toBe(true);
  });

  it('warns on empty README', () => {
    makeProject({ 'README.md': 'hi' });
    const result = auditDocumentation(tmpDir);
    expect(result.findings.some(f => f.title.includes('empty'))).toBe(true);
  });
});

// ── Testing ─────────────────────────────────────────────────────

describe('auditTesting', () => {
  it('passes with test files', () => {
    makeProject({ 'src/app.ts': '', 'src/app.test.ts': '' });
    const result = auditTesting(tmpDir);
    expect(result.pass).toBe(true);
  });

  it('fails with no tests', () => {
    makeProject({ 'src/app.ts': '', 'src/utils.ts': '' });
    const result = auditTesting(tmpDir);
    expect(result.findings.some(f => f.severity === 'critical')).toBe(true);
  });
});

// ── Dependencies ────────────────────────────────────────────────

describe('auditDependencies', () => {
  it('passes with proper manifest', () => {
    makeProject({ 'package.json': '{"dependencies":{"lodash":"^4.17.21"}}', 'package-lock.json': '{}' });
    const result = auditDependencies(tmpDir);
    expect(result.score).toBe(100);
  });

  it('flags wildcard versions', () => {
    makeProject({ 'package.json': '{"dependencies":{"bad":"*"}}', 'package-lock.json': '{}' });
    const result = auditDependencies(tmpDir);
    expect(result.findings.some(f => f.title.includes('Wildcard'))).toBe(true);
  });

  it('flags missing lockfile', () => {
    makeProject({ 'package.json': '{"dependencies":{}}' });
    const result = auditDependencies(tmpDir);
    expect(result.findings.some(f => f.title.includes('lockfile'))).toBe(true);
  });
});

// ── License ─────────────────────────────────────────────────────

describe('auditLicense', () => {
  it('passes with MIT license', () => {
    makeProject({ 'LICENSE': 'MIT License\nCopyright 2026' });
    const result = auditLicense(tmpDir);
    expect(result.score).toBe(100);
  });

  it('fails with no license', () => {
    makeProject({ 'src/app.ts': '' });
    const result = auditLicense(tmpDir);
    expect(result.findings.some(f => f.severity === 'critical')).toBe(true);
  });
});

// ── Accessibility ───────────────────────────────────────────────

describe('auditAccessibility', () => {
  it('passes with proper HTML', () => {
    makeProject({ 'index.html': '<html lang="en"><body><img src="x" alt="photo"><label for="name">Name</label><input id="name"></body></html>' });
    const result = auditAccessibility(tmpDir);
    expect(result.pass).toBe(true);
  });

  it('detects img without alt', () => {
    makeProject({ 'index.html': '<html lang="en"><body><img src="photo.jpg"></body></html>' });
    const result = auditAccessibility(tmpDir);
    expect(result.findings.some(f => f.title.includes('alt'))).toBe(true);
  });

  it('skips when no HTML files', () => {
    makeProject({ 'src/app.ts': '' });
    const result = auditAccessibility(tmpDir);
    expect(result.score).toBe(100);
  });
});

// ── Privacy ─────────────────────────────────────────────────────

describe('auditPrivacy', () => {
  it('flags missing privacy policy', () => {
    makeProject({ 'src/app.ts': '' });
    const result = auditPrivacy(tmpDir);
    expect(result.findings.some(f => f.title.includes('privacy'))).toBe(true);
  });

  it('detects PII in logs', () => {
    makeProject({ 'src/app.ts': 'console.log("email: " + email)', 'privacy.md': 'policy' });
    const result = auditPrivacy(tmpDir);
    expect(result.findings.some(f => f.title.includes('PII'))).toBe(true);
  });
});

// ── Architecture ────────────────────────────────────────────────

describe('auditArchitecture', () => {
  it('passes with good structure', () => {
    makeProject({ 'src/app.ts': 'code', '.eslintrc.json': '{}' });
    const result = auditArchitecture(tmpDir);
    expect(result.pass).toBe(true);
  });
});

// ── SEO ─────────────────────────────────────────────────────────

describe('auditSeo', () => {
  it('flags missing meta description', () => {
    makeProject({ 'index.html': '<html><head><title>Test</title></head></html>' });
    const result = auditSeo(tmpDir);
    expect(result.findings.some(f => f.title.includes('meta description'))).toBe(true);
  });

  it('skips when no HTML', () => {
    makeProject({ 'src/app.ts': '' });
    expect(auditSeo(tmpDir).score).toBe(100);
  });
});

// ── Performance ─────────────────────────────────────────────────

describe('auditPerformance', () => {
  it('passes clean project', () => {
    makeProject({ 'src/app.ts': 'const x = 1;' });
    const result = auditPerformance(tmpDir);
    expect(result.pass).toBe(true);
  });
});

// ── CI/CD ───────────────────────────────────────────────────────

describe('auditCiCd', () => {
  it('flags missing CI config', () => {
    makeProject({ 'src/app.ts': '' });
    const result = auditCiCd(tmpDir);
    expect(result.findings.some(f => f.title.includes('CI/CD'))).toBe(true);
  });

  it('passes with GitHub Actions', () => {
    makeProject({ '.github/workflows/ci.yml': 'on: push', '.gitignore': '' });
    const result = auditCiCd(tmpDir);
    expect(result.findings.filter(f => f.severity === 'high')).toHaveLength(0);
  });
});

// ── Full Certification Run ──────────────────────────────────────

describe('runCertification', () => {
  it('produces results for all 15 categories', () => {
    makeProject({
      'README.md': 'Full project documentation content here.',
      'CHANGELOG.md': 'Version 1.0.0 release notes content.',
      'LICENSE': 'MIT License Copyright 2026',
      'package.json': '{"dependencies":{}}',
      'package-lock.json': '{}',
      '.gitignore': 'node_modules',
      'src/app.ts': 'const x = 1;',
      'src/app.test.ts': 'test("works", () => {})',
      '.eslintrc.json': '{}',
    });
    const result = runCertification({ projectPath: tmpDir });
    expect(result.categories).toHaveLength(15);
    expect(result.grade).toBeDefined();
    expect(result.overallScore).toBeGreaterThan(0);
  });

  it('filters by category', () => {
    makeProject({ 'README.md': 'docs', 'LICENSE': 'MIT' });
    const result = runCertification({ projectPath: tmpDir, categories: ['documentation'] });
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].category).toBe('documentation');
  });

  it('handles empty directory', () => {
    const result = runCertification({ projectPath: tmpDir });
    expect(result.grade).toBeDefined();
    expect(result.totalFindings).toBeGreaterThan(0);
  });
});

// ── DB Persistence ──────────────────────────────────────────────

describe('DB operations', () => {
  let db: Database.Database;

  beforeEach(() => { db = initDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('insertCertificationRun and getCertificationRun round-trip', () => {
    makeProject({ 'README.md': 'docs' });
    const result = runCertification({ projectPath: tmpDir });
    insertCertificationRun(db, result);
    const loaded = getCertificationRun(db, result.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.grade).toBe(result.grade);
  });

  it('getCertificationHistory returns ordered', () => {
    makeProject({ 'README.md': 'docs' });
    const r1 = runCertification({ projectPath: tmpDir });
    const r2 = runCertification({ projectPath: tmpDir });
    insertCertificationRun(db, r1);
    insertCertificationRun(db, r2);
    const history = getCertificationHistory(db, 10);
    expect(history).toHaveLength(2);
  });

  it('returns null for nonexistent run', () => {
    expect(getCertificationRun(db, 'nonexistent')).toBeNull();
  });
});

// ── Formatting ──────────────────────────────────────────────────

describe('formatCertificationReport', () => {
  it('includes grade and score', () => {
    makeProject({ 'README.md': 'docs' });
    const result = runCertification({ projectPath: tmpDir });
    const report = formatCertificationReport(result);
    expect(report).toContain('Grade');
    expect(report).toContain(result.grade);
  });
});

describe('generateHtmlReport', () => {
  it('produces valid HTML', () => {
    makeProject({ 'README.md': 'docs' });
    const result = runCertification({ projectPath: tmpDir });
    const html = generateHtmlReport(result);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('RegForge');
    expect(html).toContain(result.grade);
  });

  it('escapes HTML in project name', () => {
    makeProject({ 'README.md': 'docs' });
    const result = runCertification({ projectPath: tmpDir });
    result.projectName = '<script>alert("xss")</script>';
    const html = generateHtmlReport(result);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('getAllCategories', () => {
  it('returns 15 categories', () => {
    expect(getAllCategories()).toHaveLength(15);
  });

  it('includes new hardening categories', () => {
    const cats = getAllCategories();
    expect(cats).toContain('contracts');
    expect(cats).toContain('authorization');
    expect(cats).toContain('error-handling');
    expect(cats).toContain('supply-chain');
  });
});

// ── Contract Mismatch Detector (Story 2.1) ──────────────────────

describe('auditContracts', () => {
  it('flags frontend fetch calls to non-existent backend routes', () => {
    makeProject({
      'src/api/routes.ts': `
        import express from 'express';
        const router = express.Router();
        router.get('/api/users', (req, res) => res.json([]));
        export default router;
      `,
      'src/components/Dashboard.tsx': `
        const data = await fetch('/api/invoices');
      `,
    });
    const result = auditContracts(tmpDir);
    expect(result.findings.some((f) => f.title.includes('CONTRACT-002'))).toBe(true);
  });

  it('flags unguarded .map() on response field', () => {
    makeProject({
      'src/components/List.tsx': `
        const items = response.data.map(x => x.name);
      `,
    });
    const result = auditContracts(tmpDir);
    expect(result.findings.some((f) => f.title.includes('CONTRACT-005'))).toBe(true);
  });

  it('flags unix timestamp conversion', () => {
    makeProject({
      'src/utils/date.ts': `
        const date = new Date(timestamp * 1000);
      `,
    });
    const result = auditContracts(tmpDir);
    expect(result.findings.some((f) => f.title.includes('CONTRACT-009'))).toBe(true);
  });

  it('passes clean project with no frontend-backend mismatches', () => {
    makeProject({
      'src/app.ts': 'const x = 1;',
    });
    const result = auditContracts(tmpDir);
    expect(result.score).toBe(100);
  });
});

// ── Authorization Pattern Detector (Story 2.2) ─────────────────

describe('auditAuthorization', () => {
  it('flags admin route without role check', () => {
    makeProject({
      'src/api/admin-routes.ts': `
        import express from 'express';
        const router = express.Router();
        router.get('/admin/dashboard', (req, res) => {
          res.json({ stats: [] });
        });
        export default router;
      `,
    });
    const result = auditAuthorization(tmpDir);
    expect(result.findings.some((f) => f.title.includes('AUTH-003'))).toBe(true);
  });

  it('passes when admin routes have role checks', () => {
    makeProject({
      'src/api/admin-routes.ts': `
        import express from 'express';
        const router = express.Router();
        router.get('/admin/dashboard', isAdmin, (req, res) => {
          res.json({ stats: [] });
        });
        export default router;
      `,
    });
    const result = auditAuthorization(tmpDir);
    expect(result.findings.filter((f) => f.title.includes('AUTH-003'))).toHaveLength(0);
  });

  it('passes clean project', () => {
    makeProject({
      'src/app.ts': 'const x = 1;',
    });
    const result = auditAuthorization(tmpDir);
    expect(result.score).toBe(100);
  });
});

// ── Error Handling Gap Detector (Story 2.3) ─────────────────────

describe('auditErrorHandling', () => {
  it('flags empty catch blocks', () => {
    makeProject({
      'src/service.ts': `
        try { doStuff(); } catch (e) {}
      `,
    });
    const result = auditErrorHandling(tmpDir);
    expect(result.findings.some((f) => f.title.includes('ERR-001'))).toBe(true);
  });

  it('flags fetch without try/catch', () => {
    makeProject({
      'src/api-client.ts': `
        const data = await fetch('/api/data');
        const json = await data.json();
      `,
    });
    const result = auditErrorHandling(tmpDir);
    expect(result.findings.some((f) => f.title.includes('ERR-003'))).toBe(true);
  });

  it('flags missing global error handler in Express app', () => {
    makeProject({
      'src/app.ts': `
        import express from 'express';
        const app = express();
        app.get('/api/data', (req, res) => res.json({}));
        app.listen(3000);
      `,
    });
    const result = auditErrorHandling(tmpDir);
    expect(result.findings.some((f) => f.title.includes('ERR-007'))).toBe(true);
  });

  it('passes when Express app has error handler', () => {
    makeProject({
      'src/app.ts': `
        import express from 'express';
        const app = express();
        app.get('/api/data', (req, res) => res.json({}));
        app.use(errorHandler);
        app.listen(3000);
      `,
    });
    const result = auditErrorHandling(tmpDir);
    expect(result.findings.filter((f) => f.title.includes('ERR-007'))).toHaveLength(0);
  });
});

// ── Supply Chain Safety Detector (Story 2.4) ────────────────────

describe('auditSupplyChain', () => {
  it('flags wildcard versions', () => {
    makeProject({
      'package.json': JSON.stringify({
        dependencies: { 'bad-pkg': '*', 'ok-pkg': '^1.0.0' },
      }),
      'package-lock.json': '{}',
    });
    const result = auditSupplyChain(tmpDir);
    expect(result.findings.some((f) => f.title.includes('SUPPLY-005'))).toBe(true);
  });

  it('flags missing lockfile', () => {
    makeProject({
      'package.json': JSON.stringify({ dependencies: { 'express': '^4.0.0' } }),
    });
    const result = auditSupplyChain(tmpDir);
    expect(result.findings.some((f) => f.title.includes('SUPPLY-004'))).toBe(true);
  });

  it('flags dev dependencies in production deps', () => {
    makeProject({
      'package.json': JSON.stringify({
        dependencies: { 'jest': '^29.0.0', 'express': '^4.0.0' },
      }),
      'package-lock.json': '{}',
    });
    const result = auditSupplyChain(tmpDir);
    expect(result.findings.some((f) => f.title.includes('SUPPLY-006'))).toBe(true);
  });

  it('passes clean package.json', () => {
    makeProject({
      'package.json': JSON.stringify({
        dependencies: { 'express': '^4.0.0' },
        devDependencies: { 'vitest': '^3.0.0' },
      }),
      'package-lock.json': '{}',
    });
    const result = auditSupplyChain(tmpDir);
    expect(result.score).toBe(100);
  });

  it('flags unpinned Python dependencies', () => {
    makeProject({
      'requirements.txt': 'flask\nrequests==2.31.0\n',
    });
    const result = auditSupplyChain(tmpDir);
    expect(result.findings.some((f) => f.title.includes('Unpinned Python'))).toBe(true);
  });
});
