# Stack Profile Protocol

> **CORE FRAMEWORK MODULE**
> One-time detection that discovers the project's runtime, test framework, build tool, and E2E setup.
> Saves results to `.claude/shared/stack-profile.json` so all agents read the same commands instead of guessing.
> Referenced by: `testloop`, `feature-lifecycle`, `_test-execution.md`, `onboard`, `sre`

---

## Purpose

Eliminate hardcoded `npm test`, `npx playwright`, `dotnet build` assumptions baked into protocol files. A Go team or a .NET team hits wrong commands on day one. Stack profile runs once and writes authoritative commands for the rest of the session (and future sessions until the project changes).

---

## Detection Algorithm

Run in order. Later checks refine earlier ones.

### Step 1: Runtime Detection

```bash
# Node.js
[ -f package.json ] && echo "RUNTIME=node"

# Python
[ -f pyproject.toml ] || [ -f requirements.txt ] || [ -f setup.py ] && echo "RUNTIME=python"

# .NET
ls *.csproj *.sln 2>/dev/null | head -1 | grep -q "." && echo "RUNTIME=dotnet"

# Go
[ -f go.mod ] && echo "RUNTIME=go"

# Rust
[ -f Cargo.toml ] && echo "RUNTIME=rust"

# Ruby
[ -f Gemfile ] && echo "RUNTIME=ruby"

# PHP
[ -f composer.json ] && echo "RUNTIME=php"
```

### Step 2: Test Framework Detection

#### Node.js
```bash
node -e "
const p = require('./package.json');
const deps = {...(p.dependencies||{}), ...(p.devDependencies||{})};
if (deps['vitest']) console.log('TEST_FRAMEWORK=vitest');
else if (deps['jest'] || deps['@jest/core']) console.log('TEST_FRAMEWORK=jest');
else if (deps['mocha']) console.log('TEST_FRAMEWORK=mocha');
else if (p.scripts?.test) console.log('TEST_FRAMEWORK=script:' + p.scripts.test);
else console.log('TEST_FRAMEWORK=unknown');
"
```

#### Python
```bash
# Check in order of preference
grep -q "pytest" pyproject.toml requirements.txt requirements-dev.txt 2>/dev/null && echo "TEST_FRAMEWORK=pytest"
grep -q "unittest" pyproject.toml 2>/dev/null && echo "TEST_FRAMEWORK=unittest"
```

#### .NET
```bash
grep -rq "xunit\|XUnit" *.csproj **/*.csproj 2>/dev/null && echo "TEST_FRAMEWORK=xunit"
grep -rq "NUnit" *.csproj **/*.csproj 2>/dev/null && echo "TEST_FRAMEWORK=nunit"
grep -rq "MSTest" *.csproj **/*.csproj 2>/dev/null && echo "TEST_FRAMEWORK=mstest"
```

#### Go / Rust
```bash
# Go uses built-in testing
[ -f go.mod ] && echo "TEST_FRAMEWORK=go-test"
# Rust uses built-in + optional cargo-nextest
[ -f Cargo.toml ] && (cargo nextest --version >/dev/null 2>&1 && echo "TEST_FRAMEWORK=cargo-nextest" || echo "TEST_FRAMEWORK=cargo-test")
```

### Step 3: Build Command Detection

```bash
node -e "
const p = require('./package.json');
const build = p.scripts?.build || p.scripts?.compile || null;
console.log('BUILD_CMD=' + (build ? 'npm run build' : 'none'));
" 2>/dev/null

# Python
[ -f pyproject.toml ] && grep -q "build" pyproject.toml && echo "BUILD_CMD=python -m build"

# .NET
ls *.sln 2>/dev/null | head -1 | xargs -I{} echo "BUILD_CMD=dotnet build {}"
ls *.csproj 2>/dev/null | head -1 | xargs -I{} echo "BUILD_CMD=dotnet build {}"

# Go
[ -f go.mod ] && echo "BUILD_CMD=go build ./..."

# Rust
[ -f Cargo.toml ] && echo "BUILD_CMD=cargo build"
```

### Step 4: E2E / Browser Test Detection

```bash
# Playwright
[ -f playwright.config.ts ] && echo "E2E_FRAMEWORK=playwright" && echo "E2E_CMD=npx playwright test"
[ -f playwright.config.js ] && echo "E2E_FRAMEWORK=playwright" && echo "E2E_CMD=npx playwright test"

# Cypress
[ -f cypress.config.ts ] || [ -f cypress.config.js ] && echo "E2E_FRAMEWORK=cypress" && echo "E2E_CMD=npx cypress run"

# Puppeteer (no config file, check deps)
node -e "const p=require('./package.json'); const d={...p.dependencies,...p.devDependencies}; if(d['puppeteer']) console.log('E2E_FRAMEWORK=puppeteer');" 2>/dev/null

# Python / pytest-playwright
grep -q "pytest-playwright" requirements*.txt pyproject.toml 2>/dev/null && echo "E2E_FRAMEWORK=pytest-playwright" && echo "E2E_CMD=pytest --browser chromium"

# .NET / Playwright
grep -rq "Microsoft.Playwright" *.csproj **/*.csproj 2>/dev/null && echo "E2E_FRAMEWORK=playwright-dotnet" && echo "E2E_CMD=dotnet test"
```

### Step 5: Type Checker Detection

```bash
# TypeScript
[ -f tsconfig.json ] && echo "TYPE_CHECK_CMD=npx tsc --noEmit"

# Python mypy
grep -q "mypy" requirements*.txt pyproject.toml 2>/dev/null && echo "TYPE_CHECK_CMD=mypy ."

# .NET (built into build)
ls *.csproj 2>/dev/null | grep -q "." && echo "TYPE_CHECK_CMD=dotnet build --no-restore"
```

### Step 6: Package Manager Detection (Node.js only)

```bash
[ -f pnpm-lock.yaml ] && echo "PKG_MGR=pnpm"
[ -f yarn.lock ] && echo "PKG_MGR=yarn"
[ -f bun.lockb ] && echo "PKG_MGR=bun"
[ -f package-lock.json ] && echo "PKG_MGR=npm"
```

---

## Output: stack-profile.json

Write detected values to `.claude/shared/stack-profile.json`:

```json
{
  "detected_at": "ISO8601",
  "runtime": "node | python | dotnet | go | rust | ruby | php | unknown",
  "pkg_manager": "npm | yarn | pnpm | bun | pip | dotnet | cargo | null",
  "test_framework": "jest | vitest | mocha | pytest | xunit | nunit | go-test | cargo-test | unknown",
  "test_command": "npm test",
  "test_flags": {
    "ci": "--ci",
    "coverage": "--coverage",
    "json_output": "--json --outputFile=.claude/local/testloop-results.json",
    "watch": "--watch"
  },
  "build_command": "npm run build",
  "type_check_command": "npx tsc --noEmit",
  "e2e_framework": "playwright | cypress | puppeteer | pytest-playwright | none",
  "e2e_command": "npx playwright test",
  "e2e_config": "playwright.config.ts",
  "install_command": "npm ci",
  "lint_command": "npm run lint",
  "stack_confidence": "high | medium | low"
}
```

`stack_confidence` is:
- `high` — multiple corroborating signals (config file + package.json + test files)
- `medium` — single signal (package.json only, or config file only)
- `low` — detected by elimination; verify before relying
- `unknown` — no signals detected; cannot determine stack

---

## Confidence Gate (CRITICAL)

**LOW or UNKNOWN confidence is a hard stop before any test execution.**

If the profile has `stack_confidence: "low"` or `stack_confidence: "unknown"`, agents must display:

```
⚠️  STACK CONFIDENCE: LOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Detected runtime: [runtime or "unknown"]
Detected test command: [command or "not detected"]
Confidence reason: [single signal / no signals]

Running with a low-confidence stack profile risks:
  - Wrong test command (false pass / false fail)
  - Wrong build command (build never runs)
  - Wrong E2E command (E2E silently skipped)

OPTIONS:
  1. Confirm the detected commands are correct:
     /feature --exec-mode real   (proceeds with current profile)

  2. Override test command directly:
     /feature --test-cmd "pytest tests/"

  3. Re-run stack detection with verbose output:
     /onboard --detect-stack --verbose

  4. Edit the profile manually:
     .claude/shared/stack-profile.json
     .claude/shared/stack-profile.override.json (override file)

⛔  BLOCKED: Cannot proceed with low-confidence stack.
    Use one of the options above to confirm or correct detection.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

`UNKNOWN` confidence is always a hard stop. `LOW` confidence is a hard stop unless the user has previously confirmed the detected commands via `--exec-mode real` — that confirmation is recorded in the profile as `"user_confirmed": true`.

---

## Agent Usage

All execution agents read stack-profile.json rather than hardcoding commands:

```bash
# Read test command
TEST_CMD=$(cat .claude/shared/stack-profile.json 2>/dev/null | grep -o '"test_command":"[^"]*"' | cut -d'"' -f4)
TEST_CMD=${TEST_CMD:-"npm test"}   # fallback if profile missing

# Read E2E command
E2E_CMD=$(cat .claude/shared/stack-profile.json 2>/dev/null | grep -o '"e2e_command":"[^"]*"' | cut -d'"' -f4)
```

---

## Refresh

Stack profile is invalidated (and should be re-run) when:
- `package.json`, `go.mod`, `*.csproj`, `Cargo.toml`, `pyproject.toml` changes
- A new config file appears (`playwright.config.ts`, `jest.config.js`, etc.)
- User runs `/onboard` again
- User runs `/feature --detect-stack`

---

## Manual Override

User can override any detected value:

```bash
# Override test command
echo '{"test_command": "pnpm run test:unit"}' > .claude/stack-profile.override.json
```

Agents merge override values on top of detected values. Override keys win.

---

*Stack Profile Protocol v1.0.0 — SkillFoundry Framework*
*Eliminates hardcoded runtime assumptions across all execution agents*
