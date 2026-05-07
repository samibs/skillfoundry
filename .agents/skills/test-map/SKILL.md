---
name: test-map
description: >-
  /test-map — Test Cases Documentation Generator
---

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

Find all test files matching:
```
*.spec.ts  *.spec.tsx  *.test.ts  *.test.tsx  *.spec.js  *.test.js
test_*.py  *_test.py  *.Tests.cs  *Tests.cs  *Test.java  *_test.go
```
Exclude: `node_modules/`, `dist/`, `.next/`, `build/`, `coverage/`

For each file: relative path, test count, framework detected.

---

### Phase 2: Classification

Read each test body. Classify the file's primary tier:

**Tier 1 — Business Logic (HIGH VALUE)**: ANY test asserting:
- Conditional rendering or visibility based on input combinations
- State transitions (step 1 → step 2, open → closed)
- Data transformation rules (format strings, filtering logic)
- Business rules (permission checks, calculation correctness)
- Field exposure/hiding (information disclosure prevention)
- Orchestration: exact payload shapes sent to services
- Multi-step flows (open popup → reset form → API call)

Signals: `toBe(false)`, `toEqual({...})`, `toHaveBeenCalledWith(...)`, multiple `expect()` with specific values.

**Tier 2 — Integration / Contract (MEDIUM-HIGH VALUE)**: Tests verifying DI wiring with real providers, HTTP request shapes via `HttpTestingController`, lifecycle-triggered behavior, event flows between services.

**Tier 3 — Smoke / Creation Guard (BASELINE VALUE)**: ALL tests are `expect(x).toBeTruthy()` / `should create` with zero behavioral assertions.

One Tier 1 test in a file makes the whole file Tier 1.

---

### Phase 3: Per-File Deep Analysis (Tier 1 and Tier 2 only)

For each file:

1. **Test Case Table**: `# | Test Name | What It Verifies (plain English, one sentence)`

2. **Why This File Exists**: Risk context — what was refactored, what business operation this protects, what would break without these tests.

3. **Added Value Table**: `Benefit | Explanation` (minimum 3 rows; reference actual method names, business rules, field names from the test file)

4. **"Is It Useful?" Verdict**: One of: `YES — Critical.` / `YES — Very.` / `YES.` / `MODERATELY.` / `MINIMAL on their own.`
   Followed by 1-2 sentences of justification.

---

### Phase 4: Tier 3 Summary (grouped by module)

Group Tier 3 files by module (inferred from file path). Produce:
- Table: `Module | Components/Pipes/Services Tested`
- Shared explanation of why smoke tests exist and their collective value

---

### Phase 5: Assessment Summary

**Value Distribution Table**:
| Tier | Test Count | File Count | Assessment |

**Coverage Quality Score (1-10 per dimension)**:
| Dimension | Score | Notes |
- Breadth (source files with any test)
- Depth (Tier 1/2 ratio vs Tier 3)
- Business rule coverage (Tier 1 files vs total feature component files)
- Edge case coverage (boundary/error/empty state tests present)
- API contract coverage (Tier 2 files with HttpTestingController vs total API service files)

---

### Phase 6: Recommendations

**Immediate High-Impact Additions** — ordered by impact:
- What is missing
- Specific example code snippet showing the recommended test
- Exact target file

**Tests That Can Be Removed**: Honest assessment. If none, say so explicitly.

**Tests That Should Be Enhanced**: `Current Test File | Enhancement | Priority`

---

### HTML Output Specification

Generate a self-contained HTML file with inline CSS:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>[ProjectName] — Test Cases Documentation</title>
<style>
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
pre code { background: none; color: inherit; padding: 0; }
.tier-high { color: #d73a49; font-weight: bold; }
.tier-medium { color: #e36209; font-weight: bold; }
.tier-baseline { color: #6a737d; font-weight: bold; }
.verdict-yes { color: #22863a; font-weight: bold; }
.verdict-moderate { color: #e36209; font-weight: bold; }
.verdict-minimal { color: #6a737d; font-weight: bold; }
ul { padding-left: 1.5rem; }
li { margin-bottom: 0.3rem; }
hr { border: none; border-top: 1px solid #eee; margin: 2rem 0; }
.toc { background: #f8f9fa; padding: 1rem 1.5rem; border-radius: 6px; margin: 1rem 0; }
.toc ol { margin: 0; }
.score-table td:nth-child(2) { font-weight: bold; text-align: center; }
</style>
</head>
<body>
<h1>[ProjectName] — Test Cases Documentation</h1>
<p><strong>Generated:</strong> [DATE]<br>
<strong>Total Spec Files:</strong> [N]<br>
<strong>Framework:</strong> [detected framework(s)]</p>
<hr>
<!-- TOC, Tier sections, Assessment, Recommendations -->
<p><em>End of Test Cases Documentation</em></p>
</body>
</html>
```

---

### Rules

- **Read the test bodies.** Names lie. `it()` bodies tell the truth.
- **One tier per file.** One Tier 1 test makes the whole file Tier 1.
- **Never fake a verdict.** No assertions = "UNCLEAR" not "YES."
- **Business language.** Tier 1 explanations are for engineering leads, not developers.
- **Count accurately.** Assessment totals must match Phase 1.
- **Specific recommendations.** Name the exact file, include real code example, not a generic template.

---

## Integration

| Command | Relationship |
|---------|-------------|
| `/tester` | Creates tests. `/test-map` documents what already exists. |
| `/doc-tests` | Checks test doc quality. `/test-map` generates the deliverable report. |
| `/self-validate` | Verifies running output. `/test-map` maps assertions in test files. |
| `/layer-check` | Validates layers. `/test-map` reports test coverage per layer. |

---

*Run after every major feature delivery or before any client review, audit, or code handoff.*
