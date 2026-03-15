# PRD: Quality Intelligence & Developer Integration Layer

---
prd_id: quality-intelligence-layer
title: Quality Intelligence & Developer Integration Layer
version: 1.0
status: DRAFT
created: 2026-03-15
author: SBS
last_updated: 2026-03-15

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []
  recommends: [semgrep-security-integration, real-autonomous-agents]
  blocks: []
  shared_with: [passive-memory-engine]

tags: [core, metrics, integration, security, developer-experience]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

SkillFoundry enforces quality gates, security scanning, and spec-driven workflows — but **cannot prove they work**. The framework scores 2/10 on measurability: there is no telemetry, no before/after comparison, no exportable evidence of ROI. Industry data shows developer trust in AI tools has dropped to 29% (Stack Overflow 2025) — adoption without proof is faith-based.

Simultaneously, SkillFoundry only operates within its own pipeline. Developers who don't run `/forge` get zero benefit. There are no git hooks for lightweight quality enforcement, no dependency vulnerability scanning in the security gate, no weight learning in the memory system, and no way to compare SF-governed code against raw AI output with hard numbers.

The framework is a 6.8/10. This PRD closes every gap below 8/10.

### 1.2 Proposed Solution

Build the **Quality Intelligence Layer** — a measurement, integration, and proof system that:

1. **Tracks quality metrics** across every forge run (defect rates, gate pass rates, security findings, rework cycles)
2. **Integrates via git hooks** so developers get quality gates even outside the full pipeline
3. **Scans dependencies** for known vulnerabilities (npm audit, pip-audit) alongside Semgrep SAST in the T4 gate
4. **Benchmarks quality** with a reproducible harness that compares SF-governed vs ungoverned AI output
5. **Learns from usage** by adjusting memory entry weights based on retrieval frequency and validation outcomes
6. **Exports proof** as structured reports (JSON, Markdown) that developers and teams can share

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Measurability score | 2/10 | 9/10 | Can answer "did SF reduce defects?" with data |
| Security gate coverage | Semgrep + 7 regex patterns | Semgrep + regex + dependency scanning | T4 gate catches CVEs in node_modules |
| Developer integration points | Pipeline-only | Pipeline + git hooks + CLI one-shots | `sf hook install` works, pre-commit runs gates |
| Memory intelligence | Static weights (0.5) | Dynamic weights adjusted by usage | Weight changes after retrieval/validation events |
| Benchmark capability | None | Reproducible quality comparison | `sf benchmark` produces comparison report |
| Report generation | Console output only | JSON + Markdown export | `sf report` creates shareable artifacts |

---

## 2. User Stories

### Primary User: Solo Developer Using AI Coding Tools

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | see how many defects SF caught across my last 10 forge runs | I know the tool is worth using | MUST |
| US-002 | developer | install git hooks that run quality gates on every commit | I get SF protection even when I don't use /forge | MUST |
| US-003 | developer | know if my dependencies have known CVEs | I don't ship vulnerable code because of transitive deps | MUST |
| US-004 | developer | run a benchmark comparing SF-governed vs raw AI output | I have hard numbers to justify using SF | MUST |
| US-005 | developer | export a quality report as Markdown | I can share proof of code quality with my team or manager | MUST |
| US-006 | developer | have memory entries automatically prioritized by usefulness | the recall system surfaces what actually matters, not everything equally | SHOULD |
| US-007 | developer | see a quality trend over time (improving/declining) | I know if my code quality is getting better or worse | SHOULD |
| US-008 | developer | run a single gate check from the CLI without the full pipeline | I can spot-check a file or directory quickly | SHOULD |
| US-009 | developer | see which OWASP categories my project is most vulnerable to | I know where to focus security effort | COULD |
| US-010 | developer | compare my project's quality metrics against industry baselines | I understand where I stand relative to the Veracode/CodeRabbit data | COULD |

### Secondary User: Team Lead / Engineering Manager

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-011 | team lead | see aggregate quality metrics across multiple forge runs | I can track team-wide code quality trends | SHOULD |
| US-012 | team lead | get a structured report showing security posture | I have evidence for compliance reviews | SHOULD |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Quality Telemetry Engine | Track and persist metrics from every forge run, gate execution, and security scan | Given a completed forge run, When I run `sf metrics`, Then I see: stories completed, gate pass/fail rates, security findings by severity, test count, and rework cycles for this run and all prior runs |
| FR-002 | Git Hook Integration | Install SF quality gates as git pre-commit and pre-push hooks | Given I run `sf hook install`, When I `git commit`, Then T0 (banned patterns) and T1 (type check) gates run automatically; When I `git push`, Then T2 (tests) and T4 (security) gates run; hooks are standard git hooks (no external deps beyond Node.js) |
| FR-003 | Dependency Vulnerability Scanner | Scan project dependencies for known CVEs using npm audit (Node.js), pip-audit (Python), dotnet list package --vulnerable (.NET) | Given a Node.js project, When T4 gate runs, Then `npm audit --json` is executed and findings with severity HIGH or CRITICAL are added to the SecurityReport; fallback: parse lockfile directly if audit command unavailable |
| FR-004 | Benchmark Harness | Reproducible quality comparison: run N coding tasks with and without SF gates, compare defect rates | Given I run `sf benchmark --tasks 20`, Then the harness: (1) generates 20 coding tasks from templates, (2) runs each through the AI with SF gates enabled, (3) runs each through the AI with gates disabled, (4) compares: security findings, test pass rate, banned pattern count, type errors; outputs a structured comparison report |
| FR-005 | Quality Report Generator | Export forge/gate/security metrics as structured Markdown and JSON | Given accumulated telemetry data, When I run `sf report --format md`, Then a Markdown report is generated with: executive summary, quality trends, security posture, gate pass rates, top recurring issues, and industry baseline comparison |
| FR-006 | Memory Weight Learning | Adjust knowledge entry weights based on retrieval frequency and validation outcomes | Given a memory entry retrieved 5 times in 3 forge sessions, When weight learning runs, Then that entry's weight increases by retrieval_boost (0.05 per retrieval, capped at 1.0); Given an entry whose linked test file now fails, Then weight decreases by validation_penalty (0.1 per failure, floored at 0.1) |
| FR-007 | Single Gate Runner | Run any individual gate (T0-T6) from the CLI against a target directory or file | Given I run `sf gate t4 ./src`, Then only the T4 security gate runs against `./src` and outputs findings without invoking the full pipeline |
| FR-008 | Telemetry Persistence | Store all metrics in a local JSONL file (`.skillfoundry/telemetry.jsonl`) with one entry per event | Given any gate execution, forge run, or security scan, When it completes, Then a telemetry event is appended with: timestamp, event_type, duration_ms, findings_count, pass/fail status, story_id (if applicable), and session_id |
| FR-009 | Industry Baseline Comparison | Compare project metrics against published industry baselines (Veracode 45% vuln rate, CodeRabbit 1.7x issue ratio, GitClear 5.7% churn) | Given telemetry data from 5+ forge runs, When I run `sf report --baseline`, Then the report includes a comparison table showing project metrics vs industry averages with delta and percentile |
| FR-010 | Hook Configuration | Allow developers to configure which gates run at which git event (pre-commit, pre-push) via `.skillfoundry/hooks.toml` | Given a hooks.toml with `pre-commit = ["t0", "t1"]` and `pre-push = ["t2", "t4"]`, When I run `sf hook install`, Then git hooks are created matching that configuration; default config is provided on first install |
| FR-011 | Dependency Scanner Platform Detection | Auto-detect project type (Node.js, Python, .NET, Rust, Go) and run the appropriate audit command | Given a project with both `package.json` and `requirements.txt`, When T4 runs, Then both `npm audit` and `pip-audit` execute and findings are merged into a single SecurityReport |
| FR-012 | Telemetry Aggregation | Compute rolling aggregates (last 5 runs, last 10, all-time) for key metrics | Given 10+ forge runs with telemetry, When I run `sf metrics --window 10`, Then I see: avg gate pass rate, avg security findings per run, total defects caught, avg rework cycles, and trend direction (improving/declining/stable) |

### 3.2 CLI Commands

**Command: `sf metrics`**
- Purpose: Display quality metrics dashboard in terminal
- Options: `--window N` (last N runs, default 10), `--json` (machine-readable output)
- Output: Table with gate pass rates, security findings, test counts, rework cycles, trend arrows

**Command: `sf hook install`**
- Purpose: Install git hooks that run SF quality gates
- Options: `--config <path>` (custom hooks.toml), `--force` (overwrite existing hooks)
- Output: Confirmation of hooks installed, which gates at which events
- Safety: Backs up existing hooks to `.git/hooks/*.bak` before overwriting

**Command: `sf hook uninstall`**
- Purpose: Remove SF git hooks, restore backups
- Output: Confirmation of hooks removed

**Command: `sf gate <tier> [target]`**
- Purpose: Run a single quality gate against a target
- Options: `t0`-`t6` tier selection, optional target path (defaults to `.`)
- Output: Gate result (pass/warn/fail) with findings

**Command: `sf report`**
- Purpose: Generate quality report from telemetry data
- Options: `--format md|json` (default md), `--output <path>`, `--baseline` (include industry comparison), `--window N`
- Output: Structured report file

**Command: `sf benchmark`**
- Purpose: Run quality comparison benchmark
- Options: `--tasks N` (number of tasks, default 10), `--output <path>`
- Output: Comparison report with governed vs ungoverned metrics

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| Git hook execution (pre-commit: T0+T1) | < 5 seconds for projects under 10K LOC |
| Git hook execution (pre-push: T2+T4) | < 30 seconds for projects under 10K LOC |
| Telemetry write | < 10ms per event (append-only JSONL) |
| Metrics aggregation | < 500ms for 100 forge runs |
| Report generation | < 2 seconds |
| Dependency scan | < 15 seconds (delegated to npm audit / pip-audit) |
| Single gate run | < 10 seconds for T0-T1, < 30 seconds for T2-T6 |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Telemetry data | Local-only, never sent to external services. Contains no source code, only aggregate counts. |
| Git hooks | Run in the same security context as the developer. No elevated privileges. |
| Dependency scanner | Reads lockfiles and runs audit commands locally. No network calls beyond what npm/pip audit already makes. |
| Benchmark harness | Uses the developer's own API keys. No hardcoded credentials. |
| Report output | Contains metric summaries, not source code. Safe to share externally. |

### 4.3 Reliability

| Metric | Target |
|--------|--------|
| Telemetry write failure | Non-blocking — log warning, never break the pipeline |
| Git hook failure | Exit with non-zero code to block commit/push, but `--no-verify` always available as escape hatch |
| Dependency scanner unavailable | Graceful degradation — log warning, continue with Semgrep + regex only |
| Corrupted telemetry file | Auto-recover by skipping malformed lines, log count of skipped entries |
| Missing telemetry data | All commands handle zero-data state gracefully with "no data yet" message |

### 4.4 Observability

| Aspect | Requirement |
|--------|-------------|
| Telemetry schema | Versioned (v1), forward-compatible, documented in README |
| Event types | Enumerated: `forge_run`, `gate_execution`, `security_scan`, `dependency_scan`, `hook_execution`, `benchmark_run` |
| Debug mode | `sf metrics --debug` shows raw telemetry entries |

---

## 5. Technical Specifications

### 5.1 Architecture

```
sf_cli/src/
├── core/
│   ├── telemetry.ts          # Telemetry engine (write, read, aggregate)
│   ├── dependency-scanner.ts  # npm audit / pip-audit / dotnet audit
│   ├── weight-learner.ts      # Memory weight adjustment
│   ├── benchmark-harness.ts   # Quality comparison runner
│   └── report-generator.ts    # Markdown/JSON report builder
├── commands/
│   ├── metrics.ts             # sf metrics CLI command
│   ├── hook.ts                # sf hook install/uninstall CLI command
│   ├── gate.ts                # sf gate <tier> CLI command
│   ├── report.ts              # sf report CLI command
│   └── benchmark.ts           # sf benchmark CLI command
└── __tests__/
    ├── telemetry.test.ts
    ├── dependency-scanner.test.ts
    ├── weight-learner.test.ts
    ├── benchmark-harness.test.ts
    ├── report-generator.test.ts
    └── hook.test.ts
```

### 5.2 Data Model

**Telemetry Event (`.skillfoundry/telemetry.jsonl`)**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | string | UUID, required | Unique event identifier |
| schema_version | number | required, currently 1 | Forward compatibility |
| event_type | string | enum: forge_run, gate_execution, security_scan, dependency_scan, hook_execution, benchmark_run | What happened |
| timestamp | string | ISO-8601, required | When it happened |
| session_id | string | UUID, required | Groups events from one forge run |
| duration_ms | number | >= 0, required | How long it took |
| status | string | enum: pass, warn, fail, error | Outcome |
| details | object | required | Event-specific payload (see subtypes below) |

**Telemetry Event Details by Type:**

`forge_run` details:
| Field | Type | Description |
|-------|------|-------------|
| prd_count | number | PRDs processed |
| stories_total | number | Total stories |
| stories_completed | number | Stories that passed all gates |
| stories_failed | number | Stories that failed |
| gate_passes | number | Total gate passes across all stories |
| gate_failures | number | Total gate failures |
| security_findings | object | `{ critical: N, high: N, medium: N, low: N }` |
| dependency_findings | object | `{ critical: N, high: N, moderate: N, low: N }` |
| tests_created | number | New test files created |
| tests_total | number | Total tests passing at end |
| rework_cycles | number | Fixer remediation attempts |
| circuit_breaker_activated | boolean | Whether pipeline halted early |
| tokens_used | number | Total LLM tokens consumed |
| cost_usd | number | Estimated cost |

`gate_execution` details:
| Field | Type | Description |
|-------|------|-------------|
| tier | string | T0-T6 |
| gate_name | string | Human-readable gate name |
| story_id | string | Which story triggered this gate |
| findings_count | number | Issues found |
| findings | array | Top 5 findings (truncated for space) |

`security_scan` details:
| Field | Type | Description |
|-------|------|-------------|
| scanner | string | semgrep, regex, or both |
| semgrep_version | string | Semgrep CLI version if available |
| owasp_categories_checked | number | Out of 10 |
| findings_by_severity | object | `{ critical: N, high: N, medium: N, low: N, info: N }` |
| findings_by_owasp | object | `{ A01: N, A02: N, ... A10: N }` |
| top_findings | array | Top 5 most severe findings (file, line, rule, severity) |

`dependency_scan` details:
| Field | Type | Description |
|-------|------|-------------|
| package_manager | string | npm, pip, dotnet, cargo, go |
| total_dependencies | number | Total deps scanned |
| vulnerable_count | number | Deps with known CVEs |
| findings | array | `[{ name, version, severity, cve, advisory_url }]` |

`hook_execution` details:
| Field | Type | Description |
|-------|------|-------------|
| hook_type | string | pre-commit, pre-push |
| gates_run | array | Which gates executed |
| files_checked | number | Files in the commit/push |
| blocked | boolean | Whether the commit/push was blocked |

`benchmark_run` details:
| Field | Type | Description |
|-------|------|-------------|
| tasks_count | number | Number of benchmark tasks |
| governed_results | object | `{ security_findings, type_errors, banned_patterns, test_pass_rate }` |
| ungoverned_results | object | Same structure as governed |
| improvement_pct | object | `{ security: N%, type_safety: N%, patterns: N% }` |

**Hook Configuration (`.skillfoundry/hooks.toml`)**

```toml
[hooks]
enabled = true

[hooks.pre-commit]
gates = ["t0", "t1"]          # Banned patterns + type check
fail_action = "block"          # block | warn
timeout_seconds = 10

[hooks.pre-push]
gates = ["t2", "t4"]          # Tests + security
fail_action = "block"
timeout_seconds = 60

[hooks.options]
backup_existing = true         # Back up existing hooks
color_output = true
verbose = false
```

**Industry Baselines (hardcoded reference data)**

```typescript
const INDUSTRY_BASELINES = {
  security_vuln_rate: { value: 0.45, source: "Veracode 2025", metric: "% of code with OWASP vulns" },
  issue_ratio_vs_human: { value: 1.7, source: "CodeRabbit 2025", metric: "issues per PR vs human baseline" },
  code_churn_rate: { value: 0.057, source: "GitClear 2025", metric: "% of new code revised within 2 weeks" },
  duplication_rate: { value: 0.123, source: "GitClear 2025", metric: "% of changed lines that are duplicated" },
  xss_failure_rate: { value: 0.86, source: "Veracode 2025", metric: "% failing XSS defense" },
  security_debt_pct: { value: 0.82, source: "Veracode 2026", metric: "% of companies with security debt" },
  dev_trust_in_ai: { value: 0.29, source: "Stack Overflow 2025", metric: "% who trust AI code accuracy" },
  ai_pr_security_rate: { value: 2.74, source: "CodeRabbit 2025", metric: "XSS vuln ratio vs human PRs" },
};
```

### 5.3 Dependencies

| Dependency | Version | Purpose | Risk if Unavailable |
|------------|---------|---------|---------------------|
| Node.js | >= 20.0.0 | Runtime (already required) | Fatal — framework can't run |
| npm | any | `npm audit --json` for dependency scanning | Graceful degradation — skip dep scan |
| pip-audit | any | Python dependency scanning | Graceful degradation — skip if not installed |
| Semgrep | any | SAST scanning (already integrated) | Falls back to regex (existing behavior) |
| git | >= 2.x | Git hook installation | Cannot install hooks — warn user |

No new npm dependencies required. All features use Node.js built-ins (fs, child_process, crypto, path) and existing project dependencies.

### 5.4 Integration Points

| System | Integration Type | Purpose | Owner |
|--------|------------------|---------|-------|
| Pipeline (pipeline.ts) | Event hooks | Emit telemetry events after each phase | SF core |
| Gates (gates.ts) | Function call | T4 gate calls dependency scanner | SF core |
| Memory (memory-buffer.ts) | Event hooks | Weight learner subscribes to retrieval/validation events | SF core |
| Git | File write (.git/hooks/) | Hook installation | Developer's repo |
| AI Runner (ai-runner.ts) | Wrapper | Benchmark harness invokes runner with/without gates | SF core |
| Existing telemetry consumers | JSONL file | External tools can read telemetry.jsonl | Any |

---

## 6. Contract Specification

### 6.1 Entity Cards

**Entity: TelemetryEvent**
| Attribute | Value |
|-----------|-------|
| **Name** | TelemetryEvent |
| **Purpose** | Records a single quality measurement from a pipeline run, gate check, or hook execution |
| **Owner** | SF core (telemetry.ts) |
| **Key Fields** | id, event_type, timestamp, session_id, status, duration_ms |
| **Derived Fields** | None — aggregates computed at query time |
| **Sensitive Fields** | None — telemetry contains counts and metadata, never source code |
| **Retention** | Indefinite (append-only JSONL, ~200 bytes per event, ~1MB per 5000 runs) |
| **Audit** | Self-auditing — telemetry IS the audit trail |
| **Data Ownership** | system (project-local file) |
| **Access Scope** | global (all events visible to anyone with file access) |

**Entity: HookConfig**
| Attribute | Value |
|-----------|-------|
| **Name** | HookConfig |
| **Purpose** | Defines which quality gates run at which git events |
| **Owner** | Developer (hooks.toml) |
| **Key Fields** | hooks.pre-commit.gates, hooks.pre-push.gates, hooks.options |
| **Derived Fields** | None |
| **Sensitive Fields** | None |
| **Retention** | Persistent (config file, versioned in git) |
| **Audit** | Git history |
| **Data Ownership** | system |
| **Access Scope** | global |

**Entity: QualityReport**
| Attribute | Value |
|-----------|-------|
| **Name** | QualityReport |
| **Purpose** | Structured summary of quality metrics over a time window |
| **Owner** | SF core (report-generator.ts) |
| **Key Fields** | generated_at, window, summary, gate_metrics, security_metrics, dependency_metrics, trends, baseline_comparison |
| **Derived Fields** | All fields derived from TelemetryEvent aggregation |
| **Sensitive Fields** | None — aggregate counts only |
| **Retention** | Developer's choice (output file) |
| **Audit** | N/A — generated artifact |
| **Data Ownership** | system |
| **Access Scope** | global |

### 6.2 Telemetry Event Lifecycle

```
[Pipeline/Gate/Hook starts]
    → event created with status: "running"
    → (no intermediate persistence — only final state written)
[Pipeline/Gate/Hook completes]
    → status set to pass/warn/fail/error
    → details populated
    → event appended to telemetry.jsonl
```

No state transitions — telemetry events are immutable once written.

### 6.3 CLI Output Contracts

**`sf metrics` output (default):**
```
Quality Metrics (last 10 runs)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Forge Runs:          10 total, 9 successful, 1 partial
  Gate Pass Rate:      94.2% (↑ from 87.1% over prior 10)
  Security Findings:   3 critical, 7 high, 12 medium (all resolved)
  Dependency CVEs:     2 high, 5 moderate (1 unresolved)
  Tests Created:       142 new tests across 10 runs
  Rework Cycles:       8 fixer attempts (6 successful)
  Avg Run Duration:    4m 32s
  Total Cost:          $2.47 (avg $0.25/run)

  Trend: IMPROVING (gate pass rate up 7.1%, security findings down 23%)

  vs Industry Baselines:
    Security vuln rate:  4.2% (yours) vs 45% (Veracode avg)  → 91% better
    Defect ratio:        0.6x human baseline vs 1.7x (CodeRabbit avg) → 65% better
    Code churn:          2.1% vs 5.7% (GitClear avg) → 63% better
```

**`sf report --format md` output structure:**
```markdown
# Quality Report — [Project Name]
Generated: [timestamp]
Window: Last [N] forge runs ([date range])

## Executive Summary
- [1-3 sentence verdict]

## Quality Trends
| Metric | Previous Window | Current Window | Change |
|--------|----------------|----------------|--------|

## Security Posture
### SAST Findings (Semgrep)
### Dependency Vulnerabilities
### OWASP Coverage

## Gate Performance
| Gate | Pass Rate | Avg Duration | Top Failure Reason |
|------|-----------|--------------|-------------------|

## Industry Comparison
| Metric | Project | Industry Avg | Source | Delta |
|--------|---------|-------------|--------|-------|

## Recommendations
1. [Prioritized action items based on data]
```

**`sf benchmark` output structure:**
```
Benchmark Results — [N] tasks
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                        With SF Gates    Without Gates    Delta
  Security findings:    2                14               -86%
  Type errors:          0                7                -100%
  Banned patterns:      0                11               -100%
  Test pass rate:       96%              78%              +18%
  Avg gate time:        12.3s            0s               +12.3s

  Verdict: SF gates caught 32 issues that would have shipped undetected.
  Trade-off: 12.3s additional overhead per task.
```

### 6.4 Error Codes

| Code | Context | Meaning | When Used |
|------|---------|---------|-----------|
| `TELEMETRY_WRITE_FAILED` | telemetry.ts | Could not append to telemetry.jsonl | Disk full, permission denied |
| `TELEMETRY_CORRUPT_ENTRY` | telemetry.ts | Malformed JSON line in telemetry file | File corruption, manual edit |
| `HOOK_INSTALL_FAILED` | hook.ts | Could not write to .git/hooks/ | Not a git repo, permission denied |
| `HOOK_EXISTING_CONFLICT` | hook.ts | Existing hook found and --force not specified | User has custom hooks |
| `DEPENDENCY_SCANNER_UNAVAILABLE` | dependency-scanner.ts | npm/pip/dotnet audit command not found | Tool not installed |
| `DEPENDENCY_SCAN_FAILED` | dependency-scanner.ts | Audit command exited with error | Network failure, malformed lockfile |
| `BENCHMARK_NO_PROVIDER` | benchmark-harness.ts | No LLM provider configured | Missing API key |
| `REPORT_NO_DATA` | report-generator.ts | No telemetry events found | First run, file deleted |
| `GATE_INVALID_TIER` | gate.ts | Unknown gate tier specified | Typo in command |
| `WEIGHT_LEARN_FAILED` | weight-learner.ts | Could not update memory entry weight | Malformed JSONL, file locked |

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- **Technical:** Must work with Node.js >= 20.0.0 only. No new npm dependencies. All features must be pure TypeScript using Node.js built-ins.
- **Storage:** Telemetry is local-only (`.skillfoundry/telemetry.jsonl`). No cloud, no network calls for metrics.
- **Git hooks:** Must be standard git hooks (shell scripts that invoke `node`). No husky, lint-staged, or other hook managers as dependencies.
- **Backward compatibility:** Existing pipeline behavior unchanged. Telemetry is additive — pipeline works identically if telemetry fails.

### 7.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| Developers have npm/node in PATH | Git hooks won't run | Hook script checks for node, exits gracefully with instructions |
| npm audit --json is stable across npm versions | Parser breaks on different output format | Version-detect npm and use appropriate parser |
| Telemetry file stays under 10MB for typical usage | Slow reads, disk pressure | Add rotation: archive when >5MB, keep last 2 archives |
| Developers want pre-commit gates to be fast (<5s) | Developers disable hooks if slow | Only T0+T1 on pre-commit (fastest gates), heavy gates on pre-push |
| Industry baselines from 2025-2026 studies remain valid | Comparison becomes misleading | Version the baselines, update annually, show source+date |

### 7.3 Out of Scope

- [ ] VS Code extension (separate PRD — massive effort, different tech stack)
- [ ] Cloud/SaaS telemetry dashboard (local-only for now)
- [ ] Team/org aggregate metrics (single developer scope)
- [ ] CI/CD pipeline integration (GitHub Actions, etc. — separate PRD)
- [ ] Real-time IDE feedback (LSP integration — separate PRD)
- [ ] Custom benchmark task authoring (use built-in templates only)
- [ ] Telemetry export to external systems (Grafana, DataDog, etc.)
- [ ] Automated dependency patching (only detection, not remediation)

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | Git hooks slow down developer workflow | M | H | Only fast gates (T0+T1) on pre-commit; heavy gates on pre-push; configurable via hooks.toml; `git commit --no-verify` always available |
| R-002 | Telemetry file grows unbounded | L | M | Auto-rotation at 5MB; keep last 2 archives; ~200 bytes per event means ~25K events before rotation |
| R-003 | npm audit output format changes between versions | M | M | Version-detect npm, maintain parsers for npm 8/9/10/11; test with multiple versions |
| R-004 | Benchmark results vary due to LLM non-determinism | H | M | Run each task 3x, report median; use temperature=0 where supported; document variance |
| R-005 | Developers don't run enough forge sessions for meaningful metrics | M | H | Show meaningful output even with 1 run; compare single-run data against baselines; "run 5+ for trend analysis" hint |
| R-006 | Industry baselines become outdated | L | L | Include source and date with every baseline; version the baseline data; log when baselines are >12 months old |
| R-007 | Weight learning creates feedback loops (popular entries get more popular) | M | M | Cap weight at 1.0, floor at 0.1; decay factor (0.01/week for unretrieved entries); validation overrides popularity |
| R-008 | Existing git hooks conflict with SF hooks | M | H | Always back up existing hooks; SF hooks chain to originals; `sf hook uninstall` restores backups cleanly |

---

## 9. Implementation Plan

### 9.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | Measurement Foundation | Telemetry engine (FR-001, FR-008), metrics CLI (FR-012), single gate runner (FR-007) | None |
| 2 | Integration & Scanning | Git hooks (FR-002, FR-010), dependency scanner (FR-003, FR-011) | Phase 1 (telemetry must exist to record hook/scan events) |
| 3 | Intelligence & Proof | Report generator (FR-005, FR-009), benchmark harness (FR-004), weight learning (FR-006) | Phase 1 (needs telemetry data), Phase 2 (dep scanner feeds into reports) |

### 9.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 | M | Low | Low |
| 2 | L | Medium | Medium (git hook compatibility across platforms) |
| 3 | L | High | Medium (benchmark determinism, weight learning edge cases) |

### 9.3 Story Decomposition Guidance

**Phase 1 Stories (~4 stories):**
1. Telemetry engine: TelemetryEvent type, write/read/aggregate functions, JSONL persistence, rotation
2. Pipeline integration: emit telemetry events from pipeline.ts, gates.ts after each phase
3. Metrics CLI command: `sf metrics` with window, JSON output, trend calculation
4. Single gate runner: `sf gate <tier> [target]` command wiring

**Phase 2 Stories (~4 stories):**
5. Dependency scanner: npm audit parser, pip-audit parser, platform detection, SecurityReport integration
6. T4 gate integration: wire dependency scanner into existing T4 gate, merge findings
7. Git hook installer: `sf hook install/uninstall`, hooks.toml config, backup/restore, hook scripts
8. Hook execution: pre-commit/pre-push shell scripts that invoke sf gate, telemetry recording

**Phase 3 Stories (~4 stories):**
9. Report generator: Markdown and JSON templates, telemetry aggregation, export
10. Industry baseline comparison: hardcoded reference data, percentile calculation, delta display
11. Benchmark harness: task templates, governed/ungoverned execution, comparison metrics
12. Memory weight learning: retrieval tracking, validation checking, weight adjustment, decay

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

- [ ] All 12 functional requirements implemented with real logic
- [ ] All MUST-priority user stories pass acceptance criteria
- [ ] Unit test coverage >= 80% for all new modules (telemetry, dependency-scanner, weight-learner, benchmark-harness, report-generator, hook)
- [ ] Integration test: full forge run produces telemetry events that `sf metrics` displays correctly
- [ ] Integration test: `sf hook install` creates working git hooks that block commits with banned patterns
- [ ] Integration test: `sf gate t4 .` runs security + dependency scan and produces combined report
- [ ] Integration test: `sf report --format md` generates valid Markdown with all sections
- [ ] No new npm dependencies added
- [ ] TypeScript compiles clean (`tsc --noEmit` = 0 errors)
- [ ] All existing 735 tests still pass (no regressions)
- [ ] Documentation: README updated with new commands, hooks.toml reference
- [ ] CHANGELOG updated with version bump

### 10.2 Score Targets

After implementation, the framework re-assessment should show:

| Dimension | Before | Target | How This PRD Gets There |
|-----------|--------|--------|------------------------|
| Measurability | 2/10 | **9/10** | Telemetry engine + metrics CLI + reports + industry baselines |
| Developer Experience | 5/10 | **7/10** | Git hooks + single gate runner + one-shot commands |
| Security Scanning | 8/10 | **9/10** | Dependency vulnerability scanning closes the last major gap |
| Memory System | 7/10 | **8/10** | Weight learning makes recall intelligent, not just available |
| Distribution | 7/10 | **8/10** | Git hooks = new low-friction entry point (no full pipeline needed) |
| Enterprise Readiness | 3/10 | **5/10** | Exportable reports provide compliance evidence |

**Target composite: 8.1/10** (up from 6.8/10)

### 10.3 Sign-off Required

| Role | Name | Status | Date |
|------|------|--------|------|
| Technical Lead | SBS | Pending | |
| Security Review | SF Security Agent | Pending | |

---

## 11. Appendix

### 11.1 Glossary

| Term | Definition | Code Name |
|------|------------|-----------|
| Telemetry event | A single quality measurement recorded during pipeline/gate/hook execution | TelemetryEvent |
| Gate tier | One of the 7 quality gate levels (T0-T6) | GateTier |
| Hook config | TOML file defining which gates run at which git events | HookConfig |
| Industry baseline | Published quality metric from a named study (e.g., Veracode 45% vuln rate) | IndustryBaseline |
| Quality report | Structured summary of metrics over a time window | QualityReport |
| Weight learning | Automatic adjustment of memory entry weights based on usage patterns | WeightLearner |
| Dependency finding | A known CVE in a project dependency detected by audit command | DependencyFinding |
| Benchmark task | A standardized coding challenge used to compare governed vs ungoverned output | BenchmarkTask |

### 11.2 References

- Veracode 2025 GenAI Code Security Report — 45% OWASP vulnerability rate
- CodeRabbit 2025 State of AI vs Human Code — 1.7x issue ratio, 2.74x security vuln rate
- GitClear 2025 AI Copilot Code Quality — 8x duplication increase, 5.7% churn rate
- Stack Overflow 2025 Developer Survey — 29% trust in AI accuracy
- METR 2025 Developer Productivity Study — 19% slowdown for experienced developers
- Snyk 2025 AI Code Security Report — 80% bypass security policies
- DORA 2024/2025 Reports — 7.2% stability reduction with AI adoption
- Harmonic Security 2025 — 579K sensitive prompts, 30% source code
- Gartner 2026 — Projected 2,500% defect increase from prompt-to-app by 2028
- Apiiro 2025 — 10,000+ new AI security findings per month
- Veracode 2026 — 82% of companies have security debt

### 11.3 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-15 | SBS | Initial draft |

---
