import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import {
  initDatabase,
  closeDatabase,
  upsertFleetHealth,
  upsertProjectHealthScore,
  getFleetHealthSummary,
  getDatabase,
  startHarvestRun,
  completeHarvestRun,
  type FleetHealthRecord,
} from "../src/state/db.js";
import { buildFleetHealthReport, compareVersions } from "../src/knowledge/fleet-health.js";

const app = (overrides: Partial<FleetHealthRecord>): FleetHealthRecord => ({
  appName: "app",
  appPath: "/apps/app",
  lastAssessedAt: null,
  lastHarvestAt: new Date().toISOString(),
  assessmentScore: null,
  testCount: 0,
  platforms: ["claude"],
  frameworkVersion: "5.32.0",
  hasForgeSession: true,
  hasMemoryBank: true,
  instructionFileCount: 1,
  ...overrides,
});

describe("compareVersions", () => {
  it("compares dotted versions numerically", () => {
    expect(compareVersions("5.9.0", "5.32.0")).toBeLessThan(0);
    expect(compareVersions("5.32.0", "5.32.0")).toBe(0);
    expect(compareVersions("6.0", "5.32.1")).toBeGreaterThan(0);
  });
});

describe("buildFleetHealthReport", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "sf-fleet-"));
    await initDatabase(path.join(tmpDir, "test.db"));
    upsertFleetHealth(app({ appName: "vatwise", appPath: "/apps/vatwise", frameworkVersion: "5.32.0", platforms: ["claude", "cursor"] }));
    upsertFleetHealth(app({ appName: "amudfin", appPath: "/apps/amudfin", frameworkVersion: "2.0.73", hasForgeSession: false, hasMemoryBank: false }));
    upsertFleetHealth(app({ appName: "legacy", appPath: "/apps/legacy", frameworkVersion: null }));
    upsertProjectHealthScore({
      appName: "vatwise", appPath: "/apps/vatwise", runId: 1, scanDate: "2026-10-01T00:00:00Z",
      securityCritical: 0, securityHigh: 0, securityMedium: 1, securityLow: 2,
      contractFrontendCalls: 0, contractBackendRoutes: 0, contractMatched: 0, contractMismatches: 0,
      deviationViolations: 0, importErrors: 0, healthGrade: "B", healthScore: 82,
    });
  });

  afterAll(async () => {
    closeDatabase();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("summarizes the fleet against the current framework version", () => {
    const report = buildFleetHealthReport({ currentVersion: "5.32.0" });
    expect(report.summary).toMatchObject({
      totalApps: 3,
      assessedApps: 2,
      unassessedApps: 1,
      assessmentCoverage: 67,
      appsWithMemoryBank: 2,
      outdatedApps: 2,
      currentFrameworkVersion: "5.32.0",
    });
    expect(report.outdatedApps.map((a) => a.name).sort()).toEqual(["amudfin", "legacy"]);
    expect(report.unassessedApps.map((a) => a.name)).toEqual(["amudfin"]);
    expect(report.platformDistribution).toEqual({ claude: 3, cursor: 1 });
  });

  it("returns latest health grades with camelCase fields", () => {
    // Regression: the query returned app_name/health_grade, so these were undefined.
    expect(getFleetHealthSummary()[0]).toMatchObject({ appName: "vatwise", healthGrade: "B", healthScore: 82 });
    expect(buildFleetHealthReport({ currentVersion: "5.32.0" }).healthScores).toHaveLength(1);
  });

  it("filters by app name or path, case-insensitively", () => {
    const report = buildFleetHealthReport({ app: "VATWISE", currentVersion: "5.32.0" });
    expect(report.apps.map((a) => a.appName)).toEqual(["vatwise"]);
    expect(report.summary.outdatedApps).toBe(0);
    expect(report.healthScores.map((s) => s.appName)).toEqual(["vatwise"]);
    expect(buildFleetHealthReport({ app: "/apps/amud" }).apps.map((a) => a.appName)).toEqual(["amudfin"]);
  });

  it("reports fresh data as not stale", () => {
    const report = buildFleetHealthReport({ currentVersion: "5.32.0" });
    expect(report.freshness.ageDays).toBe(0);
    expect(report.freshness.stale).toBe(false);
    expect(report.freshness.refreshHint).toBeNull();
  });

  it("flags old data as stale and says how to refresh it", () => {
    const later = new Date(Date.now() + 30 * 86_400_000);
    const report = buildFleetHealthReport({ currentVersion: "5.32.0", now: later });
    expect(report.freshness.ageDays).toBeGreaterThanOrEqual(29);
    expect(report.freshness.stale).toBe(true);
    expect(report.freshness.refreshHint).toContain("sf_harvest_knowledge");
  });

  it("treats an empty filter result as stale with no data", () => {
    const report = buildFleetHealthReport({ app: "no-such-app", currentVersion: "5.32.0" });
    expect(report.summary.totalApps).toBe(0);
    expect(report.freshness).toMatchObject({ dataAsOf: null, ageDays: null, stale: true });
  });

  // Must run last: it records a harvest run and ages one row, which changes the
  // refreshed/not-refreshed split the earlier cases rely on.
  it("separates apps the latest harvest did not see from the current counts", () => {
    getDatabase()
      .prepare("UPDATE fleet_health SET last_harvest_at = '2026-01-01 00:00:00' WHERE app_name = 'legacy'")
      .run();
    completeHarvestRun(startHarvestRun(), { appsScanned: 2, appsWithData: 2, totalLogs: 0, newQuirks: 0 });
    // The run starts after the other rows were written in the same second at most;
    // pin their harvest time to the run start so the comparison is deterministic.
    const runStart = (getDatabase()
      .prepare("SELECT started_at FROM harvest_runs ORDER BY id DESC LIMIT 1")
      .get() as { started_at: string }).started_at;
    getDatabase()
      .prepare("UPDATE fleet_health SET last_harvest_at = ? WHERE app_name != 'legacy'")
      .run(runStart);

    const report = buildFleetHealthReport({ currentVersion: "5.32.0" });
    expect(report.apps.map((a) => a.appName).sort()).toEqual(["amudfin", "vatwise"]);
    expect(report.summary.totalApps).toBe(2);
    expect(report.summary.outdatedApps).toBe(1);
    expect(report.notRefreshedApps).toEqual([
      { name: "legacy", path: "/apps/legacy", lastHarvest: "2026-01-01 00:00:00" },
    ]);
    expect(report.freshness.latestHarvestAt).not.toBeNull();
    expect(report.freshness.stale).toBe(false);
  });
});
