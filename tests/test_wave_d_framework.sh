#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[TEST] escalation auto-capture creates decision entry with lineage"
TMP_PROJ=$(mktemp -d)
CAP_JSON=$(CLAUDE_AS_NOTIFY_DISABLE=1 bash scripts/escalation-capture.sh capture \
  --project="$TMP_PROJ" \
  --agent=gate-keeper \
  --question="Use JWT or opaque token?" \
  --decision="Use opaque token with revocation" \
  --context="Auth reset flow ambiguity" \
  --reviewer="tech-lead" \
  --annotation="Prefer revocation support" \
  --json)
echo "$CAP_JSON" | jq -e '.status == "ok" and .agent == "gate-keeper" and (.context_summary|length > 5)' >/dev/null
jq -e '.type == "decision" and .lineage.agent == "gate-keeper" and (.lineage.context_summary|length > 5)' "$TMP_PROJ/memory_bank/knowledge/decisions.jsonl" >/dev/null


echo "[TEST] go dry-run does not mutate workspace"
TMP_GO=$(mktemp -d)
mkdir -p "$TMP_GO/scripts" "$TMP_GO/docs/stories/framework-evolution" "$TMP_GO/genesis"
cp scripts/go-framework.sh "$TMP_GO/scripts/go-framework.sh"
cp scripts/anvil.sh "$TMP_GO/scripts/anvil.sh"
cp scripts/notify.sh "$TMP_GO/scripts/notify.sh"
cp docs/stories/framework-evolution/STORY-*.md "$TMP_GO/docs/stories/framework-evolution/"
cp genesis/2026-02-07-framework-evolution.md "$TMP_GO/genesis/"
chmod +x "$TMP_GO/scripts/go-framework.sh" "$TMP_GO/scripts/anvil.sh" "$TMP_GO/scripts/notify.sh"

pushd "$TMP_GO" >/dev/null
BEFORE=$(find . -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')
CLAUDE_AS_NOTIFY_DISABLE=1 bash scripts/go-framework.sh dry-run --json >/tmp/wave_d_dry.json
cat /tmp/wave_d_dry.json | jq -e '.status=="ok" and .mode=="dry-run" and .summary.mutations==false and .summary.story_count >= 1' >/dev/null
AFTER=$(find . -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')
[ "$BEFORE" = "$AFTER" ]
popd >/dev/null


echo "[TEST] go review-only report contract"
set +e
REV_JSON=$(CLAUDE_AS_NOTIFY_DISABLE=1 bash scripts/go-framework.sh review-only --json)
REV_RC=$?
set -e
if [ "$REV_RC" -ne 0 ] && [ "$REV_RC" -ne 2 ]; then
  echo "Unexpected review-only exit code: $REV_RC" >&2
  exit 1
fi
echo "$REV_JSON" | jq -e '.mode=="review-only" and .summary.finding_count >= 0 and (.status=="pass" or .status=="warn" or .status=="fail")' >/dev/null


echo "[TEST] dashboard includes escalation read-state"
mkdir -p .claude
jq -nc --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{timestamp:$ts,agent:"tester",question:"q",decision:"d",id:"e1"}' > .claude/escalations.jsonl
DASH_OUT=$(bash scripts/dashboard.sh --once)
echo "$DASH_OUT" | grep -q "Escalations"

rm -rf "$TMP_PROJ" "$TMP_GO" /tmp/wave_d_dry.json
rm -f .claude/escalations.jsonl

echo "[PASS] wave d framework tests passed"
