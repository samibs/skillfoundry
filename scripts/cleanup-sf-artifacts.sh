#!/bin/bash

# SkillFoundry In-Project Artifact Cleanup
#
# Removes SF framework artifacts from ~/apps/* and ~/wapplications/*
# after they've been harvested into the MCP server's knowledge store.
#
# PRESERVES:
#   - .claude/settings.json and .claude/settings.local.json (Claude Code config)
#   - .cursorrules, .cursor/ (Cursor config)
#   - .gemini/, GEMINI.md (Gemini config)
#   - .copilot/, .codex/, AGENTS.md (other platform config)
#   - .github/ (GitHub config)
#   - .git/ (version control)
#   - All source code, tests, configs
#
# REMOVES:
#   - memory_bank/ directories
#   - genesis/ directories
#   - docs/stories/ directories
#   - .skillfoundry/ directories
#   - CLAUDE.md files (SF-generated)
#   - agents/ directories (SF protocol files)
#   - docs/ANTI_PATTERNS_*.md files
#   - Root-level ANTI_PATTERNS_*.md files
#   - .claude/commands/ (SF commands — now MCP skills)
#   - .claude/hooks/ (SF hooks)
#   - .claude/backups/ (SF backups)
#   - .claude/scratchpad.md (SF forge notes)
#   - .claude/skills/ (SF skill definitions)
#   - .claude/.framework-* (SF marker files)
#   - Root-level ~/apps/ SF infrastructure
#
# USAGE:
#   ./scripts/cleanup-sf-artifacts.sh --dry-run   # Preview what would be removed
#   ./scripts/cleanup-sf-artifacts.sh             # Execute cleanup

set -euo pipefail

DRY_RUN=false
VERBOSE=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)  DRY_RUN=true ;;
    --verbose)  VERBOSE=true ;;
    --help|-h)
      echo "Usage: ./scripts/cleanup-sf-artifacts.sh [--dry-run] [--verbose]"
      exit 0
      ;;
  esac
done

ROOTS=(
  "$HOME/apps"
  "$HOME/wapplications"
)

total_removed=0
total_dirs=0
total_files=0

log() { echo "[$(date '+%H:%M:%S')] $1"; }

remove_dir() {
  local dir="$1"
  if [ -d "$dir" ]; then
    local count
    count=$(find "$dir" -type f 2>/dev/null | wc -l | tr -d ' ')
    if [ "$DRY_RUN" = true ]; then
      log "  WOULD REMOVE dir:  $dir ($count files)"
    else
      rm -rf "$dir"
      log "  REMOVED dir:  $dir ($count files)"
    fi
    total_dirs=$((total_dirs + 1))
    total_files=$((total_files + count))
    total_removed=$((total_removed + 1))
  fi
}

remove_file() {
  local file="$1"
  if [ -f "$file" ]; then
    if [ "$DRY_RUN" = true ]; then
      log "  WOULD REMOVE file: $file"
    else
      rm -f "$file"
      log "  REMOVED file: $file"
    fi
    total_files=$((total_files + 1))
    total_removed=$((total_removed + 1))
  fi
}

# ─── Process each project ────────────────────────────────────────────────────

for root in "${ROOTS[@]}"; do
  if [ ! -d "$root" ]; then continue; fi

  # First handle root-level SF infra (~/apps/CLAUDE.md, ~/apps/agents/, etc.)
  log "Cleaning root-level SF artifacts in $root..."
  remove_file "$root/CLAUDE.md"
  remove_dir "$root/agents"
  remove_dir "$root/genesis"
  remove_dir "$root/memory_bank"
  remove_dir "$root/docs/stories"
  remove_file "$root/docs/ANTI_PATTERNS_DEPTH.md"
  remove_file "$root/docs/ANTI_PATTERNS_BREADTH.md"
  # Clean root .claude/ SF artifacts (preserve settings)
  remove_dir "$root/.claude/commands"
  remove_dir "$root/.claude/backups"
  remove_file "$root/.claude/scratchpad.md"
  remove_file "$root/.claude/.framework-version"
  remove_file "$root/.claude/.framework-platform"
  remove_file "$root/.claude/.framework-updated"

  # Process each project
  for project_dir in "$root"/*/; do
    [ ! -d "$project_dir" ] && continue
    project_name=$(basename "$project_dir")

    # Skip special directories
    case "$project_name" in
      .|..|archive|archive_wapplications|node_modules|.git) continue ;;
    esac

    [ "$VERBOSE" = true ] && log "Processing: $project_name"

    # ── Directories to remove entirely ──
    remove_dir "$project_dir/memory_bank"
    remove_dir "$project_dir/genesis"
    remove_dir "$project_dir/docs/stories"
    remove_dir "$project_dir/.skillfoundry"
    remove_dir "$project_dir/agents"

    # ── CLAUDE.md files ──
    remove_file "$project_dir/CLAUDE.md"
    # .claude/CLAUDE.md is also SF-generated
    remove_file "$project_dir/.claude/CLAUDE.md"

    # ── Anti-pattern files ──
    remove_file "$project_dir/docs/ANTI_PATTERNS_DEPTH.md"
    remove_file "$project_dir/docs/ANTI_PATTERNS_BREADTH.md"
    # Some projects have them in root instead of docs/
    remove_file "$project_dir/ANTI_PATTERNS_DEPTH.md"
    remove_file "$project_dir/ANTI_PATTERNS_BREADTH.md"

    # ── .claude/ SF-specific content (preserve settings.json + settings.local.json) ──
    if [ -d "$project_dir/.claude" ]; then
      remove_dir "$project_dir/.claude/commands"
      remove_dir "$project_dir/.claude/hooks"
      remove_dir "$project_dir/.claude/backups"
      remove_dir "$project_dir/.claude/skills"
      remove_file "$project_dir/.claude/scratchpad.md"
      remove_file "$project_dir/.claude/.framework-version"
      remove_file "$project_dir/.claude/.framework-platform"
      remove_file "$project_dir/.claude/.framework-updated"

      # Check if .claude/ is now empty (only settings remain or empty)
      # Don't remove the dir itself — Claude Code needs it
    fi

    # ── Clean empty docs/ directories ──
    if [ -d "$project_dir/docs" ]; then
      # Remove docs/ only if it's now empty
      if [ -z "$(ls -A "$project_dir/docs" 2>/dev/null)" ]; then
        remove_dir "$project_dir/docs"
      fi
    fi
  done
done

# ─── Summary ────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$DRY_RUN" = true ]; then
  echo "  DRY RUN COMPLETE — No files were modified"
else
  echo "  CLEANUP COMPLETE"
fi
echo "  Directories removed: $total_dirs"
echo "  Files removed:       $total_files"
echo "  Total operations:    $total_removed"
echo "═══════════════════════════════════════════════════════════"
