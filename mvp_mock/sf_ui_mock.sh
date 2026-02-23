#!/usr/bin/env bash
set -euo pipefail

cmd="${1:-demo}"

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'
  C_DIM=$'\033[2m'
  C_BOLD=$'\033[1m'
  C_BLUE=$'\033[34m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_CYAN=$'\033[36m'
else
  C_RESET=""
  C_DIM=""
  C_BOLD=""
  C_BLUE=""
  C_GREEN=""
  C_YELLOW=""
  C_CYAN=""
fi

line() {
  printf '%s\n' "-------------------------------------------------------------------------------"
}

title() {
  printf '%b\n' "${C_BOLD}${C_BLUE}$1${C_RESET}"
}

screen_shell() {
  local header="$1"
  line
  printf '%b\n' "${C_BOLD}SkillFoundry CLI${C_RESET}  ${C_DIM}|${C_RESET} ${header}"
  printf '%b\n' "${C_DIM}repo: skillfoundry | profile: enterprise-safe | mode: plan+gates${C_RESET}"
  line
}

screen_home() {
  screen_shell "Home"
  printf '%b\n' "${C_BOLD}[Command]${C_RESET} sf"
  printf '%b\n' "${C_BOLD}[Provider]${C_RESET} xai:grok-4  ${C_DIM}(switch: ctrl+p)${C_RESET}"
  printf '%b\n' "${C_BOLD}[Budget]${C_RESET} \$12.40 / \$50.00 month"
  printf '%b\n' "${C_BOLD}[Policy]${C_RESET} shell=restricted network=ask-first secrets=redact-on"
  line
  printf '%b\n' "${C_BOLD}Quick Actions${C_RESET}"
  printf '%b\n' "  1) plan  2) apply  3) chat  4) memory recall  5) runlog export"
  line
  printf '%b\n' "${C_BOLD}Recent Runs${C_RESET}"
  printf '%b\n' "  run_20260222_223455  ${C_GREEN}PASS${C_RESET}  provider-router + tests"
  printf '%b\n' "  run_20260221_181144  ${C_YELLOW}WARN${C_RESET}  budget near limit"
  printf '%b\n' "  run_20260220_094224  ${C_GREEN}PASS${C_RESET}  auth policy update"
  line
  printf '%b\n' "${C_CYAN}sf>${C_RESET} plan \"add gemini + claude-cli broker routing\""
}

screen_plan() {
  screen_shell "Planner"
  printf '%b\n' "${C_BOLD}Task${C_RESET}: add gemini + claude-cli broker routing"
  printf '%b\n' "${C_BOLD}Context${C_RESET}: 16 files | 22.1 KB | memory hits: 4"
  line
  printf '%b\n' "${C_BOLD}Pipeline${C_RESET}"
  printf '%b\n' "  [1] policy preflight ............ ${C_GREEN}PASS${C_RESET}"
  printf '%b\n' "  [2] memory recall ............... ${C_GREEN}PASS${C_RESET}"
  printf '%b\n' "  [3] cost estimate ............... ${C_GREEN}\$0.38${C_RESET}"
  printf '%b\n' "  [4] provider route .............. ${C_GREEN}xai:grok-4${C_RESET}"
  printf '%b\n' "  [5] risk scan ................... ${C_YELLOW}2 WARNINGS${C_RESET}"
  line
  printf '%b\n' "${C_BOLD}Proposed Steps${C_RESET}"
  printf '%b\n' "  1. add CliEngine adapter for claude-cli and gemini-cli"
  printf '%b\n' "  2. enforce timeout and retry parity with ApiEngine"
  printf '%b\n' "  3. add budget + fallback tests"
  printf '%b\n' "  4. update docs and runbook"
  line
  printf '%b\n' "${C_CYAN}sf>${C_RESET} apply --plan plan_20260222_231040"
}

screen_apply() {
  screen_shell "Apply"
  printf '%b\n' "${C_BOLD}Plan${C_RESET}: plan_20260222_231040  ${C_DIM}|${C_RESET} checkpoint: approved"
  line
  printf '%b\n' "${C_BOLD}Anvil Gates${C_RESET}"
  printf '%b\n' "  T1 syntax/import/banned patterns ... ${C_GREEN}PASS${C_RESET}"
  printf '%b\n' "  T2 canary smoke .................... ${C_GREEN}PASS${C_RESET}"
  printf '%b\n' "  T3 self-adversarial review ......... ${C_GREEN}PASS${C_RESET}"
  printf '%b\n' "  T4 scope validation ................ ${C_GREEN}PASS${C_RESET}"
  printf '%b\n' "  T5 contract enforcement ............ ${C_GREEN}PASS${C_RESET}"
  printf '%b\n' "  T6 shadow risk ..................... ${C_GREEN}PASS${C_RESET}"
  line
  printf '%b\n' "${C_BOLD}Result${C_RESET}"
  printf '%b\n' "  changed files: 8"
  printf '%b\n' "  tests: 41 passed | 0 failed"
  printf '%b\n' "  run id: run_20260222_231422"
  printf '%b\n' "  audit: .skillfoundry/runs/run_20260222_231422.json"
  line
  printf '%b\n' "${C_CYAN}sf>${C_RESET} memory record --from-run run_20260222_231422"
}

screen_chat() {
  screen_shell "Chat"
  printf '%b\n' "${C_BOLD}Session${C_RESET}: repo-aware | provider: claude-cli (broker) | memory: on"
  line
  printf '%b\n' "${C_DIM}you>${C_RESET} why did provider fallback fail last week?"
  printf '%b\n' "${C_BOLD}sf>${C_RESET} Found lesson#141 and run_20260215_093010."
  printf '%b\n' "    Cause: timeout policy was enforced in ApiEngine only."
  printf '%b\n' "    Fix: shared timeout guard in provider/base_engine."
  printf '%b\n' "    Want me to generate patch + tests? [y/N]"
  line
  printf '%b\n' "${C_DIM}you>${C_RESET} y"
  printf '%b\n' "${C_BOLD}sf>${C_RESET} Drafting plan in read-only mode..."
  line
}

screen_help() {
  title "SkillFoundry UI Mock"
  printf '%s\n' ""
  printf '%s\n' "Usage:"
  printf '%s\n' "  ./mvp_mock/sf_ui_mock.sh home"
  printf '%s\n' "  ./mvp_mock/sf_ui_mock.sh plan"
  printf '%s\n' "  ./mvp_mock/sf_ui_mock.sh apply"
  printf '%s\n' "  ./mvp_mock/sf_ui_mock.sh chat"
  printf '%s\n' "  ./mvp_mock/sf_ui_mock.sh demo"
}

case "$cmd" in
  home)
    screen_home
    ;;
  plan)
    screen_plan
    ;;
  apply)
    screen_apply
    ;;
  chat)
    screen_chat
    ;;
  demo)
    screen_home
    printf '\n'
    screen_plan
    printf '\n'
    screen_apply
    printf '\n'
    screen_chat
    ;;
  help|-h|--help)
    screen_help
    ;;
  *)
    echo "Unknown view: $cmd" >&2
    screen_help >&2
    exit 1
    ;;
esac
