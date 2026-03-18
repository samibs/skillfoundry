/**
 * Dashboard sync orchestrator — reads per-project telemetry, perf, knowledge,
 * and session-monitor data, then aggregates into the central SQLite database.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../utils/logger.js';
import { ensureProjectId, updateRegistryMeta } from './project-id.js';
import { initDatabase, upsertProject, insertTelemetryEvents, insertPerfEntries, insertKnowledgeEntries, insertFailurePatterns, getProjectSyncState, updateSyncTimestamp, } from './dashboard-db.js';
import { readAllEvents } from './telemetry.js';
import { readPerfLog } from './perf-tracker.js';
import { scanProjectSessions, importInbox } from './session-import.js';
// ── Registry reading ──────────────────────────────────────────────
function readProjectRegistry(frameworkDir) {
    const registryFile = join(frameworkDir, '.project-registry');
    if (!existsSync(registryFile))
        return [];
    const content = readFileSync(registryFile, 'utf-8');
    return content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && existsSync(l));
}
function readRegistryMeta(frameworkDir) {
    const metaFile = join(frameworkDir, '.project-registry-meta.jsonl');
    const metaMap = new Map();
    if (!existsSync(metaFile))
        return metaMap;
    const content = readFileSync(metaFile, 'utf-8').trim();
    if (!content)
        return metaMap;
    for (const line of content.split('\n')) {
        if (!line.trim())
            continue;
        try {
            const meta = JSON.parse(line);
            if (typeof meta.path === 'string') {
                metaMap.set(meta.path, meta);
            }
        }
        catch {
            // Skip malformed
        }
    }
    return metaMap;
}
// ── Per-project data readers ──────────────────────────────────────
function readProjectTelemetry(projectPath, sinceDatetime) {
    const events = readAllEvents(projectPath);
    const records = [];
    for (const evt of events) {
        // Skip events older than last sync
        if (sinceDatetime && evt.timestamp <= sinceDatetime)
            continue;
        records.push({
            id: evt.id,
            project_id: '', // filled by caller
            event_type: evt.event_type,
            timestamp: evt.timestamp,
            status: evt.status,
            duration_ms: evt.duration_ms,
            details: JSON.stringify(evt.details),
        });
    }
    return records;
}
function readProjectPerf(projectPath, sinceDatetime) {
    const entries = readPerfLog(projectPath);
    const records = [];
    for (const entry of entries) {
        if (sinceDatetime && entry.timestamp <= sinceDatetime)
            continue;
        records.push({
            project_id: '', // filled by caller
            gate: entry.gate,
            duration_ms: entry.duration_ms,
            timestamp: entry.timestamp,
            run_id: entry.run_id,
        });
    }
    return records;
}
function readProjectKnowledge(projectPath) {
    const knowledgeDir = join(projectPath, 'memory_bank', 'knowledge');
    if (!existsSync(knowledgeDir))
        return [];
    const records = [];
    // Read all JSONL files in knowledge directory
    try {
        const { readdirSync } = require('node:fs');
        const files = readdirSync(knowledgeDir);
        for (const file of files) {
            if (!file.endsWith('.jsonl'))
                continue;
            const filePath = join(knowledgeDir, file);
            const content = readFileSync(filePath, 'utf-8').trim();
            if (!content)
                continue;
            for (const line of content.split('\n')) {
                if (!line.trim())
                    continue;
                try {
                    const entry = JSON.parse(line);
                    records.push({
                        id: entry.id || randomUUID(),
                        project_id: '', // filled by caller
                        type: entry.type || 'unknown',
                        content: entry.content || entry.lesson || JSON.stringify(entry),
                        created_at: entry.created_at || entry.timestamp || undefined,
                        tags: Array.isArray(entry.tags) ? entry.tags.join(',') : entry.tags || undefined,
                        weight: typeof entry.weight === 'number' ? entry.weight : 0.5,
                    });
                }
                catch {
                    // Skip malformed
                }
            }
        }
    }
    catch {
        // Knowledge dir read failed — non-fatal
    }
    return records;
}
function readSessionMonitorFailures(projectPath) {
    const monitorLog = join(projectPath, 'logs', 'session-monitor.jsonl');
    if (!existsSync(monitorLog))
        return [];
    const patterns = [];
    const seenSignatures = new Set();
    try {
        const content = readFileSync(monitorLog, 'utf-8').trim();
        if (!content)
            return [];
        for (const line of content.split('\n')) {
            if (!line.trim())
                continue;
            try {
                const entry = JSON.parse(line);
                const severity = entry.severity;
                // Only track warnings and errors
                if (!severity || !['warning', 'error', 'critical'].includes(severity.toLowerCase()))
                    continue;
                const signature = entry.signature ||
                    `${entry.category || 'unknown'}:${entry.type || entry.event || 'unknown'}`;
                if (seenSignatures.has(signature))
                    continue;
                seenSignatures.add(signature);
                patterns.push({
                    project_id: '', // filled by caller
                    signature,
                    occurrences: entry.occurrences || 1,
                    first_seen: entry.first_seen || entry.timestamp || undefined,
                    last_seen: entry.last_seen || entry.timestamp || undefined,
                    source: 'session-monitor',
                    severity: severity.toLowerCase(),
                    detail: entry.detail || entry.message || undefined,
                });
            }
            catch {
                // Skip malformed
            }
        }
    }
    catch {
        // Log read failed — non-fatal
    }
    return patterns;
}
// ── Main sync orchestrator ──────────────────────────────────────
/**
 * Sync all registered projects into the central dashboard database.
 */
export function syncAllProjects(dbPath, frameworkDir) {
    const log = getLogger();
    const fwDir = frameworkDir || resolve(join(dbPath, '..', '..'));
    const result = {
        projects_synced: 0,
        projects_skipped: 0,
        events_added: 0,
        perf_entries_added: 0,
        knowledge_added: 0,
        failures_detected: 0,
        sessions_imported: 0,
        issues_imported: 0,
        inbox_imported: 0,
        errors: [],
    };
    // Read registry
    const projectPaths = readProjectRegistry(fwDir);
    if (projectPaths.length === 0) {
        log.warn('dashboard-sync', 'no_projects', { frameworkDir: fwDir });
        return result;
    }
    const metaMap = readRegistryMeta(fwDir);
    // Open database
    let db;
    try {
        db = initDatabase(dbPath);
    }
    catch (err) {
        result.errors.push(`Database init failed: ${String(err)}`);
        return result;
    }
    try {
        for (const projectPath of projectPaths) {
            try {
                // Ensure project has an ID
                const projectId = ensureProjectId(projectPath);
                updateRegistryMeta(fwDir, projectPath, projectId);
                const meta = metaMap.get(projectPath) || {};
                const projectName = basename(projectPath);
                // Upsert project record
                upsertProject(db, {
                    id: projectId,
                    path: projectPath,
                    name: projectName,
                    platform: meta.platform || 'claude',
                    framework_version: meta.framework_version || undefined,
                    health_status: meta.health_status || 'unknown',
                });
                // Get last sync state for incremental sync
                const syncState = getProjectSyncState(db, projectId);
                const since = syncState.last_synced_at;
                // Sync telemetry events
                const telemetryRecords = readProjectTelemetry(projectPath, since);
                if (telemetryRecords.length > 0) {
                    const added = insertTelemetryEvents(db, projectId, telemetryRecords);
                    result.events_added += added;
                }
                // Sync perf entries
                const perfRecords = readProjectPerf(projectPath, since);
                if (perfRecords.length > 0) {
                    const added = insertPerfEntries(db, projectId, perfRecords);
                    result.perf_entries_added += added;
                }
                // Sync knowledge entries
                const knowledgeRecords = readProjectKnowledge(projectPath);
                if (knowledgeRecords.length > 0) {
                    const added = insertKnowledgeEntries(db, projectId, knowledgeRecords);
                    result.knowledge_added += added;
                }
                // Sync failure patterns from session monitor
                const failureRecords = readSessionMonitorFailures(projectPath);
                if (failureRecords.length > 0) {
                    const added = insertFailurePatterns(db, projectId, failureRecords);
                    result.failures_detected += added;
                }
                // Import session reports and forge logs
                const sessionResult = scanProjectSessions(db, projectId, projectPath);
                result.sessions_imported += sessionResult.sessions_imported;
                result.issues_imported += sessionResult.issues_imported;
                result.failures_detected += sessionResult.patterns_extracted;
                // Mark project as synced
                updateSyncTimestamp(db, projectId);
                result.projects_synced++;
                log.info('dashboard-sync', 'project_synced', {
                    project: projectName,
                    events: telemetryRecords.length,
                    perf: perfRecords.length,
                    knowledge: knowledgeRecords.length,
                    failures: failureRecords.length,
                    sessions: sessionResult.sessions_imported,
                });
            }
            catch (err) {
                result.projects_skipped++;
                result.errors.push(`${projectPath}: ${String(err)}`);
                log.warn('dashboard-sync', 'project_failed', { path: projectPath, error: String(err) });
            }
        }
        // Import from data/inbox/
        const inboxResult = importInbox(db, fwDir);
        result.inbox_imported += inboxResult.sessions_imported;
        result.sessions_imported += inboxResult.sessions_imported;
        result.issues_imported += inboxResult.issues_imported;
        result.failures_detected += inboxResult.patterns_extracted;
        result.errors.push(...inboxResult.errors);
    }
    finally {
        db.close();
    }
    log.info('dashboard-sync', 'complete', {
        synced: result.projects_synced,
        skipped: result.projects_skipped,
        events: result.events_added,
        sessions: result.sessions_imported,
    });
    return result;
}
/**
 * Format sync result for CLI output.
 */
export function formatSyncResult(result) {
    const lines = [
        'Dashboard Sync Complete',
        String.fromCharCode(0x2501).repeat(40),
        `  Projects synced:     ${result.projects_synced}`,
        `  Projects skipped:    ${result.projects_skipped}`,
        `  Events added:        ${result.events_added}`,
        `  Perf entries added:  ${result.perf_entries_added}`,
        `  Knowledge added:     ${result.knowledge_added}`,
        `  Failures detected:   ${result.failures_detected}`,
        `  Sessions imported:   ${result.sessions_imported}`,
        `  Issues imported:     ${result.issues_imported}`,
    ];
    if (result.inbox_imported > 0) {
        lines.push(`  Inbox imported:      ${result.inbox_imported}`);
    }
    if (result.errors.length > 0) {
        lines.push('');
        lines.push(`  Errors (${result.errors.length}):`);
        for (const err of result.errors.slice(0, 5)) {
            lines.push(`    - ${err}`);
        }
        if (result.errors.length > 5) {
            lines.push(`    ... and ${result.errors.length - 5} more`);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=dashboard-sync.js.map