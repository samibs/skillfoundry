# SkillFoundry Configuration Reference

> Authoritative reference for the **actual** configuration surface used by SkillFoundry. The PRD that requested this page referenced a `tower.json` file; that file does not exist in the repository. The real configuration lives in the files documented below.

---

## 1. Configuration Surface Overview

| Surface | Location | Scope | Tracked in git? |
|---|---|---|---|
| Claude Code harness | `.claude/settings.json` | Per-project IDE behaviour | Yes |
| Local overrides | `.claude/settings.local.json` | Per-developer overrides | **No** (gitignored) |
| Node entry points | `package.json` | Repo-level npm scripts | Yes |
| CLI package | `sf_cli/package.json`, `sf_cli/tsconfig.json` | Standalone `sf` CLI build | Yes |
| Autonomous mode flag | `.claude/.autonomous` | Toggles autonomous developer loop | Yes (flag only) |
| Provider credentials | `.env` and shell env vars | API keys for AI providers | **Never** |

There is no monolithic `tower.json`. Each surface above is intentionally scoped.

---

## 2. `.claude/settings.json` — Harness Settings

This is the primary configuration file for Claude Code projects. It controls permissions, hooks, allowed tools, environment variables, and status line.

### 2.1 Common fields

| Field | Type | Purpose |
|---|---|---|
| `permissions.allow` | `string[]` | Tool patterns that bypass the permission prompt (e.g. `"Bash(npm test:*)"`) |
| `permissions.deny` | `string[]` | Tool patterns the agent must never invoke |
| `hooks.PostToolUse` | object | Shell commands triggered after a tool runs (e.g. lint, log) |
| `hooks.Stop` | object | Commands triggered when Claude stops |
| `env` | object | Environment variables injected into every tool invocation |

### 2.2 Example skeleton

```json
{
  "permissions": {
    "allow": [
      "Bash(npm test:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)"
    ],
    "deny": [
      "Bash(rm -rf:*)"
    ]
  },
  "hooks": {
    "PostToolUse": {
      "matcher": "Edit|Write",
      "command": "echo edited >> .claude/edit.log"
    }
  },
  "env": {
    "SF_LOG_LEVEL": "info"
  }
}
```

### 2.3 Editing safely

- Use `/update-config` (built-in SkillFoundry skill) to add permissions or hooks rather than hand-editing.
- Validate JSON before commit (`jq . .claude/settings.json > /dev/null`).
- Never put secrets in this file — it is committed.

### 2.4 `.claude/settings.local.json`

Same schema as `.claude/settings.json`. Gitignored. Use for personal preferences (auto-allowed commands you trust on your machine only).

---

## 3. `package.json` — Repository-Level Scripts

The root `package.json` currently exposes a single script:

```json
{
  "test": "cd sf_cli && npm test"
}
```

`npm test` from the repo root runs the Vitest suite in `sf_cli/`. CI pipelines should call this exact command.

---

## 4. `sf_cli/` — Standalone CLI

| File | Purpose |
|---|---|
| `sf_cli/package.json` | npm dependencies, build/test scripts, binary entry |
| `sf_cli/tsconfig.json` | TypeScript compiler options for the CLI |
| `sf_cli/src/` | CLI source (commands, agent runtime, gates, pipeline) |
| `sf_cli/src/__tests__/` | Vitest tests, including docs-validation gate |

Build the CLI:

```bash
cd sf_cli && npm ci && npm run build
```

---

## 5. AI Provider Credentials

API keys are **environment-resolved**, never file-resolved. Set in your shell rc or local `.env` (gitignored):

| Variable | Provider | Required when |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic Claude | Using `sf` CLI with Claude |
| `OPENAI_API_KEY` | OpenAI | Using `sf` CLI with OpenAI |
| `XAI_API_KEY` | xAI Grok | Using `sf` CLI with Grok |
| `GOOGLE_API_KEY` | Google Gemini | Using `sf` CLI with Gemini |
| `OLLAMA_HOST` | Local Ollama | Local-only inference |
| `LMSTUDIO_HOST` | Local LM Studio | Local-only inference |

**Sensitive-data handling:**

- Never commit `.env` (already in `.gitignore`).
- Never paste API keys into `.claude/settings.json` or any tracked file.
- Rotate any key that appears in a tracked file or in a log.
- The `scripts/sanitize-knowledge.sh` script strips secrets before knowledge sync.

---

## 6. Autonomous Mode Flag

`/autonomous on` creates `.claude/.autonomous` (empty file). `/autonomous off` removes it. The autonomous-developer-loop protocol checks for this file's presence.

---

## 7. Configuration Validation

Run the smoke test:

```bash
npm test
```

The `sf_cli/src/__tests__/docs-validation.test.ts` suite verifies that documented configuration files referenced from this page exist on disk.

---

## 8. Related Documents

- Deployment / install: [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md)
- Versioning & docs maintenance: [DOCS-VERSIONING-STRATEGY.md](./DOCS-VERSIONING-STRATEGY.md)
- Anti-patterns to avoid: [ANTI_PATTERNS_DEPTH.md](./ANTI_PATTERNS_DEPTH.md), [ANTI_PATTERNS_BREADTH.md](./ANTI_PATTERNS_BREADTH.md)
- Full doc map: [DOCUMENTATION-INDEX.md](./DOCUMENTATION-INDEX.md)
