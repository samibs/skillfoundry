import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initDatabase, closeDatabase } from "../src/state/db.js";
import { ensureMetricsTable, recordInvocation, getAgentMetrics, getMetricsSummary } from "../src/state/metrics.js";
import { mkdtemp } from "fs/promises";
import path from "path";
import { tmpdir } from "os";

describe("Metrics Collector", () => {
  beforeAll(async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), "sf-metrics-test-"));
    await initDatabase(path.join(tmpDir, "test.db"));
    ensureMetricsTable();
  });

  afterAll(() => {
    closeDatabase();
  });

  it("records an invocation", () => {
    recordInvocation({
      agentName: "forge",
      toolName: "sf_forge",
      projectPath: "/tmp/test-project",
      status: "success",
      duration: 5000,
      inputTokens: 10000,
      outputTokens: 5000,
      modelTier: "opus",
    });

    recordInvocation({
      agentName: "forge",
      toolName: "sf_forge",
      projectPath: "/tmp/test-project",
      status: "error",
      duration: 2000,
      error: "Build failed",
      modelTier: "opus",
    });

    recordInvocation({
      agentName: "coder",
      toolName: "sf_coder",
      projectPath: "/tmp/test-project",
      status: "success",
      duration: 3000,
      inputTokens: 5000,
      outputTokens: 8000,
      modelTier: "sonnet",
    });
  });

  it("gets metrics per agent", () => {
    const metrics = getAgentMetrics("forge");
    expect(metrics.length).toBe(1);
    expect(metrics[0].totalInvocations).toBe(2);
    expect(metrics[0].successCount).toBe(1);
    expect(metrics[0].errorCount).toBe(1);
    expect(metrics[0].successRate).toBe(0.5);
  });

  it("gets metrics summary", () => {
    const summary = getMetricsSummary();
    expect(summary.totalInvocations).toBe(3);
    expect(summary.totalSuccess).toBe(2);
    expect(summary.totalErrors).toBe(1);
    expect(summary.topAgents.length).toBe(2);
    expect(summary.topAgents[0].agentName).toBe("forge"); // most invocations
  });

  it("filters by model tier", () => {
    const summary = getMetricsSummary();
    expect(summary.byModelTier.opus).toBeDefined();
    expect(summary.byModelTier.opus.invocations).toBe(2);
    expect(summary.byModelTier.sonnet).toBeDefined();
    expect(summary.byModelTier.sonnet.invocations).toBe(1);
  });
});
