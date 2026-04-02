/**
 * DependencyAgent execution logic — checks project dependencies for version existence,
 * maturity classification, and peer conflicts.
 */

import { exec } from "../../agents/exec-utils.js";
import { readFile } from "fs/promises";
import path from "path";

export interface DepInfo {
  name: string;
  version: string;
  latest: string;
  maturity: "stable" | "beta" | "alpha" | "rc" | "unknown";
  exists: boolean;
}

export interface DepCheckResult {
  passed: boolean;
  dependencies: DepInfo[];
  peerConflicts: string[];
  outdated: DepInfo[];
  missing: string[];
  duration: number;
}

/**
 * Check if a specific npm package version exists on the registry.
 */
async function checkPackageVersion(
  name: string,
  version?: string
): Promise<{ exists: boolean; latest: string; versions: string[] }> {
  const result = await exec("npm", ["view", name, "versions", "--json"], {
    timeout: 15000,
  });

  if (!result.success) {
    return { exists: false, latest: "", versions: [] };
  }

  try {
    const versions = JSON.parse(result.stdout) as string[];
    const latest = versions[versions.length - 1] || "";
    const cleanVersion = (version || "").replace(/^[\^~>=<]*/g, "");
    const exists = !version || versions.some((v) => v.startsWith(cleanVersion));
    return { exists, latest, versions: versions.slice(-5) };
  } catch {
    return { exists: false, latest: "", versions: [] };
  }
}

/**
 * Classify a version string's maturity level.
 */
function classifyMaturity(version: string): DepInfo["maturity"] {
  const v = version.toLowerCase();
  if (v.includes("alpha")) return "alpha";
  if (v.includes("beta")) return "beta";
  if (v.includes("rc") || v.includes("preview")) return "rc";
  if (/^\d+\.\d+\.\d+$/.test(v)) return "stable";
  return "unknown";
}

/**
 * Check all dependencies in a project for version existence, maturity, and peer conflicts.
 */
export async function checkDependencies(
  projectPath: string
): Promise<DepCheckResult> {
  const start = Date.now();
  const deps: DepInfo[] = [];
  const missing: string[] = [];
  const peerConflicts: string[] = [];

  // Read package.json
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(
      await readFile(path.join(projectPath, "package.json"), "utf-8")
    );
  } catch {
    return {
      passed: false,
      dependencies: [],
      peerConflicts: [],
      outdated: [],
      missing: ["package.json not found"],
      duration: Date.now() - start,
    };
  }

  const allDeps = {
    ...((pkg.dependencies as Record<string, string>) || {}),
    ...((pkg.devDependencies as Record<string, string>) || {}),
  };

  // Check each dependency (limit to 20 for speed)
  const entries = Object.entries(allDeps).slice(0, 20);
  const checks = await Promise.all(
    entries.map(async ([name, version]) => {
      const check = await checkPackageVersion(name, version);
      const info: DepInfo = {
        name,
        version,
        latest: check.latest,
        maturity: classifyMaturity(check.latest || version),
        exists: check.exists,
      };
      if (!check.exists) missing.push(`${name}@${version}`);
      return info;
    })
  );

  deps.push(...checks);

  // Check for peer conflicts via npm ls
  const lsResult = await exec("npm", ["ls", "--json", "--depth=0"], {
    cwd: projectPath,
    timeout: 30000,
  });

  if (!lsResult.success && lsResult.stderr) {
    const peerLines = lsResult.stderr
      .split("\n")
      .filter((l) => l.includes("peer") || l.includes("ERESOLVE"))
      .slice(0, 10);
    peerConflicts.push(...peerLines);
  }

  const outdated = deps.filter(
    (d) =>
      d.exists &&
      d.latest &&
      d.version !== d.latest &&
      !d.version.startsWith("^")
  );

  return {
    passed: missing.length === 0 && peerConflicts.length === 0,
    dependencies: deps,
    peerConflicts,
    outdated,
    missing,
    duration: Date.now() - start,
  };
}
