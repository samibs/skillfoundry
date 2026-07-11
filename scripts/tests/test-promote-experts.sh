#!/usr/bin/env bash
# test-promote-experts.sh — Phase 3 cross-project promotion (FR-007)
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMOTE="$SCRIPT_DIR/../promote-experts.sh"
SYNTH="$SCRIPT_DIR/../synth-expert.sh"
PASS=0; FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
check(){ if eval "$2"; then ok "$1"; else bad "$1 — [$2]"; fi; }

ROOT="$(mktemp -d)"; trap 'rm -rf "$ROOT"' EXIT
FW="$ROOT/framework"; mkdir -p "$FW/agents" "$FW/memory_bank/knowledge"
REG="$ROOT/registry"

# helper: create a project that synthesized <slug> (real synth-expert run)
mk_project() {
    local name="$1" slug="$2"; local p="$ROOT/$name"; mkdir -p "$p/.claude/commands"
    bash "$SYNTH" synthesize --domain "$slug" --jurisdiction FR --language fr \
        --project "$name" --target "$p" --confirm >/dev/null 2>&1
    echo "$p" >> "$REG"
}

echo "── setup: legal-fr in 3 projects, real-estate in 1 ──"
: > "$REG"
mk_project projA legal-fr
mk_project projB legal-fr
mk_project projC legal-fr
mk_project projD real-estate
check "3 projects synthesized legal-fr" '[ "$(grep -l legal-fr "$ROOT"/proj{A,B,C}/.claude/commands/legal-fr-expert.md 2>/dev/null | wc -l)" = "3" ]'

echo "── FR-007: scan surfaces only domains at/above threshold ──"
out="$(bash "$PROMOTE" scan --registry "$REG" --framework "$FW" 2>&1)"
check "legal-fr (3 projects) is a promote candidate" 'echo "$out" | grep -q "promote: legal-fr"'
check "real-estate (1 project) is NOT a candidate"   '! echo "$out" | grep -q "promote: real-estate"'

echo "── threshold is configurable ──"
check "raising threshold to 4 drops legal-fr" '! bash "$PROMOTE" scan --registry "$REG" --framework "$FW" --threshold 4 2>&1 | grep -q "promote: legal-fr"'

echo "── FR-007: promote copies to framework agents/ + generalizes ──"
bash "$PROMOTE" promote --domain legal-fr --registry "$REG" --framework "$FW" >/dev/null 2>&1
check "framework agents/legal-fr-expert.md created" '[ -f "$FW/agents/legal-fr-expert.md" ]'
check "scope generalized to framework"  'grep -q "scope=framework" "$FW/agents/legal-fr-expert.md"'
check "provenance generalized"          'grep -q "provenance_project=promoted-3plus" "$FW/agents/legal-fr-expert.md"'
check "still review-only after promote" 'grep -qi "review-only" "$FW/agents/legal-fr-expert.md"'
check "framework pack scaffolded"       '[ -f "$FW/packs/legal-fr/pack.json" ]'
check "framework provenance recorded"   'grep -q "\"scope\":\"framework\"" "$FW/memory_bank/knowledge/experts.jsonl"'

echo "── promoted domain no longer a scan candidate (idempotent) ──"
check "scan skips already-shared legal-fr" '! bash "$PROMOTE" scan --registry "$REG" --framework "$FW" 2>&1 | grep -q "promote: legal-fr"'
check "re-promote is a no-op" 'bash "$PROMOTE" promote --domain legal-fr --registry "$REG" --framework "$FW" 2>&1 | grep -qi "already framework-shared"'

echo "── promote with no source reviewer fails cleanly ──"
check "unknown domain → error exit" 'bash "$PROMOTE" promote --domain nonexistent-xyz --registry "$REG" --framework "$FW" >/dev/null 2>&1; [ $? -eq 1 ]'

echo
echo "════════════════════════════════════════"
echo "  PASS: $PASS   FAIL: $FAIL"
echo "════════════════════════════════════════"
[ "$FAIL" -eq 0 ]
