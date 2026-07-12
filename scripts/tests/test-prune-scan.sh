#!/usr/bin/env bash
# test-prune-scan.sh — tests for the /prune detection engine (scripts/prune-scan.sh)
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRUNE="$SCRIPT_DIR/../prune-scan.sh"
PASS=0; FAIL=0
ok(){ echo "  ✓ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ✗ $1"; FAIL=$((FAIL+1)); }
check(){ if eval "$2"; then ok "$1"; else bad "$1 — [$2]"; fi; }

TMP="$(mktemp -d)"; mkdir -p "$TMP/src" "$TMP/node_modules/pkg"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/src/a.ts" <<'EOF'
import { readFile } from 'fs';
import { UNUSED_THING } from './x';
import LODASH from 'lodash';
import { keep } from './y';

export function compute(a: number) {
  const total = a + 1;
  const scaled = total * 2;
  const clamped = Math.min(scaled, 100);
  return keep(clamped);
}
EOF
cat > "$TMP/src/b.ts" <<'EOF'
export function other(a: number) {
  const total = a + 1;
  const scaled = total * 2;
  const clamped = Math.min(scaled, 100);
  return clamped;
}
export function neverImportedAnywhere() { return 42; }
EOF
# a decoy inside node_modules that MUST be ignored
cat > "$TMP/node_modules/pkg/index.js" <<'EOF'
import { readFile } from 'fs';
const total = 1; const scaled = total * 2; const clamped = Math.min(scaled, 100);
EOF

echo "── unused imports ──"
OUT="$(bash "$PRUNE" deadcode --path "$TMP")"
check "fully-unused named import flagged"      'echo "$OUT" | grep -q "a.ts:1.*readFile"'
check "fully-unused default import flagged"    'echo "$OUT" | grep -qi "LODASH"'
check "used import NOT flagged"                '! echo "$OUT" | grep -qE "a.ts:4.*keep"'
check "node_modules is ignored"                '! echo "$OUT" | grep -q "node_modules"'

echo "── unused-export candidates ──"
check "never-imported export flagged as candidate" 'echo "$OUT" | grep -q "neverImportedAnywhere"'

echo "── duplicate blocks ──"
DUP="$(bash "$PRUNE" duplicates --path "$TMP" --min-lines 3)"
check "cross-file duplicate block detected" 'echo "$DUP" | grep -qE "a.ts:.*(also|).*b.ts|b.ts:.*a.ts"'
check "clean project → no duplicates" 'D2=$(mktemp -d); printf "export const x = 1;\n" > "$D2/only.ts"; ! bash "$PRUNE" duplicates --path "$D2" --min-lines 3 | grep -qE "[0-9]+×"; rm -rf "$D2"'

echo "── --fix removes only fully-unused imports (safe subset) ──"
before=$(grep -c "^import" "$TMP/src/a.ts")
FIXOUT="$(bash "$PRUNE" deadcode --path "$TMP" --fix)"
after=$(grep -c "^import" "$TMP/src/a.ts")
check "fix reports a removal count"     'echo "$FIXOUT" | grep -qE "removed [0-9]+ fully-unused"'
check "fix removed the 3 unused imports" '[ "$before" = "4" ] && [ "$after" = "1" ]'
check "fix kept the used import"         'grep -q "keep" "$TMP/src/a.ts"'
check "fix is idempotent (2nd run removes 0)" 'bash "$PRUNE" deadcode --path "$TMP" --fix | grep -q "removed 0 fully-unused"'

echo "── partial import is reported, NOT auto-removed ──"
cat > "$TMP/src/c.ts" <<'EOF'
import { used, notUsed } from './z';
export const v = used();
EOF
POUT="$(bash "$PRUNE" deadcode --path "$TMP")"
check "partial-unused import reported for review" 'echo "$POUT" | grep -q "PARTIAL-IMPORT.*c.ts"'
bash "$PRUNE" deadcode --path "$TMP" --fix >/dev/null
check "partial import line NOT removed by --fix"  'grep -q "used, notUsed" "$TMP/src/c.ts"'

echo "── Python unused import ──"
mkdir -p "$TMP/py"
printf 'import os\nimport sys\n\nprint(sys.argv)\n' > "$TMP/py/m.py"
PYOUT="$(bash "$PRUNE" deadcode --path "$TMP/py")"
check "python unused 'os' flagged" 'echo "$PYOUT" | grep -qi "m.py.*os"'
check "python used 'sys' not flagged" '! echo "$PYOUT" | grep -qE "whole import unused:.*sys"'

echo "── scan runs both without error ──"
check "scan exits 0" 'bash "$PRUNE" scan --path "$TMP" >/dev/null 2>&1'

echo
echo "════════════════════════════════════════"
echo "  PASS: $PASS   FAIL: $FAIL"
echo "════════════════════════════════════════"
[ "$FAIL" -eq 0 ]
