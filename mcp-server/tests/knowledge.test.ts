import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { initDatabase, closeDatabase, insertQuirk, queryQuirks, quirkExists, promoteQuirk } from "../src/state/db.js";
import { scanApp } from "../src/knowledge/scanner.js";
import { aggregateKnowledge } from "../src/knowledge/aggregator.js";
import type { AppScanResult } from "../src/knowledge/scanner.js";
import type { KnowledgeEntry } from "../src/knowledge/memory-gate.js";
import path from "path";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";

// ─── SQLite Store Tests ─────────────────────────────────────────────────────

describe("SQLite Knowledge Store", () => {
  let dbPath: string;

  beforeAll(async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), "sf-test-"));
    dbPath = path.join(tmpDir, "test.db");
    await initDatabase(dbPath);
  });

  afterAll(() => {
    closeDatabase();
  });

  const testEntry: KnowledgeEntry = {
    framework: "nextauth",
    versionRange: "5.x-beta",
    quirk: "signIn() with redirect: false drops session cookie",
    fix: "Use redirect: false + manual window.location.href + SessionProvider",
    confidence: "verified",
    evidenceSource: "playwright",
    evidenceSummary: "Playwright test confirmed login works",
    discoveredAt: "2026-03-28T00:00:00Z",
    discoveredIn: "luxcompliancesuite",
  };

  it("inserts a quirk and returns ID", () => {
    const id = insertQuirk(testEntry);
    expect(id).toBeGreaterThan(0);
  });

  it("queries quirks by framework", () => {
    const results = queryQuirks({ framework: "nextauth" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].framework).toBe("nextauth");
    expect(results[0].quirk).toContain("signIn()");
  });

  it("detects duplicate quirks", () => {
    expect(quirkExists("nextauth", testEntry.quirk)).toBe(true);
    expect(quirkExists("nonexistent", "nope")).toBe(false);
  });

  it("promotes observed to verified", () => {
    const observedEntry: KnowledgeEntry = {
      ...testEntry,
      confidence: "observed",
      quirk: "Some observed pattern for promotion test",
    };
    const id = insertQuirk(observedEntry);
    const promoted = promoteQuirk(id, "playwright", "Now verified");
    expect(promoted).toBe(true);

    const results = queryQuirks({ framework: "nextauth" });
    const promoted_entry = results.find((r) => r.quirk.includes("promotion test"));
    expect(promoted_entry?.confidence).toBe("verified");
  });

  it("queries all quirks without filter", () => {
    const results = queryQuirks();
    expect(results.length).toBeGreaterThan(0);
  });
});

// ─── Scanner Tests ──────────────────────────────────────────────────────────

describe("Session Log Scanner", () => {
  let testAppDir: string;

  beforeAll(async () => {
    // Create a mock app directory with forge logs
    testAppDir = await mkdtemp(path.join(tmpdir(), "sf-test-app-"));

    // Create .claude dir
    await mkdir(path.join(testAppDir, ".claude"), { recursive: true });

    // Create .skillfoundry/logs with forge logs
    const logsDir = path.join(testAppDir, ".skillfoundry", "logs");
    await mkdir(logsDir, { recursive: true });

    await writeFile(
      path.join(logsDir, "forge-001.log"),
      JSON.stringify({
        ts: "2026-03-27T10:00:00Z",
        level: "ERROR",
        category: "pipeline",
        event: "no_tests_after_remediation",
        data: { story: "STORY-001.md" },
      })
    );

    await writeFile(
      path.join(logsDir, "forge-002.log"),
      JSON.stringify({
        ts: "2026-03-27T10:05:00Z",
        level: "ERROR",
        category: "pipeline",
        event: "story_failed",
        data: { story: "STORY-002.md", cost: 0.02, fixerAttempts: 3 },
      })
    );
  });

  afterAll(async () => {
    await rm(testAppDir, { recursive: true, force: true });
  });

  it("detects Claude Code platform", async () => {
    const result = await scanApp(testAppDir);
    expect(result.platforms).toContain("claude_code");
  });

  it("parses forge logs", async () => {
    const result = await scanApp(testAppDir);
    expect(result.forgeLogs.length).toBe(2);
    expect(result.forgeLogs[0].event).toBe("no_tests_after_remediation");
    expect(result.forgeLogs[1].event).toBe("story_failed");
  });
});

// ─── Aggregator Tests ───────────────────────────────────────────────────────

describe("Knowledge Aggregator", () => {
  it("extracts failure patterns from scan results", () => {
    const mockResults: AppScanResult[] = [
      {
        appName: "app-a",
        appPath: "/apps/app-a",
        platforms: ["claude_code"],
        forgeLogs: [
          { timestamp: "2026-03-27T10:00:00Z", level: "ERROR", category: "pipeline", event: "no_tests_after_remediation", data: {}, sourceFile: "" },
          { timestamp: "2026-03-27T10:05:00Z", level: "ERROR", category: "pipeline", event: "no_tests_after_remediation", data: {}, sourceFile: "" },
          { timestamp: "2026-03-27T10:10:00Z", level: "ERROR", category: "pipeline", event: "story_failed", data: { fixerAttempts: 2 }, sourceFile: "" },
        ],
        sessionMonitor: null,
        memoryFiles: [],
        gitCommitCount: 10,
      },
      {
        appName: "app-b",
        appPath: "/apps/app-b",
        platforms: ["claude_code", "cursor"],
        forgeLogs: [
          { timestamp: "2026-03-28T10:00:00Z", level: "ERROR", category: "pipeline", event: "no_tests_after_remediation", data: {}, sourceFile: "" },
        ],
        sessionMonitor: null,
        memoryFiles: [],
        gitCommitCount: 5,
      },
    ];

    const result = aggregateKnowledge(mockResults);

    expect(result.appsScanned).toBe(2);
    expect(result.appsWithData).toBe(2);
    expect(result.totalForgeLogs).toBe(4);

    // no_tests_after_remediation appears in 2 apps → should be a pattern
    const testPattern = result.failurePatterns.find(
      (p) => p.event === "no_tests_after_remediation"
    );
    expect(testPattern).toBeDefined();
    expect(testPattern!.occurrences).toBe(3);
    expect(testPattern!.apps).toContain("app-a");
    expect(testPattern!.apps).toContain("app-b");

    // Should generate quirk candidates for cross-app patterns
    expect(result.quirkCandidates.length).toBeGreaterThan(0);
    expect(result.quirkCandidates[0].confidence).toBe("observed");

    // Stats
    expect(result.stats.totalErrors).toBe(4);
    expect(result.stats.appsWithFailures).toBe(2);
    expect(result.stats.platformDistribution.claude_code).toBe(2);
  });

  it("does not promote single-occurrence patterns", () => {
    const mockResults: AppScanResult[] = [
      {
        appName: "app-c",
        appPath: "/apps/app-c",
        platforms: ["claude_code"],
        forgeLogs: [
          { timestamp: "2026-03-27T10:00:00Z", level: "ERROR", category: "pipeline", event: "story_failed", data: {}, sourceFile: "" },
        ],
        sessionMonitor: null,
        memoryFiles: [],
        gitCommitCount: 1,
      },
    ];

    const result = aggregateKnowledge(mockResults);
    // story_failed once in one app → should NOT be a quirk candidate
    expect(result.quirkCandidates.length).toBe(0);
  });
});
