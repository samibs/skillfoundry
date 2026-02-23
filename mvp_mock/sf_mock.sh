#!/usr/bin/env bash
set -euo pipefail

cmd="${1:-help}"

print_banner() {
  cat << 'BANNER'
SkillFoundry CLI v0.1.0-mvp
One workflow. Multiple providers. Memory-native execution.
BANNER
}

print_help() {
  print_banner
  cat << 'HELP'

USAGE:
  sf <command> [options]

CORE COMMANDS:
  sf init                              Initialize .skillfoundry config
  sf plan "<task>"                     Read-only planning with memory recall
  sf apply                             Apply approved plan with policy gates
  sf chat                              Interactive repo chat mode
  sf ask "<prompt>"                    One-shot prompt

PROVIDERS:
  --provider anthropic|xai|openai|gemini|ollama|claude-cli|gemini-cli

MEMORY:
  sf memory recall "<task>"            Fetch similar lessons/decisions
  sf memory record --from-run <id>      Persist run outcomes
  sf lessons capture --from-run <id>    Save lessons learned

GOVERNANCE:
  sf policy check                       Validate command/path/network policy
  sf runlog export --run <id>           Export audit bundle JSON

EXAMPLES:
  sf plan "add SSO login" --provider xai --model grok-4 --budget 2.00
  sf apply --run run_20260222_1015
  sf ask "summarize failing tests" --provider claude-cli
HELP
}

mock_init() {
  cat << 'OUT'
$ sf init
[OK] Created .skillfoundry/config.toml
[OK] Created .skillfoundry/policy.toml
[OK] Created .skillfoundry/memory.toml
[OK] Workspace registered: skillfoundry
OUT
}

mock_plan() {
  cat << 'OUT'
$ sf plan "add provider router for xAI and Gemini"
[1/6] Policy preflight....................PASS
[2/6] Memory recall.......................FOUND 5 related lessons
      - lesson#128: avoid full-repo context for plan mode
      - lesson#141: enforce provider fallback order
[3/6] Context build........................OK (14 files, 18.2 KB)
[4/6] Provider route.......................xai:grok-4 (plan-tier)
[5/6] Plan generation......................DONE
[6/6] Risk scan............................2 warnings

Plan ID: plan_20260222_223100
Estimated cost cap: $0.42

Proposed Steps:
  1. Add ProviderAdapter interface and xAI/Gemini adapters
  2. Add routing policy: api preferred, cli fallback
  3. Add tests for budget cap + fallback behavior
  4. Update docs and runbook

Next:
  sf apply --plan plan_20260222_223100
OUT
}

mock_apply() {
  cat << 'OUT'
$ sf apply --plan plan_20260222_223100
Approval checkpoint.......................APPROVED

[Gate T1] Syntax/import/banned-pattern....PASS
[Gate T2] Smoke tests.....................PASS
[Gate T3] Self-adversarial review.........PASS
[Gate T4] Scope validation................PASS
[Gate T5] Contract checks.................PASS
[Gate T6] Shadow risk scan................PASS

Changes applied: 7 files
Tests: 34 passed, 0 failed
Run ID: run_20260222_223455
Audit bundle: .skillfoundry/runs/run_20260222_223455.json

Next:
  sf memory record --from-run run_20260222_223455
OUT
}

mock_chat() {
  cat << 'OUT'
$ sf chat --provider gemini-cli
SkillFoundry Chat (repo: skillfoundry)
Mode: interactive | Policy: enforced | Memory: on
Type /help for commands, /exit to quit.

you> why did test_provider_fallback fail last week?
sf> Recalled lesson#141 and run#run_20260215_093010.
    Root cause: CLI fallback ignored timeout policy.
    Suggested fix: enforce timeout in both ApiEngine and CliEngine.
OUT
}

mock_ask() {
  cat << 'OUT'
$ sf ask "review this stack trace" --provider claude-cli
Route: provider=claude-cli engine=broker-mode
Policy: allow_shell=false allow_network=false redact=on

Likely cause: adapter error mapping retries to non-retriable status.
Check: providers/router.ts and providers/errors.ts
OUT
}

case "$cmd" in
  help|-h|--help)
    print_help
    ;;
  init)
    mock_init
    ;;
  plan)
    mock_plan
    ;;
  apply)
    mock_apply
    ;;
  chat)
    mock_chat
    ;;
  ask)
    mock_ask
    ;;
  demo)
    print_help
    echo
    mock_init
    echo
    mock_plan
    echo
    mock_apply
    echo
    mock_chat
    echo
    mock_ask
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    echo "Run: sf help" >&2
    exit 1
    ;;
esac
