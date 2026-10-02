import { existsSync, readFileSync } from "fs";
import path from "path";
import {
  getFleetHealth,
  getFleetHealthSummary,
  getLatestCompletedHarvestStart,
  type FleetHealthRecord,
} from "../state/db.js";

/** Fleet data older than this is flagged as stale in the report. */
export const FLEET_STALE_AFTER_DAYS = 7;

export interface FleetHealthOptions {
  /** Case-insensitive filter on app name or path. Omit for the whole fleet. */
  app?: string;
  /** Framework version apps are compared against. Defaults to the framework's `.version`. */
  currentVersion?: string | null;
  /** Clock override for tests. */
  now?: Date;
}

export interface FleetHealthReport {
  summary: {
    totalApps: number;
    assessedApps: number;
    unassessedApps: number;
    assessmentCoverage: number;
    appsWithMemoryBank: number;
    outdatedApps: number;
    currentFrameworkVersion: string | null;
  };
  freshness: {
    dataAsOf: string | null;
    ageDays: number | null;
    stale: boolean;
    refreshHint: string | null;
    latestHarvestAt: string | null;
  };
  platformDistribution: Record<string, number>;
  frameworkVersions: Record<string, number>;
  outdatedApps: Array<{ name: string; path: string; version: string | null; lastHarvest: string }>;
  unassessedApps: Array<{ name: string; platforms: string[]; hasMemoryBank: boolean; instructionFiles: number }>;
  /**
   * Apps the latest harvest did not see. Excluded from every count above: their
   * data predates that run. Usually the folder was deleted, no longer contains
   * SkillFoundry files, or sits outside the roots that run scanned.
   */
  notRefreshedApps: Array<{ name: string; path: string; lastHarvest: string }>;
  healthScores: Array<{ appName: string; healthGrade: string | null; healthScore: number | null; scanDate: string }>;
  apps: FleetHealthRecord[];
  filter: string | null;
}

/**
 * Read the framework version from `<root>/.version`. The root is SKILLFOUNDRY_ROOT,
 * else three levels above this module (src|dist/knowledge → mcp-server → root).
 */
export function readFrameworkVersion(): string | null {
  const root = process.env.SKILLFOUNDRY_ROOT || path.join(import.meta.dirname, "..", "..", "..");
  const file = path.join(root, ".version");
  if (!existsSync(file)) return null;
  const version = readFileSync(file, "utf8").trim();
  return version.length > 0 ? version : null;
}

/** Numeric compare of dotted versions; returns <0, 0, >0. Non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((p) => parseInt(p, 10) || 0);
  const pb = b.split(".").map((p) => parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * SQLite `datetime('now')` yields "YYYY-MM-DD HH:MM:SS" (UTC, no zone); the
 * harvester's ISO strings carry "Z". Normalize both before comparing/parsing.
 */
function toEpochMs(value: string): number {
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return Date.parse(iso);
}

/**
 * Build the fleet health report from the knowledge store: which apps SkillFoundry
 * knows about, which are on an older framework version, which have never run a
 * forge session, the latest nightly health grades — and how old that data is.
 * The data is only as fresh as the last `sf_harvest_knowledge` run, so the report
 * says so explicitly instead of presenting months-old numbers as current.
 */
export function buildFleetHealthReport(options: FleetHealthOptions = {}): FleetHealthReport {
  const now = options.now ?? new Date();
  const currentVersion =
    options.currentVersion === undefined ? readFrameworkVersion() : options.currentVersion;
  const filter = options.app?.trim().toLowerCase() || null;

  const matches = (name: string, appPath = "") =>
    !filter || name.toLowerCase().includes(filter) || appPath.toLowerCase().includes(filter);

  const matched = getFleetHealth().filter((a) => matches(a.appName, a.appPath));

  // Split off rows the latest harvest run did not touch, so stale per-app data is
  // never mixed into current counts. The harvester upserts every app it finds but
  // never removes the ones it stops finding.
  const latestRunStart = getLatestCompletedHarvestStart();
  const latestRunMs = latestRunStart === null ? null : toEpochMs(latestRunStart);
  const wasRefreshed = (a: FleetHealthRecord) =>
    latestRunMs === null || Number.isNaN(latestRunMs) || toEpochMs(a.lastHarvestAt) >= latestRunMs;
  const apps = matched.filter(wasRefreshed);
  const notRefreshed = matched.filter((a) => !wasRefreshed(a));

  const isOutdated = (a: FleetHealthRecord) =>
    !a.frameworkVersion || (currentVersion !== null && compareVersions(a.frameworkVersion, currentVersion) < 0);
  const outdated = apps.filter(isOutdated);
  const assessed = apps.filter((a) => a.hasForgeSession).length;

  const platformDistribution: Record<string, number> = {};
  const frameworkVersions: Record<string, number> = {};
  for (const app of apps) {
    for (const p of app.platforms) platformDistribution[p] = (platformDistribution[p] || 0) + 1;
    if (app.frameworkVersion) {
      frameworkVersions[app.frameworkVersion] = (frameworkVersions[app.frameworkVersion] || 0) + 1;
    }
  }

  const harvestTimes = apps.map((a) => toEpochMs(a.lastHarvestAt)).filter((t) => !Number.isNaN(t));
  const latest = harvestTimes.length > 0 ? Math.max(...harvestTimes) : null;
  const ageDays = latest === null ? null : Math.floor((now.getTime() - latest) / 86_400_000);
  const stale = ageDays === null || ageDays > FLEET_STALE_AFTER_DAYS;

  return {
    summary: {
      totalApps: apps.length,
      assessedApps: assessed,
      unassessedApps: apps.length - assessed,
      assessmentCoverage: apps.length > 0 ? Math.round((assessed / apps.length) * 100) : 0,
      appsWithMemoryBank: apps.filter((a) => a.hasMemoryBank).length,
      outdatedApps: outdated.length,
      currentFrameworkVersion: currentVersion,
    },
    freshness: {
      dataAsOf: latest === null ? null : new Date(latest).toISOString(),
      ageDays,
      stale,
      refreshHint: stale
        ? "Fleet data is missing or older than " +
          `${FLEET_STALE_AFTER_DAYS} days. Refresh it with sf_harvest_knowledge ` +
          "(appsRoot = the folder that contains your projects), then call sf_fleet_health again."
        : null,
      latestHarvestAt:
        latestRunMs === null || Number.isNaN(latestRunMs) ? null : new Date(latestRunMs).toISOString(),
    },
    platformDistribution,
    frameworkVersions,
    outdatedApps: outdated.map((a) => ({
      name: a.appName,
      path: a.appPath,
      version: a.frameworkVersion,
      lastHarvest: a.lastHarvestAt,
    })),
    unassessedApps: apps
      .filter((a) => !a.hasForgeSession)
      .map((a) => ({
        name: a.appName,
        platforms: a.platforms,
        hasMemoryBank: a.hasMemoryBank,
        instructionFiles: a.instructionFileCount,
      })),
    notRefreshedApps: notRefreshed.map((a) => ({
      name: a.appName,
      path: a.appPath,
      lastHarvest: a.lastHarvestAt,
    })),
    healthScores: getFleetHealthSummary().filter((s) => matches(s.appName)),
    apps,
    filter,
  };
}
