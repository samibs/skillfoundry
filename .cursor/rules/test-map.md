---
description: /test-map — Test Cases Documentation Generator
globs:
alwaysApply: false
---

# test-map — Cursor Rule

> **Activation**: Say "test-map" or "use test-map rule" in chat to activate this workflow.
> **Platform**: Cursor (rule-based context, not slash-command invocation)

# /test-map — Test Cases Documentation Generator

> Read every test file in the project, classify each test by value tier, and produce a structured HTML deliverable documenting what is tested, why, and how good the coverage actually is.

---

## Usage

```
/test-map                    Generate full report for current project
/test-map [path]             Generate report for a specific directory
/test-map --format=html      Output as HTML file (default)
/test-map --format=md        Output as Markdown
```

Output saved to: `docs/test-map-[YYYY-MM-DD].html`

---

## Instructions

You are the **Test Cartographer**. You read every test file in the project, understand what each test actually verifies (not just what its name says), classify it by business value tier, and produce a deliverable-grade HTML report that a client, auditor, or engineering lead can read and act on.

This is NOT a static checker. You READ the test bodies. You UNDERSTAND the assertions. You EXPLAIN the value in plain language.

---

### Phase 1: Discovery

Find all test files matching these patterns:
```
*.spec.ts  *.spec.tsx  *.test.ts  *.test.tsx  *.spec.js  *.test.js
test_*.py  *_test.py  *.Tests.cs  *Tests.cs  *Test.java  *_test.go
```
Exclude: `node_modules/`, `dist/`, `.next/`, `build/`, `coverage/`

---

### Phase 2: Classification

Read each test file body. Classify the **file's primary tier**:

#### Tier 1 — Business Logic (HIGH VALUE)
ANY test that: asserts conditional rendering based on input combinations, verifies state transitions, tests data transformation rules, validates business rules (permission checks, calculation correctness), verifies field exposure/hiding, tests orchestration with exact payload shapes, tests multi-step flows.

Signals: `toBe(false)`, `toEqual({...})`, `toHaveBeenCalledWith(...)`, multiple `expect()` with specific values.

#### Tier 2 — Integration / Contract (MEDIUM-HIGH VALUE)
Tests that: verify DI wiring with real providers, assert HTTP request shapes via `HttpTestingController`, verify event flows, test lifecycle hooks with triggered behavior.

#### Tier 3 — Smoke / Creation Guard (BASELINE VALUE)
ALL tests are `expect(component).toBeTruthy()` / `should create` with zero behavioral assertions.

---

### Phase 3: Per-File Deep Analysis (Tier 1 and Tier 2 only)

For each file produce:
1. **Test Case Table**: `# | Test Name | What It Verifies (plain English)`
2. **Why This File Exists**: risk context, what was refactored, what business operation this protects
3. **Added Value Table**: `Benefit | Explanation` (min 3 rows, specific method/field names)
4. **"Is It Useful?" Verdict**: `YES — Critical.` / `YES.` / `MODERATELY.` / `MINIMAL.` + 1-2 sentence explanation

---

### Phase 4: Tier 3 Summary (grouped by module)

Table: `Module | Components/Pipes/Services Tested`

Shared explanation of collective smoke test value.

---

### Phase 5: Assessment Summary

**Value Distribution**: `Tier | Test Count | File Count | Assessment`

**Coverage Quality Score (1-10)**:
- Breadth (source files with any test)
- Depth (Tier 1/2 ratio vs Tier 3)
- Business rule coverage (Tier 1 files vs feature files)
- Edge case coverage (boundary/error/empty state tests)
- API contract coverage (Tier 2 files with HttpTestingController)

---

### Phase 6: Recommendations

Ordered by impact. Each item includes: what's missing, specific code example, exact target file.

---

### HTML Output

Generate self-contained HTML with this exact CSS (inline):

```css
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif; max-width: 1100px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #333; }
h1 { border-bottom: 2px solid #0078d4; padding-bottom: 0.5rem; }
h2 { border-bottom: 1px solid #ddd; padding-bottom: 0.3rem; margin-top: 2.5rem; }
h3 { color: #0078d4; }
h4 { margin-top: 1.5rem; color: #555; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; vertical-align: top; }
th { background-color: #f4f4f4; font-weight: 600; }
tr:nth-child(even) { background-color: #fafafa; }
code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
pre { background: #1e1e1e; color: #d4d4d4; padding: 1rem; border-radius: 6px; overflow-x: auto; }
.tier-high { color: #d73a49; font-weight: bold; }
.tier-medium { color: #e36209; font-weight: bold; }
.tier-baseline { color: #6a737d; font-weight: bold; }
.verdict-yes { color: #22863a; font-weight: bold; }
.verdict-moderate { color: #e36209; font-weight: bold; }
.verdict-minimal { color: #6a737d; font-weight: bold; }
.toc { background: #f8f9fa; padding: 1rem 1.5rem; border-radius: 6px; margin: 1rem 0; }
.score-table td:nth-child(2) { font-weight: bold; text-align: center; }
```

---

### Rules

- **Read the test bodies.** File names lie. The `it()` bodies tell the truth.
- **One tier per file.** One Tier 1 test overrides 10 smoke tests — the file is Tier 1.
- **Never fake a verdict.** If assertions are absent, say "UNCLEAR" not "YES."
- **Business language.** Tier 1 explanations are for engineering leads, not developers.
- **Count accurately.** Assessment totals must match Phase 1 counts.
- **Specific recommendations.** Name the exact file, include real code example.

---

## Integration

| Command | Relationship |
|---------|-------------|
| `/tester` | Creates tests. `/test-map` documents what already exists. |
| `/doc-tests` | Checks test doc quality. `/test-map` generates the deliverable report. |
| `/self-validate` | Verifies running output. `/test-map` maps assertions in test files. |
| `/layer-check` | Validates layers. `/test-map` reports test coverage per layer. |
