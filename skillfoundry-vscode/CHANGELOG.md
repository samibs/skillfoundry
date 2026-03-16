# Changelog

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
