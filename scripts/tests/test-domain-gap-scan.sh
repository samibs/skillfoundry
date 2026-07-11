#!/usr/bin/env bash
# test-domain-gap-scan.sh — Phase 2 triggers (FR-012 behavioral, FR-013 declared)
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAN="$SCRIPT_DIR/../domain-gap-scan.sh"
PASS=0; FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
check(){ if eval "$2"; then ok "$1"; else bad "$1 — [$2]"; fi; }

TMP="$(mktemp -d)"; mkdir -p "$TMP/.claude/commands" "$TMP/genesis"
trap 'rm -rf "$TMP"' EXIT

echo "── FR-012: behavioral (3+ corrections) ──"
# 2 corrections for legal-fr → below threshold; 3 for accounting-lu → candidate
bash "$SCAN" record --domain "Legal FR"       --target "$TMP" >/dev/null 2>&1
bash "$SCAN" record --domain "legal-fr"       --target "$TMP" >/dev/null 2>&1
bash "$SCAN" record --domain "Comptabilité"   --target "$TMP" >/dev/null 2>&1
bash "$SCAN" record --domain "comptabilite"   --target "$TMP" >/dev/null 2>&1
bash "$SCAN" record --domain "comptabilite"   --target "$TMP" >/dev/null 2>&1
check "corrections logged to jsonl"      '[ -s "$TMP/memory_bank/knowledge/domain-corrections.jsonl" ]'
check "domain below threshold NOT a candidate" '! bash "$SCAN" scan --target "$TMP" 2>&1 | grep -q "candidate: legal-fr"'
check "domain at threshold IS a candidate"     'bash "$SCAN" scan --target "$TMP" 2>&1 | grep -q "candidate: comptabilite"'
check "IT correction never surfaces" 'for i in 1 2 3; do bash "$SCAN" record --domain "database" --target "$TMP" >/dev/null 2>&1; done; ! bash "$SCAN" scan --target "$TMP" 2>&1 | grep -q "candidate: database"'

echo "── FR-012: existing reviewer suppresses candidacy ──"
: > "$TMP/.claude/commands/comptabilite-expert.md"
check "domain with a reviewer is skipped" '! bash "$SCAN" scan --target "$TMP" 2>&1 | grep -q "candidate: comptabilite"'
rm -f "$TMP/.claude/commands/comptabilite-expert.md"

echo "── FR-013: declared PRD domains ──"
cat > "$TMP/genesis/sample.md" <<'PRD'
---
prd_id: sample
title: Sample
domains: [legal-fr, api-design, real-estate]
---
# PRD
PRD
out="$(bash "$SCAN" from-prd "$TMP/genesis/sample.md" --target "$TMP" 2>&1)"
check "declared non-IT 'legal-fr' is a candidate"  'echo "$out" | grep -q "candidate: legal-fr"'
check "declared non-IT 'real-estate' is a candidate" 'echo "$out" | grep -q "candidate: real-estate"'
check "declared IT 'api-design' is skipped"        '! echo "$out" | grep -q "candidate: api-design"'

echo "── FR-013: block-list domains syntax ──"
cat > "$TMP/genesis/block.md" <<'PRD'
---
prd_id: block
domains:
  - notariat-be
  - security
---
# PRD
PRD
out2="$(bash "$SCAN" from-prd "$TMP/genesis/block.md" --target "$TMP" 2>&1)"
check "block-list non-IT surfaced"  'echo "$out2" | grep -q "candidate: notariat-be"'
check "block-list IT skipped"       '! echo "$out2" | grep -q "candidate: security"'

echo "── empty / no-domains PRD ──"
printf -- '---\nprd_id: none\n---\n# PRD\n' > "$TMP/genesis/none.md"
check "no domains → clean message" 'bash "$SCAN" from-prd "$TMP/genesis/none.md" --target "$TMP" 2>&1 | grep -qi "declared in"'

echo
echo "════════════════════════════════════════"
echo "  PASS: $PASS   FAIL: $FAIL"
echo "════════════════════════════════════════"
[ "$FAIL" -eq 0 ]
