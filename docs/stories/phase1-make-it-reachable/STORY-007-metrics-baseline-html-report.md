# STORY-007: sf metrics baseline + HTML Report

**Phase:** C — Telemetry MVP
**PRD:** phase1-make-it-reachable
**Priority:** MUST
**Effort:** L
**Dependencies:** None (existing telemetry engine at `sf_cli/src/core/telemetry.ts` provides the foundation)
**Affects:** FR-011, FR-012, US-005, US-006

---

## Description

Implement `sf metrics baseline` to capture a snapshot of raw code quality before SkillFoundry is actively used, and `sf report --html` to generate a self-contained HTML dashboard from telemetry data. Both commands build on the existing telemetry JSONL infrastructure.

---

## Scope

### Files to create:
- `sf_cli/src/commands/baseline.ts` — baseline command implementation
- `sf_cli/src/commands/report-html.ts` — HTML report generator
- `sf_cli/src/templates/report.html` — HTML report template (embedded, self-contained)
- `sf_cli/src/core/baseline-collector.ts` — baseline metrics collection logic
- `sf_cli/__tests__/baseline.test.ts` — unit tests for baseline
- `sf_cli/__tests__/report-html.test.ts` — unit tests for HTML report

### Files to modify:
- `sf_cli/src/core/telemetry.ts` — add `baseline` to `TelemetryEventType` union
- `sf_cli/src/cli.ts` (or equivalent command router) — register `baseline` and `report --html` commands
- `bin/skillfoundry.js` — if command routing happens here

---

## Technical Approach

### `sf metrics baseline` command

The baseline command scans the project and records current quality metrics as a telemetry event.

**Collection logic (`baseline-collector.ts`):**

```typescript
interface BaselineMetrics {
  test_count: number;       // Count of test files (test_*.*, *.spec.*, *.test.*)
  lint_error_count: number; // Run project linter, count errors (0 if no linter configured)
  type_error_count: number; // Run tsc --noEmit, count errors (0 if not TypeScript)
  loc: number;              // Lines of code (exclude node_modules, .git, dist, build)
  file_count: number;       // Source files
  language: string;         // Detected primary language (by file extension frequency)
}
```

**Collection strategy:**
1. **Test count**: Glob for `**/*.{test,spec}.{ts,tsx,js,jsx}` and `**/test_*.py` and `**/*_test.go` and `**/*.Tests.cs`. Count matching files.
2. **Lint errors**: Check for common linters in order: `eslint` (check `node_modules/.bin/eslint`), `pylint`, `golangci-lint`. Run with `--format json` or equivalent, parse error count. If no linter found, record 0 with a note.
3. **Type errors**: Check for `tsconfig.json`. If found, run `npx tsc --noEmit 2>&1 | grep -c "error TS"`. If not TypeScript, record 0.
4. **LOC**: Use a fast file walker. Count non-empty lines in source files. Exclude `node_modules`, `.git`, `dist`, `build`, `coverage`, `__pycache__`.
5. **File count**: Count source files during the LOC walk.
6. **Language detection**: Count file extensions, pick the most common.

**Output:**
- Appends a `baseline` event to `.skillfoundry/telemetry.jsonl`
- Prints a summary table to stdout

```
SkillFoundry Baseline Snapshot
==============================
Language:      TypeScript
Source files:  142
Lines of code: 12,847
Test files:    38
Lint errors:   7
Type errors:   0
Saved to:      .skillfoundry/telemetry.jsonl
```

### `sf report --html` command

Generates a self-contained HTML file from telemetry data.

**Report sections:**
1. **Summary cards**: Total forge runs, overall pass rate, average duration, baseline comparison
2. **Trend chart**: Pass/fail/warn over time (line chart using Chart.js CDN)
3. **Gate breakdown**: Table showing pass/fail counts per gate type (lint, type, test, security, deps)
4. **Baseline comparison**: If a baseline event exists, show delta (e.g., "Tests: 38 -> 52 (+37%)")
5. **Recent events**: Table of last 20 telemetry events with status, duration, timestamp

**HTML template approach:**
- Self-contained single file: CSS inline, Chart.js loaded from CDN with integrity hash
- All telemetry data embedded as a `<script>` JSON block
- Charts rendered client-side via Chart.js
- Responsive layout, dark mode by default
- Footer shows generation timestamp and data date range

**Output:**
- Writes `.skillfoundry/report.html`
- Opens in default browser using `open` (macOS) or `xdg-open` (Linux) or `start` (Windows)
- Prints the file path to stdout

### Key decisions:

1. **Chart.js via CDN with SRI hash**: Avoids bundling a charting library. The HTML file works offline if CDN is cached, degrades gracefully (shows data tables) if CDN is unavailable.
2. **Self-contained HTML**: No external CSS/JS files to manage. The report is a single file that can be shared, attached to PRs, or archived.
3. **Baseline is append-only**: Multiple baselines can be captured over time. The report compares the most recent baseline to current metrics.
4. **No server required**: The report is a static file opened in a browser. No `localhost` server.
5. **Graceful degradation**: If no telemetry data exists, the report shows an empty state with instructions to run a forge pipeline.

---

## Acceptance Criteria

```gherkin
Scenario: Baseline captures metrics for a TypeScript project
  Given a TypeScript project with 50+ source files and tests
  When "sf metrics baseline" is run
  Then the command prints a summary table with file count, LOC, test count, lint errors, and type errors
  And a baseline event is appended to .skillfoundry/telemetry.jsonl
  And the event has event_type "baseline" and schema_version 1

Scenario: Baseline works for a non-TypeScript project
  Given a Python project with no tsconfig.json
  When "sf metrics baseline" is run
  Then type_error_count is 0
  And language is "python"
  And the command completes without errors

Scenario: Baseline completes in under 5 seconds
  Given a project with 50,000 lines of code
  When "sf metrics baseline" is run
  Then the command completes in under 5 seconds

Scenario: HTML report generates successfully
  Given .skillfoundry/telemetry.jsonl contains 10+ events
  When "sf report --html" is run
  Then .skillfoundry/report.html is created
  And the file opens in the default browser
  And the report shows summary cards, trend chart, gate breakdown, and recent events

Scenario: HTML report includes baseline comparison
  Given a baseline event and 5 forge_run events exist in telemetry
  When "sf report --html" is run
  Then the report includes a "Baseline Comparison" section
  And it shows deltas (e.g., test count change, lint error change)

Scenario: HTML report with no telemetry data
  Given .skillfoundry/telemetry.jsonl does not exist
  When "sf report --html" is run
  Then the report shows an empty state message: "No telemetry data found. Run a forge pipeline to generate data."
  And the command exits with code 0 (not an error)

Scenario: HTML report renders in all major browsers
  Given a generated report.html
  When opened in Chrome, Firefox, Safari, and Edge
  Then charts render correctly
  And layout is responsive
  And dark mode is applied

Scenario: HTML report data is sanitized
  Given telemetry data contains a details field with HTML characters (< > &)
  When the report is generated
  Then all data values are HTML-escaped in the output
  And no XSS is possible
```

---

## Security Checklist

- [ ] All telemetry data values are HTML-escaped before embedding in the report
- [ ] Chart.js CDN reference uses Subresource Integrity (SRI) hash
- [ ] Baseline collection does not execute project code (only counts files and runs existing linters)
- [ ] Report file is written with mode 0644 (not world-writable)
- [ ] No telemetry data leaves the machine (all local)

---

## Testing

### Unit tests (`baseline.test.ts`):
- Mock filesystem with test files, verify correct counts
- Verify baseline event structure matches TelemetryEvent schema
- Test language detection with mixed file types
- Test with no test files (count = 0)
- Test with no tsconfig.json (type errors = 0)
- Test with no linter (lint errors = 0)

### Unit tests (`report-html.test.ts`):
- Generate report from sample telemetry data, verify HTML structure
- Verify HTML escaping of special characters in data
- Verify empty state when no telemetry exists
- Verify baseline comparison section appears only when baseline exists
- Verify Chart.js CDN has SRI hash
- Verify report contains generation timestamp
