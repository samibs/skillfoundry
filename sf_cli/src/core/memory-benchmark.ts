/**
 * Memory Precision Benchmark Suite for SkillFoundry CLI.
 *
 * Measures recall precision of the vector store and TF-IDF layered recall
 * against a curated dataset of 50 query/expected-result pairs.
 *
 * Scoring algorithm:
 *   precision@k = (relevant results in top-k) / min(k, |expectedIds|)
 *   overall precision = mean precision across all query pairs
 *
 * Pass threshold: overall precision > 0.75
 * Regression detection: compare against baseline.json; warn if drop > 5 points
 *
 * @module memory-benchmark
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getLogger } from '../utils/logger.js';
import type { VectorStore } from './vector-store.js';
import type { MemoryDocument, SearchResult } from './vector-store.js';

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * A single benchmark query/expected-result pair from the dataset.
 */
export interface BenchmarkPair {
  /** Unique benchmark pair identifier, e.g. "BP-001". */
  id: string;
  /** Natural language query to submit to the search system. */
  query: string;
  /** IDs of corpus documents considered relevant for this query. */
  expectedIds: string[];
  /** Thematic category for per-category reporting. */
  category: string;
  /** Difficulty classification for per-difficulty reporting. */
  difficulty: 'easy' | 'medium' | 'hard';
  /** Human notes explaining the scoring rationale. */
  notes: string;
}

/**
 * A corpus document to be indexed before benchmark queries run.
 */
export interface CorpusDocument {
  /** Unique document identifier. */
  id: string;
  /** Full text content of the memory document. */
  text: string;
  /** MemoryDocument metadata fields. */
  metadata: MemoryDocument['metadata'];
}

/**
 * The complete benchmark dataset loaded from the fixture file.
 */
export interface BenchmarkDataset {
  /** Semantic version of the dataset format. */
  version: string;
  /** Human-readable description. */
  description: string;
  /** Minimum acceptable overall precision (0.75). */
  passThreshold: number;
  /** Number of top results to evaluate per query. */
  topK: number;
  /** 50 curated query/expected-result pairs. */
  pairs: BenchmarkPair[];
  /** Corpus documents to index before running queries. */
  corpus: CorpusDocument[];
}

/**
 * Precision result for a single benchmark pair.
 */
export interface QueryPrecisionResult {
  /** Benchmark pair identifier. */
  pairId: string;
  /** The natural language query. */
  query: string;
  /** Category of the query. */
  category: string;
  /** Difficulty level of the query. */
  difficulty: 'easy' | 'medium' | 'hard';
  /** Expected relevant document IDs. */
  expectedIds: string[];
  /** IDs returned by the search system (in rank order). */
  retrievedIds: string[];
  /** precision@k score in [0, 1]. */
  precision: number;
  /** Time taken for this query in milliseconds. */
  latencyMs: number;
}

/**
 * Full benchmark report produced by runPrecisionBenchmark().
 */
export interface BenchmarkReport {
  /** Mean precision across all 50 queries. */
  overallPrecision: number;
  /** Minimum acceptable precision (0.75). */
  passThreshold: number;
  /** True when overallPrecision > passThreshold and no query scores 0.0. */
  passed: boolean;
  /** Per-category mean precision. */
  perCategory: Record<string, number>;
  /** Per-difficulty mean precision. */
  perDifficulty: Record<string, number>;
  /** Queries that scored 0.0 precision. */
  zeroScoreFailures: Array<{ pairId: string; query: string }>;
  /** Full per-query breakdown. */
  queryResults: QueryPrecisionResult[];
  /** Sum of all query latencies in milliseconds. */
  totalLatencyMs: number;
  /** Mean latency per query in milliseconds. */
  avgLatencyMs: number;
  /** ISO timestamp when the benchmark ran. */
  ranAt: string;
  /** Number of corpus documents indexed. */
  corpusSize: number;
}

/**
 * Baseline precision record stored between benchmark runs for regression detection.
 */
export interface BenchmarkBaseline {
  /** ISO timestamp when this baseline was recorded. */
  recordedAt: string;
  /** Overall precision at time of recording. */
  overallPrecision: number;
  /** Per-category precision at time of recording. */
  perCategory: Record<string, number>;
}

/**
 * Result of comparing current benchmark run to the stored baseline.
 */
export interface BaselineComparisonResult {
  /** True when baseline file was found and comparison was performed. */
  baselineFound: boolean;
  /** Absolute change in overall precision (current - baseline). Negative = regression. */
  precisionDelta: number;
  /** True when precision dropped more than 5 percentage points from baseline. */
  regressionWarning: boolean;
  /** Human-readable warning message when regression is detected. */
  warningMessage: string | null;
}

// ── Precision calculation ─────────────────────────────────────────────────────

/**
 * Calculate precision@k for a single query result.
 *
 * Precision@k = (number of relevant results in top-k) / min(k, |expectedIds|)
 *
 * Normalizes by the number of expected results to avoid penalizing queries
 * that have fewer than k relevant documents in the corpus.
 *
 * @param retrievedIds - Ordered list of retrieved document IDs (most relevant first).
 * @param expectedIds - Set of document IDs considered relevant for this query.
 * @param topK - Number of top results to evaluate.
 * @returns Precision score in [0, 1].
 */
export function calculatePrecisionAtK(
  retrievedIds: string[],
  expectedIds: string[],
  topK: number,
): number {
  if (expectedIds.length === 0) return 0;

  const topResults = retrievedIds.slice(0, topK);
  const expectedSet = new Set(expectedIds);
  const hits = topResults.filter((id) => expectedSet.has(id)).length;

  // Normalize by min(topK, expectedIds.length) to avoid penalizing queries
  // that have fewer relevant documents than topK
  const denominator = Math.min(topK, expectedIds.length);
  return hits / denominator;
}

// ── Dataset loading ───────────────────────────────────────────────────────────

/**
 * Load and validate the benchmark dataset from a JSON file.
 *
 * @param datasetPath - Absolute path to the benchmark data JSON file.
 * @returns Parsed and validated BenchmarkDataset.
 * @throws Error when the file does not exist, cannot be parsed, or fails validation.
 */
export function loadBenchmarkDataset(datasetPath: string): BenchmarkDataset {
  if (!existsSync(datasetPath)) {
    throw new Error(`Benchmark dataset not found: ${datasetPath}`);
  }

  const raw = readFileSync(datasetPath, 'utf-8');
  let dataset: BenchmarkDataset;

  try {
    dataset = JSON.parse(raw) as BenchmarkDataset;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse benchmark dataset JSON: ${reason}`);
  }

  validateDataset(dataset);
  return dataset;
}

/**
 * Validate dataset structural integrity.
 * Ensures all query pairs reference IDs that exist in the corpus.
 *
 * @param dataset - Loaded dataset to validate.
 * @throws Error with detailed message when validation fails.
 */
export function validateDataset(dataset: BenchmarkDataset): void {
  const errors: string[] = [];

  // Basic structure checks
  if (!Array.isArray(dataset.pairs) || dataset.pairs.length === 0) {
    errors.push('Dataset must contain at least one benchmark pair');
  }
  if (!Array.isArray(dataset.corpus) || dataset.corpus.length === 0) {
    errors.push('Dataset must contain at least one corpus document');
  }
  if (typeof dataset.passThreshold !== 'number' || dataset.passThreshold <= 0 || dataset.passThreshold > 1) {
    errors.push('passThreshold must be a number in (0, 1]');
  }
  if (typeof dataset.topK !== 'number' || dataset.topK < 1) {
    errors.push('topK must be a positive integer');
  }

  if (errors.length > 0) {
    throw new Error(`Dataset validation failed:\n  - ${errors.join('\n  - ')}`);
  }

  // Build corpus ID set for reference checking
  const corpusIds = new Set(dataset.corpus.map((d) => d.id));

  // Check each pair has valid structure and references real corpus IDs
  const pairErrors: string[] = [];
  const pairIds = new Set<string>();

  for (const pair of dataset.pairs) {
    if (!pair.id || typeof pair.id !== 'string') {
      pairErrors.push(`Pair missing id field`);
      continue;
    }
    if (pairIds.has(pair.id)) {
      pairErrors.push(`Duplicate pair id: ${pair.id}`);
    }
    pairIds.add(pair.id);

    if (!pair.query || typeof pair.query !== 'string') {
      pairErrors.push(`${pair.id}: missing query`);
    }
    if (!Array.isArray(pair.expectedIds) || pair.expectedIds.length === 0) {
      pairErrors.push(`${pair.id}: expectedIds must be non-empty array`);
    } else {
      const missingIds = pair.expectedIds.filter((id) => !corpusIds.has(id));
      if (missingIds.length > 0) {
        pairErrors.push(`${pair.id}: expectedIds reference non-existent corpus docs: ${missingIds.join(', ')}`);
      }
    }
    if (!['easy', 'medium', 'hard'].includes(pair.difficulty)) {
      pairErrors.push(`${pair.id}: difficulty must be 'easy', 'medium', or 'hard'`);
    }
  }

  if (pairErrors.length > 0) {
    throw new Error(`Dataset pair validation failed:\n  - ${pairErrors.join('\n  - ')}`);
  }
}

// ── Report generation ─────────────────────────────────────────────────────────

/**
 * Aggregate per-query results into a full benchmark report.
 *
 * @param queryResults - Array of per-query precision results.
 * @param passThreshold - Required minimum overall precision.
 * @param corpusSize - Number of documents indexed for the benchmark.
 * @returns Fully populated BenchmarkReport.
 */
export function generateReport(
  queryResults: QueryPrecisionResult[],
  passThreshold: number,
  corpusSize: number,
): BenchmarkReport {
  if (queryResults.length === 0) {
    return {
      overallPrecision: 0,
      passThreshold,
      passed: false,
      perCategory: {},
      perDifficulty: {},
      zeroScoreFailures: [],
      queryResults: [],
      totalLatencyMs: 0,
      avgLatencyMs: 0,
      ranAt: new Date().toISOString(),
      corpusSize,
    };
  }

  // Overall precision = mean of all per-query precision scores
  const overallPrecision =
    queryResults.reduce((sum, r) => sum + r.precision, 0) / queryResults.length;

  // Per-category precision
  const categoryGroups = groupBy(queryResults, (r) => r.category);
  const perCategory: Record<string, number> = {};
  for (const [cat, results] of Object.entries(categoryGroups)) {
    perCategory[cat] = results.reduce((s, r) => s + r.precision, 0) / results.length;
  }

  // Per-difficulty precision
  const difficultyGroups = groupBy(queryResults, (r) => r.difficulty);
  const perDifficulty: Record<string, number> = {};
  for (const [diff, results] of Object.entries(difficultyGroups)) {
    perDifficulty[diff] = results.reduce((s, r) => s + r.precision, 0) / results.length;
  }

  // Zero-score failures
  const zeroScoreFailures = queryResults
    .filter((r) => r.precision === 0)
    .map((r) => ({ pairId: r.pairId, query: r.query }));

  // Latency stats
  const totalLatencyMs = queryResults.reduce((s, r) => s + r.latencyMs, 0);
  const avgLatencyMs = totalLatencyMs / queryResults.length;

  // Pass condition: overall precision above threshold AND no zero-score queries
  const passed = overallPrecision > passThreshold && zeroScoreFailures.length === 0;

  return {
    overallPrecision,
    passThreshold,
    passed,
    perCategory,
    perDifficulty,
    zeroScoreFailures,
    queryResults,
    totalLatencyMs,
    avgLatencyMs: Math.round(avgLatencyMs * 100) / 100,
    ranAt: new Date().toISOString(),
    corpusSize,
  };
}

// ── Baseline comparison ───────────────────────────────────────────────────────

/**
 * Load the stored baseline precision file.
 *
 * @param baselinePath - Absolute path to the baseline JSON file.
 * @returns Parsed baseline, or null if file does not exist.
 */
export function loadBaseline(baselinePath: string): BenchmarkBaseline | null {
  if (!existsSync(baselinePath)) return null;

  try {
    const raw = readFileSync(baselinePath, 'utf-8');
    return JSON.parse(raw) as BenchmarkBaseline;
  } catch {
    return null;
  }
}

/**
 * Save the current benchmark report as the new baseline.
 * Baseline is updated manually — this function should only be called
 * by developers who have reviewed and approved the current benchmark results.
 *
 * @param report - The benchmark report to save as baseline.
 * @param baselinePath - Absolute path where the baseline JSON will be written.
 */
export function saveBaseline(report: BenchmarkReport, baselinePath: string): void {
  const baseline: BenchmarkBaseline = {
    recordedAt: report.ranAt,
    overallPrecision: report.overallPrecision,
    perCategory: { ...report.perCategory },
  };
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2), 'utf-8');
}

/**
 * Compare current benchmark precision against the stored baseline.
 *
 * Emits a regression warning when overall precision drops more than
 * 5 percentage points from the baseline, even if still above the 0.75 threshold.
 *
 * @param currentPrecision - Overall precision from the current run.
 * @param baseline - Previously recorded baseline, or null if none exists.
 * @returns Comparison result with warning details.
 */
export function compareToBaseline(
  currentPrecision: number,
  baseline: BenchmarkBaseline | null,
): BaselineComparisonResult {
  const REGRESSION_THRESHOLD = 0.05; // 5 percentage points

  if (!baseline) {
    return {
      baselineFound: false,
      precisionDelta: 0,
      regressionWarning: false,
      warningMessage: null,
    };
  }

  const precisionDelta = currentPrecision - baseline.overallPrecision;
  const regressionWarning = precisionDelta < -REGRESSION_THRESHOLD;

  return {
    baselineFound: true,
    precisionDelta,
    regressionWarning,
    warningMessage: regressionWarning
      ? `Precision regression detected: dropped from ${(baseline.overallPrecision * 100).toFixed(1)}% to ${(currentPrecision * 100).toFixed(1)}% (delta: ${(precisionDelta * 100).toFixed(1)}pp)`
      : null,
  };
}

// ── Benchmark runner ──────────────────────────────────────────────────────────

/**
 * Search adapter interface allowing the benchmark to work with different
 * search backends (VectorStore with semantic embeddings, or TF-IDF fallback).
 */
export interface BenchmarkSearchAdapter {
  /**
   * Index corpus documents into the search backend.
   * @param corpus - Array of corpus documents to index.
   */
  indexCorpus(corpus: CorpusDocument[]): Promise<void>;

  /**
   * Execute a search query and return ordered result IDs.
   * @param query - Natural language query.
   * @param topK - Maximum number of results to return.
   * @returns Ordered array of document IDs (most relevant first).
   */
  search(query: string, topK: number): Promise<string[]>;

  /**
   * Clean up resources after the benchmark completes.
   */
  cleanup(): Promise<void>;
}

/**
 * Benchmark adapter backed by VectorStore with real semantic embeddings.
 * Requires Ollama or OpenAI to be available.
 */
export class VectorStoreBenchmarkAdapter implements BenchmarkSearchAdapter {
  private readonly store: VectorStore;

  /**
   * @param store - An initialized VectorStore instance.
   */
  constructor(store: VectorStore) {
    this.store = store;
  }

  /**
   * Index corpus documents into the vector store using real embeddings.
   * @param corpus - Corpus documents to embed and store.
   */
  async indexCorpus(corpus: CorpusDocument[]): Promise<void> {
    const documents: MemoryDocument[] = corpus.map((doc) => ({
      id: doc.id,
      text: doc.text,
      metadata: doc.metadata,
    }));
    await this.store.add(documents);
  }

  /**
   * Run semantic similarity search against the indexed corpus.
   * @param query - Query text.
   * @param topK - Number of top results.
   * @returns Ordered document IDs.
   */
  async search(query: string, topK: number): Promise<string[]> {
    const results: SearchResult[] = await this.store.search(query, topK);
    return results.map((r) => r.id);
  }

  /**
   * No-op cleanup for VectorStoreBenchmarkAdapter.
   * The caller is responsible for managing the VectorStore lifecycle.
   */
  async cleanup(): Promise<void> {
    // VectorStore lifecycle is managed by the caller
  }
}

/**
 * TF-IDF benchmark adapter using keyword-based scoring.
 * Works without any embedding provider — suitable for unit testing.
 */
export class TfIdfBenchmarkAdapter implements BenchmarkSearchAdapter {
  private corpus: CorpusDocument[] = [];

  /**
   * Store corpus documents in memory for TF-IDF search.
   * @param corpus - Corpus documents to index.
   */
  async indexCorpus(corpus: CorpusDocument[]): Promise<void> {
    this.corpus = [...corpus];
  }

  /**
   * Perform TF-IDF keyword scoring against the in-memory corpus.
   *
   * Scoring algorithm (matching layered-recall.ts logic):
   *   +100 for exact phrase match in text
   *   +10 per query word found in text
   *   +5 per query word found in tags
   *
   * @param query - Natural language query.
   * @param topK - Number of top results.
   * @returns Ordered document IDs by descending TF-IDF score.
   */
  async search(query: string, topK: number): Promise<string[]> {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

    const scored = this.corpus.map((doc) => {
      const textLower = doc.text.toLowerCase();
      const tagsLower = (doc.metadata.tags ?? []).map((t: string) => t.toLowerCase());

      // Exact phrase match: +100
      const exactMatch = textLower.includes(queryLower) ? 100 : 0;

      // Per-word matches in text: +10 each
      let wordMatches = 0;
      for (const word of queryWords) {
        if (textLower.includes(word)) wordMatches += 10;
      }

      // Per-word matches in tags: +5 each
      let tagBonus = 0;
      for (const word of queryWords) {
        for (const tag of tagsLower) {
          if (tag.includes(word)) {
            tagBonus += 5;
            break;
          }
        }
      }

      const score = exactMatch + wordMatches + tagBonus;
      return { id: doc.id, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => s.id);
  }

  /**
   * Clear the in-memory corpus.
   */
  async cleanup(): Promise<void> {
    this.corpus = [];
  }
}

/**
 * Run the full precision benchmark against a search adapter.
 *
 * Steps:
 *   1. Index corpus documents via the adapter
 *   2. For each of the 50 query pairs:
 *      a. Run search with top-k
 *      b. Calculate precision@k
 *      c. Record latency
 *   3. Generate full benchmark report
 *   4. Compare against baseline if available
 *   5. Clean up adapter resources
 *
 * @param dataset - Loaded benchmark dataset with pairs and corpus.
 * @param adapter - Search adapter to evaluate.
 * @param baselinePath - Optional path to baseline JSON for regression comparison.
 * @returns Full benchmark report and optional baseline comparison.
 */
export async function runPrecisionBenchmark(
  dataset: BenchmarkDataset,
  adapter: BenchmarkSearchAdapter,
  baselinePath?: string,
): Promise<{ report: BenchmarkReport; baselineComparison: BaselineComparisonResult }> {
  const log = getLogger();

  log.info('memory-benchmark', 'benchmark_start', {
    pairs: dataset.pairs.length,
    corpus: dataset.corpus.length,
    topK: dataset.topK,
    threshold: dataset.passThreshold,
  });

  // Index corpus
  await adapter.indexCorpus(dataset.corpus);
  log.info('memory-benchmark', 'corpus_indexed', { count: dataset.corpus.length });

  // Run each query pair
  const queryResults: QueryPrecisionResult[] = [];

  for (const pair of dataset.pairs) {
    const queryStart = Date.now();
    let retrievedIds: string[] = [];

    try {
      retrievedIds = await adapter.search(pair.query, dataset.topK);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log.warn('memory-benchmark', 'query_failed', { pairId: pair.id, reason });
      // Failed query scores 0 — still recorded
    }

    const latencyMs = Date.now() - queryStart;
    const precision = calculatePrecisionAtK(retrievedIds, pair.expectedIds, dataset.topK);

    log.debug('memory-benchmark', 'query_complete', {
      pairId: pair.id,
      precision: precision.toFixed(3),
      latencyMs,
    });

    queryResults.push({
      pairId: pair.id,
      query: pair.query,
      category: pair.category,
      difficulty: pair.difficulty,
      expectedIds: pair.expectedIds,
      retrievedIds,
      precision,
      latencyMs,
    });
  }

  // Clean up adapter resources
  await adapter.cleanup();

  // Generate report
  const report = generateReport(queryResults, dataset.passThreshold, dataset.corpus.length);

  // Baseline comparison
  const baseline = baselinePath ? loadBaseline(baselinePath) : null;
  const baselineComparison = compareToBaseline(report.overallPrecision, baseline);

  if (baselineComparison.regressionWarning && baselineComparison.warningMessage) {
    log.warn('memory-benchmark', 'regression_warning', {
      message: baselineComparison.warningMessage,
    });
  }

  log.info('memory-benchmark', 'benchmark_complete', {
    overallPrecision: report.overallPrecision.toFixed(3),
    passed: report.passed,
    zeroScoreCount: report.zeroScoreFailures.length,
    avgLatencyMs: report.avgLatencyMs,
  });

  return { report, baselineComparison };
}

// ── Report formatting ─────────────────────────────────────────────────────────

/**
 * Format a benchmark report as a human-readable text summary.
 *
 * @param report - Completed benchmark report.
 * @param baselineComparison - Optional baseline comparison result.
 * @returns Multi-line text report suitable for CI logs and console output.
 */
export function formatBenchmarkReport(
  report: BenchmarkReport,
  baselineComparison?: BaselineComparisonResult,
): string {
  const lines: string[] = [];
  const passIcon = report.passed ? 'PASS' : 'FAIL';
  const precisionPct = (report.overallPrecision * 100).toFixed(1);
  const thresholdPct = (report.passThreshold * 100).toFixed(1);

  lines.push('=== Memory Precision Benchmark Report ===');
  lines.push(`Status:           ${passIcon}`);
  lines.push(`Overall Precision: ${precisionPct}% (threshold: ${thresholdPct}%)`);
  lines.push(`Queries Run:       ${report.queryResults.length}`);
  lines.push(`Corpus Size:       ${report.corpusSize} documents`);
  lines.push(`Total Latency:     ${report.totalLatencyMs}ms`);
  lines.push(`Avg Latency:       ${report.avgLatencyMs}ms/query`);
  lines.push(`Ran At:            ${report.ranAt}`);
  lines.push('');

  // Per-category breakdown
  lines.push('--- Precision by Category ---');
  for (const [cat, prec] of Object.entries(report.perCategory).sort()) {
    const pct = (prec * 100).toFixed(1);
    lines.push(`  ${cat.padEnd(24)} ${pct}%`);
  }
  lines.push('');

  // Per-difficulty breakdown
  lines.push('--- Precision by Difficulty ---');
  for (const [diff, prec] of Object.entries(report.perDifficulty).sort()) {
    const pct = (prec * 100).toFixed(1);
    lines.push(`  ${diff.padEnd(24)} ${pct}%`);
  }
  lines.push('');

  // Zero-score failures
  if (report.zeroScoreFailures.length > 0) {
    lines.push('--- Zero-Score Failures (no relevant result found) ---');
    for (const f of report.zeroScoreFailures) {
      lines.push(`  [${f.pairId}] ${f.query}`);
    }
    lines.push('');
  }

  // Baseline comparison
  if (baselineComparison?.baselineFound) {
    const deltaSign = baselineComparison.precisionDelta >= 0 ? '+' : '';
    const deltaPct = `${deltaSign}${(baselineComparison.precisionDelta * 100).toFixed(1)}pp`;
    lines.push(`--- Baseline Comparison ---`);
    lines.push(`  Precision delta: ${deltaPct}`);
    if (baselineComparison.regressionWarning && baselineComparison.warningMessage) {
      lines.push(`  WARNING: ${baselineComparison.warningMessage}`);
    }
    lines.push('');
  }

  // Failure message
  if (!report.passed) {
    const reasons: string[] = [];
    if (report.overallPrecision <= report.passThreshold) {
      reasons.push(`Precision ${precisionPct}% is at or below threshold ${thresholdPct}%`);
    }
    if (report.zeroScoreFailures.length > 0) {
      reasons.push(`${report.zeroScoreFailures.length} query(ies) scored 0.0 (no relevant result found)`);
    }
    lines.push(`BENCHMARK FAILED: ${reasons.join('; ')}`);
  }

  return lines.join('\n');
}

// ── Utility helpers ───────────────────────────────────────────────────────────

/**
 * Group an array of items by a key extraction function.
 *
 * @param items - Array to group.
 * @param keyFn - Function that returns the group key for each item.
 * @returns Object mapping keys to arrays of matching items.
 */
function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

/**
 * Resolve the default path for benchmark dataset fixture.
 * Used by CLI commands and integration tests when no explicit path is provided.
 *
 * @param fromDir - Base directory to resolve from (typically __dirname equivalent).
 * @returns Absolute path to the benchmark data JSON fixture.
 */
export function defaultDatasetPath(fromDir: string): string {
  return join(fromDir, '..', '__tests__', 'fixtures', 'memory-benchmark-data.json');
}

/**
 * Resolve the default path for the benchmark baseline file.
 *
 * @param fromDir - Base directory to resolve from.
 * @returns Absolute path to the baseline JSON file.
 */
export function defaultBaselinePath(fromDir: string): string {
  return join(fromDir, '..', '__tests__', 'fixtures', 'memory-benchmark-baseline.json');
}
