#!/bin/bash
# GuardLoop Promote — Generates guardrails from high-frequency patterns
#
# Reads guardloop-patterns.json, finds patterns at or above the promotion
# threshold (default: 3 occurrences), and appends them as enforced rules
# to agents/_guardloop-rules.md. Marks promoted patterns so they are not
# double-promoted on subsequent runs.
#
# Usage:
#   bash scripts/guardloop-promote.sh          # Promote ready patterns
#   bash scripts/guardloop-promote.sh --dry-run # Show what would be promoted
#   bash scripts/guardloop-promote.sh --reset   # Reset all pattern counts
#
# Part of: GuardLoop × SkillFoundry integration

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
PATTERNS_FILE="$PROJECT_DIR/.claude/hooks/state/guardloop-patterns.json"
RULES_FILE="$PROJECT_DIR/agents/_guardloop-rules.md"

PROMOTE_THRESHOLD=3
DRY_RUN=0
RESET=0

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=1 ;;
        --reset)   RESET=1 ;;
    esac
done

if [ ! -f "$PATTERNS_FILE" ]; then
    echo "No pattern data found. Run a coding session first to collect patterns."
    exit 0
fi

# ─── Reset mode ─────────────────────────────────────────────────────────────────
if [ "$RESET" -eq 1 ]; then
    python3 - "$PATTERNS_FILE" <<'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    state = json.load(f)
for p in state["patterns"].values():
    p["count"] = 0
    p["last_seen"] = None
    p["files"] = []
    p["promoted_at"] = None
state["updated"] = ""
with open(sys.argv[1], "w") as f:
    json.dump(state, f, indent=2)
print("Pattern counts reset.")
PYEOF
    exit 0
fi

DATE=$(date -u +"%Y-%m-%d")

# ─── Rule definitions (pattern → category + enforcement text) ────────────────────
python3 - "$PATTERNS_FILE" "$RULES_FILE" "$PROMOTE_THRESHOLD" "$DATE" "$DRY_RUN" <<'PYEOF'
import json, sys, os, re

patterns_file, rules_file = sys.argv[1], sys.argv[2]
threshold = int(sys.argv[3])
date = sys.argv[4]
dry_run = sys.argv[5] == "1"

RULE_MAP = {
    "hardcoded-secret": (
        "Security",
        "Never hardcode credentials. Use process.env.VAR (JS/TS) or os.environ['VAR'] (Python). "
        "Reference .env.example for required variables."
    ),
    "localstorage-token": (
        "Security",
        "Never store auth tokens in localStorage/sessionStorage. "
        "Use HttpOnly + Secure + SameSite=Strict cookies for refresh tokens. "
        "Access tokens: memory only (SPA variable)."
    ),
    "file-corruption": (
        "Code Quality",
        "If a file contains repeating characters ()))))  000000  ========), restore from git immediately. "
        "This is an AI generation artifact — split the task into smaller targeted edits."
    ),
    "empty-catch": (
        "Error Handling",
        "Never leave empty catch blocks. Minimum: catch(e) { logger.error(e); throw e; } "
        "or catch(e) { logger.error('context', e); return errorResponse; }"
    ),
    "placeholder-code": (
        "Code Quality",
        "No TODO/FIXME/STUB/PLACEHOLDER in production code (BPSBS zero-tolerance). "
        "Implement fully or open a tracked issue via /fixer."
    ),
    "nullable-array-method": (
        "Type Safety",
        "Guard all array method calls on potentially null/undefined fields: "
        "(items ?? []).map(...) — never call .map/.filter/.some/.reduce on a nullable field."
    ),
    "ts-ignore-no-comment": (
        "Type Safety",
        "Every @ts-ignore must have a justification comment on the same line: "
        "// @ts-ignore — reason: <explain why the type system cannot handle this>"
    ),
    "console-log-unguarded": (
        "Code Quality",
        "Guard console.log/debug in production code: "
        "if (process.env.NODE_ENV !== 'production') console.log(...) "
        "Or use a proper logger (winston, pino) with log levels."
    ),
    "hardcoded-path": (
        "Configuration",
        "No hardcoded file system paths. Use path.join(__dirname, ...) for relative paths, "
        "or configuration variables from .env for deployment-specific paths."
    ),
    "select-star-query": (
        "Database",
        "SELECT * is forbidden in API response queries — over-fetches data and leaks schema. "
        "Select only the columns needed for the response (BE-004)."
    ),
}

with open(patterns_file) as f:
    state = json.load(f)

candidates = []
for pattern, data in state["patterns"].items():
    if data["count"] >= threshold and not data.get("promoted_at"):
        rule_info = RULE_MAP.get(pattern, ("General", f"Recurring pattern: {pattern} ({data['count']} occurrences)"))
        candidates.append((pattern, data, rule_info))

if not candidates:
    print(f"No patterns ready for promotion (threshold: {threshold} occurrences).")
    sys.exit(0)

if dry_run:
    print(f"DRY RUN — {len(candidates)} pattern(s) would be promoted:\n")
    for pattern, data, (cat, rule) in candidates:
        print(f"  [{data['severity'].upper()}] {pattern} ({data['count']} hits)")
        print(f"  Category: {cat}")
        print(f"  Rule: {rule[:100]}...")
        print()
    sys.exit(0)

# Build table rows
new_rows = []
for pattern, data, (cat, rule) in candidates:
    row = f"| {pattern:<28} | {data['severity']:<10} | {data['count']:<4} | {cat:<16} | {rule} |"
    new_rows.append(row)

# Create rules file if missing
if not os.path.exists(rules_file):
    with open(rules_file, "w") as f:
        f.write("""# GuardLoop Adaptive Rules

> Auto-generated from recurring failure patterns detected across sessions.
> Promoted when a pattern appears 3+ times. All code-generating agents enforce these rules.
> Source: `.claude/hooks/state/guardloop-patterns.json`
> Last updated: {date}

---

## Enforced Guardrails

| Pattern | Severity | Hits | Category | Enforcement Rule |
|---------|----------|------|----------|-----------------|
""".format(date=date))

# Append new rows to the table
with open(rules_file, "a") as f:
    for row in new_rows:
        f.write(row + "\n")

# Update "Last updated" line
with open(rules_file) as f:
    content = f.read()
content = re.sub(r"Last updated: \S+", f"Last updated: {date}", content)
with open(rules_file, "w") as f:
    f.write(content)

# Mark as promoted in state
for pattern, data, _ in candidates:
    state["patterns"][pattern]["promoted_at"] = date
state["updated"] = date
with open(patterns_file, "w") as f:
    json.dump(state, f, indent=2)

print(f"Promoted {len(candidates)} rule(s) to agents/_guardloop-rules.md:\n")
for pattern, data, (cat, rule) in candidates:
    print(f"  [{data['severity'].upper()}] {pattern}")
    print(f"    → {rule[:90]}...")
    print()
print(f"All code-generating agents will enforce these rules on next invocation.")
print(f"To propagate to all registered projects: ./update.sh --scan")
PYEOF
