/**
 * @test-suite STORY-010 — License Compliance Checker
 *
 * Tests cover:
 * - SPDX license normalisation
 * - License evaluation (commercial vs open-source projects)
 * - GPL dependency flagged as HIGH in commercial project
 * - MIT/Apache dependencies passing with no findings
 * - AGPL in open-source project (not flagged)
 * - Unknown license flagged as MEDIUM
 * - Project type detection from .sfrc, sf.config.json, config.toml
 * - npm manifest scanning with node_modules
 * - npm manifest scanning without node_modules (graceful)
 * - requirements.txt scanning
 * - Cargo.toml scanning
 * - go.mod scanning
 * - .csproj scanning
 * - Multiple manifest files scanned together
 * - Manifest discovery
 * - LicenseChecker class integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  normaliseLicense,
  evaluateLicense,
  detectProjectType,
  discoverManifests,
  scanNpmLicenses,
  scanPipLicenses,
  scanCargoLicenses,
  scanGoLicenses,
  scanDotnetLicenses,
  LicenseChecker,
  createLicenseChecker,
  COPYLEFT_LICENSES,
  RESTRICTED_FOR_COMMERCIAL,
  PERMISSIVE_LICENSES,
  type LicenseCheckOptions,
} from '../core/license-checker.js';
import type { LicenseFinding, LicenseCheckResult } from '../types.js';

// ── Mock logger ───────────────────────────────────────────────────────────────
vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// ── Test directory helpers ────────────────────────────────────────────────────
let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'sf-license-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ── normaliseLicense ──────────────────────────────────────────────────────────

describe('normaliseLicense', () => {
  it('returns UNKNOWN for null', () => {
    expect(normaliseLicense(null)).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for undefined', () => {
    expect(normaliseLicense(undefined)).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for empty string', () => {
    expect(normaliseLicense('')).toBe('UNKNOWN');
  });

  it('passes through canonical SPDX identifiers unchanged', () => {
    expect(normaliseLicense('MIT')).toBe('MIT');
    expect(normaliseLicense('Apache-2.0')).toBe('Apache-2.0');
    expect(normaliseLicense('GPL-3.0')).toBe('GPL-3.0');
    expect(normaliseLicense('AGPL-3.0')).toBe('AGPL-3.0');
  });

  it('normalises "Apache License 2.0" to Apache-2.0', () => {
    expect(normaliseLicense('Apache License 2.0')).toBe('Apache-2.0');
  });

  it('normalises "MIT License" to MIT', () => {
    expect(normaliseLicense('MIT License')).toBe('MIT');
  });

  it('normalises "GNU General Public License v3 (GPLv3)" to GPL-3.0', () => {
    expect(normaliseLicense('GNU General Public License v3 (GPLv3)')).toBe('GPL-3.0');
  });

  it('normalises "AGPL" to AGPL-3.0', () => {
    expect(normaliseLicense('AGPL')).toBe('AGPL-3.0');
  });

  it('handles SPDX expression — takes first term', () => {
    const result = normaliseLicense('MIT OR Apache-2.0');
    expect(result).toBe('MIT');
  });

  it('trims whitespace', () => {
    expect(normaliseLicense('  MIT  ')).toBe('MIT');
  });
});

// ── evaluateLicense ───────────────────────────────────────────────────────────

describe('evaluateLicense', () => {
  describe('commercial project', () => {
    it('flags GPL-3.0 as HIGH', () => {
      const result = evaluateLicense('GPL-3.0', 'commercial', [], []);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('high');
      expect(result!.reason).toContain('GPL-3.0');
      expect(result!.reason.toLowerCase()).toContain('copyleft');
    });

    it('flags GPL-2.0 as HIGH', () => {
      const result = evaluateLicense('GPL-2.0', 'commercial', [], []);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('high');
    });

    it('flags AGPL-3.0 as HIGH', () => {
      const result = evaluateLicense('AGPL-3.0', 'commercial', [], []);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('high');
    });

    it('flags GPL-3.0-only as HIGH', () => {
      const result = evaluateLicense('GPL-3.0-only', 'commercial', [], []);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('high');
    });

    it('passes MIT — no finding', () => {
      expect(evaluateLicense('MIT', 'commercial', [], [])).toBeNull();
    });

    it('passes Apache-2.0 — no finding', () => {
      expect(evaluateLicense('Apache-2.0', 'commercial', [], [])).toBeNull();
    });

    it('passes BSD-3-Clause — no finding', () => {
      expect(evaluateLicense('BSD-3-Clause', 'commercial', [], [])).toBeNull();
    });

    it('passes ISC — no finding', () => {
      expect(evaluateLicense('ISC', 'commercial', [], [])).toBeNull();
    });

    it('flags LGPL-3.0 as MEDIUM (weak copyleft)', () => {
      const result = evaluateLicense('LGPL-3.0', 'commercial', [], []);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('medium');
    });

    it('flags MPL-2.0 as MEDIUM (weak copyleft)', () => {
      const result = evaluateLicense('MPL-2.0', 'commercial', [], []);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('medium');
    });

    it('flags UNKNOWN license as MEDIUM', () => {
      const result = evaluateLicense('UNKNOWN', 'commercial', [], []);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('medium');
      expect(result!.reason).toContain('Unknown');
    });

    it('respects allowLicenses override — does not flag GPL-3.0 when allowed', () => {
      const result = evaluateLicense('GPL-3.0', 'commercial', [], ['GPL-3.0']);
      expect(result).toBeNull();
    });

    it('respects flagLicenses custom list', () => {
      const result = evaluateLicense('CUSTOM-LIC-1.0', 'commercial', ['CUSTOM-LIC-1.0'], []);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('high');
    });
  });

  describe('open-source project', () => {
    it('does NOT flag GPL-3.0 in open-source project', () => {
      expect(evaluateLicense('GPL-3.0', 'open-source', [], [])).toBeNull();
    });

    it('does NOT flag GPL-2.0 in open-source project', () => {
      expect(evaluateLicense('GPL-2.0', 'open-source', [], [])).toBeNull();
    });

    it('does NOT flag LGPL-3.0 in open-source project', () => {
      expect(evaluateLicense('LGPL-3.0', 'open-source', [], [])).toBeNull();
    });

    it('flags AGPL-3.0 as MEDIUM in open-source (network copyleft concern)', () => {
      const result = evaluateLicense('AGPL-3.0', 'open-source', [], []);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('medium');
    });

    it('flags UNKNOWN as MEDIUM in open-source project', () => {
      const result = evaluateLicense('UNKNOWN', 'open-source', [], []);
      expect(result).not.toBeNull();
      expect(result!.severity).toBe('medium');
    });

    it('passes MIT in open-source', () => {
      expect(evaluateLicense('MIT', 'open-source', [], [])).toBeNull();
    });
  });
});

// ── SPDX license sets ─────────────────────────────────────────────────────────

describe('SPDX license classification sets', () => {
  it('COPYLEFT_LICENSES includes GPL-2.0, GPL-3.0, AGPL-3.0, LGPL-3.0', () => {
    expect(COPYLEFT_LICENSES.has('GPL-2.0')).toBe(true);
    expect(COPYLEFT_LICENSES.has('GPL-3.0')).toBe(true);
    expect(COPYLEFT_LICENSES.has('AGPL-3.0')).toBe(true);
    expect(COPYLEFT_LICENSES.has('LGPL-3.0')).toBe(true);
  });

  it('RESTRICTED_FOR_COMMERCIAL includes GPL and AGPL families', () => {
    expect(RESTRICTED_FOR_COMMERCIAL.has('GPL-2.0')).toBe(true);
    expect(RESTRICTED_FOR_COMMERCIAL.has('GPL-3.0')).toBe(true);
    expect(RESTRICTED_FOR_COMMERCIAL.has('AGPL-3.0')).toBe(true);
    expect(RESTRICTED_FOR_COMMERCIAL.has('GPL-3.0-only')).toBe(true);
  });

  it('RESTRICTED_FOR_COMMERCIAL does NOT include LGPL (weak copyleft)', () => {
    expect(RESTRICTED_FOR_COMMERCIAL.has('LGPL-3.0')).toBe(false);
  });

  it('PERMISSIVE_LICENSES includes MIT, Apache-2.0, BSD-3-Clause, ISC', () => {
    expect(PERMISSIVE_LICENSES.has('MIT')).toBe(true);
    expect(PERMISSIVE_LICENSES.has('Apache-2.0')).toBe(true);
    expect(PERMISSIVE_LICENSES.has('BSD-3-Clause')).toBe(true);
    expect(PERMISSIVE_LICENSES.has('ISC')).toBe(true);
  });
});

// ── detectProjectType ─────────────────────────────────────────────────────────

describe('detectProjectType', () => {
  it('defaults to commercial when no config file present', () => {
    expect(detectProjectType(testDir)).toBe('commercial');
  });

  it('reads projectType from .sfrc JSON', () => {
    writeFileSync(join(testDir, '.sfrc'), JSON.stringify({ projectType: 'open-source' }));
    expect(detectProjectType(testDir)).toBe('open-source');
  });

  it('reads projectType from sf.config.json', () => {
    writeFileSync(join(testDir, 'sf.config.json'), JSON.stringify({ projectType: 'open-source' }));
    expect(detectProjectType(testDir)).toBe('open-source');
  });

  it('reads license_policy from .skillfoundry/config.toml', () => {
    const sfDir = join(testDir, '.skillfoundry');
    mkdirSync(sfDir, { recursive: true });
    writeFileSync(
      join(sfDir, 'config.toml'),
      '[defaults]\nmodel = "claude-opus-4-5"\nlicense_policy = "open-source"\n',
    );
    expect(detectProjectType(testDir)).toBe('open-source');
  });

  it('returns commercial when .sfrc has commercial projectType', () => {
    writeFileSync(join(testDir, '.sfrc'), JSON.stringify({ projectType: 'commercial' }));
    expect(detectProjectType(testDir)).toBe('commercial');
  });

  it('returns commercial when .sfrc is malformed JSON', () => {
    writeFileSync(join(testDir, '.sfrc'), 'not valid json {{{');
    expect(detectProjectType(testDir)).toBe('commercial');
  });

  it('.sfrc takes precedence over sf.config.json', () => {
    writeFileSync(join(testDir, '.sfrc'), JSON.stringify({ projectType: 'open-source' }));
    writeFileSync(join(testDir, 'sf.config.json'), JSON.stringify({ projectType: 'commercial' }));
    expect(detectProjectType(testDir)).toBe('open-source');
  });
});

// ── discoverManifests ─────────────────────────────────────────────────────────

describe('discoverManifests', () => {
  it('returns empty array when no manifests exist', () => {
    const manifests = discoverManifests(testDir);
    expect(manifests).toHaveLength(0);
  });

  it('discovers package.json in root', () => {
    writeFileSync(join(testDir, 'package.json'), '{"name":"test","dependencies":{}}');
    const manifests = discoverManifests(testDir);
    expect(manifests.some((m) => m.endsWith('package.json'))).toBe(true);
  });

  it('discovers requirements.txt', () => {
    writeFileSync(join(testDir, 'requirements.txt'), 'flask==2.0\n');
    const manifests = discoverManifests(testDir);
    expect(manifests.some((m) => m.endsWith('requirements.txt'))).toBe(true);
  });

  it('discovers Cargo.toml', () => {
    writeFileSync(join(testDir, 'Cargo.toml'), '[package]\nname = "myapp"\nversion = "1.0.0"\n');
    const manifests = discoverManifests(testDir);
    expect(manifests.some((m) => m.endsWith('Cargo.toml'))).toBe(true);
  });

  it('discovers go.mod', () => {
    writeFileSync(join(testDir, 'go.mod'), 'module example.com/app\ngo 1.21\n');
    const manifests = discoverManifests(testDir);
    expect(manifests.some((m) => m.endsWith('go.mod'))).toBe(true);
  });

  it('discovers .csproj files', () => {
    writeFileSync(join(testDir, 'MyApp.csproj'), '<Project Sdk="Microsoft.NET.Sdk"></Project>');
    const manifests = discoverManifests(testDir);
    expect(manifests.some((m) => m.endsWith('.csproj'))).toBe(true);
  });

  it('discovers multiple manifests at once', () => {
    writeFileSync(join(testDir, 'package.json'), '{"name":"test"}');
    writeFileSync(join(testDir, 'requirements.txt'), 'flask==2.0\n');
    const manifests = discoverManifests(testDir);
    expect(manifests.length).toBeGreaterThanOrEqual(2);
  });

  it('does not discover manifests in node_modules', () => {
    const nm = join(testDir, 'node_modules', 'some-pkg');
    mkdirSync(nm, { recursive: true });
    writeFileSync(join(nm, 'package.json'), '{"name":"some-pkg","version":"1.0.0"}');
    const manifests = discoverManifests(testDir);
    expect(manifests.every((m) => !m.includes('node_modules'))).toBe(true);
  });
});

// ── scanNpmLicenses ───────────────────────────────────────────────────────────

describe('scanNpmLicenses', () => {
  it('returns empty array for empty dependencies', () => {
    const pkgPath = join(testDir, 'package.json');
    writeFileSync(pkgPath, JSON.stringify({ name: 'test', dependencies: {}, devDependencies: {} }));
    const packages = scanNpmLicenses(testDir, pkgPath);
    expect(packages).toHaveLength(0);
  });

  it('lists dependencies from package.json when node_modules absent', () => {
    const pkgPath = join(testDir, 'package.json');
    writeFileSync(pkgPath, JSON.stringify({
      name: 'test',
      dependencies: { lodash: '^4.17.21', express: '^4.18.0' },
      devDependencies: { typescript: '^5.0.0' },
    }));
    const packages = scanNpmLicenses(testDir, pkgPath);
    // Without node_modules, license is UNKNOWN but packages are detected
    expect(packages.length).toBe(3);
    expect(packages.map((p) => p.name)).toContain('lodash');
    expect(packages.map((p) => p.name)).toContain('express');
    expect(packages.map((p) => p.name)).toContain('typescript');
  });

  it('reads license from node_modules/<pkg>/package.json', () => {
    const pkgPath = join(testDir, 'package.json');
    writeFileSync(pkgPath, JSON.stringify({
      name: 'test',
      dependencies: { 'some-lib': '^1.0.0' },
    }));

    // Create fake node_modules with license info
    const libDir = join(testDir, 'node_modules', 'some-lib');
    mkdirSync(libDir, { recursive: true });
    writeFileSync(join(libDir, 'package.json'), JSON.stringify({
      name: 'some-lib',
      version: '1.2.3',
      license: 'MIT',
    }));

    const packages = scanNpmLicenses(testDir, pkgPath);
    expect(packages).toHaveLength(1);
    expect(packages[0].name).toBe('some-lib');
    expect(packages[0].version).toBe('1.2.3');
    expect(packages[0].license).toBe('MIT');
  });

  it('reads license from legacy "licenses" array field', () => {
    const pkgPath = join(testDir, 'package.json');
    writeFileSync(pkgPath, JSON.stringify({
      name: 'test',
      dependencies: { 'old-lib': '^1.0.0' },
    }));

    const libDir = join(testDir, 'node_modules', 'old-lib');
    mkdirSync(libDir, { recursive: true });
    writeFileSync(join(libDir, 'package.json'), JSON.stringify({
      name: 'old-lib',
      version: '0.9.0',
      licenses: [{ type: 'GPL-2.0' }],
    }));

    const packages = scanNpmLicenses(testDir, pkgPath);
    expect(packages[0].license).toBe('GPL-2.0');
  });

  it('skips workspace: protocol references', () => {
    const pkgPath = join(testDir, 'package.json');
    writeFileSync(pkgPath, JSON.stringify({
      name: 'test',
      dependencies: {
        '@my/shared': 'workspace:^1.0.0',
        'real-dep': '^2.0.0',
      },
    }));
    const packages = scanNpmLicenses(testDir, pkgPath);
    expect(packages.every((p) => p.name !== '@my/shared')).toBe(true);
    expect(packages.some((p) => p.name === 'real-dep')).toBe(true);
  });

  it('handles scoped npm packages', () => {
    const pkgPath = join(testDir, 'package.json');
    writeFileSync(pkgPath, JSON.stringify({
      name: 'test',
      dependencies: { '@scope/pkg': '^1.0.0' },
    }));

    const libDir = join(testDir, 'node_modules', '@scope', 'pkg');
    mkdirSync(libDir, { recursive: true });
    writeFileSync(join(libDir, 'package.json'), JSON.stringify({
      name: '@scope/pkg',
      version: '1.0.0',
      license: 'Apache-2.0',
    }));

    const packages = scanNpmLicenses(testDir, pkgPath);
    expect(packages.some((p) => p.name === '@scope/pkg' && p.license === 'Apache-2.0')).toBe(true);
  });
});

// ── scanPipLicenses ───────────────────────────────────────────────────────────

describe('scanPipLicenses', () => {
  it('returns empty array for empty requirements.txt', () => {
    const reqPath = join(testDir, 'requirements.txt');
    writeFileSync(reqPath, '# just a comment\n');
    const packages = scanPipLicenses(testDir, reqPath);
    expect(packages).toHaveLength(0);
  });

  it('parses package names and versions', () => {
    const reqPath = join(testDir, 'requirements.txt');
    writeFileSync(reqPath, 'flask==2.0.0\nrequests>=2.28.0\ndjango\n');
    const packages = scanPipLicenses(testDir, reqPath);
    expect(packages.length).toBe(3);
    expect(packages.find((p) => p.name === 'flask')?.version).toBe('2.0.0');
    expect(packages.find((p) => p.name === 'requests')?.version).toBe('2.28.0');
    expect(packages.find((p) => p.name === 'django')?.version).toBe('unknown');
  });

  it('skips comment lines', () => {
    const reqPath = join(testDir, 'requirements.txt');
    writeFileSync(reqPath, '# This is a comment\nflask==2.0.0\n# Another comment\nrequests==2.28.0\n');
    const packages = scanPipLicenses(testDir, reqPath);
    expect(packages.every((p) => !p.name.startsWith('#'))).toBe(true);
    expect(packages.length).toBe(2);
  });

  it('skips -r and -e directives', () => {
    const reqPath = join(testDir, 'requirements.txt');
    writeFileSync(reqPath, '-r other-requirements.txt\n-e git+https://github.com/x/y.git\nflask==2.0.0\n');
    const packages = scanPipLicenses(testDir, reqPath);
    expect(packages.every((p) => !p.name.startsWith('-'))).toBe(true);
  });

  it('defaults license to UNKNOWN when no venv present', () => {
    const reqPath = join(testDir, 'requirements.txt');
    writeFileSync(reqPath, 'flask==2.0.0\n');
    const packages = scanPipLicenses(testDir, reqPath);
    expect(packages[0].license).toBe('UNKNOWN');
  });
});

// ── scanCargoLicenses ─────────────────────────────────────────────────────────

describe('scanCargoLicenses', () => {
  it('parses [package] section with license', () => {
    const cargoPath = join(testDir, 'Cargo.toml');
    writeFileSync(cargoPath, '[package]\nname = "myapp"\nversion = "0.1.0"\nlicense = "MIT"\n');
    const packages = scanCargoLicenses(testDir, cargoPath);
    expect(packages.length).toBeGreaterThanOrEqual(1);
    const myapp = packages.find((p) => p.name === 'myapp');
    expect(myapp).toBeDefined();
    expect(myapp!.license).toBe('MIT');
    expect(myapp!.version).toBe('0.1.0');
  });

  it('returns UNKNOWN license when not specified', () => {
    const cargoPath = join(testDir, 'Cargo.toml');
    writeFileSync(cargoPath, '[package]\nname = "myapp"\nversion = "0.1.0"\n');
    const packages = scanCargoLicenses(testDir, cargoPath);
    expect(packages[0].license).toBe('UNKNOWN');
  });

  it('parses Cargo.lock for transitive dependencies', () => {
    const cargoPath = join(testDir, 'Cargo.toml');
    writeFileSync(cargoPath, '[package]\nname = "myapp"\nversion = "0.1.0"\nlicense = "MIT"\n');
    writeFileSync(
      join(testDir, 'Cargo.lock'),
      '# This file is automatically @generated by Cargo.\n\n[[package]]\nname = "serde"\nversion = "1.0.0"\nlicense = "MIT OR Apache-2.0"\n\n[[package]]\nname = "tokio"\nversion = "1.0.0"\nlicense = "MIT"\n',
    );
    const packages = scanCargoLicenses(testDir, cargoPath);
    expect(packages.some((p) => p.name === 'serde')).toBe(true);
    expect(packages.some((p) => p.name === 'tokio')).toBe(true);
  });
});

// ── scanGoLicenses ────────────────────────────────────────────────────────────

describe('scanGoLicenses', () => {
  it('parses require block from go.mod', () => {
    const goModPath = join(testDir, 'go.mod');
    writeFileSync(
      goModPath,
      'module example.com/myapp\n\ngo 1.21\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.0\n\tgolang.org/x/crypto v0.10.0 // indirect\n)\n',
    );
    const packages = scanGoLicenses(testDir, goModPath);
    expect(packages.length).toBeGreaterThanOrEqual(2);
    expect(packages.some((p) => p.name === 'github.com/gin-gonic/gin')).toBe(true);
    expect(packages.some((p) => p.name === 'golang.org/x/crypto')).toBe(true);
  });

  it('returns UNKNOWN license for all Go packages', () => {
    const goModPath = join(testDir, 'go.mod');
    writeFileSync(goModPath, 'module example.com/app\n\ngo 1.21\n\nrequire (\n\tgithub.com/some/pkg v1.0.0\n)\n');
    const packages = scanGoLicenses(testDir, goModPath);
    expect(packages.every((p) => p.license === 'UNKNOWN')).toBe(true);
  });

  it('returns empty array for empty go.mod', () => {
    const goModPath = join(testDir, 'go.mod');
    writeFileSync(goModPath, 'module example.com/app\n\ngo 1.21\n');
    const packages = scanGoLicenses(testDir, goModPath);
    expect(packages).toHaveLength(0);
  });
});

// ── scanDotnetLicenses ────────────────────────────────────────────────────────

describe('scanDotnetLicenses', () => {
  it('parses PackageReference from .csproj', () => {
    const csprojPath = join(testDir, 'MyApp.csproj');
    writeFileSync(
      csprojPath,
      `<Project Sdk="Microsoft.NET.Sdk">
  <ItemGroup>
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
    <PackageReference Include="Microsoft.EntityFrameworkCore" Version="7.0.0" />
  </ItemGroup>
</Project>`,
    );
    const packages = scanDotnetLicenses(testDir, csprojPath);
    expect(packages.length).toBe(2);
    expect(packages.some((p) => p.name === 'Newtonsoft.Json' && p.version === '13.0.3')).toBe(true);
    expect(packages.some((p) => p.name === 'Microsoft.EntityFrameworkCore')).toBe(true);
  });

  it('returns UNKNOWN license for all .NET packages', () => {
    const csprojPath = join(testDir, 'App.csproj');
    writeFileSync(
      csprojPath,
      '<Project><ItemGroup><PackageReference Include="SomePkg" Version="1.0.0" /></ItemGroup></Project>',
    );
    const packages = scanDotnetLicenses(testDir, csprojPath);
    expect(packages.every((p) => p.license === 'UNKNOWN')).toBe(true);
  });

  it('returns empty array when no PackageReference found', () => {
    const csprojPath = join(testDir, 'Empty.csproj');
    writeFileSync(csprojPath, '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup></PropertyGroup></Project>');
    const packages = scanDotnetLicenses(testDir, csprojPath);
    expect(packages).toHaveLength(0);
  });
});

// ── LicenseChecker class ──────────────────────────────────────────────────────

describe('LicenseChecker', () => {
  it('throws when projectRoot is relative', () => {
    expect(() => new LicenseChecker('relative/path')).toThrow(TypeError);
  });

  it('accepts normalised absolute paths (traversal sequences are resolved by normalize)', () => {
    // normalize('/valid/path/../../../etc') → '/etc' — valid absolute path, no error expected
    expect(() => new LicenseChecker(testDir)).not.toThrow();
  });

  it('check() returns empty result when no manifests found', async () => {
    const checker = new LicenseChecker(testDir);
    const result = await checker.check();

    expect(result.scanner).toBe('license');
    expect(result.findings).toHaveLength(0);
    expect(result.findingCount).toBe(0);
    expect(result.checkedPackages).toBe(0);
    expect(result.manifests).toHaveLength(0);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('check() flags GPL-3.0 dependency in commercial project', async () => {
    // Create package.json
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'my-app',
      dependencies: { 'gpl-lib': '^1.0.0' },
    }));

    // Create node_modules with GPL license
    const libDir = join(testDir, 'node_modules', 'gpl-lib');
    mkdirSync(libDir, { recursive: true });
    writeFileSync(join(libDir, 'package.json'), JSON.stringify({
      name: 'gpl-lib',
      version: '1.0.0',
      license: 'GPL-3.0',
    }));

    const checker = new LicenseChecker(testDir);
    const result = await checker.check({ projectType: 'commercial' });

    expect(result.findingCount).toBeGreaterThanOrEqual(1);
    const gplFinding = result.findings.find((f) => f.package === 'gpl-lib');
    expect(gplFinding).toBeDefined();
    expect(gplFinding!.severity).toBe('high');
    expect(gplFinding!.license).toBe('GPL-3.0');
    expect(gplFinding!.reason).toContain('copyleft');
  });

  it('check() returns zero findings for MIT-only dependencies', async () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'my-app',
      dependencies: { lodash: '^4.17.21', express: '^4.18.0' },
    }));

    // Create node_modules with MIT licenses
    for (const [pkg, version] of [['lodash', '4.17.21'], ['express', '4.18.0']] as const) {
      const libDir = join(testDir, 'node_modules', pkg);
      mkdirSync(libDir, { recursive: true });
      writeFileSync(join(libDir, 'package.json'), JSON.stringify({ name: pkg, version, license: 'MIT' }));
    }

    const checker = new LicenseChecker(testDir);
    const result = await checker.check({ projectType: 'commercial' });

    expect(result.findingCount).toBe(0);
  });

  it('check() does NOT flag GPL-3.0 in open-source project', async () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'my-oss-app',
      dependencies: { 'gpl-lib': '^1.0.0' },
    }));

    const libDir = join(testDir, 'node_modules', 'gpl-lib');
    mkdirSync(libDir, { recursive: true });
    writeFileSync(join(libDir, 'package.json'), JSON.stringify({ name: 'gpl-lib', version: '1.0.0', license: 'GPL-3.0' }));

    const checker = new LicenseChecker(testDir);
    const result = await checker.check({ projectType: 'open-source' });

    const gplFinding = result.findings.find((f) => f.package === 'gpl-lib');
    expect(gplFinding).toBeUndefined();
  });

  it('check() scans both package.json and requirements.txt', async () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'my-app',
      dependencies: { 'npm-lib': '^1.0.0' },
    }));
    writeFileSync(join(testDir, 'requirements.txt'), 'flask==2.0.0\ndjango==4.0.0\n');

    const checker = new LicenseChecker(testDir);
    const result = await checker.check({ projectType: 'commercial' });

    // Both manifests should be scanned
    expect(result.manifests.some((m) => m.endsWith('package.json'))).toBe(true);
    expect(result.manifests.some((m) => m.endsWith('requirements.txt'))).toBe(true);
    expect(result.checkedPackages).toBeGreaterThanOrEqual(3);
  });

  it('check() includes manifests list in result', async () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'test', dependencies: {} }));
    writeFileSync(join(testDir, 'requirements.txt'), 'flask==2.0.0\n');
    writeFileSync(join(testDir, 'go.mod'), 'module example.com/app\ngo 1.21\n');

    const checker = new LicenseChecker(testDir);
    const result = await checker.check();

    expect(result.manifests.length).toBeGreaterThanOrEqual(3);
  });

  it('check() respects projectType from .sfrc', async () => {
    writeFileSync(join(testDir, '.sfrc'), JSON.stringify({ projectType: 'open-source' }));
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'oss-app',
      dependencies: { 'gpl-lib': '^1.0.0' },
    }));

    const libDir = join(testDir, 'node_modules', 'gpl-lib');
    mkdirSync(libDir, { recursive: true });
    writeFileSync(join(libDir, 'package.json'), JSON.stringify({ name: 'gpl-lib', version: '1.0.0', license: 'GPL-3.0' }));

    const checker = new LicenseChecker(testDir);
    const result = await checker.check(); // No explicit projectType — should read from .sfrc

    const gplFinding = result.findings.find((f) => f.package === 'gpl-lib');
    expect(gplFinding).toBeUndefined();
    expect(result.projectType).toBe('open-source');
  });

  it('check() with unknown license flags as medium', async () => {
    writeFileSync(join(testDir, 'package.json'), JSON.stringify({
      name: 'test',
      dependencies: { 'mystery-lib': '^1.0.0' },
    }));

    const libDir = join(testDir, 'node_modules', 'mystery-lib');
    mkdirSync(libDir, { recursive: true });
    writeFileSync(join(libDir, 'package.json'), JSON.stringify({
      name: 'mystery-lib',
      version: '1.0.0',
      // No license field
    }));

    const checker = new LicenseChecker(testDir);
    const result = await checker.check({ projectType: 'commercial' });

    const unknownFinding = result.findings.find((f) => f.package === 'mystery-lib');
    expect(unknownFinding).toBeDefined();
    expect(unknownFinding!.severity).toBe('medium');
    expect(unknownFinding!.license).toBe('UNKNOWN');
  });

  it('check() duration is positive', async () => {
    const checker = new LicenseChecker(testDir);
    const result = await checker.check();
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

// ── createLicenseChecker ──────────────────────────────────────────────────────

describe('createLicenseChecker', () => {
  it('creates a LicenseChecker instance', () => {
    const checker = createLicenseChecker(testDir);
    expect(checker).toBeInstanceOf(LicenseChecker);
  });
});

// ── Integration: fixture package-gpl.json ────────────────────────────────────

describe('Integration: fixture license files', () => {
  it('fixture package-gpl.json lists GPL and AGPL dependencies', () => {
    const fixtureDir = join(process.cwd(), 'src', '__tests__', 'fixtures', 'licenses');
    const fixturePkg = join(fixtureDir, 'package-gpl.json');
    // Scan npm licenses using fixture (no node_modules — returns UNKNOWN for all)
    const packages = scanNpmLicenses(fixtureDir, fixturePkg);
    const names = packages.map((p) => p.name);
    expect(names).toContain('some-gpl-lib');
    expect(names).toContain('another-agpl-tool');
    expect(names).toContain('lodash');
  });
});
