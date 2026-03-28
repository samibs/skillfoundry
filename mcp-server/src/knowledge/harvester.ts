import { scanAllApps } from "./scanner.js";
import { aggregateKnowledge, type AggregationResult } from "./aggregator.js";
import {
  initDatabase,
  insertQuirk,
  quirkExists,
  startHarvestRun,
  completeHarvestRun,
  insertSessionLog,
  queryQuirks,
  closeDatabase,
} from "../state/db.js";

export interface HarvestResult {
  runId: number;
  aggregation: AggregationResult;
  newQuirksInserted: number;
  duplicatesSkipped: number;
  duration: number;
}

/**
 * Full harvest pipeline:
 * 1. Scan all apps for session data
 * 2. Aggregate into failure patterns + quirk candidates
 * 3. Deduplicate against existing knowledge
 * 4. Insert new quirks into SQLite
 * 5. Return harvest report
 */
export async function runHarvest(
  appsRoot: string,
  dbPath?: string
): Promise<HarvestResult> {
  const start = Date.now();

  // Initialize DB
  await initDatabase(dbPath);
  const runId = startHarvestRun();

  try {
    // Step 1: Scan
    const scanResults = await scanAllApps(appsRoot);

    // Step 2: Aggregate
    const aggregation = aggregateKnowledge(scanResults);

    // Step 3+4: Insert new quirks (deduplicating)
    let newQuirksInserted = 0;
    let duplicatesSkipped = 0;

    for (const candidate of aggregation.quirkCandidates) {
      if (quirkExists(candidate.framework, candidate.quirk)) {
        duplicatesSkipped++;
        continue;
      }
      insertQuirk(candidate);
      newQuirksInserted++;
    }

    // Log session data for each app
    for (const app of scanResults) {
      const primaryPlatform = app.platforms[0] || "unknown";
      insertSessionLog({
        appName: app.appName,
        platform: primaryPlatform,
        sessionDate: app.sessionMonitor?.startedAt,
        totalCommands: app.sessionMonitor?.totalCommands,
        totalFailures: app.sessionMonitor?.totalFailures,
        errorSignature: app.sessionMonitor?.lastErrorSignature,
        forgeLogCount: app.forgeLogs.length,
      });
    }

    // Complete the run
    completeHarvestRun(runId, {
      appsScanned: aggregation.appsScanned,
      appsWithData: aggregation.appsWithData,
      totalLogs: aggregation.totalForgeLogs,
      newQuirks: newQuirksInserted,
    });

    return {
      runId,
      aggregation,
      newQuirksInserted,
      duplicatesSkipped,
      duration: Date.now() - start,
    };
  } catch (err) {
    throw err;
  }
}

/**
 * Query quirks from the knowledge store.
 */
export async function getQuirks(
  framework?: string,
  dbPath?: string
) {
  await initDatabase(dbPath);
  return queryQuirks({ framework });
}
