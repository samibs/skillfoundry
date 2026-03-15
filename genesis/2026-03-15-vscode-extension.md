# PRD: SkillFoundry VS Code Extension

---
prd_id: vscode-extension
title: SkillFoundry VS Code Extension
version: 1.0
status: DRAFT
created: 2026-03-15
author: SBS + PRD Architect
last_updated: 2026-03-15

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: [quality-intelligence-layer]
  recommends: [real-autonomous-agents, semgrep-security-integration]
  blocks: []
  shared_with: []

tags: [extension, vscode, dx, ui, integration]
priority: high
layers: [frontend]
---

---

## 1. Overview

### 1.1 Problem Statement

SkillFoundry operates exclusively in the terminal. Developers must switch between their editor and terminal to run gates, view metrics, check telemetry, recall memory, or trigger forge runs. This context-switching costs time and breaks flow — the exact problem SkillFoundry was built to solve for AI coding.

The framework already has 20 CLI commands, 41 core modules, and a complete telemetry engine — but no visual interface. Developers cannot:
- See quality gate results inline next to their code
- Monitor a forge run's progress in real-time without watching terminal output
- Browse telemetry trends, dependency CVEs, or security findings visually
- Trigger a single gate on the current file with one click
- Access memory recall without leaving VS Code

VS Code holds 73% IDE market share (Stack Overflow 2024). Every competitor in the AI coding space (Copilot, Cursor, Cody, Continue) ships a VS Code extension. SkillFoundry's absence from the VS Code marketplace is the single largest distribution gap in the framework.

### 1.2 Proposed Solution

Build a native VS Code extension (`skillfoundry-vscode`) that wraps the existing `sf_cli` engine. The extension is a **UI layer, not a rewrite** — it imports and calls the same TypeScript modules that power the CLI (`gates.ts`, `telemetry.ts`, `dependency-scanner.ts`, `report-generator.ts`, `pipeline.ts`, `agent-registry.ts`, `weight-learner.ts`).

The extension provides:
1. **Sidebar panel** — Quality dashboard with telemetry trends, gate status, dependency CVEs, memory entries
2. **Gate timeline view** — Visual representation of T0-T6 gate results with pass/fail/warn icons and duration
3. **Inline diagnostics** — Security findings and banned pattern violations as VS Code diagnostics (squiggly underlines)
4. **Command palette** — All 20 CLI commands accessible via `Ctrl+Shift+P > SkillFoundry: ...`
5. **Status bar** — Live forge progress, gate pass rate, active agent/team
6. **CodeLens** — "Run Gate T3 (Tests)" above test files, "Run Gate T4 (Security)" above security-sensitive files
7. **Output channel** — Forge pipeline log streamed in real-time
8. **Webview panels** — Quality report viewer, telemetry dashboard, dependency scan results

### 1.3 Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| VS Code Marketplace install | Listed and installable | `code --install-extension skillfoundry.skillfoundry` works |
| Time to first gate result | < 3 seconds from command | Measure from palette invoke to diagnostics appearing |
| Forge run monitoring | Real-time phase updates | Phase transitions appear in sidebar within 1 second of change |
| Telemetry dashboard render | < 500ms for 100 events | Webview load time with 100 JSONL entries |
| Zero new dependencies on sf_cli | 0 npm packages added to sf_cli | Extension bundles its own deps, imports sf_cli as local module |
| Inline diagnostic accuracy | 100% match with CLI gate output | Same findings as `sf gate t1 .` / `sf gate t4 .` |

---

## 2. User Stories

### Primary User: Developer Using VS Code with SkillFoundry

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | run a quality gate on the current file from the editor | I don't switch to the terminal for a quick check | MUST |
| US-002 | developer | see gate results as inline diagnostics (squiggly lines) | I fix issues where I see them, like ESLint | MUST |
| US-003 | developer | view a quality dashboard in the sidebar | I have persistent visibility into project health | MUST |
| US-004 | developer | monitor a `/forge` run in real-time | I see which phase is active, which story is executing, without watching terminal scrollback | MUST |
| US-005 | developer | trigger `/forge` from the command palette | I start the full pipeline without leaving VS Code | MUST |
| US-006 | developer | see telemetry trends (gate pass rate over time) in a chart | I know if quality is improving or declining | SHOULD |
| US-007 | developer | browse dependency CVE findings in a tree view | I can navigate directly to the vulnerable package in package.json | SHOULD |
| US-008 | developer | recall memory entries from the command palette | I search past decisions and lessons without terminal | SHOULD |
| US-009 | developer | see CodeLens actions above test files | I run relevant gates with one click on the file I'm editing | SHOULD |
| US-010 | developer | view the quality report as a formatted webview | I read the report in the editor instead of opening a markdown file | COULD |
| US-011 | developer | see the active agent/team and cost in the status bar | I have at-a-glance awareness of the current session state | COULD |
| US-012 | developer | create a PRD from a selection of text or a prompt | I start the PRD workflow without switching tools | COULD |

### Secondary User: Team Lead

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-013 | team lead | share the extension with my team via VS Code Marketplace | onboarding new developers to SkillFoundry is `ext install` not `git clone` | MUST |
| US-014 | team lead | see aggregate quality metrics in the sidebar | I get a project health overview during code review | SHOULD |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Sidebar Quality Dashboard | TreeView provider showing: gate pass rate, last forge status, security finding count, dependency CVE count, telemetry event count, memory entry count | Given a project with telemetry data, When I open the SkillFoundry sidebar, Then I see all 6 metrics updated from `.skillfoundry/telemetry.jsonl` within 500ms |
| FR-002 | Gate Timeline View | TreeView showing most recent gate run results: each tier (T0-T6) with pass/fail/warn icon, duration, and expandable detail | Given I ran `/gate all`, When I view the gate timeline, Then all 7 tiers show with correct status icons and timing |
| FR-003 | Inline Diagnostics | DiagnosticCollection populated from T1 (banned patterns) and T4 (security scan) findings, mapped to file:line | Given a file with a `TODO` marker, When T1 gate runs, Then a warning diagnostic appears on that line in the editor |
| FR-004 | Command Palette Commands | All 20 CLI commands registered as VS Code commands with `skillfoundry.` prefix | Given I press `Ctrl+Shift+P`, When I type "SkillFoundry", Then I see all commands: gate, forge, metrics, report, hook, benchmark, memory, etc. |
| FR-005 | Forge Progress Monitor | Real-time display of forge pipeline phases in sidebar: IGNITE → FORGE → TEMPER → INSPECT → REMEMBER → DEBRIEF with phase duration and story progress | Given a forge run is active, When Phase 2 starts Story 3/8, Then the sidebar shows "FORGE: Story 3/8" with elapsed time updating every second |
| FR-006 | Status Bar Integration | StatusBarItem showing: gate pass rate (e.g., "SF: 94% gates"), active agent (e.g., "sf:coder"), and clickable to open dashboard | Given a project with telemetry, When VS Code opens, Then the status bar shows the current gate pass rate |
| FR-007 | CodeLens Provider | CodeLens actions above: test files ("Run T3 Tests"), files with security patterns ("Run T4 Security"), files with TODOs ("Run T1 Banned Patterns") | Given I open a `*.test.ts` file, When it renders, Then a CodeLens "Run T3 (Tests)" appears above the first `describe()` block |
| FR-008 | Output Channel | Dedicated output channel "SkillFoundry" for forge pipeline logs, gate results, and command output | Given I run `/forge` from the palette, When the pipeline runs, Then all phase output streams to the SkillFoundry output channel in real-time |
| FR-009 | Dependency CVE Tree | TreeView listing vulnerable dependencies grouped by severity (critical → high → moderate → low), each expandable to show CVE ID, advisory URL, and affected version | Given `npm audit` found 3 CVEs, When I open the dependency tree, Then I see 3 items with severity badges and clickable advisory links |
| FR-010 | Quality Report Webview | WebviewPanel rendering the markdown quality report with formatted tables, trend arrows, and industry baseline comparison | Given telemetry data exists, When I run "SkillFoundry: View Report", Then a webview opens with the formatted report |
| FR-011 | Memory Recall QuickPick | QuickPick search over memory bank entries (facts, decisions, errors) with fuzzy matching, showing entry type, weight, and content preview | Given memory bank has 50 entries, When I run "SkillFoundry: Recall Memory" and type "auth", Then matching entries appear sorted by weight |
| FR-012 | File Watcher Auto-Refresh | FileSystemWatcher on `.skillfoundry/telemetry.jsonl` that auto-refreshes the sidebar dashboard when new events are appended | Given the forge pipeline appends a new event, When the file changes, Then the sidebar updates within 2 seconds without manual refresh |
| FR-013 | Gate on Current File | Context menu and command: "SkillFoundry: Run Gate on This File" — runs T1 + T4 on the active editor file and shows inline diagnostics | Given I have `src/auth.ts` open, When I right-click and select "Run Gate on This File", Then T1 and T4 run on that file and diagnostics appear inline |
| FR-014 | PRD Creation | Command: "SkillFoundry: Create PRD" — prompts for feature description, generates PRD in `genesis/`, opens it in editor | Given I run the command and enter "user authentication", When generation completes, Then `genesis/2026-03-15-user-authentication.md` opens in a new tab |

### 3.2 User Interface Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ VS Code                                                         │
├──────────┬──────────────────────────────────────┬───────────────┤
│ Explorer │ Editor                               │ SF Sidebar    │
│          │                                      │               │
│          │  src/auth.ts                         │ ◆ Dashboard   │
│          │  ─────────────────                   │  Pass Rate 94%│
│          │  1 │ import { hash } from 'bcrypt'   │  Last Forge ✓ │
│          │  2 │ // TODO: add rate limiting  ⚠   │  CVEs: 2 high │
│          │  3 │                                  │  Memory: 50   │
│          │  4 │ export function login(           │               │
│          │    │ ▸ Run T3 (Tests)                │ ◆ Gate Status │
│          │    │ ▸ Run T4 (Security)             │  T0 ✓  T1 ✓  │
│          │  5 │   user: string,                  │  T2 ✓  T3 ✓  │
│          │  6 │   pass: string                   │  T4 ⚠  T5 ✓  │
│          │  7 │ ) {                              │  T6 ✓         │
│          │                                      │               │
│          │                                      │ ◆ Forge       │
│          │                                      │  Phase: TEMPER│
│          │                                      │  Story: 5/8   │
│          │                                      │  Time: 2m 14s │
│          │                                      │               │
│          │                                      │ ◆ Dependencies│
│          │                                      │  ▸ 2 high CVE │
│          │                                      │  ▸ 1 moderate │
├──────────┴──────────────────────────────────────┴───────────────┤
│ SF: 94% gates │ sf:coder │ $0.12                    │ Output    │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 VS Code API Usage

| VS Code API | Feature | Purpose |
|-------------|---------|---------|
| `TreeDataProvider` | Sidebar panels (dashboard, gates, deps, forge) | Structured tree views with icons and collapse |
| `DiagnosticCollection` | Inline findings | Squiggly underlines for gate violations |
| `CodeLensProvider` | Code actions | Gate run buttons above relevant code |
| `StatusBarItem` | Status bar | Gate pass rate, active agent, cost |
| `WebviewPanel` | Report viewer, telemetry charts | Rich HTML rendering of reports |
| `OutputChannel` | Pipeline log | Real-time forge output streaming |
| `QuickPick` | Memory recall, agent select | Fuzzy search over entries |
| `FileSystemWatcher` | Auto-refresh | React to telemetry.jsonl changes |
| `commands.registerCommand` | Palette commands | All 20 CLI commands + extension-specific |
| `window.createTerminal` | Forge execution | Run sf CLI in integrated terminal |
| `workspace.getConfiguration` | Settings | Extension preferences |
| `languages.registerCodeLensProvider` | CodeLens | File-type-specific gate actions |
| `TextEditorDecorationType` | Gate gutter icons | Pass/fail markers in gutter |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Target | Rationale |
|--------|--------|-----------|
| Extension activation | < 200ms | Must not slow VS Code startup |
| Sidebar render (100 telemetry events) | < 500ms | Responsive dashboard |
| Inline diagnostics update | < 1s after gate completes | Feels instant |
| Telemetry file read (5MB) | < 300ms | Largest expected file size |
| CodeLens render | < 100ms | Standard VS Code expectation |
| Memory recall search (500 entries) | < 200ms | Fuzzy search must feel instant |
| Extension bundle size | < 5MB | Marketplace download size limit |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| No API keys in extension | Extension never stores or transmits API keys. Provider auth is handled by sf_cli config |
| No telemetry phone-home | Extension never sends data to external services. All data is local `.skillfoundry/` |
| Workspace trust | Extension respects VS Code workspace trust. Untrusted workspaces get read-only mode (dashboard only, no gate execution) |
| No code execution in webviews | Webview panels use CSP headers. No `eval()`, no inline scripts, no remote resources |
| Extension permissions | Request minimum: `file.read`, `file.write` (for gate results), `terminal` (for forge). No network permissions |

### 4.3 Compatibility

| Environment | Requirement |
|-------------|-------------|
| VS Code version | >= 1.85.0 (November 2023, Node 18+ built-in) |
| Node.js | >= 20.0.0 (required by sf_cli) |
| OS | Linux, macOS, Windows (matches sf_cli support) |
| Remote Development | Works in Remote-SSH, WSL, and Dev Containers (sf_cli must be installed in the remote environment) |
| Web (vscode.dev) | Not supported (sf_cli requires Node.js filesystem access) |

### 4.4 Reliability

| Metric | Target |
|--------|--------|
| Extension crash rate | < 0.1% of sessions |
| Graceful degradation when sf_cli missing | Show "SkillFoundry not installed" with install instructions, not a crash |
| Telemetry file corruption tolerance | Skip malformed lines (same as CLI), show partial data |
| Gate timeout handling | 30s default timeout, user-configurable, cancel button in UI |

---

## 5. Technical Specifications

### 5.1 Architecture

```
skillfoundry-vscode/          VS Code Extension (NEW PACKAGE)
├── src/
│   ├── extension.ts          Activation, command registration, lifecycle
│   ├── bridge.ts             Thin wrapper calling sf_cli modules
│   ├── providers/
│   │   ├── dashboard.ts      TreeDataProvider for quality dashboard
│   │   ├── gate-timeline.ts  TreeDataProvider for gate results
│   │   ├── dependency.ts     TreeDataProvider for CVE tree
│   │   ├── forge-monitor.ts  TreeDataProvider for live forge progress
│   │   ├── diagnostics.ts    DiagnosticCollection from gate findings
│   │   ├── codelens.ts       CodeLensProvider for gate actions
│   │   └── statusbar.ts      StatusBarItem for pass rate + agent
│   ├── views/
│   │   ├── report.ts         WebviewPanel for quality report
│   │   └── telemetry.ts      WebviewPanel for telemetry charts
│   ├── commands/
│   │   ├── gate.ts           Run gate commands
│   │   ├── forge.ts          Start/monitor forge run
│   │   ├── memory.ts         Memory recall QuickPick
│   │   └── prd.ts            PRD creation workflow
│   └── utils/
│       ├── watcher.ts        FileSystemWatcher for telemetry
│       └── icons.ts          Gate status icon mapping
├── media/
│   ├── icon.png              Extension marketplace icon
│   └── gate-icons/           SVG icons for gate tiers
├── package.json              Extension manifest
├── tsconfig.json             TypeScript config
├── esbuild.config.js         Bundle config
├── .vscodeignore             Exclude dev files from VSIX
└── __tests__/
    ├── bridge.test.ts
    ├── dashboard.test.ts
    ├── diagnostics.test.ts
    └── codelens.test.ts
```

### 5.2 Bridge Layer (`bridge.ts`)

The bridge is the critical architectural decision. It imports sf_cli core modules directly — **no subprocess spawning, no HTTP server, no IPC**.

```typescript
// bridge.ts — Thin adapter between VS Code extension and sf_cli core

import { readEvents, readEventsByType, aggregateMetrics, INDUSTRY_BASELINES } from '../../sf_cli/src/core/telemetry.js';
import { runSingleGate, runAllGates } from '../../sf_cli/src/core/gates.js';
import { runDependencyScan } from '../../sf_cli/src/core/dependency-scanner.js';
import { generateReport, formatReportMarkdown } from '../../sf_cli/src/core/report-generator.js';
import { runWeightLearning } from '../../sf_cli/src/core/weight-learner.js';

export class SfBridge {
  constructor(private workDir: string) {}

  getMetrics(window: number) { return aggregateMetrics(this.workDir, window); }
  getEvents() { return readEvents(this.workDir); }
  runGate(tier: string, target?: string) { return runSingleGate(tier, this.workDir, target || '.'); }
  runAllGates(target?: string) { return runAllGates({ workDir: this.workDir, target: target || '.' }); }
  scanDependencies() { return runDependencyScan(this.workDir); }
  generateReport(window: number) { return generateReport(this.workDir, window); }
  getBaselines() { return INDUSTRY_BASELINES; }
}
```

**Why direct import over subprocess:**
- 10-100x faster (no process spawn overhead)
- Type-safe (same TypeScript interfaces)
- No serialization/deserialization
- Shared file handles and caching
- Debuggable in VS Code itself

**Trade-off:** Extension and sf_cli must be co-located or linked. The extension's `package.json` lists sf_cli as a local dependency.

### 5.3 Extension Manifest (`package.json`)

```json
{
  "name": "skillfoundry",
  "displayName": "SkillFoundry",
  "description": "Quality gates, telemetry dashboard, dependency scanning, and forge pipeline — directly in VS Code",
  "version": "0.1.0",
  "publisher": "skillfoundry",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Linters", "Testing", "Other"],
  "keywords": ["quality", "gates", "security", "AI", "forge", "telemetry"],
  "activationEvents": [
    "workspaceContains:.skillfoundry/config.toml",
    "onCommand:skillfoundry.gate",
    "onCommand:skillfoundry.forge"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "viewsContainers": {
      "activitybar": [{
        "id": "skillfoundry",
        "title": "SkillFoundry",
        "icon": "media/icon.svg"
      }]
    },
    "views": {
      "skillfoundry": [
        { "id": "sf.dashboard", "name": "Quality Dashboard" },
        { "id": "sf.gates", "name": "Gate Timeline" },
        { "id": "sf.forge", "name": "Forge Monitor" },
        { "id": "sf.dependencies", "name": "Dependencies" }
      ]
    },
    "commands": [
      { "command": "skillfoundry.gate", "title": "SkillFoundry: Run Gate" },
      { "command": "skillfoundry.gateFile", "title": "SkillFoundry: Run Gate on This File" },
      { "command": "skillfoundry.gateAll", "title": "SkillFoundry: Run All Gates" },
      { "command": "skillfoundry.forge", "title": "SkillFoundry: Start Forge Pipeline" },
      { "command": "skillfoundry.metrics", "title": "SkillFoundry: Show Metrics" },
      { "command": "skillfoundry.report", "title": "SkillFoundry: View Quality Report" },
      { "command": "skillfoundry.benchmark", "title": "SkillFoundry: Run Benchmark" },
      { "command": "skillfoundry.hook", "title": "SkillFoundry: Manage Hooks" },
      { "command": "skillfoundry.memory", "title": "SkillFoundry: Recall Memory" },
      { "command": "skillfoundry.prd", "title": "SkillFoundry: Create PRD" },
      { "command": "skillfoundry.scanDeps", "title": "SkillFoundry: Scan Dependencies" },
      { "command": "skillfoundry.refresh", "title": "SkillFoundry: Refresh Dashboard" }
    ],
    "menus": {
      "editor/context": [
        { "command": "skillfoundry.gateFile", "group": "skillfoundry" }
      ],
      "explorer/context": [
        { "command": "skillfoundry.gateFile", "group": "skillfoundry" }
      ]
    },
    "configuration": {
      "title": "SkillFoundry",
      "properties": {
        "skillfoundry.autoRefresh": {
          "type": "boolean",
          "default": true,
          "description": "Auto-refresh dashboard when telemetry changes"
        },
        "skillfoundry.gateTimeout": {
          "type": "number",
          "default": 30,
          "description": "Gate execution timeout in seconds"
        },
        "skillfoundry.showCodeLens": {
          "type": "boolean",
          "default": true,
          "description": "Show gate CodeLens actions above code"
        },
        "skillfoundry.inlineDiagnostics": {
          "type": "boolean",
          "default": true,
          "description": "Show gate findings as inline diagnostics"
        },
        "skillfoundry.metricsWindow": {
          "type": "number",
          "default": 10,
          "description": "Default metrics window (last N forge runs)"
        }
      }
    }
  }
}
```

### 5.4 Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│                       VS Code Extension                       │
│                                                               │
│  Command Palette ──→ commands/*.ts ──→ bridge.ts ──┐         │
│  CodeLens Click  ──→ commands/gate.ts ──→          │         │
│  Context Menu    ──→ commands/gate.ts ──→          │         │
│                                                     ▼         │
│                                              ┌────────────┐  │
│  Sidebar ◄──── providers/*.ts ◄──────────── │  SfBridge   │  │
│  Diagnostics ◄─ providers/diagnostics.ts ◄── │            │  │
│  StatusBar ◄── providers/statusbar.ts ◄───── │  (imports   │  │
│  Webviews ◄── views/*.ts ◄───────────────── │   sf_cli    │  │
│  Output ◄──── commands/forge.ts ◄─────────── │   modules)  │  │
│                                              └─────┬──────┘  │
│                                                     │         │
│  FileSystemWatcher ──→ watcher.ts ──→ refresh ─────┘         │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
              ┌────────────────────────────┐
              │        sf_cli/src/core/     │
              │                             │
              │  telemetry.ts               │
              │  gates.ts                   │
              │  dependency-scanner.ts      │
              │  report-generator.ts        │
              │  weight-learner.ts          │
              │  agent-registry.ts          │
              │  pipeline.ts (via terminal) │
              └────────────────────────────┘
                            │
                            ▼
              ┌────────────────────────────┐
              │  .skillfoundry/             │
              │  ├── telemetry.jsonl        │
              │  ├── config.toml           │
              │  └── hooks.toml            │
              │  memory_bank/knowledge/    │
              └────────────────────────────┘
```

**Note on forge execution:** The forge pipeline (`pipeline.ts`) spawns AI providers and runs multi-turn agentic loops. This is too heavy for a direct import — forge runs in a VS Code integrated terminal via `window.createTerminal()`. The extension monitors progress by watching `.skillfoundry/forge-state.json` (written by progressive-persist.ts).

### 5.5 Dependencies

| Dependency | Version | Purpose | Risk if Unavailable |
|------------|---------|---------|---------------------|
| `@types/vscode` | ^1.85.0 | VS Code API types | Fatal — can't compile |
| `esbuild` | ^0.20.0 | Extension bundler | Fatal — can't package |
| `sf_cli` (local) | workspace link | Core modules (gates, telemetry, etc.) | Fatal — no functionality |
| Node.js | >= 20.0.0 | Runtime (sf_cli requirement) | Fatal |

**No new runtime npm dependencies.** The extension uses only VS Code APIs and sf_cli modules. Build tools (esbuild, TypeScript) are dev-only.

### 5.6 Integration Points

| System | Integration Type | Purpose |
|--------|------------------|---------|
| sf_cli core modules | Direct TypeScript import | Gates, telemetry, deps, reports, memory |
| sf_cli pipeline | Terminal execution + file watcher | Forge runs with progress monitoring |
| `.skillfoundry/telemetry.jsonl` | File read + watch | Dashboard data source |
| `.skillfoundry/config.toml` | File read | Configuration detection |
| `.skillfoundry/forge-state.json` | File watch | Forge progress monitoring |
| `memory_bank/knowledge/*.jsonl` | File read | Memory recall |
| VS Code Marketplace | Publish target | Distribution |
| `sf` CLI binary | Terminal command | Commands that need full CLI (forge, setup) |

---

## 6. Contract Specification

### 6.1 Entity Cards

**Entity: SfBridge**
| Attribute | Value |
|-----------|-------|
| **Name** | SfBridge |
| **Purpose** | Single interface between VS Code extension and sf_cli core modules |
| **Owner** | Extension (bridge.ts) |
| **Key Methods** | getMetrics(), getEvents(), runGate(), runAllGates(), scanDependencies(), generateReport() |
| **State** | Stateless — reads from filesystem on each call |
| **Error Handling** | All methods return result objects (never throw). Extension handles display. |

**Entity: DashboardProvider**
| Attribute | Value |
|-----------|-------|
| **Name** | DashboardProvider |
| **Purpose** | TreeDataProvider that renders quality metrics in the sidebar |
| **Owner** | Extension (providers/dashboard.ts) |
| **Data Source** | SfBridge.getMetrics() |
| **Refresh Trigger** | FileSystemWatcher on telemetry.jsonl, manual refresh command |
| **State** | Cached metrics, refreshed on file change |

**Entity: DiagnosticsManager**
| Attribute | Value |
|-----------|-------|
| **Name** | DiagnosticsManager |
| **Purpose** | Maps gate findings to VS Code DiagnosticCollection for inline display |
| **Owner** | Extension (providers/diagnostics.ts) |
| **Data Source** | SfBridge.runGate() results |
| **Mapping** | Gate finding with file:line → Diagnostic with range, severity, source "SkillFoundry" |
| **Lifecycle** | Cleared on re-run, persisted until next gate execution or file close |

### 6.2 Error Codes

| Code | Context | Meaning | User-Facing Message |
|------|---------|---------|---------------------|
| `SF_NOT_INSTALLED` | activation | sf_cli not found in workspace or PATH | "SkillFoundry not detected. Run `npx skillfoundry init` to set up." |
| `SF_NO_CONFIG` | activation | .skillfoundry/config.toml missing | "No SkillFoundry configuration found. Run `sf setup` to configure." |
| `SF_NO_TELEMETRY` | dashboard | telemetry.jsonl doesn't exist | "No telemetry data yet. Run `/forge` to start collecting metrics." |
| `SF_GATE_TIMEOUT` | gate execution | Gate exceeded timeout | "Gate timed out after {N}s. Increase timeout in settings." |
| `SF_GATE_ERROR` | gate execution | Gate threw an error | "Gate failed: {error}. Check the output channel for details." |
| `SF_NODE_VERSION` | activation | Node.js < 20 | "SkillFoundry requires Node.js 20+. Current: {version}." |

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- **Technical:** Must use VS Code Extension API only (no Electron-specific APIs). Must bundle to < 5MB VSIX.
- **Architecture:** UI layer only — no business logic duplication. All quality logic stays in sf_cli modules.
- **Platform:** VS Code desktop only. VS Code Web (vscode.dev) is out of scope due to Node.js filesystem dependency.
- **Build:** Must use esbuild for fast bundling. No webpack. Extension must activate in < 200ms.
- **Distribution:** Must be publishable to VS Code Marketplace under `skillfoundry` publisher.

### 7.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| sf_cli modules can be imported directly by the extension | If sf_cli uses dynamic imports or node-specific APIs that don't bundle, bridge breaks | Phase 1 prototype validates import compatibility first. Fallback: spawn `sf` subprocess |
| FileSystemWatcher is reliable for telemetry.jsonl changes | If VS Code misses file change events (known issue on some Linux filesystems) | Add manual refresh command + polling fallback (every 5s) |
| Developers have sf_cli installed before using the extension | Extension is useless without it | Clear "not installed" messaging with one-click install command |
| VS Code Marketplace accepts the extension | Publisher account and compliance requirements | Create publisher account early, follow marketplace guidelines |
| Direct import is fast enough for inline diagnostics | If gate execution takes > 1s, CodeLens feels sluggish | Cache last gate results per file, re-run only on save |

### 7.3 Out of Scope

- [ ] Full AI chat interface inside VS Code (use Claude Code / Copilot for that)
- [ ] Provider configuration UI (use `sf setup` in terminal)
- [ ] Interactive forge control (pause/resume/skip stories) — terminal only for v1
- [ ] Custom gate authoring UI — edit `hooks.toml` directly
- [ ] VS Code Web (vscode.dev) support — requires Node.js filesystem
- [ ] Multi-root workspace support (v1 uses first workspace folder)
- [ ] Extension settings sync across machines (rely on VS Code Settings Sync)
- [ ] Marketplace ratings/reviews gamification
- [ ] Language-specific CodeLens (e.g., different gates for Python vs TypeScript) — v1 uses file pattern matching only

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R-001 | sf_cli modules don't bundle cleanly with esbuild | M | H | Phase 1 is a build proof-of-concept. If bundling fails, fallback to subprocess bridge with JSON protocol. Test with `esbuild --bundle` early. |
| R-002 | Gate execution blocks VS Code UI thread | H | H | Run all gate executions in a worker thread or as async operations. Show progress indicator. Cancel button with AbortController. |
| R-003 | FileSystemWatcher misses telemetry updates on Linux | M | M | Implement dual strategy: watcher + 5-second polling fallback. Configurable in settings. |
| R-004 | Extension activation slows VS Code startup | M | H | Lazy activation: only activate when `.skillfoundry/config.toml` exists in workspace. Defer tree view population to after activation. |
| R-005 | Webview panels consume excessive memory with large telemetry | L | M | Paginate telemetry display (last 50 events default). Virtualized scrolling in webview. |
| R-006 | Forge progress monitoring has race conditions | M | M | Use `forge-state.json` with monotonic version counter. Poll at 1s interval. Ignore stale states. |
| R-007 | VS Code Marketplace review process delays launch | L | M | Submit early with minimal feature set (sidebar + gates). Add features in point releases. |
| R-008 | sf_cli API changes break the extension | M | H | Bridge layer abstracts all sf_cli calls. Pin sf_cli version in extension dependencies. Run extension tests as part of sf_cli CI. |

---

## 9. Implementation Plan

### 9.1 Phases

| Phase | Name | Scope | Dependencies | Size |
|-------|------|-------|--------------|------|
| 1 | Foundation | Extension scaffold, bridge layer, esbuild proof-of-concept, sidebar dashboard (FR-001), command palette (FR-004), status bar (FR-006) | sf_cli v2.0.51 | L |
| 2 | Gate Integration | Gate timeline (FR-002), inline diagnostics (FR-003), CodeLens (FR-007), gate on file (FR-013), output channel (FR-008) | Phase 1 |  L |
| 3 | Forge & Intelligence | Forge monitor (FR-005), dependency tree (FR-009), report webview (FR-010), memory recall (FR-011), file watcher (FR-012), PRD creation (FR-014) | Phase 2 | L |
| 4 | Polish & Publish | Marketplace assets (icon, screenshots, README), CI for extension, cross-platform testing, publisher account, first release | Phase 3 | M |

### 9.2 Phase Detail

**Phase 1 — Foundation (L):**
- Scaffold `skillfoundry-vscode/` package with esbuild
- Implement `bridge.ts` — validate all sf_cli imports work in extension context
- Sidebar: Quality Dashboard TreeView (gate pass rate, forge status, CVE count, memory count)
- Command Palette: Register all 20 commands with `skillfoundry.` prefix
- Status Bar: Gate pass rate + active agent
- Settings: autoRefresh, gateTimeout, showCodeLens, inlineDiagnostics, metricsWindow
- Tests: 15+ (bridge, dashboard provider, command registration)

**Phase 2 — Gate Integration (L):**
- Gate Timeline TreeView (T0-T6 with icons, duration, expandable detail)
- DiagnosticsManager: Map T1/T4 findings to inline squiggly underlines
- CodeLensProvider: "Run T3" above test files, "Run T4" above security-sensitive files
- "Run Gate on This File" context menu + command
- Output Channel: SkillFoundry log output
- Tests: 20+ (diagnostics mapping, CodeLens targeting, gate execution)

**Phase 3 — Forge & Intelligence (L):**
- Forge Monitor TreeView: phase progress, story count, elapsed time
- FileSystemWatcher on telemetry.jsonl + forge-state.json
- Dependency CVE TreeView: grouped by severity, clickable advisory links
- Quality Report WebviewPanel: rendered markdown with tables and trends
- Memory Recall QuickPick: fuzzy search, weight-sorted, type-filtered
- PRD Creation command: prompt → generate → open in editor
- Tests: 20+ (forge monitor, webview content, memory search, watcher)

**Phase 4 — Polish & Publish (M):**
- Extension icon (SVG, 128x128)
- Marketplace README with screenshots and GIFs
- Cross-platform testing (Linux, macOS, Windows)
- CI: build + test on push
- VSIX packaging and marketplace publish
- Extension update mechanism
- Tests: 5+ (packaging, activation, cross-platform)

### 9.3 Story Decomposition Guidance

**Phase 1 (~5 stories):**
1. Extension scaffold: package.json manifest, esbuild config, tsconfig, activation, deactivation
2. Bridge layer: SfBridge class, import validation, error wrapping, workspace detection
3. Sidebar dashboard: TreeDataProvider, metrics display, refresh command, icons
4. Command palette: Register all commands, input prompts for gate tier selection, terminal spawning for forge
5. Status bar: Pass rate display, click-to-open-dashboard, auto-update from telemetry

**Phase 2 (~5 stories):**
6. Gate timeline: TreeDataProvider, tier icons, duration display, expandable findings
7. Inline diagnostics: DiagnosticCollection, file:line mapping from gate results, severity translation
8. CodeLens: File pattern matching, gate tier selection per file type, click handler
9. Context menu gate: Right-click "Run Gate on This File", combined T1+T4, progress indicator
10. Output channel: Create channel, stream gate/forge output, timestamps, severity coloring

**Phase 3 (~5 stories):**
11. Forge monitor: TreeDataProvider, forge-state.json watcher, phase rendering, story progress
12. File watcher: Telemetry watcher, debounced refresh, polling fallback, setting toggle
13. Dependency tree: CVE grouping, severity badges, advisory link opening, package.json navigation
14. Report webview: HTML template, markdown rendering, table styling, industry baselines section
15. Memory recall + PRD: QuickPick with fuzzy search, weight display, PRD generation with input prompt

**Phase 4 (~3 stories):**
16. Marketplace assets: Icon, screenshots, feature descriptions, categories, keywords
17. CI/CD: GitHub Actions for build + test + package, VSIX artifact, release workflow
18. Cross-platform testing + publish: Test on 3 OS, fix platform issues, marketplace submission

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

- [ ] Extension installs from VSIX: `code --install-extension skillfoundry-0.1.0.vsix`
- [ ] Extension activates when `.skillfoundry/config.toml` exists in workspace
- [ ] All 12 commands accessible via command palette (`Ctrl+Shift+P > SkillFoundry:`)
- [ ] Sidebar shows quality dashboard with real telemetry data
- [ ] Gate timeline displays T0-T6 results with correct pass/fail/warn icons
- [ ] Inline diagnostics appear for T1 (banned patterns) and T4 (security) findings
- [ ] CodeLens "Run T3" appears above `describe()` blocks in test files
- [ ] Forge progress updates in real-time in sidebar during pipeline execution
- [ ] Dependency CVE tree shows findings grouped by severity
- [ ] Quality report renders in a webview with formatted tables
- [ ] Memory recall QuickPick returns results sorted by weight
- [ ] Status bar shows gate pass rate, updates on telemetry change
- [ ] Extension bundle < 5MB, activation < 200ms
- [ ] 60+ tests across providers, commands, bridge, and views
- [ ] Works on Linux, macOS, and Windows
- [ ] No new runtime dependencies (dev-only: esbuild, @types/vscode)
- [ ] TypeScript compiles clean (`tsc --noEmit` = 0 errors)
- [ ] Extension passes `vsce package` without warnings
- [ ] README with screenshots, installation instructions, feature list
- [ ] Published to VS Code Marketplace

### 10.2 Sign-off Required

| Role | Name | Status | Date |
|------|------|--------|------|
| Technical Lead | SBS | Pending | |
| Security Review | SF Security Agent | Pending | |
| UX Review | Manual testing | Pending | |

---

## 11. Appendix

### 11.1 Glossary

| Term | Definition | Code Name |
|------|------------|-----------|
| Bridge | Adapter layer between VS Code extension and sf_cli core modules | SfBridge |
| Gate tier | One of 7 quality validation levels (T0-T6) | GateTier |
| VSIX | VS Code Extension package format (ZIP with manifest) | — |
| TreeDataProvider | VS Code API for sidebar tree views | TreeDataProvider |
| DiagnosticCollection | VS Code API for inline error/warning markers | DiagnosticCollection |
| CodeLens | VS Code API for inline actionable hints above code | CodeLensProvider |
| Webview | VS Code API for rich HTML panels inside the editor | WebviewPanel |
| Telemetry event | A quality measurement recorded in JSONL format | TelemetryEvent |
| Forge state | Pipeline progress snapshot written to JSON during execution | ForgeState |

### 11.2 References

- [VS Code Extension API](https://code.visualstudio.com/api) — Official documentation
- [VS Code Marketplace Publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) — Publishing guide
- [esbuild](https://esbuild.github.io/) — Extension bundler
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples) — Reference implementations
- SkillFoundry sf_cli types: `sf_cli/src/types.ts`
- SkillFoundry telemetry schema: `sf_cli/src/core/telemetry.ts`
- SkillFoundry gate definitions: `sf_cli/src/core/gates.ts`
- Quality Intelligence PRD: `genesis/2026-03-15-quality-intelligence-layer.md`

### 11.3 Competitive Reference

| Extension | What it Does | What SF Can Learn |
|-----------|-------------|-------------------|
| ESLint | Inline diagnostics from linter | Diagnostic mapping pattern (file:line → squiggly) |
| GitLens | Git annotations inline | CodeLens pattern for contextual actions |
| SonarLint | Security findings inline | Severity → DiagnosticSeverity mapping |
| GitHub Copilot | AI sidebar + inline completions | Sidebar panel + status bar integration |
| Snyk | Dependency CVE tree view | TreeView grouping by severity |

### 11.4 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-15 | SBS + PRD Architect | Initial draft |

---
