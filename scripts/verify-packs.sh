#!/usr/bin/env bash
# verify-packs.sh — List all domain pack rules by last_verified date
# Groups: current (<6mo), stale (6-12mo), outdated (>12mo)
# Outputs a markdown table suitable for review

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKS_DIR="${SCRIPT_DIR}/../packs"

if [ ! -d "$PACKS_DIR" ]; then
  echo "No packs directory found at: $PACKS_DIR"
  exit 1
fi

NOW_EPOCH=$(date +%s)
SIX_MONTHS=$((180 * 86400))
TWELVE_MONTHS=$((365 * 86400))

CURRENT_COUNT=0
STALE_COUNT=0
OUTDATED_COUNT=0

CURRENT_RULES=()
STALE_RULES=()
OUTDATED_RULES=()

for PACK_DIR in "$PACKS_DIR"/*/; do
  PACK_NAME=$(basename "$PACK_DIR")
  RULES_FILE="$PACK_DIR/rules.jsonl"

  if [ ! -f "$RULES_FILE" ]; then
    continue
  fi

  while IFS= read -r line; do
    [ -z "$line" ] && continue

    RULE_ID=$(echo "$line" | grep -oP '"id"\s*:\s*"[^"]*"' | head -1 | grep -oP '"[^"]*"$' | tr -d '"')
    TITLE=$(echo "$line" | grep -oP '"title"\s*:\s*"[^"]*"' | head -1 | grep -oP '"[^"]*"$' | tr -d '"')
    LAST_VERIFIED=$(echo "$line" | grep -oP '"last_verified"\s*:\s*"[^"]*"' | head -1 | grep -oP '"[^"]*"$' | tr -d '"')

    if [ -z "$LAST_VERIFIED" ] || [ -z "$RULE_ID" ]; then
      continue
    fi

    VERIFIED_EPOCH=$(date -d "$LAST_VERIFIED" +%s 2>/dev/null || echo 0)
    DIFF=$((NOW_EPOCH - VERIFIED_EPOCH))
    DAYS=$((DIFF / 86400))

    ENTRY="| $PACK_NAME | $RULE_ID | $TITLE | $LAST_VERIFIED | ${DAYS}d |"

    if [ "$DIFF" -gt "$TWELVE_MONTHS" ]; then
      OUTDATED_RULES+=("$ENTRY")
      OUTDATED_COUNT=$((OUTDATED_COUNT + 1))
    elif [ "$DIFF" -gt "$SIX_MONTHS" ]; then
      STALE_RULES+=("$ENTRY")
      STALE_COUNT=$((STALE_COUNT + 1))
    else
      CURRENT_RULES+=("$ENTRY")
      CURRENT_COUNT=$((CURRENT_COUNT + 1))
    fi
  done < "$RULES_FILE"
done

TOTAL=$((CURRENT_COUNT + STALE_COUNT + OUTDATED_COUNT))

echo "# Domain Pack Verification Report"
echo ""
echo "**Date**: $(date +%Y-%m-%d)"
echo "**Total rules**: $TOTAL"
echo "**Current** (<6mo): $CURRENT_COUNT | **Stale** (6-12mo): $STALE_COUNT | **Outdated** (>12mo): $OUTDATED_COUNT"
echo ""

if [ "$OUTDATED_COUNT" -gt 0 ]; then
  echo "## Outdated Rules (>12 months — re-verification required)"
  echo ""
  echo "| Pack | Rule ID | Title | Last Verified | Age |"
  echo "|------|---------|-------|---------------|-----|"
  for entry in "${OUTDATED_RULES[@]}"; do
    echo "$entry"
  done
  echo ""
fi

if [ "$STALE_COUNT" -gt 0 ]; then
  echo "## Stale Rules (6-12 months — review recommended)"
  echo ""
  echo "| Pack | Rule ID | Title | Last Verified | Age |"
  echo "|------|---------|-------|---------------|-----|"
  for entry in "${STALE_RULES[@]}"; do
    echo "$entry"
  done
  echo ""
fi

if [ "$CURRENT_COUNT" -gt 0 ]; then
  echo "## Current Rules (<6 months)"
  echo ""
  echo "| Pack | Rule ID | Title | Last Verified | Age |"
  echo "|------|---------|-------|---------------|-----|"
  for entry in "${CURRENT_RULES[@]}"; do
    echo "$entry"
  done
  echo ""
fi

if [ "$OUTDATED_COUNT" -gt 0 ] || [ "$STALE_COUNT" -gt 0 ]; then
  echo "---"
  echo ""
  echo "**Action required**: $((STALE_COUNT + OUTDATED_COUNT)) rules need re-verification."
  echo "Review each rule against current legislation/standards and update \`last_verified\` in the pack's \`rules.jsonl\`."
fi
