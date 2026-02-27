#!/usr/bin/env bash

sf_theme_init() {
  if [[ -t 1 ]]; then
    SF_RESET=$'\033[0m'
    SF_BOLD=$'\033[1m'
    SF_DIM=$'\033[2m'
    SF_RED=$'\033[31m'
    SF_GREEN=$'\033[32m'
    SF_YELLOW=$'\033[33m'
    SF_BLUE=$'\033[34m'
    SF_CYAN=$'\033[36m'
  else
    SF_RESET=""
    SF_BOLD=""
    SF_DIM=""
    SF_RED=""
    SF_GREEN=""
    SF_YELLOW=""
    SF_BLUE=""
    SF_CYAN=""
  fi
}

sf_status_color() {
  local status="$1"
  case "$status" in
    pass|ok|success) echo "$SF_GREEN" ;;
    warn|warning) echo "$SF_YELLOW" ;;
    fail|error|block) echo "$SF_RED" ;;
    *) echo "$SF_CYAN" ;;
  esac
}
