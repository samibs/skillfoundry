# Environment Pre-Flight Protocol

> **Mandatory before any code execution in a new project or session.**

This protocol prevents the most common LLM agent failure modes: wrong interpreter, missing permissions, uninstalled dependencies, PATH issues, and blind retry loops.

---

## When to Run

- **Always** at the start of `/forge`, `/go`, `/goma`, `/gosm`
- **Always** when switching to a new project directory
- **Always** after a context compaction (memory of environment facts may be lost)
- **Never skip** — even if the project looks familiar

## Phase 1: Environment Audit

Run `scripts/env-preflight.sh <workdir>` and parse the JSON output.

If the script is not available, run these commands manually:

```bash
# System
uname -s && uname -r
whoami
pwd

# Python
which python python3 2>/dev/null
python3 --version 2>/dev/null

# Venv detection
ls -la venv/bin/python* .venv/bin/python* backend/venv/bin/python* 2>/dev/null

# Node.js
which node npm 2>/dev/null
node --version 2>/dev/null

# TypeScript
ls -la node_modules/.bin/tsc 2>/dev/null
npx tsc --version 2>/dev/null

# Type definitions
ls node_modules/@types/node 2>/dev/null

# Package state
ls package.json package-lock.json requirements.txt 2>/dev/null
ls node_modules/.package-lock.json 2>/dev/null

# Git
git branch --show-current
git diff --stat
```

## Phase 2: Pin Environment Facts

After Phase 1, lock these facts for the entire session:

| Fact | Example | Pin Rule |
|------|---------|----------|
| Python binary | `/home/user/project/backend/venv/bin/python3` | Use this exact path. Never use bare `python`. |
| Node binary | `/usr/bin/node` | Use `node` or `npx` consistently. |
| tsc executable | `node_modules/.bin/tsc` is `+x` | If not executable, run via `npx tsc`. |
| @types/node | Installed / Missing | If missing, install before any tsc invocation. |
| Package state | `node_modules` exists | If missing, run `npm install` before any command. |
| Alembic path | `venv/bin/alembic` | Use exact path, not bare `alembic`. |

**Once pinned, NEVER retry with a different variant.** If `venv/bin/python3` works, do not later try `python` or `python3` without the venv path.

## Phase 3: Diagnostic Discipline

### The 2-Failure Rule

After **two consecutive failures** of the same operation with different command variants:

1. **STOP executing commands**
2. **Switch to diagnostic mode:**
   - Read the error message as information, not as a prompt to retry
   - Run targeted inspection commands (see table below)
   - Form a hypothesis before the next execution attempt

### Error → Diagnosis Map

| Error Signal | Do NOT | DO |
|---|---|---|
| `command not found` | Try variations of the command | Run `which <cmd>`, inspect PATH, check venv/bin/ |
| `Permission denied` | Retry with sudo or different path | Run `ls -la <file>`, check executable bit |
| `Cannot find module` | Retry with different import | Run `ls node_modules/<pkg>`, check package.json |
| `Cannot find namespace 'NodeJS'` | Change tsconfig randomly | Check `ls node_modules/@types/node`, install if missing |
| `ENOENT` / `No such file` | Guess the correct path | Run `find` or `ls` to locate the file |
| `Connection refused` | Retry the same URL | Check if server is running: `lsof -i :<port>` or `ss -tlnp` |
| `500 Internal Server Error` | Retry the request | Read server logs: `pm2 logs` or `journalctl` |
| `CORS error` | Add random headers | Check `.env` CORS_ORIGINS and compare with browser URL |
| `Exit code 1` (npm test) | Re-run the same test | Read the test output for the specific failure |
| `TypeError` at runtime | Guess a fix | Read the stack trace, identify the exact line and variable |
| `syntax error near unexpected token` in `.env` | Retry `source .env` | **Never source .env** — extract values with `grep` (see .env Safety below) |
| `psql` / DB command fails after `.env` load | Retry with different `source` syntax | Extract `DATABASE_URL` directly: `grep '^DATABASE_URL=' .env \| cut -d= -f2-` |

### Hypothesis Ranking

When an error occurs, rank causes by likelihood:

1. **Environment mismatch** (wrong binary, missing dependency) — most common
2. **Configuration error** (.env, tsconfig, package.json) — second most common
3. **Code bug** — only after environment and config are verified
4. **Platform issue** (OS, permissions, filesystem) — rare but possible

**Never jump to cause #3 before ruling out #1 and #2.**

## Phase 4: Parallel Execution Rules

- **NEVER** run parallel bash commands that modify the same environment (npm install + npm test)
- **NEVER** run parallel bash commands against a database during schema changes
- **SAFE to parallelize**: read-only commands (grep, cat, ls), independent file edits, independent API calls
- When in doubt, serialize

## Phase 5: .env File Safety

### NEVER source .env files directly

`.env` files are **not bash scripts**. They use a simplified `KEY=VALUE` format that often contains characters bash interprets as operators: `<`, `>`, `(`, `)`, `|`, `&`, `#`, spaces in unquoted values.

**Real-world failure**: `SMTP_FROM=CircularWatch <noreply@circularwatch.lu>` — bash sees `<` as input redirection, fails with `syntax error near unexpected token 'newline'`. Agent retried `source .env` 6 times instead of reading the error once.

### Safe .env Access Patterns

```bash
# GOOD: Extract a single value with grep
DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)

# GOOD: Extract with sed (handles = in values)
API_KEY=$(sed -n 's/^API_KEY=//p' .env)

# GOOD: Use env-file-aware tools directly
# Docker, docker-compose, and dotenv-cli handle .env natively
docker run --env-file .env ...
npx dotenv -e .env -- psql "$DATABASE_URL" ...

# GOOD: Read all vars safely (handles most edge cases)
export $(grep -v '^#' .env | grep -v '^\s*$' | sed 's/=\(.*\)/="\1"/' | xargs)

# BAD: source .env — WILL BREAK on special characters
source .env          # ← NEVER DO THIS
. .env               # ← NEVER DO THIS
set -a && source .env && set +a  # ← Still breaks on special chars
```

### When You Need a Database Connection

```bash
# Extract DATABASE_URL safely, then use it
DB_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
psql "$DB_URL" -c "SELECT 1;"

# Or for multiple values:
DB_HOST=$(grep '^DB_HOST=' .env | cut -d= -f2-)
DB_PORT=$(grep '^DB_PORT=' .env | cut -d= -f2-)
DB_NAME=$(grep '^DB_NAME=' .env | cut -d= -f2-)
DB_USER=$(grep '^DB_USER=' .env | cut -d= -f2-)
psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "SELECT 1;"
```

### Pin Rule

| Fact | Pin Rule |
|------|----------|
| .env format | **NEVER source**. Always extract specific values with `grep \| cut` or `sed`. |
| DATABASE_URL | Extract once, pin for session: `DB_URL=$(grep '^DATABASE_URL=' .env \| cut -d= -f2-)` |
| .env location | Check project root AND `backend/` subdirectory. Pin whichever exists. |

---

## Anti-Patterns (NEVER DO)

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| `source .env` or `. .env` | .env files contain bash-incompatible syntax (`<>`, unquoted spaces, `#` in values) | Extract specific values: `grep '^KEY=' .env \| cut -d= -f2-` |
| `python main.py` without checking | `python` may not exist or may be Python 2 | Run `which python3` first, pin the result |
| `tsc --noEmit` without checking @types | Will fail with namespace errors | Check `node_modules/@types/node` first |
| Retry same command 3+ times | Wastes tokens, same result every time | After 2 failures, switch to diagnosis |
| `npm test` before `npm install` | Missing dependencies = test failure | Check `node_modules/` exists first |
| Parallel `pm2 restart` + `curl` | Server not ready during restart | Wait for server, then test |
| `alembic upgrade head` without checking state | May have no effect if already current | Run `alembic current` + `alembic heads` first |

## Integration with Forge Pipeline

The `/forge` skill's Phase 1 (IGNITE) must include env-preflight:

```
Phase 1: IGNITE
  Step 1: Run env-preflight.sh → parse JSON
  Step 2: Pin environment facts
  Step 3: Check for warnings → resolve before proceeding
  Step 4: Validate PRDs (existing behavior)
```

If env-preflight detects warnings (missing dependencies, non-executable binaries, missing type definitions), resolve them BEFORE any story execution begins.

---

*Environment ignorance is the #1 cause of LLM agent failure on operational tasks. Inspect first, execute second.*
