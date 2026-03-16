# Changelog

## [1.1.0] - 2026-03-16

### Live Gate Execution

- **Real Gate Execution** — "Run All Gates" and "Run Gate" now execute real T0-T6 quality gates via `sf-runner.mjs` subprocess. Results appear in the Gate Timeline with pass/fail/warn/skip status and timing.
- **Real Dependency Scanning** — "Scan Dependencies" runs actual npm/pip/dotnet vulnerability analysis instead of returning empty results.
- **Real Report Generation** — "View Quality Report" generates live quality reports from telemetry data with industry baselines.
- **Real Metrics** — "Show Metrics" aggregates actual telemetry events with trend analysis and security finding summaries.
- **sf-runner.mjs Bridge** — ESM wrapper script that bridges the VS Code extension (CJS) to sf_cli core modules (ESM). Supports gates, dependency scanning, reports, and metrics.
- **Improved Error Messages** — Gate and scan failures now show actionable messages about sf-runner availability.

## [1.0.0] - 2026-03-16

### Initial Marketplace Release

- **Quality Dashboard** — sidebar view with real-time quality metrics from `.skillfoundry/telemetry.jsonl`
- **Gate Timeline** — visual history of gate execution results (T0-T6)
- **Run All Gates** — execute the full gate suite from VS Code with progress notifications
- **Run Gate on File** — context menu action to run gates on a specific file (T1, T4, or T1+T4)
- **Forge Monitor** — sidebar view tracking forge pipeline status
- **Dependency Scanner** — sidebar view for dependency analysis
- **Memory Recall** — access SkillFoundry memory bank from the command palette
- **PRD Creation** — create Product Requirements Documents directly from VS Code
- **Benchmark Command** — run performance benchmarks from the command palette
- **Hook Management** — manage git hooks through the command palette
- **Open Last Report** — open the generated HTML quality report in the browser
- **Inline Diagnostics** — gate findings displayed as VS Code diagnostics in the editor
- **CodeLens Actions** — gate actions shown above code for TypeScript, JavaScript, Python, and C#
- **Status Bar** — persistent status bar item showing current gate health
- **Auto-Refresh** — dashboard auto-refreshes when telemetry file changes (debounced)
- **Legacy Install Detection** — detects older SkillFoundry installs and prompts for update
- **Configurable Settings** — auto-refresh, gate timeout, CodeLens toggle, inline diagnostics, metrics window size
