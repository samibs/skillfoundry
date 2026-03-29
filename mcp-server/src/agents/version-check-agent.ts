/**
 * Version Check Agent — compares PRD version specifications against actual installed packages.
 *
 * Addresses the version drift problem: PRD says Prisma 5 but npm installs Prisma 7,
 * PRD says Next.js 15 but you get 16. This agent catches mismatches before implementation.
 */

import { readFile, readdir, access } from "fs/promises";
import path from "path";
import { exec } from "./exec-utils.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VersionCheckResult {
  passed: boolean;
  prdFile: string | null;
  prdVersions: PrdVersionSpec[];
  installedVersions: InstalledVersion[];
  mismatches: VersionMismatch[];
  summary: {
    prdSpecsFound: number;
    matchedCount: number;
    mismatchCount: number;
    missingCount: number;
  };
  duration: number;
}

export interface PrdVersionSpec {
  package: string;
  specifiedVersion: string;
  source: string; // which PRD file
  line: number;
}

export interface InstalledVersion {
  package: string;
  installedVersion: string;
  source: "package.json" | "requirements.txt" | "pyproject.toml";
}

export interface VersionMismatch {
  package: string;
  prdVersion: string;
  installedVersion: string | null;
  type: "major_drift" | "minor_drift" | "missing";
  severity: "CRITICAL" | "HIGH" | "LOW";
  detail: string;
}

// ─── PRD Version Extraction ─────────────────────────────────────────────────

// Patterns that indicate version specs in PRD markdown files
const VERSION_PATTERNS = [
  // "Next.js 15", "React 19", "Prisma 5"
  /(?:^|\s)(Next\.js|React|Vue|Angular|Svelte|Express|Fastify|Prisma|Drizzle|TypeORM|Knex|Django|Flask|FastAPI)\s+v?(\d+(?:\.\d+)?(?:\.\d+)?)/gi,
  // "next@15.0.0", "prisma@5.x" — must have package-like name before @
  /([\w][\w./-]+)@(\d+(?:\.\d+)?(?:\.\d+)?(?:-[\w.]+)?)/g,
  // "Node.js 20", "Python 3.12"
  /(?:^|\s)(Node\.js|Python|TypeScript|PostgreSQL|MySQL|Redis|MongoDB)\s+v?(\d+(?:\.\d+)?)/gi,
];

// Map common names to npm package names
const NAME_TO_PKG: Record<string, string> = {
  "next.js": "next",
  "react": "react",
  "vue": "vue",
  "angular": "@angular/core",
  "svelte": "svelte",
  "express": "express",
  "fastify": "fastify",
  "prisma": "prisma",
  "drizzle": "drizzle-orm",
  "typeorm": "typeorm",
  "knex": "knex",
  "node.js": "node",
  "typescript": "typescript",
  "python": "python",
  "django": "django",
  "flask": "flask",
  "fastapi": "fastapi",
  "postgresql": "pg",
  "mysql": "mysql2",
  "redis": "redis",
  "mongodb": "mongoose",
};

async function findPrdFiles(projectPath: string): Promise<string[]> {
  const candidates: string[] = [];

  // Check genesis/ directory
  const genesisDir = path.join(projectPath, "genesis");
  try {
    const files = await readdir(genesisDir);
    for (const f of files) {
      if (f.endsWith(".md")) candidates.push(path.join(genesisDir, f));
    }
  } catch { /* no genesis dir */ }

  // Check docs/ for PRDs
  const docsDir = path.join(projectPath, "docs");
  try {
    const files = await readdir(docsDir);
    for (const f of files) {
      if (f.toLowerCase().includes("prd") && f.endsWith(".md")) {
        candidates.push(path.join(docsDir, f));
      }
    }
  } catch { /* no docs dir */ }

  // Check docs/stories/ for story files
  const storiesDir = path.join(projectPath, "docs", "stories");
  try {
    const entries = await readdir(storiesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const storyDir = path.join(storiesDir, entry.name);
        const storyFiles = await readdir(storyDir);
        for (const f of storyFiles) {
          if (f.endsWith(".md")) candidates.push(path.join(storyDir, f));
        }
      }
    }
  } catch { /* no stories dir */ }

  // Check root for any PRD-like files
  try {
    const rootFiles = await readdir(projectPath);
    for (const f of rootFiles) {
      if ((f.toLowerCase().includes("prd") || f.toLowerCase().includes("spec")) && f.endsWith(".md")) {
        candidates.push(path.join(projectPath, f));
      }
    }
  } catch { /* can't read root */ }

  return candidates;
}

async function extractPrdVersions(prdFiles: string[]): Promise<PrdVersionSpec[]> {
  const specs: PrdVersionSpec[] = [];

  for (const file of prdFiles) {
    try {
      const content = await readFile(file, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip code blocks
        if (line.trim().startsWith("```")) continue;

        for (const pattern of VERSION_PATTERNS) {
          pattern.lastIndex = 0;
          let match;
          while ((match = pattern.exec(line)) !== null) {
            const name = match[1]?.toLowerCase();
            const version = match[2] || match[1];

            if (name && version && /^\d/.test(version)) {
              const pkgName = NAME_TO_PKG[name] || name;
              specs.push({
                package: pkgName,
                specifiedVersion: version,
                source: path.basename(file),
                line: i + 1,
              });
            }
          }
        }
      }
    } catch {
      // skip unreadable files
    }
  }

  // Deduplicate (keep first occurrence)
  const seen = new Set<string>();
  return specs.filter((s) => {
    const key = s.package;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Installed Version Extraction ───────────────────────────────────────────

async function getInstalledVersions(projectPath: string): Promise<InstalledVersion[]> {
  const versions: InstalledVersion[] = [];

  // package.json
  try {
    const pkg = JSON.parse(await readFile(path.join(projectPath, "package.json"), "utf-8"));
    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };

    for (const [name, version] of Object.entries(allDeps)) {
      versions.push({
        package: name,
        installedVersion: (version as string).replace(/^[\^~>=<]/, ""),
        source: "package.json",
      });
    }

    // Node version from engines
    if (pkg.engines?.node) {
      versions.push({
        package: "node",
        installedVersion: (pkg.engines.node as string).replace(/^[\^~>=<]/, ""),
        source: "package.json",
      });
    }
  } catch { /* no package.json */ }

  // requirements.txt
  try {
    const req = await readFile(path.join(projectPath, "requirements.txt"), "utf-8");
    for (const line of req.split("\n")) {
      const match = line.match(/^([\w-]+)\s*[>=<~!]*\s*([\d.]+)/);
      if (match) {
        versions.push({
          package: match[1].toLowerCase(),
          installedVersion: match[2],
          source: "requirements.txt",
        });
      }
    }
  } catch { /* no requirements.txt */ }

  return versions;
}

// ─── Version Comparison ─────────────────────────────────────────────────────

function parseMajor(version: string): number {
  return parseInt(version.split(".")[0], 10) || 0;
}

function parseMinor(version: string): number {
  return parseInt(version.split(".")[1], 10) || 0;
}

function compareVersions(prdSpecs: PrdVersionSpec[], installed: InstalledVersion[]): VersionMismatch[] {
  const mismatches: VersionMismatch[] = [];
  const installedMap = new Map<string, InstalledVersion>();

  for (const v of installed) {
    installedMap.set(v.package, v);
  }

  for (const spec of prdSpecs) {
    const inst = installedMap.get(spec.package);

    if (!inst) {
      // Package specified in PRD but not installed
      if (spec.package !== "node" && spec.package !== "python") {
        mismatches.push({
          package: spec.package,
          prdVersion: spec.specifiedVersion,
          installedVersion: null,
          type: "missing",
          severity: "HIGH",
          detail: `${spec.package}@${spec.specifiedVersion} specified in PRD (${spec.source}:${spec.line}) but not found in dependencies`,
        });
      }
      continue;
    }

    const prdMajor = parseMajor(spec.specifiedVersion);
    const instMajor = parseMajor(inst.installedVersion);

    if (prdMajor !== instMajor && prdMajor > 0) {
      mismatches.push({
        package: spec.package,
        prdVersion: spec.specifiedVersion,
        installedVersion: inst.installedVersion,
        type: "major_drift",
        severity: "CRITICAL",
        detail: `PRD specifies ${spec.package}@${spec.specifiedVersion} but ${inst.installedVersion} is installed — MAJOR version drift (breaking changes likely)`,
      });
    } else {
      const prdMinor = parseMinor(spec.specifiedVersion);
      const instMinor = parseMinor(inst.installedVersion);

      if (spec.specifiedVersion.includes(".") && prdMinor !== instMinor && Math.abs(prdMinor - instMinor) > 2) {
        mismatches.push({
          package: spec.package,
          prdVersion: spec.specifiedVersion,
          installedVersion: inst.installedVersion,
          type: "minor_drift",
          severity: "LOW",
          detail: `PRD specifies ${spec.package}@${spec.specifiedVersion} but ${inst.installedVersion} is installed — minor version drift`,
        });
      }
    }
  }

  return mismatches;
}

// ─── Main ───────────────────────────────────────────────────────────────────

export async function checkVersions(projectPath: string): Promise<VersionCheckResult> {
  const start = Date.now();

  const prdFiles = await findPrdFiles(projectPath);
  const prdVersions = await extractPrdVersions(prdFiles);
  const installedVersions = await getInstalledVersions(projectPath);
  const mismatches = compareVersions(prdVersions, installedVersions);

  const matchedCount = prdVersions.length - mismatches.length;

  return {
    passed: mismatches.filter((m) => m.severity === "CRITICAL").length === 0,
    prdFile: prdFiles[0] ? path.basename(prdFiles[0]) : null,
    prdVersions,
    installedVersions: installedVersions.filter((v) =>
      prdVersions.some((p) => p.package === v.package)
    ),
    mismatches,
    summary: {
      prdSpecsFound: prdVersions.length,
      matchedCount: Math.max(0, matchedCount),
      mismatchCount: mismatches.filter((m) => m.type !== "missing").length,
      missingCount: mismatches.filter((m) => m.type === "missing").length,
    },
    duration: Date.now() - start,
  };
}
