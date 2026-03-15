# /recall — Layered Knowledge Recall

> Progressive disclosure search across the memory bank. Three modes: index, preview, full.

## Usage

```
/recall "query"                          Search and show compact index
/recall "query" --type=decision          Filter by entry type
/recall "query" --min-weight=0.7         Filter by minimum weight
/recall "query" --since=7d               Filter by recency
/recall "query" --tags=auth,security     Filter by tags
/recall --preview id1,id2,id3            Show content summaries for specific entries
/recall --full id1,id2                   Show complete entries with all fields
```

## How It Works

### Step 1: Index Mode (default)

When you run `/recall "query"`, search all `memory_bank/knowledge/*.jsonl` files and return a compact index:

| ID | Type | Score | Weight | Content |
|----|------|-------|--------|---------|
| abcdef12 | decision | 130 | 0.9 | "Standalone agentic loop with zero React deps..." |
| 12345678 | fact | 85 | 0.7 | "Pipeline engine is 6-phase: IGNITE→PLAN→FORGE..." |

**Scoring** (matches `semantic-search.sh` algorithm):
- Exact phrase match: +100
- Individual word match (>2 chars): +10 per word
- Type field match: +20
- Weight bonus: +10 * weight
- Tags match: +5 per word

**Filters** (combinable):
- `--type=decision|fact|error|preference|pattern`
- `--min-weight=0.7` (0.0 to 1.0)
- `--since=7d|30d|4w|2026-03-01`
- `--tags=auth,security` (match any)
- `--limit=10` (default: 20)

Max 20 results. Total output: ~400 tokens.

### Step 2: Preview Mode

After seeing the index, selectively expand entries:

```
/recall --preview abcdef12,12345678
```

Returns first 200 chars of content + metadata (type, weight, tags, created date).
Total output: ~600 tokens.

### Step 3: Full Mode

For entries you need complete detail:

```
/recall --full abcdef12
```

Returns complete canonical entry with all fields (content, tags, weight, lineage, reality_anchor, context).

## Implementation

The search engine is `sf_cli/src/core/layered-recall.ts` with three functions:
- `recallIndex(query, workDir, filters)` — compact search results
- `recallPreview(ids, workDir)` — content summaries
- `recallFull(ids, workDir)` — complete entries

For shell-based recall, use `scripts/semantic-search.sh` which provides equivalent scoring.

## When To Use

- **Starting a new task**: `/recall "auth"` to see what the memory bank knows about auth
- **Before making decisions**: `/recall "migration" --type=decision` to see past decisions
- **Debugging**: `/recall "error" --type=error --since=7d` to see recent errors
- **Deep dive**: `/recall --full <id>` after finding a relevant entry in the index

## Integration

- Works alongside `/memory` (curator persona) and `/gohm` (harvester)
- `/recall` is for quick retrieval; `/memory search` is for curator-guided exploration
- Auto-harvested entries are immediately searchable via `/recall`
