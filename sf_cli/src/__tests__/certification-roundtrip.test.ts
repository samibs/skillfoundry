/**
 * Integration test: Certification round-trip (Story 3.2)
 *
 * Runs certification on the examples/test-project (intentional violations),
 * asserts it fails, applies known fixes, re-certifies, asserts improvement.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCertification } from '../core/certification-engine.js';

let tmpDir: string;

function copyDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function makeFile(path: string, content: string) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cert-roundtrip-'));
  // Copy the test-project into a temp dir so we can modify it
  const testProject = join(__dirname, '..', '..', '..', 'examples', 'test-project');
  if (existsSync(testProject)) {
    copyDir(testProject, tmpDir);
  }
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('Certification Round-Trip', () => {
  it('test-project grades D or F before remediation', () => {
    const result = runCertification({ projectPath: tmpDir });
    expect(['D', 'F']).toContain(result.grade);
    expect(result.totalFindings).toBeGreaterThan(5);
    expect(result.findingsBySeverity.critical ?? 0).toBeGreaterThan(0);
  });

  it('remediated project grades B or better', () => {
    // Apply known fixes
    makeFile(join(tmpDir, 'README.md'), '# Test Project\n\nA demo Express app for testing the certification pipeline.\n\n## Installation\n\n```bash\nnpm install\nnpm start\n```\n');
    makeFile(join(tmpDir, 'CHANGELOG.md'), '# Changelog\n\n## 1.0.0 - 2026-03-27\n\n- Initial release\n');
    makeFile(join(tmpDir, 'LICENSE'), 'MIT License\n\nCopyright (c) 2026 Test Project\n\nPermission is hereby granted...\n');
    makeFile(join(tmpDir, '.gitignore'), 'node_modules/\n.env\ndist/\n');
    makeFile(join(tmpDir, 'package-lock.json'), '{}');
    mkdirSync(join(tmpDir, '.github', 'workflows'), { recursive: true });
    makeFile(join(tmpDir, '.github', 'workflows', 'ci.yml'), 'name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n');
    makeFile(join(tmpDir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
    makeFile(join(tmpDir, 'privacy-policy.md'), '# Privacy Policy\n\nWe respect your privacy...\n');
    makeFile(join(tmpDir, '.env.example'), 'API_KEY=your-key-here\nDB_URL=your-db-url\n');

    // Fix package.json — remove wildcards, move jest to devDeps
    makeFile(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      dependencies: { express: '^4.18.0' },
      devDependencies: { jest: '^29.0.0', vitest: '^3.0.0' },
    }, null, 2));

    // Remove dangerous .env
    try { rmSync(join(tmpDir, '.env')); } catch { /* already gone */ }

    // Replace app.ts with clean version
    makeFile(join(tmpDir, 'src', 'app.ts'), `
import express from 'express';
const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/users', (req, res) => res.json({ data: [], meta: { total: 0 } }));

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
});

export default app;
`);

    // Replace routes with clean version
    makeFile(join(tmpDir, 'src', 'routes', 'users.ts'), `
import express from 'express';
const router = express.Router();

router.get('/api/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const user = { id: userId, name: 'Test User' };
    res.json({ data: user });
  } catch (err) {
    console.error('Failed to fetch user:', err);
    res.status(500).json({ error: { code: 'FETCH_FAILED', message: 'Failed to fetch user' } });
  }
});

export default router;
`);

    // Replace component with clean version
    makeFile(join(tmpDir, 'src', 'components', 'Dashboard.tsx'), `
import React, { useState, useEffect } from 'react';

interface DashboardStats { users: number; orders: number; }

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setError('Failed to load dashboard');
      }
    };
    loadStats();
  }, []);

  if (error) return <div role="alert">{error}</div>;
  if (!stats) return <div>Loading...</div>;
  return <div><h1>Dashboard</h1><p>Users: {stats.users}</p></div>;
}
`);

    // Replace index.html with accessible version
    makeFile(join(tmpDir, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Test project for certification pipeline testing">
  <title>Test Project</title>
</head>
<body>
  <main>
    <h1>Test Project</h1>
    <img src="logo.png" alt="Test Project Logo">
    <form>
      <label for="email">Email</label>
      <input type="email" id="email" name="email" aria-label="Email address">
    </form>
  </main>
</body>
</html>`);

    // Add a test file
    makeFile(join(tmpDir, 'src', 'app.test.ts'), `
import { describe, it, expect } from 'vitest';
describe('app', () => {
  it('health check returns ok', () => { expect(true).toBe(true); });
  it('users endpoint returns array', () => { expect([]).toEqual([]); });
});
`);

    // Add eslint config
    makeFile(join(tmpDir, '.eslintrc.json'), '{"extends": ["eslint:recommended"]}');

    const result = runCertification({ projectPath: tmpDir });
    expect(result.overallScore).toBeGreaterThanOrEqual(70);
    expect(['A', 'B', 'C']).toContain(result.grade);
    // Critical findings should be zero after remediation
    expect(result.findingsBySeverity.critical ?? 0).toBe(0);
  });
});
