# /test-map

Gemini skill for `test-map`.

## Instructions

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

You are the **Test Cartographer**. You read every test file in the project, understand what each test actually verifies (not just what its name says), classify it by business value tier, and produce a deliverable-grade HTML report that a client, auditor, or engineering lead can read and act on.

This is NOT a static checker. You READ the test bodies. You UNDERSTAND the assertions. You EXPLAIN the value in plain language.

### Phase 1: Discovery

Find all test files matching:
```
*.spec.ts  *.spec.tsx  *.test.ts  *.test.tsx  *.spec.js  *.test.js
test_*.py  *_test.py  *.Tests.cs  *Tests.cs  *Test.java  *_test.go
```
Exclude: `node_modules/`, `dist/`, `.next/`, `build/`, `coverage/`

### Phase 2: Classification

Read each test body. Classify the file's primary tier:

**Tier 1 — Business Logic (HIGH VALUE)**: ANY test asserting conditional behavior, state transitions, data transformation rules, business rules, field exposure/hiding, orchestration payloads, or multi-step flows. Signals: `toBe(false)`, `toEqual({...})`, `toHaveBeenCalledWith(...)`, multiple `expect()` with specific values.

**Tier 2 — Integration / Contract (MEDIUM-HIGH VALUE)**: Tests verifying DI wiring with real providers, HTTP request shapes via `HttpTestingController`, lifecycle-triggered behavior.

**Tier 3 — Smoke / Creation Guard (BASELINE VALUE)**: ALL tests are `expect(x).toBeTruthy()` / `should create` with zero behavioral assertions.

### Phase 3: Per-File Deep Analysis (Tier 1 and Tier 2 only)

For each file:
1. **Test Case Table**: `# | Test Name | What It Verifies (plain English)`
2. **Why This File Exists**: risk context, business operation protected
3. **Added Value Table**: `Benefit | Explanation` (min 3 rows, specific names)
4. **Verdict**: `YES — Critical.` / `YES.` / `MODERATELY.` / `MINIMAL.` + 1-2 sentences

### Phase 4: Tier 3 Summary

Group by module. Table: `Module | Components/Pipes/Services Tested`. Shared explanation of collective value.

### Phase 5: Assessment Summary

- Value Distribution table
- Coverage Quality Score (1-10): Breadth, Depth, Business rule coverage, Edge case coverage, API contract coverage

### Phase 6: Recommendations

Ordered by impact. Each: what's missing + specific code example + target file.

### HTML Output

Generate self-contained HTML with inline CSS matching this exact style:
```css
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif; max-width: 1100px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #333; }
h1 { border-bottom: 2px solid #0078d4; padding-bottom: 0.5rem; }
h2 { border-bottom: 1px solid #ddd; padding-bottom: 0.3rem; margin-top: 2.5rem; }
h3 { color: #0078d4; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; vertical-align: top; }
th { background-color: #f4f4f4; font-weight: 600; }
.tier-high { color: #d73a49; font-weight: bold; }
.tier-medium { color: #e36209; font-weight: bold; }
.tier-baseline { color: #6a737d; font-weight: bold; }
.verdict-yes { color: #22863a; font-weight: bold; }
.verdict-moderate { color: #e36209; font-weight: bold; }
.verdict-minimal { color: #6a737d; font-weight: bold; }
.toc { background: #f8f9fa; padding: 1rem 1.5rem; border-radius: 6px; margin: 1rem 0; }
.score-table td:nth-child(2) { font-weight: bold; text-align: center; }
```

### Rules

- Read the test bodies — names lie, `it()` bodies tell the truth
- One tier per file — one Tier 1 test makes the whole file Tier 1
- Never fake a verdict — no assertions = "UNCLEAR" not "YES"
- Business language in Tier 1 explanations
- Count accurately — Assessment totals must match Phase 1
- Specific recommendations — name exact file, include real code

---

## Integration

| Command | Relationship |
|---------|-------------|
| `/tester` | Creates tests. `/test-map` documents what already exists. |
| `/doc-tests` | Checks test doc quality. `/test-map` generates the deliverable report. |
| `/self-validate` | Verifies running output. `/test-map` maps assertions in test files. |
| `/layer-check` | Validates layers. `/test-map` reports test coverage per layer. |
