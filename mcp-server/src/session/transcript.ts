/**
 * Transcript Compaction Engine — records tool invocations and prunes old entries
 * to keep context windows manageable during long agent sessions.
 */

/** Maximum characters retained for a transcript entry's input field. */
const MAX_INPUT_LENGTH = 200;

/** Maximum characters retained for a transcript entry's output field. */
const MAX_OUTPUT_LENGTH = 500;

/**
 * A single recorded tool invocation within a session transcript.
 */
export interface TranscriptEntry {
  /** Name of the tool that was invoked. */
  toolName: string;
  /** Truncated input (first 200 chars). */
  input: string;
  /** Truncated output (first 500 chars). */
  output: string;
  /** ISO 8601 timestamp of when the invocation occurred. */
  timestamp: string;
  /** Input tokens consumed by this invocation. */
  inputTokens: number;
  /** Output tokens consumed by this invocation. */
  outputTokens: number;
}

/**
 * Result returned by a compaction operation.
 */
export interface CompactionResult {
  /** Number of entries that were pruned. */
  pruned: number;
  /** Number of entries retained after compaction. */
  retained: number;
}

/**
 * Serialized form of a TranscriptStore, used for persistence and restoration.
 */
export interface TranscriptStoreJSON {
  entries: TranscriptEntry[];
  compactedCount: number;
}

/**
 * Truncates a string to maxLength characters, appending '...' if truncated.
 *
 * @param text - The text to truncate.
 * @param maxLength - Maximum allowed length.
 * @returns The truncated string.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + '...';
}

/**
 * Creates a TranscriptEntry with truncated input/output fields.
 *
 * @param toolName - Name of the invoked tool.
 * @param input - Raw input string (will be truncated).
 * @param output - Raw output string (will be truncated).
 * @param inputTokens - Input tokens consumed.
 * @param outputTokens - Output tokens consumed.
 * @returns A fully populated TranscriptEntry.
 */
export function createTranscriptEntry(
  toolName: string,
  input: string,
  output: string,
  inputTokens: number,
  outputTokens: number,
): TranscriptEntry {
  return {
    toolName,
    input: truncate(input, MAX_INPUT_LENGTH),
    output: truncate(output, MAX_OUTPUT_LENGTH),
    timestamp: new Date().toISOString(),
    inputTokens,
    outputTokens,
  };
}

/**
 * Stores a rolling transcript of tool invocations and supports compaction
 * (pruning old entries) to keep context windows within budget.
 */
export class TranscriptStore {
  private entries: TranscriptEntry[] = [];
  private compactedCount: number = 0;

  /**
   * Appends a transcript entry to the store.
   *
   * @param entry - The TranscriptEntry to record.
   */
  append(entry: TranscriptEntry): void {
    this.entries.push(entry);
  }

  /**
   * Compacts the transcript by pruning old entries, keeping only the latest N.
   * If the current entry count is at or below keepLast, no pruning occurs.
   *
   * @param keepLast - Number of most-recent entries to retain.
   * @returns A CompactionResult with the number of pruned and retained entries.
   */
  compact(keepLast: number): CompactionResult {
    if (this.entries.length <= keepLast) {
      return { pruned: 0, retained: this.entries.length };
    }

    const pruned = this.entries.length - keepLast;
    this.entries = this.entries.slice(-keepLast);
    this.compactedCount += pruned;

    return { pruned, retained: this.entries.length };
  }

  /**
   * Returns a shallow copy of all current transcript entries.
   *
   * @returns Array of TranscriptEntry objects.
   */
  replay(): TranscriptEntry[] {
    return [...this.entries];
  }

  /**
   * Returns the number of entries currently in the store.
   *
   * @returns Current entry count.
   */
  size(): number {
    return this.entries.length;
  }

  /**
   * Returns the total number of entries pruned across all compactions.
   *
   * @returns Cumulative pruned entry count.
   */
  totalCompacted(): number {
    return this.compactedCount;
  }

  /**
   * Serializes the store to a plain object for persistence.
   *
   * @returns A TranscriptStoreJSON object.
   */
  toJSON(): TranscriptStoreJSON {
    return {
      entries: [...this.entries],
      compactedCount: this.compactedCount,
    };
  }

  /**
   * Restores a TranscriptStore from a previously serialized JSON object.
   *
   * @param data - The serialized TranscriptStoreJSON to restore from.
   * @returns A new TranscriptStore populated with the restored data.
   */
  static fromJSON(data: TranscriptStoreJSON): TranscriptStore {
    const store = new TranscriptStore();
    store.entries = [...data.entries];
    store.compactedCount = data.compactedCount;
    return store;
  }
}
