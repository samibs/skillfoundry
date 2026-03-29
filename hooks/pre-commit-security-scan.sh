#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SkillFoundry Hook: Pre-Commit Security Scan
#
# Scans staged files for hardcoded secrets before allowing commit.
# Install: cp hooks/pre-commit-security-scan.sh .claude/hooks/
# Config:  Add to .claude/settings.json hooks.preCommit
# ─────────────────────────────────────────────────────────────────────────────

set +e  # Don't exit on first error (lesson from cross-project analysis)

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null)
[ -z "$STAGED_FILES" ] && exit 0

VIOLATIONS=0
VIOLATION_DETAILS=""

for file in $STAGED_FILES; do
  # Skip non-source files
  case "$file" in
    *.md|*.txt|*.json|*.yaml|*.yml|*.toml|*.lock|*.svg|*.png|*.jpg) continue ;;
    *.example|*.sample|*.template) continue ;;
    .env.example|.env.sample) continue ;;
  esac

  [ ! -f "$file" ] && continue

  # Check for hardcoded secrets
  if grep -nP '(?:password|passwd|secret|api_key|apikey|auth_token|private_key)\s*[:=]\s*['"'"'"][^'"'"'"]{4,}['"'"'"]' "$file" 2>/dev/null | grep -v '\.test\.\|\.spec\.\|fixtures\|mock\|example\|process\.env\|os\.environ' > /dev/null; then
    VIOLATIONS=$((VIOLATIONS + 1))
    VIOLATION_DETAILS="$VIOLATION_DETAILS\n  CRITICAL: Possible hardcoded secret in $file"
  fi

  # Check for hardcoded DB connection strings
  if grep -nP '(?:postgres|mysql|mongodb|redis)://[^\s'"'"'"]{10,}' "$file" 2>/dev/null | grep -v 'example\|sample\|\.md$\|CLAUDE\.md' > /dev/null; then
    VIOLATIONS=$((VIOLATIONS + 1))
    VIOLATION_DETAILS="$VIOLATION_DETAILS\n  CRITICAL: Hardcoded DB connection string in $file"
  fi

  # Check for CORS wildcard
  if grep -nP 'allow_origins.*\*|origin.*['"'"'"]\*['"'"'"]' "$file" 2>/dev/null > /dev/null; then
    VIOLATION_DETAILS="$VIOLATION_DETAILS\n  WARNING: CORS wildcard origin in $file"
  fi
done

if [ $VIOLATIONS -gt 0 ]; then
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  SkillFoundry Security Scan: $VIOLATIONS CRITICAL VIOLATION(S)  ║"
  echo "╠══════════════════════════════════════════════════════════╣"
  echo -e "$VIOLATION_DETAILS"
  echo "╠══════════════════════════════════════════════════════════╣"
  echo "║  Move secrets to .env and use process.env.<VAR_NAME>    ║"
  echo "║  Run: sf_security_scan_lite for full report             ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  exit 1
fi

exit 0
