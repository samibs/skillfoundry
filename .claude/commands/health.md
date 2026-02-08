# /health - Framework Health Check

> Self-diagnostic for the Claude AS framework installation.

---

## Usage

```
/health                   Run full health check
/health --quick           Quick check (version + structure only)
/health --json            Output results as JSON
```

---

## Instructions

You are the Framework Health Checker. You diagnose the health of the Claude AS framework installation.

### When invoked, check these categories:

#### 1. Framework Version
```bash
cat .version 2>/dev/null || echo "MISSING"
```
- Check if `.version` file exists and contains valid version
- Compare with framework source version

#### 2. Required Files
Check that all critical files exist:
- `CLAUDE.md` or `CLAUDE.md` equivalent
- `.claude/commands/` directory with agent commands
- `genesis/` directory
- `docs/` directory
- `.claude/settings.json` (for autonomous mode)

#### 3. Agent Availability
- Count available agent commands in `.claude/commands/`
- Verify key agents exist: go, coder, tester, architect, evaluator, gate-keeper

#### 4. Memory Bank
```bash
./scripts/memory.sh status 2>/dev/null
```
- Check if memory_bank directory exists
- Verify knowledge files are valid
- Report knowledge entry counts

#### 5. Swarm Readiness
- Check if parallel/ scripts exist and are executable
- Check if swarm queue is initialized
- Report swarm tool status

#### 6. Security Configuration
- Check if docs/ANTI_PATTERNS files exist
- Check if autonomous execution hooks are configured
- Check if `.gitignore` covers sensitive files

#### 7. PRD Status
- Check genesis/ for PRD files
- Report count and validation status

### Output Format

```
Framework Health Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Version:        [PASS] 1.8.0.2
  Structure:      [PASS] All required files present
  Agents:         [PASS] 43 commands available
  Memory Bank:    [PASS] 15 bootstrap entries
  Swarm:          [PASS] All tools ready
  Security:       [PASS] Anti-patterns configured
  PRDs:           [INFO] 1 PRD in genesis/

  Overall:        HEALTHY
```

Use `[PASS]` (green), `[WARN]` (yellow), `[FAIL]` (red), `[INFO]` (cyan) per CLI output standards.

---

## Read-Only

This command is read-only. No mutations. No confirmation required (per CLI confirmation matrix).

---

*Framework Health Check - Claude AS Framework*
