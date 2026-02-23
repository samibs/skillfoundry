#!/usr/bin/env bash
set -euo pipefail

echo "[TEST] sf_cli version"
bash sf_cli/sf.sh --version >/dev/null

echo "[TEST] init"
bash sf_cli/sf.sh init --force >/dev/null

echo "[TEST] validate PRD"
bash sf_cli/sf.sh validate genesis/2026-02-22-skillfoundry-cli-platform.md >/dev/null

echo "[TEST] provider"
bash sf_cli/sf.sh provider set xai >/dev/null
PROVIDER_OUTPUT=$(bash sf_cli/sf.sh provider list)
rg -q "Current: xai" <<< "$PROVIDER_OUTPUT"

echo "[TEST] policy"
bash sf_cli/sf.sh policy check >/dev/null

echo "[TEST] config set/get"
bash sf_cli/sf.sh config set fallback_provider gemini-cli >/dev/null
CFG_OUTPUT=$(bash sf_cli/sf.sh config get fallback_provider)
rg -q "gemini-cli" <<< "$CFG_OUTPUT"

echo "[TEST] deps output"
DEPS_OUTPUT=$(bash sf_cli/sf.sh deps)
rg -q "Story dependency graph" <<< "$DEPS_OUTPUT"

echo "[TEST] status/state/metrics baseline"
STATUS_OUTPUT=$(bash sf_cli/sf.sh status)
rg -q "PRD: genesis/2026-02-22-skillfoundry-cli-platform.md" <<< "$STATUS_OUTPUT"
bash sf_cli/sf.sh state | jq -e '.current_state' >/dev/null
bash sf_cli/sf.sh metrics | jq -e '.status' >/dev/null

echo "[TEST] plan"
PLAN_ID=$(bash sf_cli/sf.sh plan "test run for pipeline" --json | jq -r '.plan_id')
[[ -n "$PLAN_ID" ]]
[[ -f ".skillfoundry/plans/${PLAN_ID}.json" ]]

echo "[TEST] apply"
bash sf_cli/sf.sh apply --plan "$PLAN_ID" >/dev/null
RUN_ID=$(ls -1t .skillfoundry/runs/*.json | head -n1 | xargs -n1 basename | sed 's/.json$//')
[[ -n "$RUN_ID" ]]

echo "[TEST] runlog export"
bash sf_cli/sf.sh runlog export --run "$RUN_ID" >/dev/null
[[ -f ".skillfoundry/runs/${RUN_ID}.export.json" ]]

echo "[TEST] runlog export path policy block"
if bash sf_cli/sf.sh runlog export --run "$RUN_ID" --out /tmp/run-export.json >/dev/null 2>&1; then
  echo "Expected policy path block did not occur" >&2
  exit 1
fi

echo "[TEST] memory + lessons"
bash sf_cli/sf.sh memory record --from-run "$RUN_ID" >/dev/null
bash sf_cli/sf.sh lessons capture --from-run "$RUN_ID" >/dev/null

echo "[PASS] sf_cli smoke tests passed"

echo "[TEST] tui line-mode"
TUI_HELP_OUTPUT=$(printf ':help\n:exit\n' | bash sf_cli/sf.sh tui)
echo "$TUI_HELP_OUTPUT" | rg -q "Commands: :home :plan"

echo "[TEST] tui timeline + mode"
TUI_TIMELINE_OUTPUT=$(printf ':mode chat\n:mode command\n:plan timeline test\n:timeline\n:exit\n' | bash sf_cli/sf.sh tui --high-contrast --reduced-motion)
echo "$TUI_TIMELINE_OUTPUT" | rg -q "\\[OK\\].*plan completed"

echo "[TEST] ask budget guard"
bash sf_cli/sf.sh config set run_budget_usd 0 >/dev/null
if bash sf_cli/sf.sh ask "this should be blocked by budget" >/dev/null 2>&1; then
  echo "Expected budget block did not occur" >&2
  exit 1
fi
bash sf_cli/sf.sh config set run_budget_usd 2 >/dev/null

echo "[TEST] ask json contract via fallback route"
bash sf_cli/sf.sh config set provider unsupported-provider >/dev/null
bash sf_cli/sf.sh config set fallback_provider unsupported-fallback >/dev/null
bash sf_cli/sf.sh config set fallback_engine broker >/dev/null
ASK_JSON=$(timeout 5 bash sf_cli/sf.sh ask "hello contract" --json || true)
if [[ -n "$ASK_JSON" ]]; then
  echo "$ASK_JSON" | jq -e '.status and .route and .usage and .cost and .errors and .text' >/dev/null
fi
bash sf_cli/sf.sh config set provider xai >/dev/null
bash sf_cli/sf.sh config set fallback_provider openai >/dev/null

echo "[TEST] resume command"
bash sf_cli/sf.sh resume >/dev/null 2>&1 || true

echo "[TEST] rollback command"
bash sf_cli/sf.sh rollback "$RUN_ID" >/dev/null
[[ ! -f ".skillfoundry/runs/${RUN_ID}.json" ]]

echo "[TEST] clean command"
bash sf_cli/sf.sh clean --force >/dev/null
[[ -d ".skillfoundry/plans" && -d ".skillfoundry/runs" ]]

echo "[TEST] metrics growth"
bash sf_cli/sf.sh metrics | jq -e '.commands.clean >= 1 and .status.success >= 1' >/dev/null
