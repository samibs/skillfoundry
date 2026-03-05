#!/usr/bin/env npx tsx
// One-time migration script: normalize legacy JSONL entries, extract knowledge
// from .claude/scratchpad.md, update stale bootstrap facts, write canonical JSONL.
//
// Run: npx tsx scripts/migrate-platform-memory.ts
// Idempotent: running again reports 0 new entries.

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Types ─────────────────────────────────────────────────────────

interface CanonicalEntry {
  id: string;
  type: 'fact' | 'decision' | 'error' | 'preference';
  content: string;
  created_at: string;
  created_by: string;
  session_id: string;
  context: {
    prd_id: string | null;
    story_id: string | null;
    phase: string | null;
  };
  weight: number;
  validation_count: number;
  retrieval_count: number;
  tags: string[];
  reality_anchor: {
    has_tests: boolean;
    test_file: string | null;
    test_passing: boolean;
  };
  lineage: {
    parent_id: string | null;
    supersedes: string[];
    superseded_by: string | null;
  };
}

// ── Paths ─────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..');
const KNOWLEDGE_DIR = join(ROOT, 'memory_bank', 'knowledge');
const SCRATCHPAD = join(ROOT, '.claude', 'scratchpad.md');

const FILES = {
  bootstrap: join(KNOWLEDGE_DIR, 'bootstrap.jsonl'),
  decisions: join(KNOWLEDGE_DIR, 'decisions.jsonl'),
  decisionsUniversal: join(KNOWLEDGE_DIR, 'decisions-universal.jsonl'),
  patternsUniversal: join(KNOWLEDGE_DIR, 'patterns-universal.jsonl'),
  errorsUniversal: join(KNOWLEDGE_DIR, 'errors-universal.jsonl'),
  facts: join(KNOWLEDGE_DIR, 'facts.jsonl'),
  errors: join(KNOWLEDGE_DIR, 'errors.jsonl'),
  preferences: join(KNOWLEDGE_DIR, 'preferences.jsonl'),
};

// ── Helpers ───────────────────────────────────────────────────────

function readJsonl(filePath: string): Record<string, unknown>[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function writeJsonl(filePath: string, entries: CanonicalEntry[]): void {
  const content = entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length > 0 ? '\n' : '');
  writeFileSync(filePath, content, 'utf-8');
}

function appendJsonl(filePath: string, entries: CanonicalEntry[]): void {
  for (const entry of entries) {
    appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
  }
}

function isCanonical(entry: Record<string, unknown>): boolean {
  return (
    typeof entry.id === 'string' &&
    typeof entry.weight === 'number' &&
    typeof entry.lineage === 'object' &&
    entry.lineage !== null
  );
}

function buildEntry(
  type: CanonicalEntry['type'],
  content: string,
  opts: {
    created_at?: string;
    created_by?: string;
    session_id?: string;
    tags?: string[];
    weight?: number;
    phase?: string | null;
    supersedes?: string[];
  } = {},
): CanonicalEntry {
  return {
    id: randomUUID(),
    type,
    content,
    created_at: opts.created_at ?? new Date().toISOString(),
    created_by: opts.created_by ?? 'migration-script',
    session_id: opts.session_id ?? 'platform-memory-migration',
    context: {
      prd_id: null,
      story_id: null,
      phase: opts.phase ?? null,
    },
    weight: opts.weight ?? 0.5,
    validation_count: 0,
    retrieval_count: 0,
    tags: opts.tags ?? [],
    reality_anchor: {
      has_tests: false,
      test_file: null,
      test_passing: false,
    },
    lineage: {
      parent_id: null,
      supersedes: opts.supersedes ?? [],
      superseded_by: null,
    },
  };
}

function contentExists(content: string, existingEntries: CanonicalEntry[]): boolean {
  return existingEntries.some((e) => e.content === content);
}

// ── Step 1: Normalize legacy entries ──────────────────────────────

interface NormalizeResult {
  file: string;
  normalized: number;
  kept: number;
}

function normalizeLegacyFile(
  filePath: string,
  legacyType: 'decision' | 'pattern' | 'error',
): NormalizeResult {
  const fileName = filePath.split('/').pop()!;
  const entries = readJsonl(filePath);
  if (entries.length === 0) return { file: fileName, normalized: 0, kept: 0 };

  let normalized = 0;
  let kept = 0;
  const canonical: CanonicalEntry[] = [];

  for (const entry of entries) {
    if (isCanonical(entry)) {
      canonical.push(entry as unknown as CanonicalEntry);
      kept++;
      continue;
    }

    // Build content from legacy fields
    let content: string;
    let tags: string[] = [];
    const canonicalType: CanonicalEntry['type'] = legacyType === 'pattern' ? 'fact' : legacyType;

    if (legacyType === 'decision') {
      const decision = (entry.decision as string) ?? '';
      const reasoning = (entry.chosen_reason as string) ?? (entry.reasoning as string) ?? '';
      const context = (entry.context as string) ?? '';
      content = context ? `${decision}. Context: ${context}. Reason: ${reasoning}` : `${decision}. Reason: ${reasoning}`;
      tags = ['decision', 'session-harvest'];
      if ((entry.impact as string) === 'high') tags.push('high-impact');
    } else if (legacyType === 'pattern') {
      const pattern = (entry.pattern as string) ?? '';
      const description = (entry.description as string) ?? '';
      content = `${pattern}: ${description}`;
      const category = (entry.category as string) ?? '';
      tags = ['pattern', category].filter(Boolean);
      if ((entry.frequency as string) === 'recurring') tags.push('recurring');
    } else {
      const error = (entry.error as string) ?? '';
      const rootCause = (entry.root_cause as string) ?? '';
      const fix = (entry.fix as string) ?? '';
      content = `${error}. Root cause: ${rootCause}. Fix: ${fix}`;
      tags = ['error', 'session-harvest'];
      if (entry.file) tags.push('shell');
    }

    canonical.push(
      buildEntry(canonicalType, content, {
        created_at: (entry.timestamp as string) ?? new Date().toISOString(),
        created_by: 'session-harvest',
        session_id: (entry.session as string) ?? 'unknown',
        tags,
        weight: 0.5,
      }),
    );
    normalized++;
  }

  writeJsonl(filePath, canonical);
  return { file: fileName, normalized, kept };
}

// ── Step 2: Extract knowledge from scratchpad ─────────────────────

interface ExtractionResult {
  facts: CanonicalEntry[];
  decisions: CanonicalEntry[];
  errors: CanonicalEntry[];
  preferences: CanonicalEntry[];
}

function extractFromScratchpad(): ExtractionResult {
  if (!existsSync(SCRATCHPAD)) {
    console.log('  Scratchpad not found, skipping extraction');
    return { facts: [], decisions: [], errors: [], preferences: [] };
  }

  const content = readFileSync(SCRATCHPAD, 'utf-8');
  const facts: CanonicalEntry[] = [];
  const decisions: CanonicalEntry[] = [];
  const errors: CanonicalEntry[] = [];
  const preferences: CanonicalEntry[] = [];

  const scratchpadOpts = {
    created_by: 'scratchpad-extraction',
    session_id: 'platform-memory-migration',
  };

  // ── Facts: Session summaries ──

  facts.push(
    buildEntry(
      'fact',
      'Forge v2.0.12: 3/3 stories, 308/308 tests (48 new), shell 198/198. PRD: local-first-development. 6 knowledge entries harvested.',
      { ...scratchpadOpts, created_at: '2026-02-27T10:15:00Z', tags: ['forge', 'session-summary', 'v2.0.12'], weight: 0.5 },
    ),
  );

  facts.push(
    buildEntry(
      'fact',
      'Forge v2.0.10: Pipeline engine created. ai-runner.ts (standalone agentic loop, zero React deps), pipeline.ts (6-phase engine). 258 tests (20 new). Build clean.',
      { ...scratchpadOpts, created_at: '2026-02-26T12:00:00Z', tags: ['forge', 'session-summary', 'v2.0.10', 'pipeline'], weight: 0.6 },
    ),
  );

  facts.push(
    buildEntry(
      'fact',
      'Forge v2.0.9: Reflection protocols added to 5 orchestrators (auto, context, fixer, gate-keeper, go). Knowledge promotion pipeline built. 238 tests passing.',
      { ...scratchpadOpts, created_at: '2026-02-26T00:00:00Z', tags: ['forge', 'session-summary', 'v2.0.9', 'reflection'], weight: 0.5 },
    ),
  );

  facts.push(
    buildEntry(
      'fact',
      'Visual overhaul v2.0.4: Full "Modern Hacker" theme applied to 12 CLI components. 238 tests (no regressions).',
      { ...scratchpadOpts, created_at: '2026-02-23T18:00:00Z', tags: ['forge', 'session-summary', 'v2.0.4', 'visual'], weight: 0.4 },
    ),
  );

  facts.push(
    buildEntry(
      'fact',
      'Team summon v2.0.2: Multi-agent auto-routing with 6 preset teams, keyword-based router (30+ agents, weighted regex). 237 tests (26 new).',
      { ...scratchpadOpts, created_at: '2026-02-23T12:00:00Z', tags: ['forge', 'session-summary', 'v2.0.2', 'team'], weight: 0.5 },
    ),
  );

  facts.push(
    buildEntry(
      'fact',
      'Performance v2.0.1: 4 caching layers — Anthropic prompt caching (~90% token discount), provider singleton, in-memory budget cache, tool transform memoization.',
      { ...scratchpadOpts, created_at: '2026-02-23T10:00:00Z', tags: ['forge', 'session-summary', 'v2.0.1', 'caching', 'performance'], weight: 0.6 },
    ),
  );

  facts.push(
    buildEntry(
      'fact',
      'Security hardening v2.0.0: Placeholder keys removed, bash defense-in-depth, symlink blocking, extended redaction (+5 patterns). 211 tests (15 new).',
      { ...scratchpadOpts, created_at: '2026-02-23T08:00:00Z', tags: ['forge', 'session-summary', 'v2.0.0', 'security'], weight: 0.6 },
    ),
  );

  facts.push(
    buildEntry(
      'fact',
      'Competitive-leap v1.9.0.16: 17/17 stories implemented (all 5 phases). 6 security findings (5 fixed). 25 new tests. 10 knowledge entries harvested.',
      { ...scratchpadOpts, created_at: '2026-02-16T01:00:00Z', tags: ['forge', 'session-summary', 'v1.9.0.16', 'competitive-leap'], weight: 0.5 },
    ),
  );

  // ── Facts: Architecture & capabilities ──

  facts.push(
    buildEntry(
      'fact',
      'Version progression: 1.9.0.15 → 1.9.0.16 → 2.0.0 → 2.0.1 → 2.0.2 → 2.0.3 → 2.0.4 → 2.0.8 → 2.0.9 → 2.0.10 → 2.0.11 → 2.0.12',
      { ...scratchpadOpts, created_at: '2026-02-27T10:15:00Z', tags: ['versioning', 'history'], weight: 0.6 },
    ),
  );

  facts.push(
    buildEntry(
      'fact',
      '60 agents registered with tool categories and system prompts. 6 tool categories: FULL(21), CODE(10), REVIEW(9), OPS(9), INSPECT(8), NONE(2). 65% of agents use fewer tools, saving 70-350 tokens per request.',
      { ...scratchpadOpts, created_at: '2026-02-23T08:00:00Z', tags: ['agents', 'optimization', 'tokens'], weight: 0.7 },
    ),
  );

  facts.push(
    buildEntry(
      'fact',
      'Design system: 20+ hex colors (accent:#00d4ff, secondary:#6e7dff, success:#00ff87, warning:#ffaa00, error:#ff3333), 30+ unicode symbols, 4 custom border styles (header/double/input/card), gradient banner (cyan→blue→purple).',
      { ...scratchpadOpts, created_at: '2026-02-23T18:00:00Z', tags: ['visual', 'theme', 'design-system'], weight: 0.4 },
    ),
  );

  facts.push(
    buildEntry(
      'fact',
      'Pipeline engine is 6-phase: IGNITE→PLAN→FORGE→TEMPER→INSPECT→DEBRIEF. Implemented in sf_cli/src/core/pipeline.ts with standalone ai-runner.ts (zero React deps).',
      { ...scratchpadOpts, created_at: '2026-02-26T12:00:00Z', tags: ['pipeline', 'architecture', 'forge'], weight: 0.7 },
    ),
  );

  facts.push(
    buildEntry(
      'fact',
      '4 caching layers: Anthropic prompt caching (cache_control ephemeral on system prompt + last tool def, ~90% token discount), provider singleton (useRef), in-memory budget cache (disk read once), tool transform memoization (by tool-name key).',
      { ...scratchpadOpts, created_at: '2026-02-23T10:00:00Z', tags: ['caching', 'performance', 'architecture'], weight: 0.6 },
    ),
  );

  // ── Decisions ──

  decisions.push(
    buildEntry(
      'decision',
      'Standalone agentic loop (ai-runner.ts) with zero React deps for pipeline use. Reason: pipeline runs non-interactively, React/Ink only needed for interactive CLI.',
      { ...scratchpadOpts, created_at: '2026-02-26T12:00:00Z', tags: ['architecture', 'pipeline', 'decision'], weight: 0.6 },
    ),
  );

  decisions.push(
    buildEntry(
      'decision',
      'Keyword-based team routing with weighted regex patterns, no LLM calls. Reason: deterministic, zero-cost, zero-latency. Complex tasks default to cloud (safety-first).',
      { ...scratchpadOpts, created_at: '2026-02-23T12:00:00Z', tags: ['team', 'routing', 'decision'], weight: 0.6 },
    ),
  );

  decisions.push(
    buildEntry(
      'decision',
      'Quality primer injected at generation time, not just gate validation. Reason: prevents bad code from being written, cheaper than fixing after the fact.',
      { ...scratchpadOpts, created_at: '2026-02-16T01:00:00Z', tags: ['quality', 'decision'], weight: 0.5 },
    ),
  );

  decisions.push(
    buildEntry(
      'decision',
      'Cost-aware routing disabled by default (opt-in). Reason: prevents surprise behavior changes for existing users. New features that add cost/complexity should be opt-in.',
      { ...scratchpadOpts, created_at: '2026-02-16T01:00:00Z', tags: ['cost-routing', 'decision', 'opt-in'], weight: 0.5 },
    ),
  );

  decisions.push(
    buildEntry(
      'decision',
      'Rejection tracker auto-proposes rules after 3+ identical rejections. Reason: self-improving quality without human intervention. Pattern recognition on gate failures.',
      { ...scratchpadOpts, created_at: '2026-02-16T01:00:00Z', tags: ['quality', 'self-improving', 'decision'], weight: 0.5 },
    ),
  );

  // ── Errors: Security fixes ──

  errors.push(
    buildEntry(
      'error',
      'CRITICAL: eval() command injection in rejection-tracker.sh — user input passed to eval for dynamic filtering. Fix: replaced with jq --arg for safe JSON-aware filtering.',
      { ...scratchpadOpts, created_at: '2026-02-16T01:00:00Z', tags: ['security', 'critical', 'shell', 'injection'], weight: 0.8 },
    ),
  );

  errors.push(
    buildEntry(
      'error',
      'CRITICAL: Insecure mktemp in /tmp — cross-user exposure risk. Fix: mktemp in project directory with chmod 600, avoids shared /tmp.',
      { ...scratchpadOpts, created_at: '2026-02-16T01:00:00Z', tags: ['security', 'critical', 'shell', 'tempfiles'], weight: 0.8 },
    ),
  );

  errors.push(
    buildEntry(
      'error',
      'HIGH: Unsafe sed with user-controlled replacement text allows delimiter injection. Fix: replaced with awk -v variable passing (safe against delimiter injection).',
      { ...scratchpadOpts, created_at: '2026-02-16T01:00:00Z', tags: ['security', 'high', 'shell', 'injection'], weight: 0.7 },
    ),
  );

  errors.push(
    buildEntry(
      'error',
      'clearTimeout missing in catch blocks causes timer accumulation on repeated network failures. Fix: always clearTimeout() in both try and catch blocks when using AbortController with setTimeout.',
      { ...scratchpadOpts, created_at: '2026-02-27T10:10:00Z', tags: ['bug', 'timeout', 'network', 'memory-leak'], weight: 0.6 },
    ),
  );

  // ── Preferences ──

  preferences.push(
    buildEntry(
      'preference',
      'Backend-first development order: backend → CLI tools → web UI layered on top. Reusable modules across apps.',
      { ...scratchpadOpts, tags: ['workflow', 'development-order'], weight: 0.6 },
    ),
  );

  preferences.push(
    buildEntry(
      'preference',
      'Dark mode by default for all UI/dashboard implementations. Clean, professional, debug-mode accessible.',
      { ...scratchpadOpts, tags: ['ui', 'dark-mode', 'visual'], weight: 0.5 },
    ),
  );

  preferences.push(
    buildEntry(
      'preference',
      'Cold-blooded logic over flattery: no vague encouragement or optimistic assumptions — honest, structured, production-ready evaluations only.',
      { ...scratchpadOpts, tags: ['communication', 'philosophy'], weight: 0.7 },
    ),
  );

  return { facts, decisions, errors, preferences };
}

// ── Step 3: Supersede stale bootstrap entries ─────────────────────

function buildSupersedingEntries(): CanonicalEntry[] {
  const entries: CanonicalEntry[] = [];

  entries.push(
    buildEntry(
      'fact',
      'The framework supports 5 platforms: Claude Code (.claude/commands/), GitHub Copilot (.copilot/custom-agents/), Cursor (.cursor/rules/), Codex (.agents/), and Gemini (.gemini/).',
      {
        created_by: 'migration-script',
        tags: ['platforms', 'claude', 'copilot', 'cursor', 'codex', 'gemini'],
        weight: 0.8,
        supersedes: ['bootstrap-fact-003'],
      },
    ),
  );

  entries.push(
    buildEntry(
      'fact',
      '56 agents and 63 skills across 5 platforms. Agents cover the full development lifecycle with 6 tool categories.',
      {
        created_by: 'migration-script',
        tags: ['agents', 'skills', 'count'],
        weight: 0.7,
        supersedes: ['bootstrap-fact-004'],
      },
    ),
  );

  return entries;
}

// ── Step 4: Deduplicate and write ─────────────────────────────────

function deduplicateAndAppend(
  filePath: string,
  newEntries: CanonicalEntry[],
): number {
  const existing = readJsonl(filePath) as unknown as CanonicalEntry[];
  let written = 0;

  for (const entry of newEntries) {
    if (contentExists(entry.content, existing)) continue;
    appendJsonl(filePath, [entry]);
    existing.push(entry);
    written++;
  }

  return written;
}

// ── Step 5: Update superseded_by in bootstrap ─────────────────────

function markBootstrapSuperseded(supersedingEntries: CanonicalEntry[]): number {
  const bootstrapEntries = readJsonl(FILES.bootstrap) as unknown as CanonicalEntry[];
  let updated = 0;

  for (const newEntry of supersedingEntries) {
    for (const oldId of newEntry.lineage.supersedes) {
      const oldEntry = bootstrapEntries.find((e) => e.id === oldId);
      if (oldEntry && !oldEntry.lineage.superseded_by) {
        oldEntry.lineage.superseded_by = newEntry.id;
        updated++;
      }
    }
  }

  if (updated > 0) {
    writeJsonl(FILES.bootstrap, bootstrapEntries);
  }

  return updated;
}

// ── Main ──────────────────────────────────────────────────────────

function main(): void {
  console.log('=== Platform Memory Migration ===\n');

  // Verify knowledge dir exists
  if (!existsSync(KNOWLEDGE_DIR)) {
    console.error(`Knowledge directory not found: ${KNOWLEDGE_DIR}`);
    process.exit(1);
  }

  // Step 1: Normalize legacy entries
  console.log('Step 1: Normalizing legacy entries...');
  const normalizeResults: NormalizeResult[] = [];

  normalizeResults.push(normalizeLegacyFile(FILES.decisions, 'decision'));
  normalizeResults.push(normalizeLegacyFile(FILES.decisionsUniversal, 'decision'));
  normalizeResults.push(normalizeLegacyFile(FILES.patternsUniversal, 'pattern'));
  normalizeResults.push(normalizeLegacyFile(FILES.errorsUniversal, 'error'));

  const totalNormalized = normalizeResults.reduce((sum, r) => sum + r.normalized, 0);
  const totalKept = normalizeResults.reduce((sum, r) => sum + r.kept, 0);

  for (const r of normalizeResults) {
    if (r.normalized > 0 || r.kept > 0) {
      console.log(`  ${r.file}: ${r.normalized} normalized, ${r.kept} already canonical`);
    }
  }

  // Step 2: Extract from scratchpad
  console.log('\nStep 2: Extracting knowledge from scratchpad...');
  const extracted = extractFromScratchpad();
  console.log(`  Found: ${extracted.facts.length} facts, ${extracted.decisions.length} decisions, ${extracted.errors.length} errors, ${extracted.preferences.length} preferences`);

  // Step 3: Build superseding entries
  console.log('\nStep 3: Building superseding bootstrap entries...');
  const superseding = buildSupersedingEntries();
  console.log(`  Built ${superseding.length} superseding entries`);

  // Step 4: Deduplicate and write
  console.log('\nStep 4: Deduplicating and writing...');

  // Combine scratchpad facts + superseding entries → facts.jsonl
  const allNewFacts = [...extracted.facts, ...superseding];
  const factsWritten = deduplicateAndAppend(FILES.facts, allNewFacts);
  console.log(`  facts.jsonl: ${factsWritten} new entries written (${allNewFacts.length - factsWritten} duplicates skipped)`);

  // Scratchpad decisions → decisions.jsonl
  const decisionsWritten = deduplicateAndAppend(FILES.decisions, extracted.decisions);
  console.log(`  decisions.jsonl: ${decisionsWritten} new entries appended (${extracted.decisions.length - decisionsWritten} duplicates skipped)`);

  // Scratchpad errors → errors.jsonl
  const errorsWritten = deduplicateAndAppend(FILES.errors, extracted.errors);
  console.log(`  errors.jsonl: ${errorsWritten} new entries appended (${extracted.errors.length - errorsWritten} duplicates skipped)`);

  // Preferences → preferences.jsonl
  const preferencesWritten = deduplicateAndAppend(FILES.preferences, extracted.preferences);
  console.log(`  preferences.jsonl: ${preferencesWritten} new entries written (${extracted.preferences.length - preferencesWritten} duplicates skipped)`);

  // Step 5: Mark bootstrap entries as superseded
  console.log('\nStep 5: Updating bootstrap lineage...');
  const bootstrapUpdated = markBootstrapSuperseded(superseding);
  console.log(`  ${bootstrapUpdated} bootstrap entries marked as superseded`);

  // Summary
  const totalExtracted = factsWritten + decisionsWritten + errorsWritten + preferencesWritten;
  const totalAll = totalNormalized + totalExtracted + bootstrapUpdated;
  console.log(`\n=== Migration Complete ===`);
  console.log(`Migrated ${totalAll} entries (${totalNormalized} normalized, ${totalExtracted} extracted, ${bootstrapUpdated} superseded)`);
}

main();
