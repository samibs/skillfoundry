#!/bin/bash

# Nightly Harvest — Full-pipeline daily harvest at 4:00 AM
#
# Runs the 7-stage TypeScript pipeline:
#   1. SCAN     — Discover all projects in ~/apps/* and ~/wapplications/*
#   2. PARSE    — Parse session transcripts from Claude, Cursor, Gemini, Copilot, Codex
#   3. EXTRACT  — Extract actionable insights from sessions
#   4. HARVEST  — Run knowledge harvest pipeline
#   5. ASSESS   — Security scan + contract check on all projects
#   6. REPORT   — Generate nightly report
#   7. PERSIST  — Store everything in SQLite
#
# USAGE:
#   ./scripts/nightly-harvest.sh           # Run full pipeline
#   ./scripts/nightly-harvest.sh --dry-run # Preview mode (just checks deps)
#
# CRON:
#   0 4 * * * /home/n00b73/tools/skillfoundry-mcp/scripts/nightly-harvest.sh >> /home/n00b73/tools/skillfoundry-mcp/logs/nightly-harvest.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MCP_DIR="$FRAMEWORK_DIR/mcp-server"
LOG_DIR="$FRAMEWORK_DIR/logs"
LOCK_FILE="$FRAMEWORK_DIR/.claude/nightly-harvest.lock"

mkdir -p "$LOG_DIR" "$FRAMEWORK_DIR/.claude"

# ── Logging ──────────────────────────────────────────────────────────────────

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# ── Log rotation (keep last 5000 lines) ─────────────────────────────────────

LOG_FILE="$LOG_DIR/nightly-harvest.log"
if [ -f "$LOG_FILE" ]; then
    lines=$(wc -l < "$LOG_FILE" | tr -d ' ')
    if [ "$lines" -gt 5000 ]; then
        tail -2500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
        log "Log rotated (was $lines lines)"
    fi
fi

# ── Lock management ─────────────────────────────────────────────────────────

if [ -f "$LOCK_FILE" ]; then
    lock_pid=$(cat "$LOCK_FILE" 2>/dev/null)
    if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
        log "SKIP: Another nightly harvest is running (PID $lock_pid)"
        exit 0
    fi
    rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT INT TERM

# ── Dry-run check ────────────────────────────────────────────────────────────

if [ "${1:-}" = "--dry-run" ]; then
    log "DRY-RUN: Checking dependencies..."
    echo "  Node:     $(node --version 2>/dev/null || echo 'NOT FOUND')"
    echo "  MCP dist: $([ -f "$MCP_DIR/dist/knowledge/nightly-harvest.js" ] && echo 'OK' || echo 'MISSING — run npm run build')"
    echo "  DB:       $([ -f "$MCP_DIR/data/skillfoundry.db" ] && echo 'EXISTS' || echo 'Will be created')"
    echo "  Apps:     $(ls -d ~/apps/*/ 2>/dev/null | wc -l | tr -d ' ') projects in ~/apps"
    echo "  Wapps:    $(ls -d ~/wapplications/*/ 2>/dev/null | wc -l | tr -d ' ') projects in ~/wapplications"
    echo "  Claude:   $(ls -d ~/.claude/projects/*/ 2>/dev/null | wc -l | tr -d ' ') project session dirs"
    echo "  Cursor:   $(ls -d ~/.cursor/projects/*/ 2>/dev/null | wc -l | tr -d ' ') project session dirs"
    echo "  Gemini:   $([ -d ~/.gemini/antigravity ] && echo 'Found' || echo 'Not found')"
    exit 0
fi

# ── Pre-flight checks ───────────────────────────────────────────────────────

if ! command -v node &>/dev/null; then
    log "ERROR: Node.js not found in PATH"
    exit 1
fi

if [ ! -f "$MCP_DIR/dist/knowledge/nightly-harvest.js" ]; then
    log "ERROR: Compiled pipeline not found. Run: cd $MCP_DIR && npm run build"
    exit 1
fi

# ── Run the pipeline ────────────────────────────────────────────────────────

log "═══ Nightly Harvest Starting ═══"
start_ts=$(date +%s)

cd "$MCP_DIR"

node -e "
  import('$MCP_DIR/dist/knowledge/nightly-harvest.js')
    .then(({ runNightlyHarvest }) => runNightlyHarvest())
    .then((result) => {
      console.log(JSON.stringify({
        runId: result.runId,
        duration: (result.duration / 1000).toFixed(1) + 's',
        projects: result.stages.scan.projectCount,
        sessions: result.stages.parse.sessionCount,
        insights: result.stages.extract.insightCount,
        quirks: result.stages.harvest.quirksInserted,
        security: result.stages.assess.securityFindings,
        report: result.stages.report.path,
        suggestions: result.improvementSuggestions.length,
      }, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Pipeline failed:', err.message || err);
      process.exit(1);
    });
" 2>&1

exit_code=$?
end_ts=$(date +%s)
duration=$((end_ts - start_ts))

if [ $exit_code -eq 0 ]; then
    log "═══ Nightly Harvest Complete (${duration}s) ═══"
else
    log "═══ Nightly Harvest FAILED (${duration}s, exit=$exit_code) ═══"
fi

exit $exit_code
