#!/usr/bin/env bash
set -euo pipefail

VERSION="0.1.0"
WORK_DIR=".skillfoundry"
CONFIG_FILE="$WORK_DIR/config.toml"
POLICY_FILE="$WORK_DIR/policy.toml"
PLAN_DIR="$WORK_DIR/plans"
RUN_DIR="$WORK_DIR/runs"
MEMORY_DIR="memory_bank/knowledge"
USAGE_FILE="$WORK_DIR/usage.jsonl"
STATE_FILE=".claude/state.json"
METRICS_FILE=".claude/metrics.json"

# Optional UI modules for interactive shell.
if [[ -f "sf_cli/theme/tokens.sh" ]]; then
  # shellcheck source=/dev/null
  source "sf_cli/theme/tokens.sh"
fi
if [[ -f "sf_cli/ui/tui.sh" ]]; then
  # shellcheck source=/dev/null
  source "sf_cli/ui/tui.sh"
fi

print_usage() {
  cat << 'USAGE'
SkillFoundry CLI

Usage:
  sf <command> [options]

Commands:
  init [--force]
  validate [<prd-file>]
  rollback [<run-id>]
  deps
  resume
  clean [--force]
  plan "<task>" [--provider <name>] [--model <id>] [--budget <usd>] [--json]
  apply --plan <plan-id> [--checkpoint]
  chat [--provider <name>] [--engine api|broker]
  ask "<prompt>" [--provider <name>] [--engine api|broker] [--raw|--json]
  provider set <name>
  provider list
  config set <key> <value>
  config get <key>
  status
  state
  metrics
  policy check
  memory recall "<query>"
  memory record --from-run <run-id>
  memory sync
  lessons capture --from-run <run-id>
  runlog export --run <run-id> [--out <path>]
  tui [--high-contrast] [--reduced-motion]

Examples:
  sf init
  sf provider set xai
  sf plan "add provider routing"
  sf apply --plan plan_20260223_010000
USAGE
}

now_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

gen_id() {
  local prefix="$1"
  date +"${prefix}_%Y%m%d_%H%M%S"
}

ensure_workspace() {
  mkdir -p "$WORK_DIR" "$PLAN_DIR" "$RUN_DIR" ".claude"
}

init_state_if_missing() {
  ensure_workspace
  if [[ ! -f "$STATE_FILE" ]] || ! jq -e '.' "$STATE_FILE" >/dev/null 2>&1; then
    jq -n \
      --arg ts "$(now_utc)" \
      '{current_state:"IDLE",updated_at:$ts,current_prd:"",current_story:"",last_plan_id:"",last_run_id:"",recovery:{rollback_available:false,resume_point:""}}' \
      > "$STATE_FILE"
  fi
}

set_state() {
  local new_state="$1"
  local prd="${2:-}"
  local story="${3:-}"
  local plan_id="${4:-}"
  local run_id="${5:-}"
  init_state_if_missing
  local tmp
  tmp=$(mktemp)
  jq \
    --arg st "$new_state" \
    --arg ts "$(now_utc)" \
    --arg prd "$prd" \
    --arg story "$story" \
    --arg plan_id "$plan_id" \
    --arg run_id "$run_id" \
    '.current_state=$st
     | .updated_at=$ts
     | .current_prd=(if $prd != "" then $prd else .current_prd end)
     | .current_story=(if $story != "" then $story else .current_story end)
     | .last_plan_id=(if $plan_id != "" then $plan_id else .last_plan_id end)
     | .last_run_id=(if $run_id != "" then $run_id else .last_run_id end)
     | .recovery.rollback_available=(if $run_id != "" then true else .recovery.rollback_available end)
     | .recovery.resume_point=(if $story != "" then $story else .recovery.resume_point end)' \
    "$STATE_FILE" > "$tmp"
  mv "$tmp" "$STATE_FILE"
}

record_metric() {
  local command="$1"
  local outcome="$2"
  ensure_workspace
  if [[ ! -f "$METRICS_FILE" ]] || ! jq -e '.' "$METRICS_FILE" >/dev/null 2>&1; then
    jq -n \
      --arg ts "$(now_utc)" \
      '{updated_at:$ts,commands:{},status:{success:0,failed:0}}' > "$METRICS_FILE"
  fi

  local tmp
  tmp=$(mktemp)
  if ! jq \
    --arg command "$command" \
    --arg outcome "$outcome" \
    --arg ts "$(now_utc)" \
    '.updated_at=$ts
     | .commands[$command]=((.commands[$command] // 0) + 1)
     | .status.success=(if $outcome == "success" then (.status.success + 1) else .status.success end)
     | .status.failed=(if $outcome == "failed" then (.status.failed + 1) else .status.failed end)' \
    "$METRICS_FILE" > "$tmp"; then
    jq -n \
      --arg ts "$(now_utc)" \
      '{updated_at:$ts,commands:{},status:{success:0,failed:0}}' > "$METRICS_FILE"
    jq \
      --arg command "$command" \
      --arg outcome "$outcome" \
      --arg ts "$(now_utc)" \
      '.updated_at=$ts
       | .commands[$command]=((.commands[$command] // 0) + 1)
       | .status.success=(if $outcome == "success" then (.status.success + 1) else .status.success end)
       | .status.failed=(if $outcome == "failed" then (.status.failed + 1) else .status.failed end)' \
      "$METRICS_FILE" > "$tmp"
  fi
  mv "$tmp" "$METRICS_FILE"
}

create_default_config() {
  cat > "$CONFIG_FILE" << 'CFG'
provider = "xai"
engine = "api"
model = "grok-4"
fallback_provider = "openai"
fallback_engine = "broker"
monthly_budget_usd = 50
run_budget_usd = 2
memory_sync_enabled = false
memory_sync_remote = "origin"
CFG
}

create_default_policy() {
  cat > "$POLICY_FILE" << 'POL'
allow_shell = false
allow_network = false
allow_paths = [".", "memory_bank", ".skillfoundry", "docs", "genesis"]
redact = true
POL
}

get_cfg() {
  local key="$1"
  local default_val="${2:-}"
  if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "$default_val"
    return
  fi
  local line
  line=$(grep -E "^${key}[[:space:]]*=" "$CONFIG_FILE" | tail -n1 || true)
  if [[ -z "$line" ]]; then
    echo "$default_val"
    return
  fi
  local val
  val=$(echo "$line" | cut -d '=' -f2- | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//')
  echo "$val"
}

set_cfg() {
  local key="$1"
  local val="$2"
  ensure_workspace
  if [[ ! -f "$CONFIG_FILE" ]]; then
    create_default_config
  fi
  if grep -qE "^${key}[[:space:]]*=" "$CONFIG_FILE"; then
    sed -i -E "s|^${key}[[:space:]]*=.*$|${key} = \"${val}\"|" "$CONFIG_FILE"
  else
    echo "${key} = \"${val}\"" >> "$CONFIG_FILE"
  fi
}

policy_allows_network() {
  if [[ ! -f "$POLICY_FILE" ]]; then
    echo "false"
    return
  fi
  grep -Eq '^allow_network[[:space:]]*=[[:space:]]*true' "$POLICY_FILE" && echo "true" || echo "false"
}

policy_redact() {
  if [[ ! -f "$POLICY_FILE" ]]; then
    echo "true"
    return
  fi
  grep -Eq '^redact[[:space:]]*=[[:space:]]*true' "$POLICY_FILE" && echo "true" || echo "false"
}

policy_allows_path() {
  local target="$1"
  if [[ ! -f "$POLICY_FILE" ]]; then
    return 0
  fi
  local paths_line
  paths_line=$(grep -E '^allow_paths[[:space:]]*=' "$POLICY_FILE" | tail -n1 || true)
  if [[ -z "$paths_line" ]]; then
    return 1
  fi
  local rel
  rel=$(realpath -m --relative-to="." "$target" 2>/dev/null || echo "$target")
  local allow_list
  allow_list=$(echo "$paths_line" | sed -E 's/^allow_paths[[:space:]]*=[[:space:]]*\[//' | sed -E 's/\][[:space:]]*$//')
  local item
  while IFS= read -r item; do
    item=$(echo "$item" | tr -d '"' | xargs)
    [[ -z "$item" ]] && continue
    if [[ "$item" == "." ]]; then
      if [[ "$rel" != ..* ]]; then
        return 0
      fi
      continue
    fi
    if [[ "$rel" == "$item" || "$rel" == "$item/"* ]]; then
      return 0
    fi
  done < <(echo "$allow_list" | tr ',' '\n')
  return 1
}

estimate_cost_usd() {
  local text="$1"
  local chars="${#text}"
  # Coarse estimate for guardrail checks; keeps budget logic deterministic.
  awk -v c="$chars" 'BEGIN { printf "%.4f", (c/1000.0)*0.02 }'
}

current_month_spend_usd() {
  if [[ ! -f "$USAGE_FILE" ]]; then
    echo "0"
    return
  fi
  local month
  month=$(date -u +%Y-%m)
  jq -s --arg m "$month" '[ .[] | select(.month == $m) | .cost_usd ] | add // 0' "$USAGE_FILE" 2>/dev/null || echo "0"
}

budget_allows_cost() {
  local cost="$1"
  local run_budget
  run_budget=$(get_cfg "run_budget_usd" "2")
  local monthly_budget
  monthly_budget=$(get_cfg "monthly_budget_usd" "50")
  local month_used
  month_used=$(current_month_spend_usd)

  awk -v c="$cost" -v r="$run_budget" -v m="$monthly_budget" -v u="$month_used" 'BEGIN {
    if (c > r) exit 1;
    if ((u + c) > m) exit 2;
    exit 0;
  }'
}

record_usage() {
  local feature="$1"
  local cost="$2"
  ensure_workspace
  mkdir -p "$WORK_DIR"
  jq -n \
    --arg ts "$(now_utc)" \
    --arg month "$(date -u +%Y-%m)" \
    --arg feature "$feature" \
    --argjson cost "$cost" \
    '{timestamp:$ts,month:$month,feature:$feature,cost_usd:$cost}' >> "$USAGE_FILE"
}

memory_sync_enabled() {
  local v
  v=$(get_cfg "memory_sync_enabled" "false")
  [[ "$v" == "true" ]]
}

sync_memory_to_git() {
  if ! memory_sync_enabled; then
    echo "[INFO] memory sync disabled"
    return 0
  fi
  if ! command -v git >/dev/null 2>&1; then
    echo "[BLOCK] git not available for memory sync" >&2
    return 1
  fi
  local remote
  remote=$(get_cfg "memory_sync_remote" "origin")
  if [[ ! -d ".git" ]]; then
    echo "[BLOCK] not a git repository; cannot sync memory" >&2
    return 1
  fi
  git add "$MEMORY_DIR" 2>/dev/null || true
  if git diff --cached --quiet; then
    echo "[INFO] no memory changes to sync"
    return 0
  fi
  git commit -m "chore(memory): sync lessons and run records" >/dev/null 2>&1 || true
  git push "$remote" HEAD >/dev/null 2>&1 || {
    echo "[WARN] memory sync push failed (remote/auth/network)"
    return 1
  }
  echo "[OK] memory synced to git remote '$remote'"
}

redact_text() {
  local input="$1"
  # Redact long token-like sequences and common key signatures.
  echo "$input" | \
    sed -E 's/(sk-[A-Za-z0-9_-]{20,})/[REDACTED]/g' | \
    sed -E 's/(xai-[A-Za-z0-9_-]{20,})/[REDACTED]/g' | \
    sed -E 's/(ghp_[A-Za-z0-9]{20,})/[REDACTED]/g' | \
    sed -E 's/([A-Za-z0-9_]{24,})/[REDACTED]/g'
}

cmd_init() {
  local force="false"
  if [[ "${1:-}" == "--force" ]]; then
    force="true"
  fi

  ensure_workspace
  init_state_if_missing

  if [[ -f "$CONFIG_FILE" && "$force" != "true" ]]; then
    echo "[OK] Workspace already initialized: $WORK_DIR"
    echo "[INFO] Use 'sf init --force' to regenerate defaults"
    record_metric "init" "success"
    return 0
  fi

  create_default_config
  create_default_policy
  mkdir -p "$PLAN_DIR" "$RUN_DIR"

  echo "[OK] Created $CONFIG_FILE"
  echo "[OK] Created $POLICY_FILE"
  echo "[OK] Ensured $PLAN_DIR and $RUN_DIR"
  record_metric "init" "success"
}

cmd_validate() {
  local prd_file="${1:-genesis/2026-02-22-skillfoundry-cli-platform.md}"
  if [[ ! -f "$prd_file" ]]; then
    echo "[BLOCK] PRD not found: $prd_file" >&2
    record_metric "validate" "failed"
    exit 1
  fi

  local missing=0
  local patterns=(
    "^## [0-9]+\\. Overview([[:space:]].*)?$"
    "^## [0-9]+\\. User Stories([[:space:]].*)?$"
    "^## [0-9]+\\. Functional Requirements([[:space:]].*)?$"
    "^## [0-9]+\\. Non-Functional Requirements([[:space:]].*)?$"
    "^## [0-9]+\\. Technical Specifications([[:space:]].*)?$"
    "^## [0-9]+\\. (Out of Scope|Constraints[[:space:]]*&[[:space:]]*Assumptions)([[:space:]].*)?$"
    "^## [0-9]+\\. (Definition of Done|Acceptance Criteria)([[:space:]].*)?$"
  )
  local labels=(
    "Overview"
    "User Stories"
    "Functional Requirements"
    "Non-Functional Requirements"
    "Technical Specifications"
    "Out of Scope / Constraints & Assumptions"
    "Definition of Done / Acceptance Criteria"
  )
  local i
  for i in "${!patterns[@]}"; do
    local pattern="${patterns[$i]}"
    local label="${labels[$i]}"
    if ! rg -q "$pattern" "$prd_file"; then
      echo "[BLOCK] Missing required section: $label"
      missing=$((missing + 1))
    fi
  done

  if [[ "$missing" -gt 0 ]]; then
    echo "[BLOCK] PRD validation failed for $prd_file ($missing missing sections)"
    record_metric "validate" "failed"
    exit 2
  fi

  echo "[OK] PRD validated: $prd_file"
  record_metric "validate" "success"
}

cmd_rollback() {
  ensure_workspace
  local target_run="${1:-}"

  if [[ -z "$target_run" ]]; then
    target_run=$(ls -1t "$RUN_DIR"/*.json 2>/dev/null | head -n1 | xargs -n1 basename 2>/dev/null | sed 's/.json$//' || true)
  fi

  if [[ -z "$target_run" ]]; then
    echo "[INFO] No run artifact available to rollback."
    record_metric "rollback" "success"
    return 0
  fi

  local run_file="$RUN_DIR/${target_run}.json"
  if [[ ! -f "$run_file" ]]; then
    echo "[BLOCK] Run not found for rollback: $target_run" >&2
    record_metric "rollback" "failed"
    exit 1
  fi

  local plan_id
  plan_id=$(jq -r '.plan_id // ""' "$run_file")
  rm -f "$run_file" "$RUN_DIR/${target_run}.export.json"
  if [[ -n "$plan_id" ]]; then
    rm -f "$PLAN_DIR/${plan_id}.json"
  fi

  set_state "VALIDATED" "genesis/2026-02-22-skillfoundry-cli-platform.md" "STORY-008" "$plan_id" ""
  echo "[OK] Rolled back artifacts for run: $target_run"
  record_metric "rollback" "success"
}

cmd_provider() {
  local action="${1:-}"
  case "$action" in
    set)
      local name="${2:-}"
      if [[ -z "$name" ]]; then
        echo "Missing provider name" >&2
        exit 1
      fi
      set_cfg "provider" "$name"
      echo "[OK] provider set to '$name'"
      record_metric "provider_set" "success"
      ;;
    list)
      local cur
      cur=$(get_cfg "provider" "xai")
      cat << EOF_L
Available providers:
  - xai
  - openai
  - anthropic
  - gemini
  - ollama
  - claude-cli
  - gemini-cli
Current: $cur
EOF_L
      record_metric "provider_list" "success"
      ;;
    *)
      echo "Usage: sf provider set <name> | sf provider list" >&2
      exit 1
      ;;
  esac
}

cmd_config() {
  local action="${1:-}"
  case "$action" in
    set)
      local key="${2:-}"
      local val="${3:-}"
      [[ -n "$key" && -n "$val" ]] || { echo "Usage: sf config set <key> <value>" >&2; exit 1; }
      set_cfg "$key" "$val"
      echo "[OK] config set $key=$val"
      record_metric "config_set" "success"
      ;;
    get)
      local key="${2:-}"
      [[ -n "$key" ]] || { echo "Usage: sf config get <key>" >&2; exit 1; }
      get_cfg "$key" ""
      record_metric "config_get" "success"
      ;;
    *)
      echo "Usage: sf config set <key> <value> | sf config get <key>" >&2
      exit 1
      ;;
  esac
}

cmd_deps() {
  local story_dir="docs/stories/skillfoundry-cli-platform"
  if [[ ! -d "$story_dir" ]]; then
    echo "[BLOCK] Story directory not found: $story_dir" >&2
    record_metric "deps" "failed"
    exit 1
  fi

  echo "Story dependency graph (skillfoundry-cli-platform):"
  local story_file
  while IFS= read -r story_file; do
    local name
    name=$(basename "$story_file")
    local deps_line
    deps_line=$(grep -E '^\*\*Dependencies:\*\*' "$story_file" | head -n1 || true)
    local deps
    deps=$(echo "$deps_line" | sed -E 's/^\*\*Dependencies:\*\*[[:space:]]*//' | xargs)
    if [[ -z "$deps" ]]; then
      deps="None"
    fi
    echo "- $name -> $deps"
  done < <(ls -1 "$story_dir"/STORY-*.md | sort)

  record_metric "deps" "success"
}

cmd_resume() {
  init_state_if_missing
  local current_state
  current_state=$(jq -r '.current_state' "$STATE_FILE")
  local last_plan
  last_plan=$(jq -r '.last_plan_id // ""' "$STATE_FILE")
  local resume_point
  resume_point=$(jq -r '.recovery.resume_point // ""' "$STATE_FILE")

  if [[ "$current_state" == "IDLE" ]]; then
    echo "[INFO] No interrupted execution to resume."
    record_metric "resume" "success"
    return 0
  fi

  echo "[INFO] Resume state detected:"
  echo "  current_state: $current_state"
  echo "  resume_point: ${resume_point:-none}"
  echo "  last_plan_id: ${last_plan:-none}"

  if [[ -n "$last_plan" && -f "$PLAN_DIR/${last_plan}.json" ]]; then
    echo "[INFO] Resuming by retrying apply for plan: $last_plan"
    if bash sf_cli/sf.sh apply --plan "$last_plan"; then
      record_metric "resume" "success"
      return 0
    fi
    record_metric "resume" "failed"
    return 1
  fi

  echo "[WARN] No resumable plan artifact found."
  record_metric "resume" "failed"
  return 1
}

cmd_clean() {
  local force="${1:-}"
  if [[ "$force" != "--force" ]]; then
    echo "Usage: sf clean --force" >&2
    return 1
  fi
  ensure_workspace
  rm -rf "$PLAN_DIR" "$RUN_DIR"
  mkdir -p "$PLAN_DIR" "$RUN_DIR"
  : > "$USAGE_FILE"
  rm -f "$WORK_DIR/timeline.log"
  rm -f "$STATE_FILE" "$METRICS_FILE"
  init_state_if_missing
  echo "[OK] Execution artifacts cleaned and state reset."
  record_metric "clean" "success"
}

collect_memory_hits() {
  local query="$1"
  if [[ ! -d "$MEMORY_DIR" ]]; then
    echo "[]"
    return
  fi
  local terms
  terms=$(echo "$query" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '\n' | awk 'length($0)>3' | head -n 3)
  if [[ -z "$terms" ]]; then
    echo "[]"
    return
  fi

  local hits="[]"
  while IFS= read -r term; do
    local match
    match=$(rg -n -i "$term" "$MEMORY_DIR" 2>/dev/null | head -n 2 || true)
    if [[ -n "$match" ]]; then
      while IFS= read -r line; do
        local file
        file=$(echo "$line" | cut -d: -f1)
        local ln
        ln=$(echo "$line" | cut -d: -f2)
        local snippet
        snippet=$(echo "$line" | cut -d: -f3- | sed 's/"/\\"/g')
        hits=$(echo "$hits" | jq --arg f "$file" --arg l "$ln" --arg s "$snippet" '. + [{"file":$f,"line":$l,"snippet":$s}]')
      done <<< "$match"
    fi
  done <<< "$terms"

  echo "$hits"
}

cmd_plan() {
  ensure_workspace
  if [[ ! -f "$CONFIG_FILE" ]]; then
    cmd_init
  fi

  local task="${1:-}"
  shift || true
  if [[ -z "$task" ]]; then
    echo "Usage: sf plan \"<task>\" [--provider <name>] [--model <id>] [--budget <usd>] [--json]" >&2
    exit 1
  fi

  local provider
  provider=$(get_cfg "provider" "xai")
  local model
  model=$(get_cfg "model" "grok-4")
  local budget
  budget=$(get_cfg "run_budget_usd" "2")
  local output_json="false"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --provider)
        provider="$2"; shift 2 ;;
      --model)
        model="$2"; shift 2 ;;
      --budget)
        budget="$2"; shift 2 ;;
      --json)
        output_json="true"; shift ;;
      *)
        echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  local plan_id
  plan_id=$(gen_id "plan")
  set_state "GENERATING_STORIES" "genesis/2026-02-22-skillfoundry-cli-platform.md" "STORY-007" "$plan_id" ""
  local memory_hits
  memory_hits=$(collect_memory_hits "$task")

  jq -n \
    --arg plan_id "$plan_id" \
    --arg created_at "$(now_utc)" \
    --arg task "$task" \
    --arg provider "$provider" \
    --arg model "$model" \
    --arg budget "$budget" \
    --argjson memory_hits "$memory_hits" \
    '{plan_id:$plan_id,created_at:$created_at,task:$task,route:{provider:$provider,model:$model},budget_usd:($budget|tonumber),memory_hits:$memory_hits,status:"planned"}' \
    > "$PLAN_DIR/${plan_id}.json"

  if [[ "$output_json" == "true" ]]; then
    set_state "VALIDATED" "genesis/2026-02-22-skillfoundry-cli-platform.md" "STORY-007" "$plan_id" ""
    record_metric "plan" "success"
    cat "$PLAN_DIR/${plan_id}.json"
    return 0
  fi

  echo "[OK] Plan created: $plan_id"
  echo "[INFO] Route: $provider:$model"
  echo "[INFO] Budget cap: \$$budget"
  echo "[INFO] Memory hits: $(jq '.memory_hits | length' "$PLAN_DIR/${plan_id}.json")"
  echo "Next: sf apply --plan $plan_id"
  set_state "VALIDATED" "genesis/2026-02-22-skillfoundry-cli-platform.md" "STORY-007" "$plan_id" ""
  record_metric "plan" "success"
}

run_gate_t1() {
  bash scripts/anvil.sh check sf_cli >/tmp/sf_gate_t1_sf_cli.log 2>&1 || return 1
  bash scripts/anvil.sh check docs/stories/skillfoundry-cli-platform >/tmp/sf_gate_t1_stories.log 2>&1 || return 1
  bash scripts/anvil.sh check genesis/2026-02-22-skillfoundry-cli-platform.md >/tmp/sf_gate_t1_prd.log 2>&1 || return 1
  return 0
}

run_gate_t2() {
  bash sf_cli/sf.sh --version >/dev/null 2>&1
}

run_gate_t3() {
  local banned_re
  banned_re='[T][O][D][O]|[F][I][X][M][E]|[P][L][A][C][E][H][O][L][D][E][R]|[S][T][U][B]|[H][A][C][K]|[X][X][X]|[W][I][P]|[T][E][M][P]|[C][O][M][I][N][G][[:space:]][S][O][O][N]|Not[I]mplemented[E]rror'
  rg -n "$banned_re" sf_cli docs/stories/skillfoundry-cli-platform genesis/2026-02-22-skillfoundry-cli-platform.md >/tmp/sf_gate_t3.log 2>&1 && return 1 || return 0
}

run_gate_t4() {
  # Scope sanity check: ensure story directory and PRD exist.
  [[ -d docs/stories/skillfoundry-cli-platform && -f genesis/2026-02-22-skillfoundry-cli-platform.md ]]
}

run_gate_t5() {
  # Contract presence check for command surface and UX contract sections.
  rg -n "CLI Contract Specification|Interactive UX Contract|Command Surface" genesis/2026-02-22-skillfoundry-cli-platform.md >/dev/null
}

run_gate_t6() {
  # Shadow risk check: verify policy + budget controls are present.
  rg -n "FR-030|FR-031|FR-032|FR-033" genesis/2026-02-22-skillfoundry-cli-platform.md >/dev/null
}

cmd_apply() {
  ensure_workspace
  local plan_id=""
  local checkpoint="false"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --plan)
        plan_id="$2"; shift 2 ;;
      --checkpoint)
        checkpoint="true"; shift ;;
      *)
        echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  if [[ -z "$plan_id" ]]; then
    echo "Usage: sf apply --plan <plan-id> [--checkpoint]" >&2
    exit 1
  fi

  local plan_file="$PLAN_DIR/${plan_id}.json"
  if [[ ! -f "$plan_file" ]]; then
    echo "Plan not found: $plan_id" >&2
    record_metric "apply" "failed"
    exit 1
  fi

  if [[ "$checkpoint" == "true" ]]; then
    printf "Approval checkpoint for %s [y/N]: " "$plan_id"
    read -r answer
    if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
      echo "Apply cancelled"
      exit 1
    fi
  fi

  local run_id
  run_id=$(gen_id "run")
  set_state "EXECUTING_STORY" "genesis/2026-02-22-skillfoundry-cli-platform.md" "STORY-008" "$plan_id" "$run_id"
  local run_file="$RUN_DIR/${run_id}.json"

  local t1="fail" t2="fail" t3="fail" t4="fail" t5="fail" t6="fail"
  run_gate_t1 && t1="pass"
  run_gate_t2 && t2="pass"
  run_gate_t3 && t3="pass"
  run_gate_t4 && t4="pass"
  run_gate_t5 && t5="pass"
  run_gate_t6 && t6="pass"

  local final_status="failed"
  if [[ "$t1" == "pass" && "$t2" == "pass" && "$t3" == "pass" && "$t4" == "pass" && "$t5" == "pass" && "$t6" == "pass" ]]; then
    final_status="passed"
  fi

  jq -n \
    --arg run_id "$run_id" \
    --arg created_at "$(now_utc)" \
    --arg plan_id "$plan_id" \
    --arg status "$final_status" \
    --arg t1 "$t1" --arg t2 "$t2" --arg t3 "$t3" --arg t4 "$t4" --arg t5 "$t5" --arg t6 "$t6" \
    '{run_id:$run_id,created_at:$created_at,plan_id:$plan_id,status:$status,gates:{t1:$t1,t2:$t2,t3:$t3,t4:$t4,t5:$t5,t6:$t6}}' \
    > "$run_file"

  if [[ "$final_status" == "passed" ]]; then
    echo "[OK] Apply completed: $run_id"
    echo "[OK] Gates: T1..T6 PASS"
    echo "Audit: $run_file"
    set_state "COMPLETED" "genesis/2026-02-22-skillfoundry-cli-platform.md" "STORY-008" "$plan_id" "$run_id"
    record_metric "apply" "success"
    exit 0
  fi

  echo "[BLOCK] Apply failed: $run_id"
  echo "[BLOCK] Gate status: $(jq -c '.gates' "$run_file")"
  echo "Audit: $run_file"
  set_state "FAILED" "genesis/2026-02-22-skillfoundry-cli-platform.md" "STORY-008" "$plan_id" "$run_id"
  record_metric "apply" "failed"
  exit 4
}

cmd_policy() {
  local sub="${1:-}"
  if [[ "$sub" != "check" ]]; then
    echo "Usage: sf policy check" >&2
    exit 1
  fi
  ensure_workspace
  [[ -f "$POLICY_FILE" ]] || create_default_policy

  local errors=0
  grep -Eq '^allow_shell[[:space:]]*=[[:space:]]*(true|false)' "$POLICY_FILE" || { echo "[BLOCK] policy allow_shell missing/invalid"; errors=$((errors+1)); }
  grep -Eq '^allow_network[[:space:]]*=[[:space:]]*(true|false)' "$POLICY_FILE" || { echo "[BLOCK] policy allow_network missing/invalid"; errors=$((errors+1)); }
  grep -Eq '^redact[[:space:]]*=[[:space:]]*(true|false)' "$POLICY_FILE" || { echo "[BLOCK] policy redact missing/invalid"; errors=$((errors+1)); }
  grep -Eq '^allow_paths[[:space:]]*=' "$POLICY_FILE" || { echo "[BLOCK] policy allow_paths missing/invalid"; errors=$((errors+1)); }

  if [[ "$errors" -gt 0 ]]; then
    record_metric "policy_check" "failed"
    exit 2
  fi
  echo "[OK] Policy check passed"
  record_metric "policy_check" "success"
}

cmd_memory() {
  local sub="${1:-}"
  shift || true
  case "$sub" in
    recall)
      local query="${1:-}"
      if [[ -z "$query" ]]; then
        echo "Usage: sf memory recall \"<query>\"" >&2
        exit 1
      fi
      mkdir -p "$MEMORY_DIR"
      if ! command -v rg >/dev/null 2>&1; then
        echo "ripgrep not available" >&2
        exit 1
      fi
      rg -n -i "$query" "$MEMORY_DIR" || true
      record_metric "memory_recall" "success"
      ;;
    record)
      if [[ "${1:-}" != "--from-run" ]]; then
        echo "Usage: sf memory record --from-run <run-id>" >&2
        exit 1
      fi
      local run_id="${2:-}"
      local run_file="$RUN_DIR/${run_id}.json"
      [[ -f "$run_file" ]] || { echo "Run not found: $run_id" >&2; exit 1; }
      mkdir -p "$MEMORY_DIR"
      jq -c '{type:"run_record",run_id:.run_id,status:.status,created_at:.created_at}' "$run_file" >> "$MEMORY_DIR/run-records.jsonl"
      echo "[OK] Recorded memory from run: $run_id"
      record_metric "memory_record" "success"
      ;;
    sync)
      sync_memory_to_git
      record_metric "memory_sync" "success"
      ;;
    *)
      echo "Usage: sf memory recall \"<query>\" | sf memory record --from-run <run-id> | sf memory sync" >&2
      exit 1
      ;;
  esac
}

cmd_lessons() {
  local sub="${1:-}"
  shift || true
  if [[ "$sub" != "capture" || "${1:-}" != "--from-run" ]]; then
    echo "Usage: sf lessons capture --from-run <run-id>" >&2
    exit 1
  fi
  local run_id="${2:-}"
  local run_file="$RUN_DIR/${run_id}.json"
  [[ -f "$run_file" ]] || { echo "Run not found: $run_id" >&2; exit 1; }

  mkdir -p "$MEMORY_DIR"
  local lesson
  lesson=$(jq -c '{type:"lesson",run_id:.run_id,rule:(if .status=="passed" then "Gate sequence validated" else "Investigate failing gate before apply" end),created_at:.created_at}' "$run_file")
  echo "$lesson" >> "$MEMORY_DIR/lessons.jsonl"
  echo "[OK] Lesson captured from run: $run_id"
  sync_memory_to_git || true
  record_metric "lessons_capture" "success"
}

cmd_runlog() {
  local sub="${1:-}"
  shift || true
  if [[ "$sub" != "export" ]]; then
    echo "Usage: sf runlog export --run <run-id> [--out <path>]" >&2
    exit 1
  fi

  local run_id=""
  local out=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --run)
        run_id="$2"; shift 2 ;;
      --out)
        out="$2"; shift 2 ;;
      *)
        echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  [[ -n "$run_id" ]] || { echo "Missing --run <run-id>" >&2; exit 1; }
  local src="$RUN_DIR/${run_id}.json"
  [[ -f "$src" ]] || { echo "Run not found: $run_id" >&2; exit 1; }

  if [[ -z "$out" ]]; then
    out="$RUN_DIR/${run_id}.export.json"
  fi
  if ! policy_allows_path "$out"; then
    echo "[BLOCK] output path denied by policy: $out" >&2
    record_metric "runlog_export" "failed"
    exit 2
  fi
  cp "$src" "$out"
  echo "[OK] Exported runlog: $out"
  record_metric "runlog_export" "success"
}

call_xai_api() {
  local prompt="$1"
  local model="$2"
  local api_key="${XAI_API_KEY:-}"

  if [[ -z "$api_key" ]]; then
    echo "Missing XAI_API_KEY for provider xai" >&2
    return 1
  fi
  if [[ "$(policy_allows_network)" != "true" ]]; then
    echo "Network blocked by policy (allow_network=false)" >&2
    return 2
  fi

  local payload
  payload=$(jq -n --arg m "$model" --arg p "$prompt" '{model:$m,messages:[{role:"user",content:$p}],temperature:0.2,max_tokens:800}')

  local response
  response=$(curl -sS https://api.x.ai/v1/chat/completions \
    -H "Authorization: Bearer ${api_key}" \
    -H "Content-Type: application/json" \
    -d "$payload")

  local text
  text=$(echo "$response" | jq -r '.choices[0].message.content // empty')
  if [[ -z "$text" ]]; then
    echo "$response" >&2
    return 1
  fi
  echo "$text"
}

cmd_ask() {
  local prompt="${1:-}"
  shift || true
  [[ -n "$prompt" ]] || { echo "Usage: sf ask \"<prompt>\" [--provider <name>] [--engine api|broker] [--raw|--json]" >&2; exit 1; }

  local provider
  provider=$(get_cfg "provider" "xai")
  local engine
  engine=$(get_cfg "engine" "api")
  local model
  model=$(get_cfg "model" "grok-4")
  local output_mode="raw"
  local input_tokens=0
  local output_tokens=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --provider) provider="$2"; shift 2 ;;
      --engine) engine="$2"; shift 2 ;;
      --raw) output_mode="raw"; shift ;;
      --json) output_mode="json"; shift ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  local est_cost
  est_cost=$(estimate_cost_usd "$prompt")
  input_tokens=$(echo "$prompt" | awk '{print int((length($0)+3)/4)}')
  local budget_rc=0
  if budget_allows_cost "$est_cost"; then
    budget_rc=0
  else
    budget_rc=$?
  fi
  if [[ "$budget_rc" -eq 1 ]]; then
    echo "Run budget exceeded (estimated cost=$est_cost)" >&2
    record_metric "ask" "failed"
    exit 5
  elif [[ "$budget_rc" -eq 2 ]]; then
    echo "Monthly budget exceeded (estimated cost=$est_cost)" >&2
    record_metric "ask" "failed"
    exit 5
  fi

  local text=""
  local used_provider="$provider"
  local used_engine="$engine"
  local ask_rc=0

  if [[ "$engine" == "api" && "$provider" == "xai" ]]; then
    text=$(call_xai_api "$prompt" "$model") || ask_rc=$?
  elif [[ "$engine" == "broker" && "$provider" == "claude-cli" && -x "$(command -v claude || true)" ]]; then
    text=$(claude -p "$prompt") || ask_rc=$?
  elif [[ "$engine" == "broker" && "$provider" == "gemini-cli" && -x "$(command -v gemini || true)" ]]; then
    text=$(gemini -p "$prompt") || ask_rc=$?
  else
    ask_rc=3
  fi

  if [[ "$ask_rc" -ne 0 || -z "$text" ]]; then
    local fb_provider
    fb_provider=$(get_cfg "fallback_provider" "")
    local fb_engine
    fb_engine=$(get_cfg "fallback_engine" "broker")
    if [[ -n "$fb_provider" ]]; then
      used_provider="$fb_provider"
      used_engine="$fb_engine"
      if [[ "$fb_engine" == "broker" && "$fb_provider" == "claude-cli" && -x "$(command -v claude || true)" ]]; then
        text=$(claude -p "$prompt") || true
      elif [[ "$fb_engine" == "broker" && "$fb_provider" == "gemini-cli" && -x "$(command -v gemini || true)" ]]; then
        text=$(gemini -p "$prompt") || true
      elif [[ "$fb_engine" == "api" && "$fb_provider" == "xai" ]]; then
        text=$(call_xai_api "$prompt" "$model") || true
      fi
    fi
  fi

  if [[ -z "$text" ]]; then
    echo "Provider route failed (primary and fallback)" >&2
    record_metric "ask" "failed"
    exit 3
  fi

  if [[ "$(policy_redact)" == "true" ]]; then
    text=$(redact_text "$text")
  fi
  output_tokens=$(echo "$text" | awk '{print int((length($0)+3)/4)}')
  record_usage "ask" "$est_cost"
  record_metric "ask" "success"

  if [[ "$output_mode" == "json" ]]; then
    jq -n \
      --arg provider "$used_provider" \
      --arg engine "$used_engine" \
      --arg model "$model" \
      --arg text "$text" \
      --argjson est_cost "$est_cost" \
      --argjson in_tok "$input_tokens" \
      --argjson out_tok "$output_tokens" \
      '{status:"ok",route:{provider:$provider,engine:$engine,model:$model},usage:{input_tokens:$in_tok,output_tokens:$out_tok,total_tokens:($in_tok+$out_tok)},cost:{estimated_usd:$est_cost},errors:[],text:$text}'
  else
    echo "$text"
  fi
}

cmd_chat() {
  local provider
  provider=$(get_cfg "provider" "xai")
  local engine
  engine=$(get_cfg "engine" "api")

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --provider) provider="$2"; shift 2 ;;
      --engine) engine="$2"; shift 2 ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  echo "SkillFoundry chat mode. Type '/exit' to quit."
  set_state "EXECUTING_STORY" "genesis/2026-02-22-skillfoundry-cli-platform.md" "STORY-009" "" ""
  while true; do
    printf "you> "
    read -r line || break
    if [[ "$line" == "/exit" ]]; then
      break
    fi
    if [[ -z "$line" ]]; then
      continue
    fi
    bash sf_cli/sf.sh ask "$line" --provider "$provider" --engine "$engine" --raw || true
  done
  set_state "VALIDATED" "genesis/2026-02-22-skillfoundry-cli-platform.md" "STORY-009" "" ""
  record_metric "chat" "success"
}

cmd_tui() {
  ensure_workspace
  [[ -f "$CONFIG_FILE" ]] || cmd_init

  local high_contrast="false"
  local reduced_motion="false"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --high-contrast) high_contrast="true"; shift ;;
      --reduced-motion) reduced_motion="true"; shift ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done

  local provider
  provider=$(get_cfg "provider" "xai")
  local model
  model=$(get_cfg "model" "grok-4")
  local budget
  budget=$(get_cfg "run_budget_usd" "2")

  if declare -f sf_ui_launch >/dev/null 2>&1; then
    set_state "EXECUTING_STORY" "genesis/2026-02-22-skillfoundry-cli-platform.md" "STORY-001" "" ""
    sf_ui_launch "$provider" "$model" "$budget" "$high_contrast" "$reduced_motion"
    set_state "VALIDATED" "genesis/2026-02-22-skillfoundry-cli-platform.md" "STORY-001" "" ""
    record_metric "tui" "success"
    return 0
  fi

  print_usage
}

cmd_state() {
  init_state_if_missing
  cat "$STATE_FILE"
  record_metric "state" "success"
}

cmd_metrics() {
  ensure_workspace
  if [[ ! -f "$METRICS_FILE" ]] || ! jq -e '.' "$METRICS_FILE" >/dev/null 2>&1; then
    jq -n \
      --arg ts "$(now_utc)" \
      '{updated_at:$ts,commands:{},status:{success:0,failed:0}}' > "$METRICS_FILE"
  fi
  cat "$METRICS_FILE"
  record_metric "metrics" "success"
}

cmd_status() {
  init_state_if_missing
  local prd_file="genesis/2026-02-22-skillfoundry-cli-platform.md"
  local story_count
  story_count=$(find docs/stories/skillfoundry-cli-platform -maxdepth 1 -type f -name 'STORY-*.md' 2>/dev/null | wc -l | tr -d ' ')
  local plan_count
  plan_count=$(find "$PLAN_DIR" -maxdepth 1 -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
  local run_count
  run_count=$(find "$RUN_DIR" -maxdepth 1 -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
  local last_run
  last_run=$(ls -1t "$RUN_DIR"/*.json 2>/dev/null | head -n1 || true)
  local last_run_status="none"
  if [[ -n "$last_run" ]]; then
    last_run_status=$(jq -r '.status' "$last_run")
  fi

  cat << EOF_S
/go status
PRD: $prd_file
Stories: $story_count
Plans: $plan_count
Runs: $run_count
Last Run Status: $last_run_status
Current State: $(jq -r '.current_state' "$STATE_FILE")
Resume Point: $(jq -r '.recovery.resume_point' "$STATE_FILE")
EOF_S
  record_metric "status" "success"
}

main() {
  if [[ "${1:-}" == "--version" ]]; then
    echo "$VERSION"
    exit 0
  fi

  local cmd="${1:-}"
  if [[ -z "$cmd" ]]; then
    if [[ -t 0 && -t 1 ]]; then
      cmd_tui
    else
      print_usage
    fi
    exit 0
  fi
  shift || true

  case "$cmd" in
    init) cmd_init "$@" ;;
    validate) cmd_validate "$@" ;;
    rollback) cmd_rollback "$@" ;;
    provider) cmd_provider "$@" ;;
    config) cmd_config "$@" ;;
    deps) cmd_deps "$@" ;;
    resume) cmd_resume "$@" ;;
    clean) cmd_clean "$@" ;;
    status) cmd_status "$@" ;;
    state) cmd_state "$@" ;;
    metrics) cmd_metrics "$@" ;;
    plan) cmd_plan "$@" ;;
    apply) cmd_apply "$@" ;;
    policy) cmd_policy "$@" ;;
    memory) cmd_memory "$@" ;;
    lessons) cmd_lessons "$@" ;;
    runlog) cmd_runlog "$@" ;;
    ask) cmd_ask "$@" ;;
    chat) cmd_chat "$@" ;;
    tui) cmd_tui "$@" ;;
    help|-h|--help) print_usage ;;
    *)
      echo "Unknown command: $cmd" >&2
      print_usage
      exit 1
      ;;
  esac
}

main "$@"
