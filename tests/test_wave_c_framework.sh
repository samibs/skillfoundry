#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[TEST] dedup signature + promotion review queue"
TMP_FW=$(mktemp -d)
mkdir -p "$TMP_FW/scripts"
cp scripts/harvest.sh "$TMP_FW/scripts/harvest.sh"
cp scripts/registry.sh "$TMP_FW/scripts/registry.sh"
chmod +x "$TMP_FW/scripts/harvest.sh" "$TMP_FW/scripts/registry.sh"

TMP_P1=$(mktemp -d)
TMP_P2=$(mktemp -d)
mkdir -p "$TMP_P1/memory_bank/knowledge" "$TMP_P2/memory_bank/knowledge"
cat > "$TMP_P1/memory_bank/knowledge/decisions.jsonl" << 'JEOF'
{"id":"d1","type":"decision","content":"Use deterministic retries for queue workers.","weight":0.7,"tags":["queue"]}
JEOF
cat > "$TMP_P2/memory_bank/knowledge/decisions.jsonl" << 'JEOF'
{"id":"d2","type":"decision","content":"use   deterministic retries for queue workers.","weight":0.7,"tags":["queue"]}
JEOF

bash "$TMP_FW/scripts/harvest.sh" "$TMP_P1" --json >/dev/null
bash "$TMP_FW/scripts/harvest.sh" "$TMP_P2" --json >/dev/null
DECISIONS_FILE="$TMP_FW/memory_bank/knowledge/decisions-universal.jsonl"
[[ -f "$DECISIONS_FILE" ]]
[[ "$(wc -l < "$DECISIONS_FILE" | tr -d ' ')" == "1" ]]
jq -e '.promotion_count >= 2 and (.signature|length > 10)' "$DECISIONS_FILE" >/dev/null

bash "$TMP_FW/scripts/harvest.sh" --promote >/dev/null
REVIEW_FILE="$TMP_FW/memory_bank/knowledge/promotion-review.jsonl"
[[ -f "$REVIEW_FILE" ]]
[[ "$(wc -l < "$REVIEW_FILE" | tr -d ' ')" -ge "1" ]]

rm -rf "$TMP_P1" "$TMP_P2" "$TMP_FW"

echo "[TEST] conflict detection fallback to wave mode"
TMP_SWARM=$(mktemp -d)
QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh init >/dev/null
QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh add --id=TASK-1 --story=s1 --files=src/a.txt >/dev/null
QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh add --id=TASK-2 --story=s2 --files=src/a.txt >/dev/null
QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh claim --id=TASK-1 --agent=coder >/dev/null
QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh start --id=TASK-1 >/dev/null
if QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh claim --id=TASK-2 --agent=tester >/dev/null 2>&1; then
  echo "Expected claim conflict failure did not occur" >&2
  exit 1
fi
QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh status --json | jq -e '.mode == "wave"' >/dev/null

# complete should release conflict-detector locks
QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh complete --id=TASK-1 >/dev/null
SWARM_DIR="$TMP_SWARM/.claude/swarm" bash parallel/conflict-detector.sh list --json | jq -e '.locks | length == 0' >/dev/null

rm -rf "$TMP_SWARM"

echo "[PASS] wave c framework tests passed"
