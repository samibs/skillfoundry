import { scanAllApps, scanMultipleRoots } from "./scanner.js";
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
  upsertFleetHealth,
} from "../state/db.js";

// ── Secret scan ──────────────────────────────────────────────────────────────

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "aws-access-key",    pattern: /AKIA[A-Z0-9]{16}/g },
  { name: "jwt-token",         pattern: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}/g },
  { name: "bearer-token",      pattern: /Bearer\s+[A-Za-z0-9._\-/+]{20,}/gi },
  { name: "api-key-assign",    pattern: /(api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{10,}['"]/gi },
  { name: "password-assign",   pattern: /(password|passwd|pwd)\s*[:=]\s*['"][^'"]{6,}['"]/gi },
  { name: "secret-assign",     pattern: /(secret|token|credential)\s*[:=]\s*['"][^'"]{8,}['"]/gi },
  { name: "private-key-header",pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/g },
];

const REDACT_PLACEHOLDER = "[REDACTED-BY-HARVESTER]";

/**
 * Scan text for credential patterns. Returns redacted text and a list of
 * pattern names that were found. Logs a warning for each match.
 */
export function redactSecrets(text: string, context: string): { redacted: string; found: string[] } {
  let result = text;
  const found: string[] = [];

  for (const { name, pattern } of SECRET_PATTERNS) {
    const before = result;
    result = result.replace(pattern, REDACT_PLACEHOLDER);
    if (result !== before) {
      found.push(name);
      console.warn(`[harvester] Secret pattern '${name}' found and redacted in ${context}`);
    }
  }

  return { redacted: result, found };
}

export interface HarvestResult {
  runId: number;
  aggregation: AggregationResult;
  newQuirksInserted: number;
  duplicatesSkipped: number;
  secretsRedacted: number;
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
  appsRoots: string | string[],
  dbPath?: string
): Promise<HarvestResult> {
  const start = Date.now();

  // Initialize DB
  await initDatabase(dbPath);
  const runId = startHarvestRun();

  try {
    // Step 1: Scan (supports single root or multiple roots)
    const roots = Array.isArray(appsRoots) ? appsRoots : [appsRoots];
    const scanResults = roots.length === 1
      ? await scanAllApps(roots[0])
      : await scanMultipleRoots(roots);

    // Step 2: Aggregate
    const aggregation = aggregateKnowledge(scanResults);

    // Step 3+4: Insert new quirks (deduplicating), with secret redaction
    let newQuirksInserted = 0;
    let duplicatesSkipped = 0;
    let secretsRedacted = 0;

    for (const rawCandidate of aggregation.quirkCandidates) {
      if (quirkExists(rawCandidate.framework, rawCandidate.quirk)) {
        duplicatesSkipped++;
        continue;
      }
      const { redacted, found } = redactSecrets(
        rawCandidate.quirk,
        `quirk:${rawCandidate.framework}`,
      );
      const candidate = found.length > 0
        ? { ...rawCandidate, quirk: redacted }
        : rawCandidate;
      if (found.length > 0) secretsRedacted += found.length;
      insertQuirk(candidate);
      newQuirksInserted++;
    }

    // Log session data + fleet health for each app (with secret redaction on error signatures)
    for (const app of scanResults) {
      const primaryPlatform = app.platforms[0] || "unknown";
      let errorSignature = app.sessionMonitor?.lastErrorSignature;
      if (errorSignature) {
        const { redacted, found } = redactSecrets(errorSignature, `session:${app.appName}`);
        if (found.length > 0) {
          secretsRedacted += found.length;
          errorSignature = redacted;
        }
      }
      insertSessionLog({
        appName: app.appName,
        platform: primaryPlatform,
        sessionDate: app.sessionMonitor?.startedAt,
        totalCommands: app.sessionMonitor?.totalCommands,
        totalFailures: app.sessionMonitor?.totalFailures,
        errorSignature,
        forgeLogCount: app.forgeLogs.length,
      });

      // Populate fleet health dashboard
      upsertFleetHealth({
        appName: app.appName,
        appPath: app.appPath,
        lastAssessedAt: null,
        lastHarvestAt: new Date().toISOString(),
        assessmentScore: null,
        testCount: 0,
        platforms: app.platforms,
        frameworkVersion: app.frameworkMeta?.version || null,
        hasForgeSession: app.forgeLogs.length > 0,
        hasMemoryBank: app.memoryBankStats !== null,
        instructionFileCount: app.instructionFiles.length,
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
      secretsRedacted,
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
