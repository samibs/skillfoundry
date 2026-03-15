// Weight learner — adjusts memory entry weights based on retrieval frequency and validation outcomes.
// Entries that are retrieved often get boosted. Entries whose linked tests fail get penalized.
// Stale entries (unretrieved for weeks) decay toward the floor.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getLogger } from '../utils/logger.js';
const KNOWLEDGE_DIR = join('memory_bank', 'knowledge');
// ── Configuration ───────────────────────────────────────────────
export const WEIGHT_CONFIG = {
    retrieval_boost: 0.05, // +0.05 per retrieval event
    validation_pass_boost: 0.03, // +0.03 when linked test passes
    validation_fail_penalty: 0.1, // -0.1 when linked test fails
    decay_per_week: 0.01, // -0.01 per week without retrieval
    weight_floor: 0.1, // minimum weight
    weight_ceiling: 1.0, // maximum weight
    max_retrieval_count: 100, // cap to prevent overflow
};
// ── Core Functions ──────────────────────────────────────────────
/**
 * Read all entries from a JSONL knowledge file.
 * Skips malformed lines.
 */
function readEntries(filePath) {
    if (!existsSync(filePath))
        return [];
    const content = readFileSync(filePath, 'utf-8').trim();
    if (!content)
        return [];
    const entries = [];
    for (const line of content.split('\n')) {
        if (!line.trim())
            continue;
        try {
            const parsed = JSON.parse(line);
            if (parsed.id && parsed.content) {
                entries.push(parsed);
            }
        }
        catch {
            // Skip malformed
        }
    }
    return entries;
}
/**
 * Write entries back to a JSONL file.
 */
function writeEntries(filePath, entries) {
    const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    writeFileSync(filePath, content);
}
/**
 * Clamp a weight value between floor and ceiling.
 */
function clampWeight(weight) {
    return Math.max(WEIGHT_CONFIG.weight_floor, Math.min(WEIGHT_CONFIG.weight_ceiling, weight));
}
/**
 * Record a retrieval event for an entry — boosts its weight.
 */
export function recordRetrieval(workDir, entryId) {
    const log = getLogger();
    const knowledgeDir = join(workDir, KNOWLEDGE_DIR);
    if (!existsSync(knowledgeDir))
        return null;
    const files = getKnowledgeFiles(knowledgeDir);
    for (const file of files) {
        const filePath = join(knowledgeDir, file);
        const entries = readEntries(filePath);
        const idx = entries.findIndex((e) => e.id === entryId);
        if (idx >= 0) {
            const entry = entries[idx];
            const oldWeight = entry.weight ?? 0.5;
            const newWeight = clampWeight(oldWeight + WEIGHT_CONFIG.retrieval_boost);
            const oldCount = entry.retrieval_count ?? 0;
            entry.weight = newWeight;
            entry.retrieval_count = Math.min(oldCount + 1, WEIGHT_CONFIG.max_retrieval_count);
            try {
                writeEntries(filePath, entries);
                return {
                    id: entryId,
                    file,
                    old_weight: oldWeight,
                    new_weight: newWeight,
                    reason: `retrieval (count: ${entry.retrieval_count})`,
                };
            }
            catch (err) {
                log.warn('weight-learner', 'write_failed', { file, error: String(err) });
                return null;
            }
        }
    }
    return null;
}
/**
 * Update weights based on test validation results.
 * Entries linked to passing tests get boosted; failing tests get penalized.
 */
export function runValidationUpdate(workDir) {
    const log = getLogger();
    const knowledgeDir = join(workDir, KNOWLEDGE_DIR);
    if (!existsSync(knowledgeDir))
        return [];
    const updates = [];
    const files = getKnowledgeFiles(knowledgeDir);
    for (const file of files) {
        const filePath = join(knowledgeDir, file);
        const entries = readEntries(filePath);
        let modified = false;
        for (const entry of entries) {
            if (!entry.reality_anchor?.test_file)
                continue;
            const testFile = resolve(workDir, entry.reality_anchor.test_file);
            if (!testFile.startsWith(resolve(workDir)))
                continue; // Path traversal protection
            const testExists = existsSync(testFile);
            if (!testExists)
                continue; // Test file reference might be stale
            const oldWeight = entry.weight ?? 0.5;
            const wasPassing = entry.reality_anchor.test_passing ?? true;
            // Check if the test is currently passing by looking at recent gate results
            // For now, we rely on the reality_anchor.test_passing flag being updated by the pipeline
            if (wasPassing) {
                const newWeight = clampWeight(oldWeight + WEIGHT_CONFIG.validation_pass_boost);
                if (newWeight !== oldWeight) {
                    entry.weight = newWeight;
                    entry.validation_count = (entry.validation_count ?? 0) + 1;
                    modified = true;
                    updates.push({
                        id: entry.id,
                        file,
                        old_weight: oldWeight,
                        new_weight: newWeight,
                        reason: 'test passing — validated',
                    });
                }
            }
            else {
                const newWeight = clampWeight(oldWeight - WEIGHT_CONFIG.validation_fail_penalty);
                if (newWeight !== oldWeight) {
                    entry.weight = newWeight;
                    modified = true;
                    updates.push({
                        id: entry.id,
                        file,
                        old_weight: oldWeight,
                        new_weight: newWeight,
                        reason: 'test failing — penalized',
                    });
                }
            }
        }
        if (modified) {
            try {
                writeEntries(filePath, entries);
            }
            catch (err) {
                log.warn('weight-learner', 'write_failed', { file, error: String(err) });
            }
        }
    }
    return updates;
}
/**
 * Apply time-based decay to entries that haven't been retrieved recently.
 * Entries that haven't been retrieved in the last N weeks lose weight.
 */
export function runDecay(workDir, now = new Date()) {
    const log = getLogger();
    const knowledgeDir = join(workDir, KNOWLEDGE_DIR);
    if (!existsSync(knowledgeDir))
        return [];
    const updates = [];
    const files = getKnowledgeFiles(knowledgeDir);
    const nowMs = now.getTime();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    for (const file of files) {
        const filePath = join(knowledgeDir, file);
        const entries = readEntries(filePath);
        let modified = false;
        for (const entry of entries) {
            const createdAt = new Date(entry.created_at).getTime();
            if (isNaN(createdAt))
                continue;
            const ageWeeks = (nowMs - createdAt) / weekMs;
            const retrievals = entry.retrieval_count ?? 0;
            // Only decay entries older than 2 weeks with zero retrievals
            if (ageWeeks < 2 || retrievals > 0)
                continue;
            const oldWeight = entry.weight ?? 0.5;
            const decayAmount = Math.floor(ageWeeks) * WEIGHT_CONFIG.decay_per_week;
            const newWeight = clampWeight(oldWeight - decayAmount);
            if (newWeight < oldWeight) {
                entry.weight = newWeight;
                modified = true;
                updates.push({
                    id: entry.id,
                    file,
                    old_weight: oldWeight,
                    new_weight: newWeight,
                    reason: `stale — ${Math.floor(ageWeeks)} weeks old, 0 retrievals`,
                });
            }
        }
        if (modified) {
            try {
                writeEntries(filePath, entries);
            }
            catch (err) {
                log.warn('weight-learner', 'decay_write_failed', { file, error: String(err) });
            }
        }
    }
    return updates;
}
/**
 * Run the full weight learning cycle: validation updates + decay.
 */
export function runWeightLearning(workDir) {
    const log = getLogger();
    const knowledgeDir = join(workDir, KNOWLEDGE_DIR);
    const errors = [];
    if (!existsSync(knowledgeDir)) {
        return { entries_scanned: 0, entries_updated: 0, updates: [], errors: ['Knowledge directory not found'] };
    }
    let entriesScanned = 0;
    const files = getKnowledgeFiles(knowledgeDir);
    for (const file of files) {
        entriesScanned += readEntries(join(knowledgeDir, file)).length;
    }
    const validationUpdates = runValidationUpdate(workDir);
    const decayUpdates = runDecay(workDir);
    const allUpdates = [...validationUpdates, ...decayUpdates];
    log.info('weight-learner', 'cycle_complete', {
        scanned: entriesScanned,
        updated: allUpdates.length,
        validation: validationUpdates.length,
        decay: decayUpdates.length,
    });
    return {
        entries_scanned: entriesScanned,
        entries_updated: allUpdates.length,
        updates: allUpdates,
        errors,
    };
}
// ── Helpers ─────────────────────────────────────────────────────
function getKnowledgeFiles(dir) {
    try {
        const { readdirSync } = require('node:fs');
        return readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=weight-learner.js.map