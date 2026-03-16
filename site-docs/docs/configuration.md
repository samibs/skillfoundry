---
sidebar_position: 4
title: Configuration
---

# Configuration

SkillFoundry is configured through a combination of project-level config files, environment variables, VS Code extension settings, and CLI flags. This page is the complete reference for every option.

## Config File Locations

| File | Scope | Purpose |
|------|-------|---------|
| `.skillfoundry/config.toml` | Project | Framework settings, platform selection, budget, logging, telemetry. Created automatically by `skillfoundry init`. |
| `CLAUDE.md` | Project | Agent behavior rules, coding standards, skill instructions, and workflow constraints. Read by Claude on every interaction. |

Both files live at the root of your project. The installer creates `.skillfoundry/config.toml` with sensible defaults; `CLAUDE.md` is authored by the developer and checked into version control.

:::tip
`config.toml` controls **SkillFoundry framework behavior**. `CLAUDE.md` controls **AI agent behavior**. Keep them separate — they serve different audiences.
:::

## config.toml Reference

Below is every section and key recognized by the framework. Keys marked *(auto)* are populated by the installer and should not be changed manually.

### `[framework]`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `version` | string | *(auto)* | Framework version that created this config. Used for migration detection. |
| `installed_at` | string | *(auto)* | ISO 8601 timestamp of when `skillfoundry init` was run. |
| `source` | string | *(auto)* | Absolute path to the SkillFoundry installation source. |

### `[platforms]`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `installed` | string[] | `["claude"]` | List of active AI platforms. Determines which agent config files are generated. Supported values: `claude`, `copilot`, `cursor`. |

Example:

```toml
[platforms]
installed = ["claude", "copilot"]
```

### `[budget]`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `monthly_limit_usd` | number | *(commented out)* | Monthly cost limit in USD. When set, the framework tracks estimated token spend and warns when approaching the threshold. Uncomment and set a value to activate. |

Example:

```toml
[budget]
monthly_limit_usd = 50.00
```

### `[logging]`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `log_level` | string | `"info"` | Log verbosity. Accepted values: `debug`, `info`, `warn`, `error`. Controls output from CLI commands and gate execution. |

### `[telemetry]`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `consent` | string | `"pending"` | Telemetry consent status. Values: `opted_in`, `opted_out`, `pending`. When `pending`, the CLI prompts on first interactive run. |
| `consent_date` | string | — | ISO 8601 timestamp recording when the user made their telemetry choice. |
| `consent_version` | number | `1` | Version of the consent policy the user agreed to. Allows re-prompting when the policy changes. |

### Full Example

```toml
[framework]
version = "2.0.42"
installed_at = "2026-03-16T10:30:00Z"
source = "/home/user/.npm-global/lib/node_modules/skillfoundry"

[platforms]
installed = ["claude"]

[budget]
# monthly_limit_usd = 100.00

[logging]
log_level = "info"

[telemetry]
consent = "opted_out"
consent_date = "2026-03-16T10:31:00Z"
consent_version = 1
```

## VS Code Extension Settings

The SkillFoundry VS Code extension provides a dashboard, inline gate results, and CodeLens actions. All settings are under the `skillfoundry.*` namespace in your VS Code `settings.json`.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `skillfoundry.autoRefresh` | boolean | `true` | Automatically refresh the dashboard panel when telemetry data or gate results change. Disable if the refresh is distracting during active development. |
| `skillfoundry.gateTimeout` | number | `30000` | Maximum time in milliseconds to wait for a single gate to complete execution. Increase for large projects or slow CI environments. |
| `skillfoundry.showCodeLens` | boolean | `true` | Show inline CodeLens action buttons (e.g., "Run Gate", "View Report") above functions and files that have gate findings. |
| `skillfoundry.inlineDiagnostics` | boolean | `true` | Display gate findings as native editor diagnostics (warnings and errors in the Problems panel and inline squiggles). |
| `skillfoundry.metricsWindow` | number | `10` | Number of recent gate runs to include when calculating trend metrics on the dashboard. |

Example `settings.json` snippet:

```json
{
  "skillfoundry.autoRefresh": true,
  "skillfoundry.gateTimeout": 60000,
  "skillfoundry.showCodeLens": true,
  "skillfoundry.inlineDiagnostics": true,
  "skillfoundry.metricsWindow": 20
}
```

## Environment Variables

Environment variables override config file values and are useful for CI/CD pipelines, Docker containers, and non-interactive environments.

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API key. Required for AI-powered features (PRD generation, autonomous mode, intelligent gate analysis). Not needed if using Claude Code CLI with its own authentication. |
| `SF_LOG_LEVEL` | Override the `log_level` from `config.toml`. Useful for enabling `debug` output in CI without changing the committed config. Accepted values: `debug`, `info`, `warn`, `error`. |
| `SF_PRD_IDEA` | Provide a PRD idea for non-interactive mode. When set, `/prd` uses this value instead of prompting. Useful in scripts and automation. |

Example usage in a shell:

```bash
# Enable debug logging for a single run
SF_LOG_LEVEL=debug skillfoundry forge run

# Generate a PRD non-interactively
SF_PRD_IDEA="Add user authentication with OAuth2" skillfoundry prd
```

### Precedence Order

When the same setting is specified in multiple places, the following precedence applies (highest to lowest):

1. **CLI flags** (e.g., `--verbose`)
2. **Environment variables** (e.g., `SF_LOG_LEVEL`)
3. **Project config** (`.skillfoundry/config.toml`)
4. **Framework defaults**

## CLI Flags

Common flags accepted by most SkillFoundry CLI commands:

| Flag | Short | Description |
|------|-------|-------------|
| `--yes` | `-y` | Skip all confirmation prompts. Accept defaults for every interactive question. Essential for CI/CD pipelines. |
| `--platform=<name>` | — | Target a specific platform (`claude`, `copilot`, `cursor`). Overrides the `[platforms].installed` config for this invocation. |
| `--html` | — | Generate gate reports in HTML format in addition to the default terminal output. Reports are saved to `.skillfoundry/reports/`. |
| `--baseline` | — | Capture current gate results as the baseline for future comparisons. Subsequent runs highlight regressions against this baseline. |
| `--verbose` | — | Enable verbose output. Equivalent to `SF_LOG_LEVEL=debug`. Shows detailed gate execution steps, timing, and intermediate results. |

### Command Examples

```bash
# Initialize with all prompts auto-accepted
skillfoundry init --yes --platform=claude

# Run gates with HTML report and verbose output
skillfoundry gate run --html --verbose

# Capture a baseline after a release
skillfoundry gate run --baseline

# Target a specific platform for config generation
skillfoundry config sync --platform=copilot
```

## Next Steps

- [Next.js Recipe](/recipes/nextjs) — Framework-specific setup for Next.js projects
- [Monorepo Recipe](/recipes/monorepo) — Configure SkillFoundry across workspace packages
- [Azure DevOps Recipe](/recipes/azure-devops) — CI/CD pipeline integration
- [Architecture](/architecture) — Understand what the configuration controls
