# sf CLI (Incremental /go Implementation)

This directory contains the executable baseline for the SkillFoundry CLI.

## Run

```bash
bash sf_cli/sf.sh --version
bash sf_cli/sf.sh init --force
bash sf_cli/sf.sh plan "add provider routing"
bash sf_cli/sf.sh apply --plan <plan-id>
```

## Implemented commands

- `init`
- `validate [<prd-file>]`
- `rollback [<run-id>]`
- `deps`
- `resume`
- `clean --force`
- `plan`
- `apply`
- `provider set|list`
- `config set|get`
- `status`
- `state`
- `metrics`
- `policy check`
- `memory recall|record|sync`
- `lessons capture`
- `runlog export`
- `ask`
- `chat`
- `tui`

## Interactive UX baseline

- `sf` with no subcommand launches interactive mode when attached to a TTY.
- Full-screen rendering is used when terminal capability checks pass.
- Otherwise it falls back to line mode with the same core controls.
- Timeline stream is persisted to `.skillfoundry/timeline.log`.
- Apply in TUI includes diff/preview + explicit checkpoint approval.

## Governance and routing baseline

- Policy checks validate shell/network/redaction/path fields.
- Runlog exports are path-checked against policy allowlist.
- Ask command enforces estimated run/month budget caps.
- Ask command attempts fallback route on primary provider failure.
- Ask JSON output follows a normalized contract with `route`, `usage`, `cost`, and `errors`.
- Lesson capture can trigger optional git-based memory sync.

## Notes

- xAI API calls require `XAI_API_KEY` and `allow_network = true`.
- Broker mode supports installed CLIs when available (`claude`, `gemini`).
- Apply runs T1-T6 gate checks and writes run artifacts to `.skillfoundry/runs/`.
