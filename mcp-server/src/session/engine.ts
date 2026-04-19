/**
 * SessionEngine — orchestrates turn execution, budget tracking, and compaction signals.
 */

import { randomUUID } from 'node:crypto';
import { type SessionConfig, createSessionConfig } from './config.js';
import { type UsageSummary, createUsageSummary, addTurn } from './usage.js';
import {
  type CompactionResult,
  type TranscriptStoreJSON,
  TranscriptStore,
  createTranscriptEntry,
} from './transcript.js';
import { type StoredSession, saveSession, loadSession } from './persistence.js';

/** Reasons a session may be stopped. */
export type StopReason = 'completed' | 'max_turns_reached' | 'max_budget_reached';

/** Result of a canExecute() check. */
export interface ExecuteCheck {
  allowed: boolean;
  reason?: StopReason;
}

/**
 * Manages a single agent session's lifecycle: turn counting, token budget,
 * and compaction signaling.
 */
export class SessionEngine {
  /** Unique identifier for this session. */
  public readonly sessionId: string;

  /** ISO timestamp of when this session was created. */
  public readonly createdAt: string;

  private config: SessionConfig;
  private usage: UsageSummary;
  private transcript: TranscriptStore;

  /**
   * Creates a new SessionEngine.
   *
   * @param config - Session configuration. Uses env-based defaults if omitted.
   * @param sessionId - Optional session ID. A UUID is generated if omitted.
   */
  constructor(config?: SessionConfig, sessionId?: string) {
    this.config = config ?? createSessionConfig();
    this.sessionId = sessionId ?? randomUUID();
    this.createdAt = new Date().toISOString();
    this.usage = createUsageSummary();
    this.transcript = new TranscriptStore();
  }

  /**
   * Checks whether the session is allowed to execute another turn.
   *
   * @returns An ExecuteCheck indicating whether execution is allowed,
   *          and the reason if it is not.
   */
  canExecute(): ExecuteCheck {
    if (this.usage.turnCount >= this.config.maxTurns) {
      return { allowed: false, reason: 'max_turns_reached' };
    }
    if (this.usage.totalTokens >= this.config.maxBudgetTokens) {
      return { allowed: false, reason: 'max_budget_reached' };
    }
    return { allowed: true };
  }

  /**
   * Records a completed turn's token usage and appends a transcript entry.
   * Automatically triggers compaction when the turn count exceeds the threshold.
   *
   * @param inputTokens - Input tokens consumed in this turn.
   * @param outputTokens - Output tokens consumed in this turn.
   * @param toolName - Name of the tool invoked (defaults to 'unknown').
   * @param input - Raw input string for the transcript (will be truncated).
   * @param output - Raw output string for the transcript (will be truncated).
   */
  recordTurn(
    inputTokens: number,
    outputTokens: number,
    toolName: string = 'unknown',
    input: string = '',
    output: string = '',
  ): void {
    this.usage = addTurn(this.usage, inputTokens, outputTokens);

    const entry = createTranscriptEntry(toolName, input, output, inputTokens, outputTokens);
    this.transcript.append(entry);

    if (this.needsCompaction()) {
      this.runCompaction();
    }
  }

  /**
   * Returns a copy of the current usage summary.
   *
   * @returns A snapshot of the current UsageSummary.
   */
  getUsage(): UsageSummary {
    return { ...this.usage };
  }

  /**
   * Returns the current turn count.
   *
   * @returns Number of turns recorded so far.
   */
  getTurnCount(): number {
    return this.usage.turnCount;
  }

  /**
   * Returns a copy of the session configuration.
   *
   * @returns A snapshot of the SessionConfig.
   */
  getConfig(): SessionConfig {
    return { ...this.config };
  }

  /**
   * Checks whether the session has exceeded the compaction threshold.
   *
   * @returns True if turnCount exceeds compactAfterTurns.
   */
  needsCompaction(): boolean {
    return this.usage.turnCount > this.config.compactAfterTurns;
  }

  /**
   * Runs transcript compaction, pruning old entries to keep only the most recent
   * entries up to the configured compactAfterTurns limit.
   * Logs the compaction result to stderr for observability.
   *
   * @returns The CompactionResult with pruned and retained counts.
   */
  runCompaction(): CompactionResult {
    const result = this.transcript.compact(this.config.compactAfterTurns);
    if (result.pruned > 0) {
      process.stderr.write(
        `[skillfoundry] transcript compaction: pruned=${result.pruned} retained=${result.retained} totalCompacted=${this.transcript.totalCompacted()}\n`,
      );
    }
    return result;
  }

  /**
   * Returns the transcript store for inspection or serialization.
   *
   * @returns The session's TranscriptStore instance.
   */
  getTranscript(): TranscriptStore {
    return this.transcript;
  }

  /**
   * Persists the session state to disk as a JSON file.
   *
   * Serializes usage counters, turn count, transcript, and timestamps
   * into the configured persist directory.
   *
   * @returns The absolute path of the written session file.
   */
  persist(): string {
    const stored: StoredSession = {
      sessionId: this.sessionId,
      inputTokens: this.usage.inputTokens,
      outputTokens: this.usage.outputTokens,
      turnCount: this.usage.turnCount,
      createdAt: this.createdAt,
      lastActive: new Date().toISOString(),
      transcript: this.transcript.toJSON(),
    };
    return saveSession(stored, this.config.persistDirectory);
  }

  /**
   * Resumes a previously persisted session from disk.
   *
   * Restores usage counters, turn count, transcript entries, and the
   * original createdAt timestamp. The session continues with the
   * provided configuration (or env-based defaults).
   *
   * @param sessionId - The session ID to resume.
   * @param config - Session configuration to apply. Uses env-based defaults if omitted.
   * @returns A fully restored SessionEngine, or null if the session file was not found.
   */
  static resume(sessionId: string, config?: SessionConfig): SessionEngine | null {
    const resolvedConfig = config ?? createSessionConfig();
    const stored = loadSession(sessionId, resolvedConfig.persistDirectory);
    if (!stored) {
      return null;
    }

    const engine = new SessionEngine(resolvedConfig, stored.sessionId);

    // Restore createdAt from persisted state (override constructor default)
    (engine as { createdAt: string }).createdAt = stored.createdAt;

    // Restore usage counters by replaying the stored totals
    engine.usage = {
      inputTokens: stored.inputTokens,
      outputTokens: stored.outputTokens,
      totalTokens: stored.inputTokens + stored.outputTokens,
      turnCount: stored.turnCount,
    };

    // Restore transcript from serialized form
    const transcriptData = stored.transcript as TranscriptStoreJSON;
    if (transcriptData && Array.isArray(transcriptData.entries)) {
      engine.transcript = TranscriptStore.fromJSON(transcriptData);
    }

    return engine;
  }
}
