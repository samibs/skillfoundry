# SkillFoundry Deployment & Installation Guide

> Step-by-step installation, update, and operational deployment using the **actual** scripts shipped in this repository. The PRD that requested this guide referenced `deploy.sh`; that file does not exist. The real installation flow uses the scripts documented below.

---

## 1. Prerequisites

| Requirement | Minimum | Notes |
|---|---|---|
| Node.js | 20.0 | Verified by `node --version` |
| Git | 2.30 | Required for repo clone and knowledge sync |
| Bash 4+ or PowerShell 5.1+ | — | One of either, depending on OS |
| AI provider API key | optional | Required for `sf` CLI; not required for skill-layer mode inside Claude Code/Cursor/Copilot/Codex/Gemini |
| Disk space | ~200 MB | Excludes user knowledge base |

Supported providers (any one suffices): Anthropic, OpenAI, xAI, Google, Ollama (local), LM Studio (local).

---

## 2. Installation

### 2.1 Linux / macOS — One-Click

```bash
git clone https://github.com/samibs/skillfoundry.git
cd skillfoundry
bash install-unified.sh
```

`install-unified.sh` auto-detects OS (linux/macos/windows-cygwin) and platform IDE (Claude Code, Cursor, Copilot, Codex, Gemini) and installs the appropriate skill pack. The script is idempotent: re-running it upgrades existing installs in place.

### 2.2 Windows — PowerShell

```powershell
git clone https://github.com/samibs/skillfoundry.git
cd skillfoundry
.\install-unified.ps1
```

### 2.3 Standalone CLI (`sf`)

Install the `sf_cli` package directly:

```bash
cd sf_cli
npm ci
npm run build
npm link        # exposes the `sf` binary globally
```

Verify:

```bash
sf --version
```

---

## 3. Environment Variables

Configure exactly one provider key (or more, for cross-provider routing):

| Variable | Used by |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic provider |
| `OPENAI_API_KEY` | OpenAI provider |
| `XAI_API_KEY` | xAI Grok provider |
| `GOOGLE_API_KEY` | Google Gemini provider |
| `OLLAMA_HOST` | Local Ollama (defaults to `http://localhost:11434`) |
| `LMSTUDIO_HOST` | Local LM Studio |

Place keys in your shell rc file or in `.env` at the repo root (already gitignored). **Never commit API keys.**

---

## 4. Updating

```bash
# Linux / macOS
bash update.sh

# Windows
.\update.ps1
```

The update scripts pull latest, run `npm ci` where applicable, and reapply the platform skill pack.

---

## 5. Operational Scripts

| Script | Purpose | Typical use |
|---|---|---|
| `scripts/dashboard.sh` | Live execution dashboard (terminal UI) | `bash scripts/dashboard.sh --refresh=2` |
| `scripts/knowledge-sync.sh` | Pull/push global knowledge repo | `bash scripts/knowledge-sync.sh start` |
| `scripts/session-init.sh` | Start-of-session: pull knowledge, start sync daemon | Run automatically by autonomous mode |
| `scripts/session-close.sh` | End-of-session: harvest memory, final sync | Run automatically by autonomous mode |
| `scripts/anvil.sh` | Run Anvil quality gates standalone | `bash scripts/anvil.sh --tier T1` |
| `scripts/harvest.sh` | Extract knowledge from completed work | `bash scripts/harvest.sh` |

---

## 6. CI / Smoke Test

The repository ships a single root-level test entry point:

```bash
npm test    # delegates to: cd sf_cli && npm test
```

This runs the `sf_cli` Vitest suite, which also covers documentation-presence checks (`sf_cli/src/__tests__/docs-validation.test.ts`).

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `install-unified.sh: line N: command not found` | Bash < 4 or missing core utility | Install Bash 4+ (`brew install bash` on macOS) |
| `EACCES: permission denied` during `npm link` | npm prefix in protected dir | Use `npm config set prefix ~/.npm-global` and add `~/.npm-global/bin` to PATH |
| `sf` command not found after install | npm global bin not on PATH | Run `npm bin -g` and add output to PATH |
| Knowledge sync hangs | Daemon already running | `bash scripts/knowledge-sync.sh stop` then restart |
| Provider call returns 401 | API key not exported in current shell | `echo $ANTHROPIC_API_KEY` to verify; re-source rc file |
| `.next` stale bundle (Next.js dashboards only) | Old cache | `rm -rf .next node_modules/.cache && npm ci && npm run build` |

For deeper provider-specific issues, see `docs/TROUBLESHOOTING.md`.

---

## 8. Verifying a Healthy Install

```bash
# 1. Binary exists
which sf

# 2. Version reported
sf --version

# 3. Skills index populated
ls .claude/commands | head -10     # for Claude Code
ls .cursor/rules    | head -10     # for Cursor

# 4. Tests pass
npm test
```

A clean install produces no errors at any of these steps.

---

## 9. Uninstall

```bash
# Remove global sf binary
npm unlink -g skillfoundry

# Remove platform skill pack (Claude Code example)
rm -rf .claude/commands/skillfoundry*
```

The repository clone itself can be deleted with `rm -rf skillfoundry`.

---

## 10. Related Documents

- Configuration reference: [CONFIGURATION-REFERENCE.md](./CONFIGURATION-REFERENCE.md)
- Versioning & docs maintenance: [DOCS-VERSIONING-STRATEGY.md](./DOCS-VERSIONING-STRATEGY.md)
- Operational standards (PM2, incident response): [enterprise-standards.md](./enterprise-standards.md)
- Full doc map: [DOCUMENTATION-INDEX.md](./DOCUMENTATION-INDEX.md)
