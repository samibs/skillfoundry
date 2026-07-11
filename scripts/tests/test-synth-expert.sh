#!/usr/bin/env bash
# test-synth-expert.sh — shell tests for scripts/synth-expert.sh
# Covers FR-002 (slug/classification), FR-003 (confirm gate), FR-004/005 (synthesis+pack),
# FR-006 (IT guard), FR-009 (provenance/idempotency), FR-010 (review-only content).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNTH="$SCRIPT_DIR/../synth-expert.sh"
PASS=0; FAIL=0

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
check(){ if eval "$2"; then ok "$1"; else bad "$1 — [$2]"; fi; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "── FR-002: slug canonicalization ──"
check "spaces/case/punct -> slug" '[ "$(bash "$SYNTH" slug "Legal — Contract Drafting")" = "legal-contract-drafting" ]'
check "accents transliterated"     '[ "$(bash "$SYNTH" slug "Comptabilité Générale")" = "comptabilite-generale" ] || [ "$(bash "$SYNTH" slug "Comptabilité Générale")" = "comptabilit-gnrale" ]'
check "path injection stripped (no / or ..)" '! bash "$SYNTH" slug "../../etc/passwd" | grep -qE "\.\.|/"'
check "empty input rejected (exit 2)" 'bash "$SYNTH" slug "@@@" >/dev/null 2>&1; [ $? -eq 2 ]'

echo "── FR-006: IT / registry guard ──"
check "IT domain 'api-design' blocked (exit 10)" 'bash "$SYNTH" guard --domain "api-design" --target "$TMP" >/dev/null 2>&1; [ $? -eq 10 ]'
check "IT domain 'security' blocked (exit 10)"   'bash "$SYNTH" guard --domain "security" --target "$TMP" >/dev/null 2>&1; [ $? -eq 10 ]'
check "non-IT 'legal-fr' eligible (exit 0)"      'bash "$SYNTH" guard --domain "legal-fr" --target "$TMP" >/dev/null 2>&1; [ $? -eq 0 ]'

echo "── FR-003: unattended without --confirm never creates ──"
# stdin is piped (not a tty) here, and no --confirm -> must decline with exit 20
check "non-interactive declines (exit 20)" 'bash "$SYNTH" synthesize --domain "legal-fr" --jurisdiction FR --language fr --target "$TMP" </dev/null >/dev/null 2>&1; [ $? -eq 20 ]'
check "  ...and wrote no skill file" '[ ! -f "$TMP/.claude/commands/legal-fr-expert.md" ]'
check "  ...and logged the gap"      'grep -q "gap-declined" "$TMP/logs/domain-experts.log"'

echo "── FR-004/005: synthesis creates reviewer + pack ──"
bash "$SYNTH" synthesize --domain "legal-fr" --jurisdiction FR --language fr --signal self-flag \
     --project DeltaNIS2 --target "$TMP" --confirm >/dev/null 2>&1
check "reviewer skill created"        '[ -f "$TMP/.claude/commands/legal-fr-expert.md" ]'
check "pack.json created"             '[ -f "$TMP/packs/legal-fr/pack.json" ]'
check "pack.json is valid JSON"       'python3 -c "import json,sys;json.load(open(\"$TMP/packs/legal-fr/pack.json\"))"'
check "rules.jsonl created + empty"   '[ -f "$TMP/packs/legal-fr/rules.jsonl" ] && [ ! -s "$TMP/packs/legal-fr/rules.jsonl" ]'
check "SOURCES.md created"            '[ -f "$TMP/packs/legal-fr/SOURCES.md" ]'
check "no unrendered placeholders"    '! grep -q "{{" "$TMP/.claude/commands/legal-fr-expert.md"'

echo "── FR-010: reviewer is review-only, not advisory ──"
check "declares review-only"          'grep -qi "review-only" "$TMP/.claude/commands/legal-fr-expert.md"'
check "forbids determinations/advice" 'grep -qi "never" "$TMP/.claude/commands/legal-fr-expert.md" && grep -qi "determination" "$TMP/.claude/commands/legal-fr-expert.md"'
check "carries the disclaimer"        'grep -qi "not legal/tax/financial/medical advice" "$TMP/.claude/commands/legal-fr-expert.md"'

echo "── FR-009: provenance + idempotency ──"
check "provenance recorded"           'grep -q "\"domain_slug\":\"legal-fr\"" "$TMP/memory_bank/knowledge/experts.jsonl"'
before=$(wc -l < "$TMP/memory_bank/knowledge/experts.jsonl")
bash "$SYNTH" synthesize --domain "legal-fr" --jurisdiction FR --language fr --project DeltaNIS2 --target "$TMP" --confirm >/dev/null 2>&1
after=$(wc -l < "$TMP/memory_bank/knowledge/experts.jsonl")
check "re-synth is idempotent (no dup provenance)" '[ "$before" = "$after" ]'
check "re-synth did not duplicate skill file" '[ "$(ls "$TMP/.claude/commands/" | grep -c "legal-fr-expert.md")" = "1" ]'

echo "── FR-006: synthesize refuses an IT domain outright ──"
check "synthesize 'database' blocked (exit 10)" 'bash "$SYNTH" synthesize --domain "database" --jurisdiction EU --language en --target "$TMP" --confirm >/dev/null 2>&1; [ $? -eq 10 ]'

echo "── FR-009: list shows the reviewer ──"
check "list includes legal-fr-expert" 'bash "$SYNTH" list --target "$TMP" | grep -q "legal-fr-expert"'

echo
echo "════════════════════════════════════════"
echo "  PASS: $PASS   FAIL: $FAIL"
echo "════════════════════════════════════════"
[ "$FAIL" -eq 0 ]
