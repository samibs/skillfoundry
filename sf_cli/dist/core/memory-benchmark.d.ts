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
import type { VectorStore } from './vector-store.js';
import type { MemoryDocument } from './vector-store.js';
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
    zeroScoreFailures: Array<{
        pairId: string;
        query: string;
    }>;
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
export declare function calculatePrecisionAtK(retrievedIds: string[], expectedIds: string[], topK: number): number;
/**
 * Load and validate the benchmark dataset from a JSON file.
 *
 * @param datasetPath - Absolute path to the benchmark data JSON file.
 * @returns Parsed and validated BenchmarkDataset.
 * @throws Error when the file does not exist, cannot be parsed, or fails validation.
 */
export declare function loadBenchmarkDataset(datasetPath: string): BenchmarkDataset;
/**
 * Validate dataset structural integrity.
 * Ensures all query pairs reference IDs that exist in the corpus.
 *
 * @param dataset - Loaded dataset to validate.
 * @throws Error with detailed message when validation fails.
 */
export declare function validateDataset(dataset: BenchmarkDataset): void;
/**
 * Aggregate per-query results into a full benchmark report.
 *
 * @param queryResults - Array of per-query precision results.
 * @param passThreshold - Required minimum overall precision.
 * @param corpusSize - Number of documents indexed for the benchmark.
 * @returns Fully populated BenchmarkReport.
 */
export declare function generateReport(queryResults: QueryPrecisionResult[], passThreshold: number, corpusSize: number): BenchmarkReport;
/**
 * Load the stored baseline precision file.
 *
 * @param baselinePath - Absolute path to the baseline JSON file.
 * @returns Parsed baseline, or null if file does not exist.
 */
export declare function loadBaseline(baselinePath: string): BenchmarkBaseline | null;
/**
 * Save the current benchmark report as the new baseline.
 * Baseline is updated manually — this function should only be called
 * by developers who have reviewed and approved the current benchmark results.
 *
 * @param report - The benchmark report to save as baseline.
 * @param baselinePath - Absolute path where the baseline JSON will be written.
 */
export declare function saveBaseline(report: BenchmarkReport, baselinePath: string): void;
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
export declare function compareToBaseline(currentPrecision: number, baseline: BenchmarkBaseline | null): BaselineComparisonResult;
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
export declare class VectorStoreBenchmarkAdapter implements BenchmarkSearchAdapter {
    private readonly store;
    /**
     * @param store - An initialized VectorStore instance.
     */
    constructor(store: VectorStore);
    /**
     * Index corpus documents into the vector store using real embeddings.
     * @param corpus - Corpus documents to embed and store.
     */
    indexCorpus(corpus: CorpusDocument[]): Promise<void>;
    /**
     * Run semantic similarity search against the indexed corpus.
     * @param query - Query text.
     * @param topK - Number of top results.
     * @returns Ordered document IDs.
     */
    search(query: string, topK: number): Promise<string[]>;
    /**
     * No-op cleanup for VectorStoreBenchmarkAdapter.
     * The caller is responsible for managing the VectorStore lifecycle.
     */
    cleanup(): Promise<void>;
}
/**
 * TF-IDF benchmark adapter using keyword-based scoring.
 * Works without any embedding provider — suitable for unit testing.
 */
export declare class TfIdfBenchmarkAdapter implements BenchmarkSearchAdapter {
    private corpus;
    /**
     * Store corpus documents in memory for TF-IDF search.
     * @param corpus - Corpus documents to index.
     */
    indexCorpus(corpus: CorpusDocument[]): Promise<void>;
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
    search(query: string, topK: number): Promise<string[]>;
    /**
     * Clear the in-memory corpus.
     */
    cleanup(): Promise<void>;
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
export declare function runPrecisionBenchmark(dataset: BenchmarkDataset, adapter: BenchmarkSearchAdapter, baselinePath?: string): Promise<{
    report: BenchmarkReport;
    baselineComparison: BaselineComparisonResult;
}>;
/**
 * Format a benchmark report as a human-readable text summary.
 *
 * @param report - Completed benchmark report.
 * @param baselineComparison - Optional baseline comparison result.
 * @returns Multi-line text report suitable for CI logs and console output.
 */
export declare function formatBenchmarkReport(report: BenchmarkReport, baselineComparison?: BaselineComparisonResult): string;
/**
 * Resolve the default path for benchmark dataset fixture.
 * Used by CLI commands and integration tests when no explicit path is provided.
 *
 * @param fromDir - Base directory to resolve from (typically __dirname equivalent).
 * @returns Absolute path to the benchmark data JSON fixture.
 */
export declare function defaultDatasetPath(fromDir: string): string;
/**
 * Resolve the default path for the benchmark baseline file.
 *
 * @param fromDir - Base directory to resolve from.
 * @returns Absolute path to the baseline JSON file.
 */
export declare function defaultBaselinePath(fromDir: string): string;
