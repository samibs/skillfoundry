# Contributing to SkillFoundry

Thanks for considering contributing to SkillFoundry. This document covers what you need to know.

---

## Getting Started

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/skillfoundry.git
cd skillfoundry

# 2. Install CLI dependencies
cd sf_cli && npm install

# 3. Run tests (all must pass before you start)
npm test
```

Requires **Node.js v20+** and **npm**.

---

## What Can I Contribute?

| Area | Examples |
|------|----------|
| **Agents** | New agent contracts in `agents/` (e.g., a11y specialist, API design) |
| **Skills** | New slash commands in `.claude/commands/` |
| **CLI features** | New commands, UI components, provider adapters in `sf_cli/src/` |
| **Bug fixes** | Anything in the issue tracker |
| **Documentation** | Fixes, tutorials, examples in `docs/` |
| **Platform support** | Improved Copilot/Cursor/Codex/Gemini skill generation |
| **Scripts** | Shell tooling improvements in `scripts/` |

---

## Development Workflow

### 1. Create a branch

```bash
git checkout -b feat/your-feature    # or fix/your-bug
```

Use conventional commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.

### 2. Make your changes

- **CLI code** lives in `sf_cli/src/` (TypeScript + React/Ink)
- **Agent contracts** live in `agents/` (Markdown)
- **Skills** live in `.claude/commands/` and are generated for other platforms by the installer
- **Install/update scripts** are `install.sh`, `install.ps1`, `update.sh`, `update.ps1`

### 3. Write tests

Every change needs tests. The project uses **Vitest**:

```bash
cd sf_cli
npm test              # run all 380+ tests
npm run test:watch    # watch mode during development
```

Test files go in `sf_cli/src/__tests__/` and follow the pattern `*.test.ts`.

### 4. Validate

```bash
# TypeScript must compile clean
cd sf_cli && npx tsc --noEmit

# All tests must pass
npm test

# Bash scripts must pass syntax check
bash -n install.sh
bash -n update.sh
```

### 5. Open a pull request

- Target the `main` branch
- Include a clear description of what changed and why
- Reference any related issues

---

## Code Standards

- **No placeholders, TODOs, or stubs** — every line must be real, working code
- **No hardcoded secrets** — use environment variables
- **No silent failures** — log all errors
- **TypeScript strict mode** — `sf_cli/tsconfig.json` has strict enabled
- Follow existing patterns in the codebase rather than inventing new ones

### Commit Messages

```
feat: add dark mode toggle to CLI header
fix: CLI exits silently on Windows with non-Claude platforms
chore: bump version to 2.0.24
docs: add troubleshooting section for Ollama setup
refactor: extract provider adapter interface
```

Keep the first line under 72 characters. Add a body if the "why" isn't obvious from the title.

---

## Project Structure

```
skillfoundry/
├── sf_cli/                  CLI source (TypeScript + React/Ink)
│   ├── src/core/            Provider adapters, tools, permissions, gates
│   ├── src/components/      Terminal UI components
│   ├── src/commands/        Slash command handlers
│   ├── src/hooks/           React hooks for session state
│   └── src/__tests__/       Vitest tests (380+)
├── agents/                  Agent contracts (Markdown)
├── genesis/                 PRD templates
├── scripts/                 Shell tooling (memory, harvest, evolve, etc.)
├── install.sh / install.ps1 Installer (bash / PowerShell)
├── update.sh / update.ps1   Updater (bash / PowerShell)
└── docs/                    Documentation
```

---

## Adding a New Agent

1. Create `agents/your-agent-name.md` following the existing contract format
2. The installer auto-discovers agents and generates platform-specific files
3. Add a corresponding skill in `.claude/commands/your-agent-name.md`
4. Test that it generates correctly for all 5 platforms by running `install.sh --dry-run`

---

## Adding a New CLI Command

1. Create `sf_cli/src/commands/your-command.ts`
2. Register it in `sf_cli/src/commands/index.ts`
3. Add tests in `sf_cli/src/__tests__/`
4. Document it in `docs/USER-GUIDE-CLI.md`

---

## Reporting Issues

Use [GitHub Issues](https://github.com/samibs/skillfoundry/issues). Include:

- What you expected vs. what happened
- Steps to reproduce
- OS, Node.js version, platform (Claude Code / Copilot / Cursor / etc.)
- CLI output or error messages

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
