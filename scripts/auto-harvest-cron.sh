#!/bin/bash

# Auto-Harvest Cron — Periodically sweep all registered projects for unharvested knowledge
#
# Designed to run via cron (e.g., every 30 minutes or hourly).
# Harvests from all projects in .project-registry, promotes recurring patterns,
# syncs to the global knowledge repo, and updates registry metadata.
#
# USAGE:
#   ./scripts/auto-harvest-cron.sh              # Full sweep: harvest + promote + sync
#   ./scripts/auto-harvest-cron.sh --harvest    # Harvest only (no promote/sync)
#   ./scripts/auto-harvest-cron.sh --dry-run    # Preview what would be harvested
#   ./scripts/auto-harvest-cron.sh --status     # Show last harvest stats
#
# CRON EXAMPLE:
#   */30 * * * * /home/n00b73/dev_tools_20260120_latest/skillfoundry/scripts/auto-harvest-cron.sh >> /home/n00b73/dev_tools_20260120_latest/skillfoundry/logs/auto-harvest.log 2>&1

set -o pipefail

# ── Framework paths ─────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REGISTRY_FILE="$FRAMEWORK_DIR/.project-registry"
META_FILE="$FRAMEWORK_DIR/.project-registry-meta.jsonl"
CENTRAL_KNOWLEDGE="$FRAMEWORK_DIR/memory_bank/knowledge"
LOG_DIR="$FRAMEWORK_DIR/logs"
LOG_FILE="$LOG_DIR/auto-harvest.log"
LOCK_FILE="$FRAMEWORK_DIR/.claude/auto-harvest.lock"
STATE_FILE="$FRAMEWORK_DIR/.claude/auto-harvest-state.json"

# Scripts
HARVEST_SCRIPT="$FRAMEWORK_DIR/scripts/harvest.sh"
PROMOTE_SCRIPT="$FRAMEWORK_DIR/scripts/promote-knowledge.sh"
SYNC_SCRIPT="$FRAMEWORK_DIR/scripts/knowledge-sync.sh"
SANITIZE_SCRIPT="$FRAMEWORK_DIR/scripts/sanitize-knowledge.sh"

# Options
DRY_RUN=false
HARVEST_ONLY=false
SHOW_STATUS=false
VERBOSE=false

# ── Argument parsing ────────────────────────────────────────────────────────

for arg in "$@"; do
    case "$arg" in
        --dry-run)     DRY_RUN=true ;;
        --harvest)     HARVEST_ONLY=true ;;
        --status)      SHOW_STATUS=true ;;
        --verbose|-v)  VERBOSE=true ;;
        --help|-h)
            echo "Auto-Harvest Cron — Sweep all registered projects for knowledge"
            echo ""
            echo "Usage: ./scripts/auto-harvest-cron.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --harvest    Harvest only (skip promote and sync)"
            echo "  --dry-run    Preview what would be harvested without writing"
            echo "  --status     Show last harvest statistics"
            echo "  --verbose    Verbose output"
            echo "  --help       Show this help"
            echo ""
            echo "Cron setup:"
            echo "  */30 * * * * $FRAMEWORK_DIR/scripts/auto-harvest-cron.sh"
            exit 0
            ;;
    esac
done

# ── Helpers ─────────────────────────────────────────────────────────────────

mkdir -p "$LOG_DIR" "$FRAMEWORK_DIR/.claude"

now_ts() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

now_epoch() {
    date +%s
}

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    if [ "$VERBOSE" = true ] || [ -t 1 ]; then
        echo "$msg"
    fi
    echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

rotate_log() {
    if [ -f "$LOG_FILE" ]; then
        local lines
        lines=$(wc -l < "$LOG_FILE" | tr -d ' ')
        if [ "$lines" -gt 2000 ]; then
            tail -1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
        fi
    fi
}

# ── Lock management (prevent concurrent runs) ──────────────────────────────

acquire_lock() {
    if [ -f "$LOCK_FILE" ]; then
        local lock_pid
        lock_pid=$(cat "$LOCK_FILE" 2>/dev/null)
        if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
            log "SKIP: Another auto-harvest is running (PID $lock_pid)"
            exit 0
        fi
        # Stale lock — remove it
        rm -f "$LOCK_FILE"
    fi
    echo $$ > "$LOCK_FILE"
}

release_lock() {
    rm -f "$LOCK_FILE"
}

trap release_lock EXIT INT TERM

# ── Status command ──────────────────────────────────────────────────────────

if [ "$SHOW_STATUS" = true ]; then
    echo "Auto-Harvest Status"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ -f "$STATE_FILE" ]; then
        last_run=$(jq -r '.last_run // "never"' "$STATE_FILE" 2>/dev/null)
        total_runs=$(jq -r '.total_runs // 0' "$STATE_FILE" 2>/dev/null)
        total_harvested=$(jq -r '.total_entries_harvested // 0' "$STATE_FILE" 2>/dev/null)
        total_promoted=$(jq -r '.total_promoted // 0' "$STATE_FILE" 2>/dev/null)
        projects_scanned=$(jq -r '.projects_scanned // 0' "$STATE_FILE" 2>/dev/null)
        last_duration=$(jq -r '.last_duration_sec // "?"' "$STATE_FILE" 2>/dev/null)
        echo "  Last run:          $last_run"
        echo "  Total runs:        $total_runs"
        echo "  Projects scanned:  $projects_scanned"
        echo "  Entries harvested: $total_harvested (lifetime)"
        echo "  Entries promoted:  $total_promoted (lifetime)"
        echo "  Last duration:     ${last_duration}s"
    else
        echo "  No harvest runs recorded yet."
    fi

    echo ""
    if [ -f "$REGISTRY_FILE" ]; then
        reg_count=$(grep -c '^/' "$REGISTRY_FILE" 2>/dev/null || echo 0)
        echo "  Registered projects: $reg_count"
    fi

    if [ -f "$LOG_FILE" ]; then
        echo ""
        echo "  Recent log (last 10 lines):"
        tail -10 "$LOG_FILE" | sed 's/^/    /'
    fi
    exit 0
fi

# ── Pre-flight checks ──────────────────────────────────────────────────────

if [ ! -f "$REGISTRY_FILE" ]; then
    log "ERROR: No .project-registry found at $REGISTRY_FILE"
    exit 1
fi

if [ ! -f "$HARVEST_SCRIPT" ] || [ ! -x "$HARVEST_SCRIPT" ]; then
    log "ERROR: harvest.sh not found or not executable at $HARVEST_SCRIPT"
    exit 1
fi

acquire_lock
rotate_log

# ── Count projects with harvestable knowledge ───────────────────────────────

count_knowledge_files() {
    local project_dir="$1"
    local count=0
    for f in "$project_dir"/memory_bank/knowledge/*.jsonl; do
        if [ -f "$f" ] && [ -s "$f" ]; then
            count=$((count + $(wc -l < "$f" | tr -d ' ')))
        fi
    done
    echo "$count"
}

has_new_knowledge() {
    local project_dir="$1"
    local last_harvest_epoch="$2"

    # Check if any knowledge file was modified since last harvest
    for f in "$project_dir"/memory_bank/knowledge/*.jsonl; do
        if [ -f "$f" ] && [ -s "$f" ]; then
            local file_mtime
            file_mtime=$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null || echo 0)
            if [ "$file_mtime" -gt "$last_harvest_epoch" ]; then
                return 0
            fi
        fi
    done

    # Also check .claude/scratchpad.md
    if [ -f "$project_dir/.claude/scratchpad.md" ]; then
        local sp_mtime
        sp_mtime=$(stat -c %Y "$project_dir/.claude/scratchpad.md" 2>/dev/null || stat -f %m "$project_dir/.claude/scratchpad.md" 2>/dev/null || echo 0)
        if [ "$sp_mtime" -gt "$last_harvest_epoch" ]; then
            return 0
        fi
    fi

    return 1
}

# ── Main harvest sweep ──────────────────────────────────────────────────────

log "═══ Auto-Harvest Started ═══"
start_epoch=$(now_epoch)

# Load previous state
last_harvest_epoch=0
total_runs=0
total_harvested=0
total_promoted=0

if [ -f "$STATE_FILE" ]; then
    last_harvest_epoch=$(jq -r '.last_harvest_epoch // 0' "$STATE_FILE" 2>/dev/null)
    total_runs=$(jq -r '.total_runs // 0' "$STATE_FILE" 2>/dev/null)
    total_harvested=$(jq -r '.total_entries_harvested // 0' "$STATE_FILE" 2>/dev/null)
    total_promoted=$(jq -r '.total_promoted // 0' "$STATE_FILE" 2>/dev/null)
fi

projects_total=0
projects_harvested=0
projects_skipped=0
entries_this_run=0

while IFS= read -r project_path; do
    # Skip empty lines and comments
    [[ -z "$project_path" || "$project_path" =~ ^# ]] && continue
    # Skip non-existent directories
    [ ! -d "$project_path" ] && continue

    projects_total=$((projects_total + 1))

    # Check if project has a memory_bank
    if [ ! -d "$project_path/memory_bank/knowledge" ]; then
        projects_skipped=$((projects_skipped + 1))
        continue
    fi

    # Check if there's new knowledge since last harvest
    if ! has_new_knowledge "$project_path" "$last_harvest_epoch"; then
        projects_skipped=$((projects_skipped + 1))
        [ "$VERBOSE" = true ] && log "  SKIP: $project_path (no changes)"
        continue
    fi

    project_name=$(basename "$project_path")
    entries_before=$(count_knowledge_files "$FRAMEWORK_DIR")

    if [ "$DRY_RUN" = true ]; then
        local_entries=$(count_knowledge_files "$project_path")
        log "  DRY-RUN: Would harvest $project_path ($local_entries entries)"
        projects_harvested=$((projects_harvested + 1))
        continue
    fi

    log "  Harvesting: $project_name"

    # Run harvest for this project
    if bash "$HARVEST_SCRIPT" "$project_path" 2>/dev/null; then
        entries_after=$(count_knowledge_files "$FRAMEWORK_DIR")
        new_entries=$((entries_after - entries_before))
        if [ "$new_entries" -gt 0 ]; then
            log "    +$new_entries entries harvested"
            entries_this_run=$((entries_this_run + new_entries))
        fi
        projects_harvested=$((projects_harvested + 1))

        # Update meta file with last_harvested timestamp
        if [ -f "$META_FILE" ] && command -v jq &>/dev/null; then
            tmp_meta=$(mktemp)
            while IFS= read -r line; do
                meta_path=$(echo "$line" | jq -r '.path // ""' 2>/dev/null)
                if [ "$meta_path" = "$project_path" ]; then
                    echo "$line" | jq -c ".last_harvested = \"$(now_ts)\" | .updated_at = \"$(now_ts)\"" 2>/dev/null || echo "$line"
                else
                    echo "$line"
                fi
            done < "$META_FILE" > "$tmp_meta"
            mv "$tmp_meta" "$META_FILE"
        fi
    else
        log "    WARN: harvest failed for $project_name (continuing)"
    fi

done < "$REGISTRY_FILE"

# ── Promotion cycle ─────────────────────────────────────────────────────────

promoted_this_run=0

if [ "$DRY_RUN" = false ] && [ "$HARVEST_ONLY" = false ]; then
    # Run promotion via harvest.sh --promote
    log "  Running promotion cycle..."
    if bash "$HARVEST_SCRIPT" --promote 2>/dev/null; then
        log "    Promotion cycle complete"
    fi

    # Run promote-knowledge.sh if staging/ has content
    if [ -f "$PROMOTE_SCRIPT" ] && [ -x "$PROMOTE_SCRIPT" ]; then
        staging_dir="$CENTRAL_KNOWLEDGE/staging"
        if [ -d "$staging_dir" ] && [ "$(ls -A "$staging_dir" 2>/dev/null)" ]; then
            log "  Promoting staged lessons..."
            promote_output=$(bash "$PROMOTE_SCRIPT" promote 2>&1) || true
            promoted_this_run=$(echo "$promote_output" | grep -c "Promoted:" 2>/dev/null || echo 0)
            if [ "$promoted_this_run" -gt 0 ]; then
                log "    +$promoted_this_run lessons promoted"
            fi
        fi
    fi
fi

# ── Knowledge sync ──────────────────────────────────────────────────────────

if [ "$DRY_RUN" = false ] && [ "$HARVEST_ONLY" = false ]; then
    if [ -f "$SYNC_SCRIPT" ] && [ -x "$SYNC_SCRIPT" ]; then
        CONF_FILE="$FRAMEWORK_DIR/.claude/knowledge-sync.conf"
        if [ -f "$CONF_FILE" ]; then
            log "  Syncing to global knowledge repo..."
            if bash "$SYNC_SCRIPT" sync 2>/dev/null; then
                log "    Sync complete"
            else
                log "    WARN: Sync failed (will retry next run)"
            fi
        fi
    fi
fi

# ── Sanitize central knowledge ──────────────────────────────────────────────

if [ "$DRY_RUN" = false ] && [ -f "$SANITIZE_SCRIPT" ] && [ -x "$SANITIZE_SCRIPT" ]; then
    bash "$SANITIZE_SCRIPT" "$CENTRAL_KNOWLEDGE" 2>/dev/null || true
fi

# ── Save state ──────────────────────────────────────────────────────────────

end_epoch=$(now_epoch)
duration=$((end_epoch - start_epoch))
total_runs=$((total_runs + 1))
total_harvested=$((total_harvested + entries_this_run))
total_promoted=$((total_promoted + promoted_this_run))

if [ "$DRY_RUN" = false ]; then
    cat > "$STATE_FILE" <<ENDJSON
{
  "last_run": "$(now_ts)",
  "last_harvest_epoch": $end_epoch,
  "last_duration_sec": $duration,
  "total_runs": $total_runs,
  "projects_scanned": $projects_total,
  "projects_harvested_last": $projects_harvested,
  "projects_skipped_last": $projects_skipped,
  "entries_last_run": $entries_this_run,
  "total_entries_harvested": $total_harvested,
  "promoted_last_run": $promoted_this_run,
  "total_promoted": $total_promoted
}
ENDJSON
fi

# ── Summary ─────────────────────────────────────────────────────────────────

log "═══ Auto-Harvest Complete (${duration}s) ═══"
log "  Projects: $projects_harvested harvested, $projects_skipped skipped (of $projects_total)"
log "  Entries:  +$entries_this_run harvested, +$promoted_this_run promoted"

if [ -t 1 ]; then
    echo ""
    echo "Auto-Harvest Complete"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Projects:  $projects_harvested/$projects_total harvested"
    echo "  Skipped:   $projects_skipped (no changes)"
    echo "  Entries:   +$entries_this_run"
    echo "  Promoted:  +$promoted_this_run"
    echo "  Duration:  ${duration}s"
    if [ "$DRY_RUN" = true ]; then
        echo "  Mode:      DRY RUN (no writes)"
    fi
fi
