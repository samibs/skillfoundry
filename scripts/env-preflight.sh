#!/usr/bin/env bash
# env-preflight.sh — Environment audit for AI agent sessions
#
# Runs before any code execution to build a "machine model" that prevents
# common LLM agent failure modes: wrong interpreter, missing permissions,
# uninstalled dependencies, bad PATH, etc.
#
# Usage:
#   bash scripts/env-preflight.sh [workdir]
#
# Output: JSON to stdout with environment facts.
# Exit 0 always (informational, never blocks).

set -uo pipefail

WORKDIR="${1:-.}"
WORKDIR="$(cd "$WORKDIR" 2>/dev/null && pwd || echo "$WORKDIR")"

# ── Collect environment facts ───────────────────────────────────────────────

collect_json() {
  local os_name kernel shell_name shell_version
  os_name="$(uname -s 2>/dev/null || echo unknown)"
  kernel="$(uname -r 2>/dev/null || echo unknown)"
  shell_name="$(basename "${SHELL:-unknown}" 2>/dev/null || echo unknown)"
  shell_version="$("$SHELL" --version 2>/dev/null | head -1 || echo unknown)"

  # Python detection
  local python_bin="" python_version=""
  if command -v python3 &>/dev/null; then
    python_bin="python3"
    python_version="$(python3 --version 2>&1 | head -1)"
  elif command -v python &>/dev/null; then
    python_bin="python"
    python_version="$(python --version 2>&1 | head -1)"
  fi

  # Venv detection
  local venv_path="" venv_python=""
  for candidate in venv .venv env .env; do
    if [ -f "$WORKDIR/$candidate/bin/python3" ]; then
      venv_path="$WORKDIR/$candidate"
      venv_python="$venv_path/bin/python3"
      break
    elif [ -f "$WORKDIR/$candidate/bin/python" ]; then
      venv_path="$WORKDIR/$candidate"
      venv_python="$venv_path/bin/python"
      break
    fi
  done

  # Also check backend/ subdirectory
  if [ -z "$venv_path" ]; then
    for candidate in backend/venv backend/.venv; do
      if [ -f "$WORKDIR/$candidate/bin/python3" ]; then
        venv_path="$WORKDIR/$candidate"
        venv_python="$venv_path/bin/python3"
        break
      fi
    done
  fi

  # Node.js detection
  local node_bin="" node_version="" npm_version=""
  if command -v node &>/dev/null; then
    node_bin="$(command -v node)"
    node_version="$(node --version 2>&1)"
  fi
  if command -v npm &>/dev/null; then
    npm_version="$(npm --version 2>&1)"
  fi

  # TypeScript detection
  local tsc_path="" tsc_executable=false tsc_version=""
  if [ -f "$WORKDIR/node_modules/.bin/tsc" ]; then
    tsc_path="$WORKDIR/node_modules/.bin/tsc"
    [ -x "$tsc_path" ] && tsc_executable=true
    tsc_version="$(npx tsc --version 2>/dev/null || echo unknown)"
  fi

  # tsconfig check
  local has_tsconfig=false ts_types_node=false
  if [ -f "$WORKDIR/tsconfig.json" ]; then
    has_tsconfig=true
    # Check if @types/node is installed
    if [ -d "$WORKDIR/node_modules/@types/node" ]; then
      ts_types_node=true
    fi
  fi

  # Package manager detection
  local has_package_json=false has_node_modules=false
  [ -f "$WORKDIR/package.json" ] && has_package_json=true
  [ -d "$WORKDIR/node_modules" ] && has_node_modules=true

  # Git detection
  local git_version="" git_branch="" git_clean=false
  if command -v git &>/dev/null; then
    git_version="$(git --version 2>&1 | head -1)"
    git_branch="$(git branch --show-current 2>/dev/null || echo "")"
    git diff --quiet 2>/dev/null && git_clean=true
  fi

  # Docker detection
  local has_docker=false docker_running=false
  if command -v docker &>/dev/null; then
    has_docker=true
    docker info &>/dev/null 2>&1 && docker_running=true
  fi

  # Database tools
  local has_alembic=false alembic_path=""
  if [ -n "$venv_python" ] && [ -f "$venv_path/bin/alembic" ]; then
    has_alembic=true
    alembic_path="$venv_path/bin/alembic"
  elif command -v alembic &>/dev/null; then
    has_alembic=true
    alembic_path="$(command -v alembic)"
  fi

  local has_prisma=false
  [ -f "$WORKDIR/node_modules/.bin/prisma" ] && has_prisma=true

  # .env file detection and safety check
  local has_dotenv=false dotenv_path="" dotenv_unsafe=false
  for env_candidate in .env backend/.env; do
    if [ -f "$WORKDIR/$env_candidate" ]; then
      has_dotenv=true
      dotenv_path="$WORKDIR/$env_candidate"
      # Check if .env contains bash-unsafe characters (unquoted <, >, |, &, (, ))
      if grep -qP '=.*[<>|&()]' "$dotenv_path" 2>/dev/null || \
         grep -qE '=[^"'"'"']*[<>|&()]' "$dotenv_path" 2>/dev/null; then
        dotenv_unsafe=true
      fi
      break
    fi
  done

  # Database URL detection (safe extraction, never source)
  local has_database_url=false database_url_prefix=""
  if [ -n "$dotenv_path" ]; then
    local db_url
    db_url=$(grep '^DATABASE_URL=' "$dotenv_path" 2>/dev/null | head -1 | cut -d= -f2-)
    if [ -n "$db_url" ]; then
      has_database_url=true
      database_url_prefix="${db_url:0:20}..."
    fi
  fi

  # Process manager
  local has_pm2=false
  command -v pm2 &>/dev/null && has_pm2=true

  # Disk space (root partition)
  local disk_free=""
  disk_free="$(df -h "$WORKDIR" 2>/dev/null | tail -1 | awk '{print $4}' || echo unknown)"

  # ── Build JSON output ───────────────────────────────────────────────────
  cat <<ENDJSON
{
  "env_preflight": true,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "workdir": "$(realpath "$WORKDIR" 2>/dev/null || echo "$WORKDIR")",
  "os": {
    "name": "$os_name",
    "kernel": "$kernel",
    "shell": "$shell_name"
  },
  "python": {
    "system_binary": "$python_bin",
    "system_version": "$python_version",
    "venv_path": "$venv_path",
    "venv_python": "$venv_python",
    "recommendation": "$(if [ -n "$venv_python" ]; then echo "USE: $venv_python (venv detected)"; elif [ -n "$python_bin" ]; then echo "USE: $python_bin"; else echo "NONE: no python found"; fi)"
  },
  "node": {
    "binary": "$node_bin",
    "version": "$node_version",
    "npm_version": "$npm_version",
    "has_package_json": $has_package_json,
    "has_node_modules": $has_node_modules
  },
  "typescript": {
    "tsc_path": "$tsc_path",
    "tsc_executable": $tsc_executable,
    "tsc_version": "$tsc_version",
    "has_tsconfig": $has_tsconfig,
    "types_node_installed": $ts_types_node
  },
  "git": {
    "version": "$git_version",
    "branch": "$git_branch",
    "clean": $git_clean
  },
  "dotenv": {
    "has_dotenv": $has_dotenv,
    "path": "$dotenv_path",
    "unsafe_for_source": $dotenv_unsafe,
    "has_database_url": $has_database_url,
    "database_url_prefix": "$database_url_prefix",
    "recommendation": "$(if [ "$dotenv_unsafe" = true ]; then echo "NEVER source — contains bash-unsafe characters. Use: grep '^KEY=' .env | cut -d= -f2-"; elif [ "$has_dotenv" = true ]; then echo "Extract values with grep, do not source"; else echo "No .env file found"; fi)"
  },
  "database": {
    "has_alembic": $has_alembic,
    "alembic_path": "$alembic_path",
    "has_prisma": $has_prisma
  },
  "tools": {
    "has_docker": $has_docker,
    "docker_running": $docker_running,
    "has_pm2": $has_pm2
  },
  "disk_free": "$disk_free",
  "warnings": [$(
    warnings=""
    [ -z "$python_bin" ] && [ -n "$venv_python" ] && warnings="${warnings}\"System python not in PATH but venv exists — use $venv_python directly\","
    [ "$tsc_executable" = false ] && [ -n "$tsc_path" ] && warnings="${warnings}\"tsc exists but is not executable — run: chmod +x $tsc_path\","
    [ "$has_tsconfig" = true ] && [ "$ts_types_node" = false ] && warnings="${warnings}\"tsconfig.json exists but @types/node missing — run: npm i -D @types/node\","
    [ "$has_package_json" = true ] && [ "$has_node_modules" = false ] && warnings="${warnings}\"package.json exists but node_modules missing — run: npm install\","
    [ "$dotenv_unsafe" = true ] && warnings="${warnings}\"CRITICAL: .env contains bash-unsafe characters (<>|&) — NEVER use 'source .env'. Extract values with: grep '^KEY=' .env | cut -d= -f2-\","
    [ "$has_dotenv" = true ] && [ "$has_database_url" = false ] && warnings="${warnings}\"WARNING: .env exists but no DATABASE_URL found — check if DB connection string uses a different key\","
    echo "${warnings%,}"
  )]
}
ENDJSON
}

collect_json
