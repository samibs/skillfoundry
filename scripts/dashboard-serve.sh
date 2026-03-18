#!/bin/bash

# SkillFoundry Centralized Dashboard — One-Command Launcher
# Syncs all projects, captures KPI snapshots, seeds playbooks,
# scans for remediations, then starts the web dashboard.
#
# USAGE:
#   ./scripts/dashboard-serve.sh [options]
#   ./scripts/dashboard-serve.sh --port=8080
#   ./scripts/dashboard-serve.sh --sync-only
#   ./scripts/dashboard-serve.sh --help
#
# REQUIRES: Node.js >= 20, better-sqlite3 installed in sf_cli/

set -e
set -o pipefail

# ── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Defaults ────────────────────────────────────────────────
PORT=9400
SYNC_ONLY=false
SKIP_SYNC=false
OPEN_BROWSER=false

# ── Find framework root ────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRAMEWORK_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_PATH="$FRAMEWORK_ROOT/data/dashboard.db"
DIST="$FRAMEWORK_ROOT/sf_cli/dist"

# ── Argument parsing ───────────────────────────────────────
show_help() {
    echo -e "${BOLD}SkillFoundry Centralized Dashboard${NC}"
    echo ""
    echo "USAGE:"
    echo "  ./scripts/dashboard-serve.sh [options]"
    echo ""
    echo "OPTIONS:"
    echo "  --port=N          Port for web dashboard (default: 9400)"
    echo "  --sync-only       Sync and prepare only, don't start server"
    echo "  --skip-sync       Skip sync, just start server"
    echo "  --open            Open browser after starting"
    echo "  --help            Show this help message"
    echo ""
    echo "WHAT IT DOES:"
    echo "  1. Syncs all registered projects into data/dashboard.db"
    echo "  2. Captures KPI snapshots for trend tracking"
    echo "  3. Seeds remediation playbooks (10 built-in)"
    echo "  4. Scans for auto-remediation opportunities"
    echo "  5. Starts web dashboard at http://127.0.0.1:PORT"
    echo ""
    echo "EXAMPLES:"
    echo "  ./scripts/dashboard-serve.sh              # Default (port 9400)"
    echo "  ./scripts/dashboard-serve.sh --port=8080  # Custom port"
    echo "  ./scripts/dashboard-serve.sh --sync-only  # Sync without server"
}

for arg in "$@"; do
    case "$arg" in
        --help|-h) show_help; exit 0 ;;
        --port=*) PORT="${arg#--port=}" ;;
        --sync-only) SYNC_ONLY=true ;;
        --skip-sync) SKIP_SYNC=true ;;
        --open) OPEN_BROWSER=true ;;
        --*) echo -e "${RED}[FAIL]${NC} Unknown option: $arg"; show_help; exit 1 ;;
    esac
done

# ── Validate ────────────────────────────────────────────────
if [ ! -f "$FRAMEWORK_ROOT/.project-registry" ]; then
    echo -e "${RED}[FAIL]${NC} No .project-registry found at $FRAMEWORK_ROOT"
    echo "       Run this from the SkillFoundry framework root."
    exit 1
fi

if ! command -v node &>/dev/null; then
    echo -e "${RED}[FAIL]${NC} Node.js not found. Install Node.js >= 20."
    exit 1
fi

# Ensure data directory exists
mkdir -p "$FRAMEWORK_ROOT/data"

# ── Auto-install dependencies if missing ────────────────────
if [ ! -d "$FRAMEWORK_ROOT/sf_cli/node_modules/better-sqlite3" ]; then
    echo -e "${YELLOW}[DEPS]${NC} better-sqlite3 not found — installing dependencies..."
    if [ -f "$FRAMEWORK_ROOT/sf_cli/package-lock.json" ]; then
        (cd "$FRAMEWORK_ROOT/sf_cli" && npm ci 2>&1 | tail -3) || \
        (cd "$FRAMEWORK_ROOT/sf_cli" && npm install 2>&1 | tail -3)
    else
        (cd "$FRAMEWORK_ROOT/sf_cli" && npm install 2>&1 | tail -3)
    fi
    if [ ! -d "$FRAMEWORK_ROOT/sf_cli/node_modules/better-sqlite3" ]; then
        echo -e "${RED}[FAIL]${NC} Failed to install better-sqlite3."
        echo "       Run manually: cd $FRAMEWORK_ROOT/sf_cli && npm install"
        exit 1
    fi
    echo -e "       ${GREEN}Done${NC} — dependencies installed."
fi

# ── Check compiled dist exists ──────────────────────────────
if [ ! -f "$DIST/core/dashboard-db.js" ]; then
    echo -e "${YELLOW}[BUILD]${NC} Compiled files not found — building..."
    if command -v npx &>/dev/null; then
        (cd "$FRAMEWORK_ROOT/sf_cli" && npx tsc 2>&1 | tail -5) || true
    fi
    if [ ! -f "$DIST/core/dashboard-db.js" ]; then
        echo -e "${RED}[FAIL]${NC} Build failed. Run manually: cd $FRAMEWORK_ROOT/sf_cli && npx tsc"
        exit 1
    fi
    echo -e "       ${GREEN}Done${NC} — build complete."
fi

# ── Helper: run ESM node code ───────────────────────────────
# sf_cli is "type": "module", so we must use dynamic import()
run_node() {
    node --input-type=module -e "$1" 2>&1
}

# ── Banner ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}  SkillFoundry Centralized Dashboard${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Step 1: Sync ────────────────────────────────────────────
if [ "$SKIP_SYNC" = false ]; then
    echo -e "${CYAN}[1/4]${NC} Syncing all projects..."
    SYNC_OUTPUT=$(run_node "
        const { syncAllProjects } = await import('$DIST/core/dashboard-sync.js');
        const r = syncAllProjects('$DB_PATH', '$FRAMEWORK_ROOT');
        console.log(JSON.stringify(r));
    ") || true

    if echo "$SYNC_OUTPUT" | node -e "process.stdin.on('data',d=>{try{JSON.parse(d);process.exit(0)}catch{process.exit(1)}})" 2>/dev/null; then
        PROJECTS=$(echo "$SYNC_OUTPUT" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log(r.projects_synced)})")
        EVENTS=$(echo "$SYNC_OUTPUT" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log(r.events_added)})")
        KNOWLEDGE=$(echo "$SYNC_OUTPUT" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log(r.knowledge_added)})")
        echo -e "      ${GREEN}Done${NC} — $PROJECTS projects, $EVENTS events, $KNOWLEDGE knowledge entries"
    else
        echo -e "      ${YELLOW}Warning${NC} — sync error:"
        echo -e "      ${DIM}$(echo "$SYNC_OUTPUT" | head -5)${NC}"
    fi

    # ── Step 2: KPI Snapshots ───────────────────────────────
    echo -e "${CYAN}[2/4]${NC} Capturing KPI snapshots..."
    SNAP_OUTPUT=$(run_node "
        const { initDatabase } = await import('$DIST/core/dashboard-db.js');
        const { captureSnapshots } = await import('$DIST/core/kpi-engine.js');
        const db = initDatabase('$DB_PATH');
        const r = captureSnapshots(db);
        console.log(JSON.stringify(r));
        db.close();
    ") || true

    if echo "$SNAP_OUTPUT" | node -e "process.stdin.on('data',d=>{try{JSON.parse(d);process.exit(0)}catch{process.exit(1)}})" 2>/dev/null; then
        CAPTURED=$(echo "$SNAP_OUTPUT" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log(r.projects_captured)})")
        SKIPPED=$(echo "$SNAP_OUTPUT" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log(r.projects_skipped)})")
        echo -e "      ${GREEN}Done${NC} — $CAPTURED captured, $SKIPPED already today"
    else
        echo -e "      ${YELLOW}Warning${NC} — snapshot error:"
        echo -e "      ${DIM}$(echo "$SNAP_OUTPUT" | head -5)${NC}"
    fi

    # ── Step 3: Seed Playbooks ──────────────────────────────
    echo -e "${CYAN}[3/4]${NC} Seeding playbooks & scanning remediations..."
    REM_OUTPUT=$(run_node "
        const { initDatabase } = await import('$DIST/core/dashboard-db.js');
        const { seedPlaybooks, scanForRemediations } = await import('$DIST/core/remediation-engine.js');
        const db = initDatabase('$DB_PATH');
        seedPlaybooks(db);
        const scan = scanForRemediations(db);
        console.log(JSON.stringify(scan));
        db.close();
    ") || true

    if echo "$REM_OUTPUT" | node -e "process.stdin.on('data',d=>{try{JSON.parse(d);process.exit(0)}catch{process.exit(1)}})" 2>/dev/null; then
        CREATED=$(echo "$REM_OUTPUT" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log(r.actions_created)})")
        AUTO=$(echo "$REM_OUTPUT" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log(r.auto_applied)})")
        echo -e "      ${GREEN}Done${NC} — $CREATED remediations created, $AUTO auto-applied"
    else
        echo -e "      ${YELLOW}Warning${NC} — remediation error:"
        echo -e "      ${DIM}$(echo "$REM_OUTPUT" | head -5)${NC}"
    fi
else
    echo -e "${DIM}  Sync skipped (--skip-sync)${NC}"
fi

# ── Step 4: Start Server ───────────────────────────────────
if [ "$SYNC_ONLY" = true ]; then
    echo ""
    echo -e "${GREEN}[DONE]${NC} Sync complete. Database at: $DB_PATH"
    echo -e "       Run without --sync-only to start the web dashboard."
    exit 0
fi

echo -e "${CYAN}[4/4]${NC} Starting web dashboard on port $PORT..."
echo ""
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${BOLD}Dashboard:${NC}  ${GREEN}http://127.0.0.1:$PORT${NC}"
echo -e "  ${BOLD}Database:${NC}   $DB_PATH"
echo -e "  ${BOLD}Stop:${NC}       Press ${BOLD}Ctrl+C${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Open browser if requested
if [ "$OPEN_BROWSER" = true ]; then
    if command -v xdg-open &>/dev/null; then
        xdg-open "http://127.0.0.1:$PORT" 2>/dev/null &
    elif command -v open &>/dev/null; then
        open "http://127.0.0.1:$PORT" 2>/dev/null &
    fi
fi

# Trap for clean exit
trap 'echo -e "\n${CYAN}[INFO]${NC} Dashboard stopped."; exit 0' INT TERM

# Start server (blocks until Ctrl+C)
exec node --input-type=module -e "
    const { startServer } = await import('$DIST/core/dashboard-server.js');
    startServer({ dbPath: '$DB_PATH', frameworkDir: '$FRAMEWORK_ROOT', port: $PORT });
"
