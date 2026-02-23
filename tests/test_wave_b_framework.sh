#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[TEST] memory sync json contract"
TMP_FW=$(mktemp -d)
TMP_PROJ=$(mktemp -d)
mkdir -p "$TMP_FW/scripts" "$TMP_FW/memory_bank/knowledge" "$TMP_PROJ/memory_bank/knowledge"
cp scripts/harvest.sh "$TMP_FW/scripts/harvest.sh"
cp scripts/memory.sh "$TMP_FW/scripts/memory.sh"
cp scripts/registry.sh "$TMP_FW/scripts/registry.sh"
chmod +x "$TMP_FW/scripts/harvest.sh" "$TMP_FW/scripts/memory.sh" "$TMP_FW/scripts/registry.sh"

cat > "$TMP_FW/memory_bank/knowledge/bootstrap.jsonl" << 'JEOF'
{"id":"b1","type":"fact","content":"Universal bootstrap entry","weight":0.9,"tags":["global"],"scope":"universal"}
JEOF
cat > "$TMP_FW/memory_bank/knowledge/decisions-universal.jsonl" << 'JEOF'
{"id":"u1","type":"decision","content":"Always run smoke tests before release","weight":0.8,"tags":["quality"],"scope":"universal"}
JEOF
cat > "$TMP_PROJ/memory_bank/knowledge/decisions.jsonl" << JEOF
{"id":"p1","type":"decision","content":"Use queue retries for workers test-$RANDOM","weight":0.7,"tags":["queue"]}
JEOF

SYNC_JSON=$(FORCE=true FRAMEWORK_DIR="$TMP_FW" MEMORY_BANK_DIR="$TMP_PROJ/memory_bank" bash scripts/memory.sh sync "$TMP_PROJ" --json)
echo "$SYNC_JSON" | jq -e '.status == "ok" and .pull and .push and .pull.new_entries >= 1 and .push.harvested >= 1' >/dev/null

echo "[TEST] swarm complete handoff writes scratchpad note"
TMP_SWARM=$(mktemp -d)
QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh init >/dev/null
QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh add --id=TASK-B --story=story-b >/dev/null
QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh claim --id=TASK-B --agent=coder >/dev/null
QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh start --id=TASK-B >/dev/null
QUEUE_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-queue.sh complete --id=TASK-B --handoff-to=tester --result='{"summary":"done"}' >/dev/null
SWARM_DIR="$TMP_SWARM/.claude/swarm" bash parallel/swarm-scratchpad.sh read --for=tester --unread --json | jq -e '.notes | length >= 1 and .[0].task_id == "TASK-B" and .[0].priority == "high"' >/dev/null

rm -rf "$TMP_FW" "$TMP_PROJ" "$TMP_SWARM"

echo "[PASS] wave b framework tests passed"
