# SkillFoundry

![CI](https://github.com/samibs/skillfoundry/actions/workflows/ci.yml/badge.svg)

SkillFoundry is a production AI engineering framework that turns requirements into tested, reviewable code with a multi-agent pipeline.

It supports 5 platforms:
- Claude Code
- GitHub Copilot CLI
- Cursor
- OpenAI Codex
- Google Gemini

## Why SkillFoundry

- PRD-first workflow for non-trivial work
- Multi-agent execution with explicit handoffs
- Built-in quality gates (The Anvil, 6 tiers)
- Security and standards enforcement (Top 12 critical checks)
- Data isolation enforcement (row-level ownership, query scoping)
- Cross-platform skill generation and sync
- Continuous agent evolution loop (debate -> implement -> iterate)

## Quick Start

### 1) Clone

```bash
git clone https://github.com/samibs/skillfoundry.git
cd skillfoundry
```

### 2) Install for your platform

```bash
# Linux/macOS
./install.sh --platform=claude

# Windows PowerShell
./install.ps1 -Platform claude
```

Replace `claude` with one of:
`claude`, `copilot`, `cursor`, `codex`, `gemini`

### 3) Run the workflow

```text
/prd "your feature"
/go
```

Or run the full shortcut pipeline:

```text
/forge
```

## Core Commands

- `/prd` create PRD in `genesis/`
- `/go` orchestrate implementation pipeline
- `/forge` run full validate -> implement -> inspect flow
- `/anvil` run 6-tier quality gate
- `/stories` generate implementation stories from PRD
- `/tester` run testing workflow
- `/security` run security audit workflow

## Architecture at a Glance

- `agents/` source agent contracts and orchestration rules
- `.agents/skills/` Codex-compatible skill definitions
- `scripts/` installers, sync, diagnostics, automation
- `genesis/` PRDs
- `docs/stories/` generated implementation stories
- `memory_bank/` learning and persistent knowledge artifacts

## Documentation

- Agent evolution: `docs/AGENT-EVOLUTION.md`
- Quick reference: `docs/QUICK-REFERENCE.md`
- Docs index: `DOCUMENTATION-INDEX.md`
- Security docs: `docs/security/`

## Versioning and Releases

Current framework line: `v1.9.0.22`

Detailed release notes are maintained in:
- `CHANGELOG.md`

## Contributing

1. Create a branch
2. Implement with tests
3. Run quality checks
4. Open a pull request with rationale and evidence

## License

MIT License. See `LICENSE`.
