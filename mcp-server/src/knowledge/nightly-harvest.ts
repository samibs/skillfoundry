/**
 * Nightly Harvest Orchestrator — daily 4:00 AM pipeline.
 *
 * Pipeline stages:
 *   1. SCAN     — Discover all projects in ~/apps/* and ~/wapplications/*
 *   2. PARSE    — Parse session transcripts from all 5 AI platforms
 *   3. EXTRACT  — Extract actionable insights from sessions
 *   4. HARVEST  — Run existing knowledge harvest pipeline
 *   5. ASSESS   — Run security scan + contract check on all projects
 *   6. REPORT   — Generate nightly report with findings + improvement suggestions
 *   7. PERSIST  — Store everything in SQLite
 */

import { writeFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";

import { parseMultiRootSessions, type ParsedSession } from "./session-transcript-parser.js";
import { extractAllInsights, aggregateInsightPatterns } from "./insight-extractor.js";
import { runHarvest } from "./harvester.js";
import { generateProjectContext } from "../agents/project-context-agent.js";
import { runSecurityScanLite } from "../agents/security-scan-lite-agent.js";
import { checkContracts } from "../agents/contract-check-agent.js";
import {
  initDatabase,
  upsertSessionTranscript,
  insertPlatformInsight,
  startNightlyHarvestRun,
  completeNightlyHarvestRun,
  failNightlyHarvestRun,
  closeDatabase,
  upsertProjectHealthScore,
  getProjectHealthHistory,
  getFleetHealthSummary,
} from "../state/db.js";
import { guardSecrets } from "../agents/secret-guard-agent.js";
import { validateImports } from "../agents/import-validator-agent.js";
import { enforceDeviations, loadDeviationCatalog } from "../agents/deviation-enforcer-agent.js";
import { analyzeCorrections, type CorrectionEvent } from "./correction-analyzer.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NightlyHarvestResult {
  runId: number;
  startedAt: string;
  completedAt: string;
  duration: number;
  stages: {
    scan: { projectCount: number; roots: string[] };
    parse: { sessionCount: number; platforms: Record<string, number> };
    extract: { insightCount: number; byType: Record<string, number> };
    harvest: { quirksInserted: number; duplicatesSkipped: number };
    assess: {
      securityFindings: { critical: number; high: number; medium: number; low: number };
      contractStats: { totalFrontend: number; totalBackend: number; matched: number; mismatches: number };
    };
    secretGuard: { totalFindings: number; bySeverity: Record<string, number> };
    importValidator: { totalErrors: number; nativeModules: string[] };
    deviationEnforcer: { rulesChecked: number; totalViolations: number };
    correctionAnalyzer: { totalCorrections: number; newRulesGenerated: number };
    healthScores: { projectsScored: number; averageScore: number };
    report: { path: string };
  };
  improvementSuggestions: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(stage: string, msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${stage}] ${msg}`);
}

// ─── Discovery ──────────────────────────────────────────────────────────────

function getProjectRoots(): string[] {
  const homedir = os.homedir();
  return [
    path.join(homedir, "apps"),
    path.join(homedir, "wapplications"),
  ];
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

export async function runNightlyHarvest(
  dbPath?: string,
  roots?: string[]
): Promise<NightlyHarvestResult> {
  const startedAt = new Date().toISOString();
  const start = Date.now();

  // Initialize database
  await initDatabase(dbPath);
  const runId = startNightlyHarvestRun();

  const appsRoots = roots || getProjectRoots();

  try {
    // ─── Stage 1: SCAN ────────────────────────────────────────────
    log("SCAN", `Discovering projects in ${appsRoots.join(", ")}`);

    const { readdir } = await import("fs/promises");
    const projectPaths: string[] = [];
    for (const root of appsRoots) {
      try {
        const entries = await readdir(root, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "archive") continue;
          projectPaths.push(path.join(root, entry.name));
        }
      } catch { /* skip inaccessible roots */ }
    }
    log("SCAN", `Found ${projectPaths.length} projects`);

    // ─── Stage 2: PARSE ───────────────────────────────────────────
    log("PARSE", "Parsing session transcripts from all platforms...");

    const sessions = await parseMultiRootSessions(appsRoots);
    const platformCounts: Record<string, number> = {};
    for (const s of sessions) {
      platformCounts[s.platform] = (platformCounts[s.platform] || 0) + 1;
    }
    log("PARSE", `Parsed ${sessions.length} sessions: ${Object.entries(platformCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`);

    // Store session transcripts in DB
    for (const session of sessions) {
      upsertSessionTranscript({
        appName: session.appName,
        appPath: session.appPath,
        platform: session.platform,
        sessionId: session.sessionId,
        sessionDate: session.sessionDate,
        messageCount: session.messageCount,
        userMessageCount: session.userMessageCount,
        assistantMessageCount: session.assistantMessageCount,
        toolUseCount: session.toolUseCount,
        errorCount: session.errorCount,
        durationMinutes: session.durationMinutes,
        filePath: session.filePath,
        fileSizeBytes: session.fileSizeBytes,
      });
    }

    // ─── Stage 3: EXTRACT ─────────────────────────────────────────
    log("EXTRACT", "Extracting insights from sessions...");

    const insights = extractAllInsights(sessions);
    const insightsByType: Record<string, number> = {};
    for (const i of insights) {
      insightsByType[i.insightType] = (insightsByType[i.insightType] || 0) + 1;
    }
    log("EXTRACT", `Extracted ${insights.length} insights: ${Object.entries(insightsByType).map(([k, v]) => `${k}=${v}`).join(", ")}`);

    // Store insights in DB
    let insightsStored = 0;
    for (const insight of insights) {
      if (insertPlatformInsight(insight)) insightsStored++;
    }

    const aggregated = aggregateInsightPatterns(insights);

    // ─── Stage 4: HARVEST ─────────────────────────────────────────
    log("HARVEST", "Running knowledge harvest pipeline...");

    let harvestResult;
    try {
      harvestResult = await runHarvest(appsRoots, dbPath);
      log("HARVEST", `Inserted ${harvestResult.newQuirksInserted} quirks, skipped ${harvestResult.duplicatesSkipped} dupes`);
    } catch (err) {
      log("HARVEST", `Harvest error (non-fatal): ${err}`);
      harvestResult = { newQuirksInserted: 0, duplicatesSkipped: 0 };
    }

    // ─── Stage 5: ASSESS ──────────────────────────────────────────
    log("ASSESS", "Running security + contract checks...");

    let totalCritical = 0, totalHigh = 0, totalMedium = 0, totalLow = 0;
    let totalFrontend = 0, totalBackend = 0, totalMatched = 0, totalMismatches = 0;

    // Run assessments in batches to avoid memory issues
    const batchSize = 10;
    for (let i = 0; i < projectPaths.length; i += batchSize) {
      const batch = projectPaths.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (projectPath) => {
          const [security, contracts] = await Promise.all([
            runSecurityScanLite(projectPath).catch(() => null),
            checkContracts(projectPath).catch(() => null),
          ]);
          return { security, contracts };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          const { security, contracts } = result.value;
          if (security?.summary) {
            totalCritical += security.summary.critical;
            totalHigh += security.summary.high;
            totalMedium += security.summary.medium;
            totalLow += security.summary.low;
          }
          if (contracts?.summary) {
            totalFrontend += contracts.summary.totalFrontendCalls;
            totalBackend += contracts.summary.totalBackendRoutes;
            totalMatched += contracts.summary.matchedCount;
            totalMismatches += contracts.summary.mismatchCount;
          }
        }
      }
    }

    log("ASSESS", `Security: ${totalCritical}C/${totalHigh}H/${totalMedium}M/${totalLow}L | Contracts: ${totalFrontend}fe/${totalBackend}be/${totalMatched}m/${totalMismatches}x`);

    // ─── Stage 5b: SECRET GUARD ────────────────────────────────────
    log("SECRET-GUARD", "Running secret guard on all projects...");

    let totalSecretFindings = 0;
    const secretBySeverity: Record<string, number> = {};

    for (let i = 0; i < projectPaths.length; i += batchSize) {
      const batch = projectPaths.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(p => guardSecrets(p).catch(() => null))
      );
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          totalSecretFindings += result.value.summary.total;
          for (const f of result.value.findings) {
            secretBySeverity[f.severity] = (secretBySeverity[f.severity] || 0) + 1;
          }
        }
      }
    }
    log("SECRET-GUARD", `Found ${totalSecretFindings} secret findings`);

    // ─── Stage 5c: IMPORT VALIDATOR ────────────────────────────────
    log("IMPORT-VALIDATOR", "Validating imports across all projects...");

    let totalImportErrors = 0;
    const allNativeModules: string[] = [];

    for (let i = 0; i < projectPaths.length; i += batchSize) {
      const batch = projectPaths.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(p => validateImports(p).catch(() => null))
      );
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          totalImportErrors += result.value.summary.total;
          for (const nm of result.value.nativeModules) {
            if (!allNativeModules.includes(nm)) allNativeModules.push(nm);
          }
        }
      }
    }
    log("IMPORT-VALIDATOR", `Found ${totalImportErrors} import errors, ${allNativeModules.length} native modules`);

    // ─── Stage 5d: DEVIATION ENFORCER ──────────────────────────────
    log("DEVIATION", "Loading deviation catalog and scanning projects...");

    let deviationRulesLoaded = 0;
    let totalDeviationViolations = 0;

    try {
      deviationRulesLoaded = await loadDeviationCatalog(dbPath);
    } catch (err) {
      log("DEVIATION", `Catalog load error (non-fatal): ${err}`);
    }

    if (deviationRulesLoaded > 0) {
      for (let i = 0; i < projectPaths.length; i += batchSize) {
        const batch = projectPaths.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(p => enforceDeviations(p, dbPath, { maxViolations: 50 }).catch(() => null))
        );
        for (const result of results) {
          if (result.status === "fulfilled" && result.value) {
            totalDeviationViolations += result.value.totalViolations;
          }
        }
      }
    }
    log("DEVIATION", `Checked ${deviationRulesLoaded} rules, found ${totalDeviationViolations} violations`);

    // ─── Stage 5e: CORRECTION FEEDBACK LOOP ────────────────────────
    log("CORRECTIONS", "Analyzing user corrections from sessions...");

    const correctionEvents: CorrectionEvent[] = insights
      .filter(i => i.insightType === "correction")
      .map(i => ({
        appName: i.appName,
        appPath: i.appPath,
        platform: i.platform,
        sessionId: i.sessionId,
        content: i.content,
        context: i.context ?? "",
      }));

    let correctionResult = { totalCorrections: 0, uniquePatterns: 0, newRulesGenerated: 0, patterns: [] as any[] };
    if (correctionEvents.length > 0) {
      try {
        correctionResult = await analyzeCorrections(correctionEvents, dbPath);
      } catch (err) {
        log("CORRECTIONS", `Analysis error (non-fatal): ${err}`);
      }
    }
    log("CORRECTIONS", `${correctionResult.totalCorrections} corrections → ${correctionResult.uniquePatterns} patterns → ${correctionResult.newRulesGenerated} new rules`);

    // ─── Stage 5f: PROJECT HEALTH SCORES ───────────────────────────
    log("HEALTH", "Computing per-project health scores...");

    let projectsScored = 0;
    let totalScore = 0;

    for (const projectPath of projectPaths) {
      const appName = path.basename(projectPath);
      try {
        const [security, contracts, secrets, imports] = await Promise.all([
          runSecurityScanLite(projectPath).catch(() => null),
          checkContracts(projectPath).catch(() => null),
          guardSecrets(projectPath).catch(() => null),
          validateImports(projectPath).catch(() => null),
        ]);

        const secCritical = security?.summary?.critical ?? 0;
        const secHigh = security?.summary?.high ?? 0;
        const secMedium = security?.summary?.medium ?? 0;
        const secLow = security?.summary?.low ?? 0;
        const contractFe = contracts?.summary?.totalFrontendCalls ?? 0;
        const contractBe = contracts?.summary?.totalBackendRoutes ?? 0;
        const contractMatched = contracts?.summary?.matchedCount ?? 0;
        const contractMismatches = contracts?.summary?.mismatchCount ?? 0;
        const importErrs = imports?.summary?.total ?? 0;

        // Calculate health score (0-100)
        let score = 100;
        score -= secCritical * 15;
        score -= secHigh * 8;
        score -= secMedium * 3;
        score -= secLow * 1;
        score -= contractMismatches * 2;
        score -= importErrs * 5;
        score -= (secrets?.summary?.total ?? 0) * 10;
        score = Math.max(0, Math.min(100, score));

        const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";

        upsertProjectHealthScore({
          appName,
          appPath: projectPath,
          runId,
          scanDate: new Date().toISOString(),
          securityCritical: secCritical,
          securityHigh: secHigh,
          securityMedium: secMedium,
          securityLow: secLow,
          contractFrontendCalls: contractFe,
          contractBackendRoutes: contractBe,
          contractMatched,
          contractMismatches,
          deviationViolations: 0,
          importErrors: importErrs,
          healthGrade: grade,
          healthScore: score,
        });

        projectsScored++;
        totalScore += score;
      } catch {
        // skip projects that fail scoring
      }
    }

    const averageScore = projectsScored > 0 ? totalScore / projectsScored : 0;
    log("HEALTH", `Scored ${projectsScored} projects, average: ${averageScore.toFixed(1)}/100`);

    // ─── Stage 6: REPORT ──────────────────────────────────────────
    log("REPORT", "Generating nightly report...");

    const reportsDir = path.join(import.meta.dirname, "..", "..", "data", "nightly-reports");
    await mkdir(reportsDir, { recursive: true });

    const reportDate = new Date().toISOString().split("T")[0];
    const reportPath = path.join(reportsDir, `${reportDate}.md`);
    const duration = Date.now() - start;

    // Get trend data for report
    const fleetSummary = getFleetHealthSummary();

    const report = generateReport({
      runId,
      date: reportDate,
      duration,
      projectCount: projectPaths.length,
      sessions,
      platformCounts,
      insights,
      insightsByType,
      aggregated,
      harvestResult,
      security: { critical: totalCritical, high: totalHigh, medium: totalMedium, low: totalLow },
      contracts: { totalFrontend, totalBackend, totalMatched, totalMismatches },
      secretGuard: { totalFindings: totalSecretFindings, bySeverity: secretBySeverity },
      importValidator: { totalErrors: totalImportErrors, nativeModules: allNativeModules },
      deviationEnforcer: { rulesChecked: deviationRulesLoaded, totalViolations: totalDeviationViolations },
      corrections: correctionResult,
      healthScores: { projectsScored, averageScore },
      fleetSummary,
    });

    await writeFile(reportPath, report, "utf-8");
    log("REPORT", `Saved to ${reportPath}`);

    // ─── Stage 7: PERSIST ─────────────────────────────────────────
    const completedAt = new Date().toISOString();

    completeNightlyHarvestRun(runId, {
      appsScanned: projectPaths.length,
      sessionsParsed: sessions.length,
      insightsExtracted: insightsStored,
      newQuirks: harvestResult.newQuirksInserted,
      securityFindings: totalCritical + totalHigh,
      contractMismatches: totalMismatches,
      reportPath,
    });

    log("DONE", `Completed in ${(duration / 1000).toFixed(1)}s`);

    return {
      runId,
      startedAt,
      completedAt,
      duration,
      stages: {
        scan: { projectCount: projectPaths.length, roots: appsRoots },
        parse: { sessionCount: sessions.length, platforms: platformCounts },
        extract: { insightCount: insightsStored, byType: insightsByType },
        harvest: { quirksInserted: harvestResult.newQuirksInserted, duplicatesSkipped: harvestResult.duplicatesSkipped },
        assess: {
          securityFindings: { critical: totalCritical, high: totalHigh, medium: totalMedium, low: totalLow },
          contractStats: { totalFrontend, totalBackend, matched: totalMatched, mismatches: totalMismatches },
        },
        secretGuard: { totalFindings: totalSecretFindings, bySeverity: secretBySeverity },
        importValidator: { totalErrors: totalImportErrors, nativeModules: allNativeModules },
        deviationEnforcer: { rulesChecked: deviationRulesLoaded, totalViolations: totalDeviationViolations },
        correctionAnalyzer: { totalCorrections: correctionResult.totalCorrections, newRulesGenerated: correctionResult.newRulesGenerated },
        healthScores: { projectsScored, averageScore },
        report: { path: reportPath },
      },
      improvementSuggestions: aggregated.improvementSuggestions,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    failNightlyHarvestRun(runId, errorMsg);
    log("FAIL", `Nightly harvest failed: ${errorMsg}`);
    throw err;
  }
}

// ─── Report Generator ───────────────────────────────────────────────────────

function generateReport(data: {
  runId: number;
  date: string;
  duration: number;
  projectCount: number;
  sessions: ParsedSession[];
  platformCounts: Record<string, number>;
  insights: Array<{ insightType: string; severity: string; content: string; appName: string }>;
  insightsByType: Record<string, number>;
  aggregated: ReturnType<typeof aggregateInsightPatterns>;
  harvestResult: { newQuirksInserted: number; duplicatesSkipped: number };
  security: { critical: number; high: number; medium: number; low: number };
  contracts: { totalFrontend: number; totalBackend: number; totalMatched: number; totalMismatches: number };
  secretGuard: { totalFindings: number; bySeverity: Record<string, number> };
  importValidator: { totalErrors: number; nativeModules: string[] };
  deviationEnforcer: { rulesChecked: number; totalViolations: number };
  corrections: { totalCorrections: number; uniquePatterns: number; newRulesGenerated: number };
  healthScores: { projectsScored: number; averageScore: number };
  fleetSummary: Array<{ appName: string; healthGrade: string | null; healthScore: number | null }>;
}): string {
  const lines: string[] = [];
  const ln = (s: string) => lines.push(s);

  ln(`# Nightly Harvest Report — ${data.date}`);
  ln("");
  ln(`> Run #${data.runId} | Duration: ${(data.duration / 1000).toFixed(1)}s | Projects: ${data.projectCount}`);
  ln("");

  ln("## Pipeline Summary");
  ln("");
  ln("| Stage | Result |");
  ln("|-------|--------|");
  ln(`| Scan | ${data.projectCount} projects |`);
  ln(`| Parse | ${data.sessions.length} sessions (${Object.entries(data.platformCounts).map(([k, v]) => `${k}: ${v}`).join(", ")}) |`);
  ln(`| Extract | ${Object.values(data.insightsByType).reduce((a, b) => a + b, 0)} insights |`);
  ln(`| Harvest | ${data.harvestResult.newQuirksInserted} new quirks, ${data.harvestResult.duplicatesSkipped} duplicates |`);
  ln(`| Security | ${data.security.critical}C / ${data.security.high}H / ${data.security.medium}M / ${data.security.low}L |`);
  ln(`| Contracts | ${data.contracts.totalFrontend}fe / ${data.contracts.totalBackend}be / ${data.contracts.totalMatched}m / ${data.contracts.totalMismatches}x |`);
  ln(`| Secret Guard | ${data.secretGuard.totalFindings} findings (${Object.entries(data.secretGuard.bySeverity).map(([k, v]) => `${k}: ${v}`).join(", ") || "clean"}) |`);
  ln(`| Import Validator | ${data.importValidator.totalErrors} errors, ${data.importValidator.nativeModules.length} native modules |`);
  ln(`| Deviation Enforcer | ${data.deviationEnforcer.rulesChecked} rules checked, ${data.deviationEnforcer.totalViolations} violations |`);
  ln(`| Corrections | ${data.corrections.totalCorrections} corrections → ${data.corrections.uniquePatterns} patterns → ${data.corrections.newRulesGenerated} new rules |`);
  ln(`| Health Scores | ${data.healthScores.projectsScored} projects, avg ${data.healthScores.averageScore.toFixed(1)}/100 |`);
  ln("");

  ln("## Session Transcripts by Platform");
  ln("");
  for (const [platform, count] of Object.entries(data.platformCounts).sort((a, b) => b[1] - a[1])) {
    const platSessions = data.sessions.filter(s => s.platform === platform);
    const totalMsgs = platSessions.reduce((s, p) => s + p.messageCount, 0);
    const totalErrors = platSessions.reduce((s, p) => s + p.errorCount, 0);
    ln(`### ${platform} (${count} sessions, ${totalMsgs} messages, ${totalErrors} errors)`);
    ln("");
    for (const session of platSessions.slice(0, 10)) {
      ln(`- **${session.appName}** [${session.sessionId.slice(0, 8)}]: ${session.messageCount} msgs, ${session.toolUseCount} tools, ${session.errorCount} errors${session.durationMinutes ? `, ${session.durationMinutes}min` : ""}`);
    }
    if (platSessions.length > 10) ln(`- ... and ${platSessions.length - 10} more`);
    ln("");
  }

  ln("## Extracted Insights");
  ln("");
  ln("| Type | Count |");
  ln("|------|-------|");
  for (const [type, count] of Object.entries(data.insightsByType).sort((a, b) => b[1] - a[1])) {
    ln(`| ${type} | ${count} |`);
  }
  ln("");

  if (data.aggregated.topErrors.length > 0) {
    ln("### Top Errors (cross-project)");
    ln("");
    for (const e of data.aggregated.topErrors.slice(0, 5)) {
      ln(`- **${e.count} projects**: ${e.content.slice(0, 120)} (${e.projects.join(", ")})`);
    }
    ln("");
  }

  if (data.aggregated.securityFindings.length > 0) {
    ln("### Security Findings from Sessions");
    ln("");
    for (const f of data.aggregated.securityFindings.slice(0, 5)) {
      ln(`- [${f.severity.toUpperCase()}] ${f.content.slice(0, 120)} (${f.projects.join(", ")})`);
    }
    ln("");
  }

  if (data.aggregated.corrections.length > 0) {
    ln("### User Corrections (AI behavior feedback)");
    ln("");
    for (const c of data.aggregated.corrections.slice(0, 5)) {
      ln(`- **${c.count} projects**: ${c.content.slice(0, 150)}`);
    }
    ln("");
  }

  // Fleet Health Scores
  if (data.fleetSummary.length > 0) {
    ln("## Fleet Health Scores");
    ln("");
    ln("| Project | Grade | Score |");
    ln("|---------|-------|-------|");
    const sorted = [...data.fleetSummary].sort((a, b) => (b.healthScore ?? 0) - (a.healthScore ?? 0));
    for (const p of sorted) {
      ln(`| ${p.appName} | ${p.healthGrade ?? "?"} | ${p.healthScore?.toFixed(0) ?? "?"}/100 |`);
    }
    ln("");

    const gradeCount: Record<string, number> = {};
    for (const p of sorted) {
      const g = p.healthGrade ?? "?";
      gradeCount[g] = (gradeCount[g] || 0) + 1;
    }
    ln(`**Distribution**: ${Object.entries(gradeCount).map(([g, c]) => `${g}: ${c}`).join(" | ")}`);
    ln("");
  }

  if (data.aggregated.improvementSuggestions.length > 0) {
    ln("## MCP Server Improvement Suggestions");
    ln("");
    for (const s of data.aggregated.improvementSuggestions) {
      ln(`- ${s}`);
    }
    ln("");
  }

  ln("---");
  ln(`_Generated by SkillFoundry MCP v5.0.0 — Nightly Harvest Pipeline (with Secret Guard, Import Validator, Deviation Enforcer, Correction Analyzer, Health Scores)_`);

  return lines.join("\n");
}
