# SkillFoundry CLI MVP Mock

This folder now includes two mock layers:

- `mvp_mock/sf_mock.sh`: command-surface mock (plain output)
- `mvp_mock/sf_ui_mock.sh`: terminal UX mock (Codex/Claude/Gemini style screens)

## Run

```bash
chmod +x mvp_mock/sf_mock.sh mvp_mock/sf_ui_mock.sh

# command-surface demo
./mvp_mock/sf_mock.sh demo

# visual terminal UX demo
./mvp_mock/sf_ui_mock.sh demo

# individual UI views
./mvp_mock/sf_ui_mock.sh home
./mvp_mock/sf_ui_mock.sh plan
./mvp_mock/sf_ui_mock.sh apply
./mvp_mock/sf_ui_mock.sh chat
```

## UX Mock Focus

- Persistent header/status bar
- Provider + budget + policy visibility
- Plan/apply gate pipeline (Anvil-style)
- Memory/lesson recall in conversation flow
- Prompt-like interaction line (`sf>`, `you>`) with modern terminal rhythm

## Next Step to Make It Real

Implement a real TUI shell using this layout as the contract:

- framework: `Textual` (Python) or `Bubble Tea` (Go)
- panes: left nav, center activity, right context/policy
- live stream: tool calls + diffs + test progress
- input modes: command mode (`sf>`) and chat mode (`you>`)
