#!/usr/bin/env bash

SF_UI_TIMELINE_FILE=".skillfoundry/timeline.log"
SF_UI_MODE="command"
SF_UI_HIGH_CONTRAST="false"
SF_UI_REDUCED_MOTION="false"

sf_ui_supports_fullscreen() {
  [[ -t 0 && -t 1 ]] || return 1
  command -v tput >/dev/null 2>&1 || return 1
  local cols
  cols=$(tput cols 2>/dev/null || echo 0)
  [[ "$cols" -ge 100 ]]
}

sf_ui_prompt() {
  if [[ "$SF_UI_MODE" == "chat" ]]; then
    printf '%b' "${SF_CYAN}you>${SF_RESET} "
  else
    printf '%b' "${SF_CYAN}sf>${SF_RESET} "
  fi
}

sf_ui_draw_line() {
  printf '%s\n' "--------------------------------------------------------------------------------"
}

sf_ui_symbol_for_status() {
  local status="$1"
  case "$status" in
    pass|ok|success) echo "[OK]" ;;
    warn|warning) echo "[WARN]" ;;
    fail|error|block) echo "[BLOCK]" ;;
    running) echo "[RUN]" ;;
    queued) echo "[Q]" ;;
    *) echo "[INFO]" ;;
  esac
}

sf_ui_event() {
  local status="$1"
  local stage="$2"
  local message="$3"
  local color
  color=$(sf_status_color "$status")
  local symbol
  symbol=$(sf_ui_symbol_for_status "$status")
  local ts
  ts=$(date -u +"%H:%M:%S")

  mkdir -p .skillfoundry
  printf '%s\t%s\t%s\t%s\n' "$ts" "$status" "$stage" "$message" >> "$SF_UI_TIMELINE_FILE"

  if [[ "$SF_UI_HIGH_CONTRAST" == "true" ]]; then
    printf '%s %s %s %s\n' "$symbol" "$ts" "$stage" "$message"
  else
    printf '%b%s%b %s %s %s\n' "$color" "$symbol" "$SF_RESET" "$ts" "$stage" "$message"
  fi
}

sf_ui_show_timeline() {
  if [[ ! -f "$SF_UI_TIMELINE_FILE" ]]; then
    echo "No timeline events yet."
    return
  fi
  tail -n 20 "$SF_UI_TIMELINE_FILE" | while IFS=$'\t' read -r ts status stage message; do
    local color
    color=$(sf_status_color "$status")
    local symbol
    symbol=$(sf_ui_symbol_for_status "$status")
    if [[ "$SF_UI_HIGH_CONTRAST" == "true" ]]; then
      printf '%s %s %s %s\n' "$symbol" "$ts" "$stage" "$message"
    else
      printf '%b%s%b %s %s %s\n' "$color" "$symbol" "$SF_RESET" "$ts" "$stage" "$message"
    fi
  done
}

sf_ui_show_diff_preview() {
  local plan_id="$1"
  local plan_file=".skillfoundry/plans/${plan_id}.json"
  if [[ ! -f "$plan_file" ]]; then
    echo "[BLOCK] Plan not found: $plan_id"
    return 1
  fi

  sf_ui_draw_line
  echo "Diff Preview for $plan_id"
  sf_ui_draw_line
  local diff_out
  diff_out=$(git --no-pager diff -- . ':(exclude).skillfoundry' 2>/dev/null || true)
  if [[ -n "$diff_out" ]]; then
    echo "$diff_out" | sed -n '1,220p'
  else
    echo "No tracked file diff currently detected."
    echo "Plan summary:"
    jq -r '"task: " + .task, "route: " + .route.provider + ":" + .route.model, "budget_usd: " + (.budget_usd|tostring)' "$plan_file"
  fi
  sf_ui_draw_line
}

sf_ui_apply_with_checkpoint() {
  local plan_id="$1"
  sf_ui_event "queued" "apply" "checkpoint requested for ${plan_id}"
  sf_ui_show_diff_preview "$plan_id" || return 1

  printf 'Approve apply for %s [y/N]: ' "$plan_id"
  read -r approve
  if [[ "$approve" != "y" && "$approve" != "Y" ]]; then
    sf_ui_event "warn" "apply" "checkpoint declined for ${plan_id}"
    return 1
  fi

  sf_ui_event "running" "apply" "executing apply for ${plan_id}"
  if bash sf_cli/sf.sh apply --plan "$plan_id"; then
    sf_ui_event "pass" "apply" "apply completed for ${plan_id}"
    return 0
  fi

  sf_ui_event "fail" "apply" "apply failed for ${plan_id}"
  local latest_run
  latest_run=$(ls -1t .skillfoundry/runs/*.json 2>/dev/null | head -n1 | xargs -n1 basename 2>/dev/null | sed 's/.json$//' || true)
  echo "Recovery actions:"
  echo "  1) Retry: :apply ${plan_id}"
  echo "  2) Export runlog: :runlog ${latest_run}"
  echo "  3) Check policy: :policy check"
  return 1
}

sf_ui_draw_header() {
  local provider="$1"
  local model="$2"
  local mode="$3"
  sf_ui_draw_line
  printf '%b\n' "${SF_BOLD}SkillFoundry CLI${SF_RESET}  ${SF_DIM}| provider=${provider} model=${model} mode=${mode}${SF_RESET}"
  printf '%b\n' "${SF_DIM}left=navigation  center=activity  right=context${SF_RESET}"
  printf '%b\n' "${SF_DIM}accessibility: high-contrast=${SF_UI_HIGH_CONTRAST} reduced-motion=${SF_UI_REDUCED_MOTION}${SF_RESET}"
  sf_ui_draw_line
}

sf_ui_draw_home() {
  local provider="$1"
  local model="$2"
  local budget="$3"
  sf_ui_draw_header "$provider" "$model" "interactive"
  printf '%b\n' "${SF_BOLD}[Left] Navigation${SF_RESET}"
  printf '%s\n' "  home  plan  apply  chat  provider  policy  runlog  timeline"
  sf_ui_draw_line
  printf '%b\n' "${SF_BOLD}[Center] Activity${SF_RESET}"
  printf '%s\n' "  - Use: :plan <task>"
  printf '%s\n' "  - Use: :apply <plan-id>"
  printf '%s\n' "  - Use: :chat"
  printf '%s\n' "  - Use: :timeline"
  sf_ui_draw_line
  printf '%b\n' "${SF_BOLD}[Right] Context${SF_RESET}"
  printf '%s\n' "  route: ${provider}:${model}"
  printf '%s\n' "  run budget: \$${budget}"
  printf '%s\n' "  policy: shell/network restricted by default"
  printf '%s\n' "  input mode: ${SF_UI_MODE}"
  sf_ui_draw_line
  sf_ui_prompt
}

sf_ui_draw_line_mode_hint() {
  sf_ui_event "warn" "ui" "full-screen mode unavailable; using line mode"
  printf '%s\n' "Commands: :plan <task> | :apply <plan-id> | :chat | :timeline | :provider list | :mode <command|chat> | :exit"
  sf_ui_prompt
}

sf_ui_launch() {
  local provider="$1"
  local model="$2"
  local budget="$3"
  local high_contrast="${4:-false}"
  local reduced_motion="${5:-false}"

  sf_theme_init
  SF_UI_HIGH_CONTRAST="$high_contrast"
  SF_UI_REDUCED_MOTION="$reduced_motion"

  local fullscreen="false"
  if sf_ui_supports_fullscreen; then
    fullscreen="true"
  fi

  if [[ "$fullscreen" == "true" ]]; then
    clear
    sf_ui_draw_home "$provider" "$model" "$budget"
  else
    sf_ui_draw_line_mode_hint
  fi

  while IFS= read -r line; do
    if [[ -z "$line" ]]; then
      sf_ui_prompt
      continue
    fi

    case "$line" in
      :exit|/exit|quit)
        break
        ;;
      :home)
        clear
        sf_ui_draw_home "$provider" "$model" "$budget"
        ;;
      :provider\ list)
        bash sf_cli/sf.sh provider list
        sf_ui_prompt
        ;;
      :provider\ set\ *)
        local p
        p=$(echo "$line" | sed -E 's/^:provider set[[:space:]]+//')
        bash sf_cli/sf.sh provider set "$p"
        provider="$p"
        sf_ui_prompt
        ;;
      :plan\ *)
        local task
        task=$(echo "$line" | sed -E 's/^:plan[[:space:]]+//')
        sf_ui_event "queued" "plan" "task queued"
        sf_ui_event "running" "plan" "building plan context"
        bash sf_cli/sf.sh plan "$task"
        sf_ui_event "pass" "plan" "plan completed"
        sf_ui_prompt
        ;;
      :apply\ *)
        local plan_id
        plan_id=$(echo "$line" | sed -E 's/^:apply[[:space:]]+//')
        sf_ui_apply_with_checkpoint "$plan_id" || true
        sf_ui_prompt
        ;;
      :diff\ *)
        local plan_id
        plan_id=$(echo "$line" | sed -E 's/^:diff[[:space:]]+//')
        sf_ui_show_diff_preview "$plan_id" || true
        sf_ui_prompt
        ;;
      :timeline)
        sf_ui_show_timeline
        sf_ui_prompt
        ;;
      :runlog\ *)
        local run_id
        run_id=$(echo "$line" | sed -E 's/^:runlog[[:space:]]+//')
        bash sf_cli/sf.sh runlog export --run "$run_id" || true
        sf_ui_prompt
        ;;
      :policy\ check)
        bash sf_cli/sf.sh policy check || true
        sf_ui_prompt
        ;;
      :chat)
        SF_UI_MODE="chat"
        bash sf_cli/sf.sh chat --provider "$provider"
        SF_UI_MODE="command"
        sf_ui_prompt
        ;;
      :mode\ *)
        local m
        m=$(echo "$line" | sed -E 's/^:mode[[:space:]]+//')
        if [[ "$m" == "chat" || "$m" == "command" ]]; then
          SF_UI_MODE="$m"
        else
          echo "[BLOCK] Invalid mode: $m"
        fi
        sf_ui_prompt
        ;;
      :palette|:cp|^P)
        echo "Palette actions: :home :plan :apply :chat :timeline :provider list :mode chat :mode command"
        sf_ui_prompt
        ;;
      :route|:cr|^R)
        echo "Route switch: :provider set <name>"
        sf_ui_prompt
        ;;
      :memory|:cl|^L)
        echo "Memory lookup: use :plan with task keywords or run 'sf memory recall \"<query>\"' in another shell"
        sf_ui_prompt
        ;;
      :help)
        printf '%s\n' "Commands: :home :plan <task> :apply <plan-id> :diff <plan-id> :timeline :chat :provider list :provider set <name> :mode <command|chat> :policy check :runlog <run-id> :exit"
        printf '%s\n' "Shortcut aliases: :palette(:cp/^P) :route(:cr/^R) :memory(:cl/^L)"
        sf_ui_prompt
        ;;
      *)
        printf '%b\n' "${SF_RED}[BLOCK]${SF_RESET} Unknown UI command. Use :help"
        sf_ui_prompt
        ;;
    esac
  done
}
