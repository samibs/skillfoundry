---
story_id: STORY-005
title: Transcript Compaction Engine
phase: 2
priority: MUST
complexity: medium
depends_on: [STORY-004]
blocks: []
layers: [backend]
---

# STORY-005: Transcript Compaction Engine

## Objective

Implement a TranscriptStore that tracks tool invocation history per session and automatically compacts old entries when the threshold is exceeded.

## Technical Approach

### 1. Create TranscriptStore

Create `src/session/transcript.ts`:

```typescript
export interface TranscriptEntry {
  toolName: string;
  input: string;           // Truncated input (first 200 chars)
  output: string;          // Truncated output (first 500 chars)
  timestamp: string;       // ISO 8601
  inputTokens: number;
  outputTokens: number;
}

export class TranscriptStore {
  private entries: TranscriptEntry[] = [];
  private compactedCount: number = 0;

  append(entry: TranscriptEntry): void {
    this.entries.push(entry);
  }

  compact(keepLast: number): { pruned: number; retained: number } {
    if (this.entries.length <= keepLast) {
      return { pruned: 0, retained: this.entries.length };
    }
    const pruned = this.entries.length - keepLast;
    this.entries = this.entries.slice(-keepLast);
    this.compactedCount += pruned;
    return { pruned, retained: this.entries.length };
  }

  replay(): TranscriptEntry[] {
    return [...this.entries];
  }

  size(): number {
    return this.entries.length;
  }

  totalCompacted(): number {
    return this.compactedCount;
  }

  toJSON(): object {
    return {
      entries: this.entries,
      compactedCount: this.compactedCount,
    };
  }

  static fromJSON(data: { entries: TranscriptEntry[]; compactedCount: number }): TranscriptStore {
    const store = new TranscriptStore();
    store.entries = data.entries;
    store.compactedCount = data.compactedCount;
    return store;
  }
}
```

### 2. Integrate with SessionEngine

Add to `src/session/engine.ts`:
- TranscriptStore as a member of SessionEngine
- `recordTurn()` also appends to transcript
- `needsCompaction()` checks transcript size against config
- `runCompaction()` calls `transcript.compact(config.compactAfterTurns)`
- Auto-compact after every turn if threshold exceeded

### 3. Logging

Compaction events logged with:
- Entries pruned count
- Entries retained count
- Session ID
- Timestamp

## Acceptance Criteria

```gherkin
Given a TranscriptStore with 25 entries and compactAfterTurns=20
When compact(20) is called
Then 5 entries are pruned, 20 are retained
And the retained entries are the MOST RECENT 20

Given a session with compactAfterTurns=10
When the 11th tool is executed
Then compaction runs automatically
And the transcript has 10 entries (the latest 10)

Given a TranscriptStore serialized to JSON
When fromJSON is called with that data
Then the store is fully restored with entries and compactedCount

Given compact is called when entries <= keepLast
Then nothing is pruned and the store is unchanged
```

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `src/session/transcript.ts` | TranscriptStore implementation |
| MODIFY | `src/session/engine.ts` | Integrate transcript + auto-compaction |
