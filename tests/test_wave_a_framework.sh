#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[TEST] harvest status json"
HARVEST_JSON=$(bash scripts/harvest.sh --status --json)
echo "$HARVEST_JSON" | jq -e '.status == "ok" and .decisions and .errors and .patterns and .bootstrap' >/dev/null

echo "[TEST] harvest project json output"
TMP_PROJECT=$(mktemp -d)
mkdir -p "$TMP_PROJECT/memory_bank/knowledge"
cat > "$TMP_PROJECT/memory_bank/knowledge/decisions.jsonl" << JEOF
{"id":"d1","type":"decision","content":"Use deterministic retries for queue workers run-$RANDOM","weight":0.7,"tags":["queue","reliability"]}
JEOF
HARVEST_PROJECT_JSON=$(bash scripts/harvest.sh "$TMP_PROJECT" --json)
echo "$HARVEST_PROJECT_JSON" | jq -e '.status == "ok" and .harvested >= 1' >/dev/null
rm -rf "$TMP_PROJECT"

echo "[TEST] swarm queue init/add dedupe under lock"
TMP_SWARM=$(mktemp -d)
QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh init >/dev/null
QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh add --id=STORY-LOCK --story=wave-a >/dev/null
QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh add --id=STORY-LOCK --story=wave-a >/dev/null
QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh status --json | jq -e '.total == 1 and .queued == 1' >/dev/null

echo "[TEST] swarm queue recover compacts invalid/duplicate lines"
QUEUE_FILE="$TMP_SWARM/.claude/swarm/task-queue.jsonl"
{
  echo '{"id":"X","story_id":"s","status":"queued","claimed_by":"","claimed_at":"","started_at":"","completed_at":"","dependencies":[],"files_touched":[],"retry_count":0,"max_retries":3,"block_reason":"","fail_reason":"","result":{},"created_at":"2026-02-23T00:00:00Z"}'
  echo 'NOT JSON'
  echo '{"id":"X","story_id":"s","status":"claimed","claimed_by":"coder","claimed_at":"2026-02-23T00:00:01Z","started_at":"","completed_at":"","dependencies":[],"files_touched":[],"retry_count":0,"max_retries":3,"block_reason":"","fail_reason":"","result":{},"created_at":"2026-02-23T00:00:00Z"}'
} >> "$QUEUE_FILE"

RECOVERY_JSON=$(QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh recover --json)
echo "$RECOVERY_JSON" | jq -e '.invalid_removed >= 1 and .duplicates_compacted >= 1' >/dev/null
QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh status --json | jq -e '.total >= 2' >/dev/null
rm -rf "$TMP_SWARM"

echo "[PASS] wave a framework tests passed"
