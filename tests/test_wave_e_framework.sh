#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[TEST] PRD diff maps FR changes to impacted stories"
TMP_DIFF=$(mktemp -d)
mkdir -p "$TMP_DIFF/scripts" "$TMP_DIFF/docs/stories/framework-evolution" "$TMP_DIFF/genesis"
cp scripts/go-framework.sh "$TMP_DIFF/scripts/go-framework.sh"
cp scripts/anvil.sh "$TMP_DIFF/scripts/anvil.sh"
cp scripts/notify.sh "$TMP_DIFF/scripts/notify.sh"
cp docs/stories/framework-evolution/STORY-*.md "$TMP_DIFF/docs/stories/framework-evolution/"
cp genesis/2026-02-07-framework-evolution.md "$TMP_DIFF/genesis/"
chmod +x "$TMP_DIFF/scripts/go-framework.sh" "$TMP_DIFF/scripts/anvil.sh" "$TMP_DIFF/scripts/notify.sh"

pushd "$TMP_DIFF" >/dev/null
git init >/dev/null
git config user.email "test@example.com"
git config user.name "wave-e-test"
git add .
git commit -m "baseline" >/dev/null
echo "\nFR-039 regression test marker" >> genesis/2026-02-07-framework-evolution.md
DIFF_JSON=$(CLAUDE_AS_NOTIFY_DISABLE=1 bash scripts/go-framework.sh prd-diff --prd=genesis/2026-02-07-framework-evolution.md --base=HEAD --json)
echo "$DIFF_JSON" | jq -e 'any(.impacted_stories[]; .story_id=="STORY-011")' >/dev/null


echo "[TEST] incremental run skips completed impacted stories"
CLAUDE_AS_NOTIFY_DISABLE=1 bash scripts/go-framework.sh mark-complete --story=STORY-011 >/dev/null
INC_JSON=$(CLAUDE_AS_NOTIFY_DISABLE=1 bash scripts/go-framework.sh incremental --prd=genesis/2026-02-07-framework-evolution.md --base=HEAD --json)
echo "$INC_JSON" | jq -e 'any(.skipped[]; .story_id=="STORY-011" and .reason=="already_completed")' >/dev/null
popd >/dev/null


echo "[TEST] semantic search relevance smoke"
TMP_SEM=$(mktemp -d)
mkdir -p "$TMP_SEM/memory_bank/knowledge"
cat > "$TMP_SEM/memory_bank/knowledge/decisions.jsonl" <<'JEOF'
{"id":"s1","type":"decision","content":"Authentication uses opaque tokens with revocation list","weight":0.9,"tags":["auth","security"]}
{"id":"s2","type":"decision","content":"Queue workers use deterministic retry policy","weight":0.6,"tags":["queue"]}
JEOF
SEM_JSON=$(MEMORY_BANK="$TMP_SEM/memory_bank" PROJECT_MEMORY="$TMP_SEM/memory_bank" bash scripts/semantic-search.sh "auth token revocation" --json --limit=3)
echo "$SEM_JSON" | jq -e '.total >= 1 and .results[0].score >= 1' >/dev/null


echo "[TEST] compliance scan reports additive baseline + secret/dependency checks"
TMP_COMP=$(mktemp -d)
cat > "$TMP_COMP/app.js" <<'JEOF'
const api_key = "SUPERSECRET123456";
JEOF
COMP_JSON=$(bash scripts/advanced-ops.sh compliance --profile=gdpr --project="$TMP_COMP" --json)
echo "$COMP_JSON" | jq -e '.baseline_rules and .secret_scan and .dependency_scan and .secret_scan.findings >= 1' >/dev/null


echo "[TEST] monorepo order integration"
TMP_MONO=$(mktemp -d)
mkdir -p "$TMP_MONO/packages/pkg-a" "$TMP_MONO/packages/pkg-b"
cat > "$TMP_MONO/packages/pkg-a/package.json" <<'JEOF'
{"name":"pkg-a","version":"1.0.0","dependencies":{"@scope/pkg-b":"workspace:*"}}
JEOF
cat > "$TMP_MONO/packages/pkg-b/package.json" <<'JEOF'
{"name":"pkg-b","version":"1.0.0"}
JEOF
MONO_JSON=$(bash scripts/advanced-ops.sh monorepo-order --root="$TMP_MONO" --json)
echo "$MONO_JSON" | jq -e '.total == 2 and (.order | length) == 2' >/dev/null


echo "[TEST] metrics trend delta calculation"
TMP_COST=$(mktemp -d)
cat > "$TMP_COST/usage.jsonl" <<'JEOF'
{"agent":"coder","story":"STORY-001","tokens":100,"phase":"impl","timestamp":"2026-02-20T01:00:00Z"}
{"agent":"tester","story":"STORY-001","tokens":50,"phase":"test","timestamp":"2026-02-20T02:00:00Z"}
{"agent":"coder","story":"STORY-002","tokens":220,"phase":"impl","timestamp":"2026-02-21T01:00:00Z"}
JEOF
TREND_JSON=$(bash scripts/advanced-ops.sh metrics-trend --file="$TMP_COST/usage.jsonl" --json)
echo "$TREND_JSON" | jq -e '.summary.latest == 220 and .summary.previous == 150 and .summary.delta == 70' >/dev/null


echo "[TEST] template inheritance generation"
TMP_TPL=$(mktemp -d)
cat > "$TMP_TPL/base.md" <<'JEOF'
# Base Template
## Shared Section
JEOF
cat > "$TMP_TPL/overlay.md" <<'JEOF'
## Overlay Section
- auth enabled
JEOF
OUT_FILE="$TMP_TPL/generated.md"
TPL_JSON=$(bash scripts/advanced-ops.sh template-inherit --base="$TMP_TPL/base.md" --overlay="$TMP_TPL/overlay.md" --out="$OUT_FILE" --json)
echo "$TPL_JSON" | jq -e '.status=="ok" and .output == "'"$OUT_FILE"'"' >/dev/null
grep -q "Base Template" "$OUT_FILE"
grep -q "Overlay Section" "$OUT_FILE"

rm -rf "$TMP_DIFF" "$TMP_SEM" "$TMP_COMP" "$TMP_MONO" "$TMP_COST" "$TMP_TPL"

echo "[PASS] wave e framework tests passed"
