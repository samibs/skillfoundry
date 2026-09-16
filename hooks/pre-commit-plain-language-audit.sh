#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SkillFoundry Hook: Pre-Commit Plain-Language UI Audit
#
# Blocks a commit that introduces a high-severity plain-language finding
# (bare domain-term label, unexplained enum, bare-verb button, ...) in staged
# UI files. Skips silently when no UI files are staged or the crawler isn't
# installed in this repo — see the plain-language-ui skill for install steps.
#
# Install: cp hooks/pre-commit-plain-language-audit.sh .claude/hooks/
# Config:  Add to .claude/settings.json hooks.preCommit
# ─────────────────────────────────────────────────────────────────────────────

set +e  # Don't exit on first error (lesson from cross-project analysis)

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null)
[ -z "$STAGED_FILES" ] && exit 0

# Only run when a staged file could carry a rendered UI label.
UI_TOUCHED=false
for file in $STAGED_FILES; do
  case "$file" in
    *.tsx|*.jsx|*.ts|*.js|*.html|*.component.html|*.razor|*.cshtml) UI_TOUCHED=true; break ;;
  esac
done
[ "$UI_TOUCHED" = false ] && exit 0

# Locate the crawler — try each known install location in turn.
CANDIDATES=(
  ".claude/skills/plain-language-ui/scripts/audit_labels.py"
  ".agents/skills/plain-language-ui/scripts/audit_labels.py"
  "scripts/audit_labels.py"
)
AUDIT_SCRIPT=""
for candidate in "${CANDIDATES[@]}"; do
  if [ -f "$candidate" ]; then
    AUDIT_SCRIPT="$candidate"
    break
  fi
done
[ -z "$AUDIT_SCRIPT" ] && exit 0

PYTHON_BIN=$(command -v python3 || command -v python)
[ -z "$PYTHON_BIN" ] && exit 0

OUT_DIR=$(mktemp -d)
"$PYTHON_BIN" "$AUDIT_SCRIPT" . --out "$OUT_DIR" --min-severity high >/dev/null 2>&1
STATUS=$?

if [ $STATUS -ne 0 ]; then
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  Plain-Language UI Audit: HIGH-SEVERITY FINDING(S)       ║"
  echo "╠══════════════════════════════════════════════════════════╣"
  echo "║  A bare domain term, raw enum, or bare-verb button is    ║"
  echo "║  about to ship. See the report below, fix, then commit.  ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  [ -f "$OUT_DIR/report.md" ] && cat "$OUT_DIR/report.md"
  rm -rf "$OUT_DIR"
  exit 1
fi

rm -rf "$OUT_DIR"
exit 0
