---
name: certify
description: >-
  RegForge Certification Pipeline — 11-category project audit with grade (A-F)
---

# /certify - RegForge Certification Pipeline

> Run a full 11-category audit on the current project and produce a certification grade (A-F).

---

## Usage

```
/certify                          Full certification (all 11 categories)
/certify --category security      Single category only
/certify --html report.html       Also generate HTML report
```

---

## Instructions

You are the **RegForge Certification Engine** — a static analysis auditor that evaluates projects across 11 categories and produces a pass/fail grade. When `/certify` is invoked, execute the full audit pipeline below.

### PHASE 1: PROJECT SCAN

Identify the project type by checking for:
- `package.json` → Node.js/TypeScript
- `requirements.txt` / `pyproject.toml` → Python
- `*.csproj` / `*.sln` → .NET
- `go.mod` → Go
- `Cargo.toml` → Rust

List all files in the project root and key directories (src/, lib/, app/, tests/).

### PHASE 2: RUN ALL 11 AUDIT CATEGORIES

For each category, scan the project and score 0-100. Deduct points per finding:
- **Critical**: -20 points
- **High**: -15 points
- **Medium**: -10 points
- **Low**: -5 points
- **Info**: -2 points

#### Category 1: SECURITY (Weight: 15%)
Scan all source files for:
- Hardcoded secrets (API_KEY, SECRET, TOKEN, PASSWORD with values)
- `eval()` usage
- `innerHTML` assignment (XSS risk)
- `dangerouslySetInnerHTML`
- SQL string concatenation
- `exec()` with string arguments
- Missing `.gitignore`
- Secrets in `.env` files tracked by git

#### Category 2: DOCUMENTATION (Weight: 10%)
Check for:
- `README.md` exists and has >50 chars
- `CHANGELOG.md` exists
- `LICENSE` file exists
- `docs/` directory exists
- JSDoc/docstring coverage on public functions

#### Category 3: TESTING (Weight: 15%)
Check for:
- Test files exist (*.test.*, *.spec.*, *_test.*)
- Test-to-source file ratio (aim for 1:3 minimum)
- Test framework config (jest.config, vitest.config, pytest.ini, etc.)
- Coverage report files

#### Category 4: DEPENDENCIES (Weight: 10%)
Check for:
- Dependency manifest exists (package.json, requirements.txt)
- Lockfile exists (package-lock.json, yarn.lock, etc.)
- No wildcard `"*"` versions
- devDependencies separate from dependencies

#### Category 5: LICENSE (Weight: 10%)
Check for:
- LICENSE file exists
- SPDX-compatible identifier detected (MIT, Apache-2.0, GPL, BSD, ISC, etc.)
- License matches package.json declaration

#### Category 6: ACCESSIBILITY (Weight: 10%)
Scan HTML/JSX/TSX/Vue files for:
- `<img>` without `alt` attribute
- `<input>` without `<label>` or `aria-label`
- `<html>` without `lang` attribute
- Missing focus management for interactive elements
- Skip if no HTML/UI files found (score 100)

#### Category 7: PRIVACY (Weight: 10%)
Check for:
- Privacy policy file/page exists
- No PII (email, password, phone) in console.log/logging statements
- `.env.example` exists when `.env` exists
- No personal data in committed config files
- GDPR keywords present if EU-targeted (data retention, consent, erasure)

#### Category 8: ARCHITECTURE (Weight: 8%)
Check for:
- Source code organized in `src/`, `lib/`, or `app/` directory
- No files over 500 lines / 50KB
- Linter/formatter config exists (.eslintrc, .prettierrc, biome.json, .editorconfig)
- Consistent file naming conventions

#### Category 9: SEO (Weight: 4%)
Scan HTML files for:
- `<meta name="description">` tag
- `<meta name="viewport">` tag
- `robots.txt` exists
- `sitemap.xml` exists
- Skip if no HTML files (score 100)

#### Category 10: PERFORMANCE (Weight: 4%)
Check for:
- Large image files (>500KB)
- Synchronous file I/O in non-CLI source files
- Bundle config exists (webpack, vite, esbuild)
- Lazy loading patterns

#### Category 11: CI/CD (Weight: 4%)
Check for:
- CI config exists (.github/workflows/, .gitlab-ci.yml, Jenkinsfile, etc.)
- `.gitignore` exists and is populated
- Dockerfile or docker-compose exists
- `.env.example` for environment documentation

### PHASE 3: COMPUTE GRADE

Calculate weighted overall score:
```
overall = Σ(category_score × category_weight) / Σ(category_weights)
```

Grade mapping:
- **A**: 90-100 (Certified — production ready)
- **B**: 75-89 (Certified with recommendations)
- **C**: 60-74 (Conditional — must fix high/critical findings)
- **D**: 40-59 (Not certified — significant gaps)
- **F**: 0-39 (Failed — fundamental issues)

### PHASE 4: GENERATE REPORT

Output the report in this exact format:

```
RegForge Certification Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Project:  [project name]
  Grade:    [A-F] ([score]/100)
  Findings: [total] ([critical] critical, [high] high, [medium] medium, [low] low)

  Category Scores:
  ────────────────────────────────────────────────────────
    [✓/✗] security           [score]/100  [bar]  [findings] findings
    [✓/✗] documentation      [score]/100  [bar]  [findings] findings
    [✓/✗] testing            [score]/100  [bar]  [findings] findings
    ... (all 11 categories)

  Critical & High Findings:
  ────────────────────────────────────────────────────────
    [CRIT] [title]
           [file:line]
           Fix: [recommendation]
    [HIGH] [title]
           [file:line]
           Fix: [recommendation]
    ...

  Remediation Roadmap:
  ────────────────────────────────────────────────────────
    1. [highest priority fix]
    2. [next priority fix]
    ...
```

### Hard Rules

- ALWAYS scan the actual project files — NEVER assume or guess
- NEVER skip a category — if not applicable, score 100 with an info note
- REJECT vague findings — every finding must cite a specific file and recommendation
- DO read file contents when checking for patterns (don't just check existence)
- CHECK that findings are real — exclude test files, node_modules, dist/, build/
- ENSURE the grade is computed mathematically, not estimated
- IMPLEMENT the full pipeline even if the project looks "obviously good"
