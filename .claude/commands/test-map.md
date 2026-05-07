# /test-map — Test Cases Documentation Generator

> Read every test file in the project, classify each test by value tier, and produce a structured HTML deliverable documenting what is tested, why, and how good the coverage actually is.

---

## Usage

```
/test-map                    Generate full report for current project
/test-map [path]             Generate report for a specific directory
/test-map --format=html      Output as HTML file (default)
/test-map --format=md        Output as Markdown
/test-map --open             Generate HTML and open in browser (if tool available)
```

Output saved to: `docs/test-map-[YYYY-MM-DD].html` (or `.md`)

---

## Instructions

You are the **Test Cartographer**. You read every test file in the project, understand what each test actually verifies (not just what its name says), classify it by business value tier, and produce a deliverable-grade HTML report that a client, auditor, or engineering lead can read and act on.

This is NOT a static checker. You READ the test bodies. You UNDERSTAND the assertions. You EXPLAIN the value in plain language.

---

### Phase 1: Discovery

Find all test files matching these patterns:
```
*.spec.ts       *.spec.tsx      *.test.ts       *.test.tsx
*.spec.js       *.test.js
test_*.py       *_test.py
*.Tests.cs      *Tests.cs
*Test.java      *Spec.java
*_test.go
```

Exclude: `node_modules/`, `dist/`, `.next/`, `build/`, `coverage/`, `__pycache__/`

For each file, record:
- File path (relative to project root)
- Number of test cases (`it(...)`, `test(...)`, `it.each(...)`, `@Test`, `def test_`)
- Framework detection (Jest, Vitest, pytest, NUnit, JUnit, Go test)

---

### Phase 2: Classification

Read each test file body. Classify the **file's primary tier** based on what the tests actually do:

#### Tier 1 — Business Logic (HIGH VALUE)

A file is Tier 1 if ANY test in it:
- Asserts conditional rendering or visibility based on input combinations
- Verifies state transitions (step 1 → step 2, open → closed, disabled → enabled)
- Tests data transformation rules (format strings, concatenation, filtering logic)
- Validates business rules (permission checks, validation logic, calculation correctness)
- Verifies that specific fields are/aren't exposed (information hiding)
- Tests orchestration: component A calls service B with exact payload shape
- Tests multi-step flows (open popup → reset form → call API with formatted payload)

Signals: `toBe(false)`, `toEqual({...})`, `toHaveBeenCalledWith(...)`, multiple `expect()` calls with specific values, `toContain(specificValue)`, conditional test data setups.

#### Tier 2 — Integration / Contract (MEDIUM-HIGH VALUE)

A file is Tier 2 if tests:
- Verify DI wiring with real providers (not just `toBeTruthy()`)
- Assert HTTP request shapes using `HttpTestingController`
- Verify event flows between services
- Test lifecycle hooks (`ngOnInit`, `ngOnChanges`, `useEffect`)
- Assert service method delegation with specific parameters

Signals: `HttpTestingController`, `spyOn(...).and.returnValue(...)` with assertions on call args, `TestBed.inject(...)`, lifecycle-triggered behavior.

#### Tier 3 — Smoke / Creation Guard (BASELINE VALUE)

A file is Tier 3 if ALL tests are:
- `expect(component).toBeTruthy()` / `expect(service).toBeTruthy()`
- `expect(pipe).toBeTruthy()`
- `should create` with no further assertions
- Zero behavioral assertions (no `toBe(value)`, no `toHaveBeenCalledWith(...)`)

---

### Phase 3: Per-File Deep Analysis (Tier 1 and Tier 2 only)

For each Tier 1 and Tier 2 file, produce:

#### a) Test Case Table
For each `it(...)` / `test(...)` block:
- Test number
- Test name (exact)
- Plain-English explanation of WHAT it verifies (1 sentence, business-readable)

#### b) Why This File Exists
Explain the risk context: what was refactored, what business operation this protects, what would break without these tests.

#### c) Added Value Table
| Benefit | Explanation |

At least 3 rows. Be specific — reference actual method names, business rules, or field names from the test file.

#### d) "Is It Useful?" Verdict
One of: `YES — Critical.` / `YES.` / `YES — Very.` / `MODERATELY.` / `MINIMAL on their own.`
Followed by 1-2 sentences explaining the verdict.

---

### Phase 4: Tier 3 Summary (grouped, not per-file)

For Tier 3 files, group by module (inferred from path). Produce:
- A table: Module | Components/Pipes/Services Tested
- Shared explanation of why smoke tests exist and their collective value

---

### Phase 5: Assessment Summary

#### Value Distribution Table
| Tier | Test Count | File Count | Assessment |

#### Coverage Quality Score (1-10 per dimension)
| Dimension | Score | Notes |
- **Breadth** — percentage of source files with any test
- **Depth** — ratio of Tier 1/2 tests to Tier 3 tests
- **Business rule coverage** — Tier 1 files vs total feature files
- **Edge case coverage** — presence of boundary/error/empty state tests
- **API contract coverage** — Tier 2 files with HttpTestingController vs total API service files

---

### Phase 6: Recommendations

#### Immediate High-Impact Additions
Ordered by impact. For each:
- What is missing
- Specific example code snippet showing the recommended test
- Which file/service to target first

#### Tests That Can Be Removed
Honest assessment. If none, say so.

#### Tests That Should Be Enhanced
Table: Current Test File | Enhancement | Priority

---

### HTML Output Specification

Generate a self-contained HTML file with inline CSS. Use this exact structure and style:

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

<div class="toc">
<h2 style="margin-top:0">Table of Contents</h2>
<ol>
  <li><a href="#test-categories-overview">Test Categories Overview</a></li>
  <li><a href="#tier-1">Tier 1 — Business Logic Tests (HIGH VALUE)</a></li>
  <li><a href="#tier-2">Tier 2 — Integration Tests (MEDIUM-HIGH VALUE)</a></li>
  <li><a href="#tier-3">Tier 3 — Smoke Tests / Creation Guards (BASELINE VALUE)</a></li>
  <li><a href="#assessment-summary">Assessment Summary</a></li>
  <li><a href="#recommendations">Recommendations</a></li>
</ol>
</div>

<hr>
<!-- ... sections ... -->
<p><em>End of Test Cases Documentation</em></p>
</body>
</html>
```

Apply CSS classes exactly as specified:
- `class="tier-high"` → HIGH VALUE labels
- `class="tier-medium"` → MEDIUM-HIGH VALUE labels
- `class="tier-baseline"` → BASELINE VALUE labels
- `class="verdict-yes"` → YES verdicts
- `class="verdict-moderate"` → MODERATELY verdicts
- `class="verdict-minimal"` → MINIMAL verdicts

---

### Rules

- **Read the test bodies.** File names and `describe()` labels lie. The `it()` bodies tell the truth.
- **One tier per file.** If a file has one Tier 1 test and 10 smoke tests, it is Tier 1. The high-value test is the reason the file exists.
- **Never fake a verdict.** If you can't determine what a test protects from reading the assertions, say "UNCLEAR — test body lacks assertions" not "YES."
- **Business language.** The Tier 1 explanations are written for an engineering lead, not a developer. No `toBe()` jargon in the "Why" sections.
- **Count accurately.** The test count in the Assessment Summary must match the actual count from Phase 1.
- **Specific recommendations.** Each recommendation names the exact file and includes a real code example, not a generic template.

---

## Integration

| Command | Relationship |
|---------|-------------|
| `/tester` | Creates tests. `/test-map` documents what tests already exist. |
| `/doc-tests` | Checks test documentation quality. `/test-map` generates the deliverable report. |
| `/self-validate` | Verifies running output. `/test-map` maps what assertions exist in test files. |
| `/layer-check` | Validates all three layers. `/test-map` reports test coverage of each layer. |

---

*Run after every major feature delivery or before any client review, audit, or code handoff.*
