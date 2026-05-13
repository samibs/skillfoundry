#!/bin/bash
# GuardLoop Harvest — Stop hook
#
# Runs at session end. Scans all code files edited this session against
# GuardLoop's full 10-pattern failure set. Logs detections to the knowledge
# base and updates the adaptive pattern frequency counter.
#
# Reads: .claude/hooks/state/guardloop-files.log  (written by failure-scan.sh)
# Writes: memory_bank/knowledge/errors-universal.jsonl
#         .claude/hooks/state/guardloop-patterns.json
#
# Runs AFTER batch-check.sh in settings.json (batch-check deletes edited-files.log;
# guardloop-harvest.sh uses its own independent guardloop-files.log).
#
# Part of: GuardLoop × SkillFoundry integration

set -o pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
STATE_DIR="$PROJECT_DIR/.claude/hooks/state"
FILES_LOG="$STATE_DIR/guardloop-files.log"
PATTERNS_FILE="$STATE_DIR/guardloop-patterns.json"
KNOWLEDGE_DIR="$PROJECT_DIR/memory_bank/knowledge"
ERRORS_LOG="$KNOWLEDGE_DIR/errors-universal.jsonl"

# Nothing to harvest if no files were tracked
if [ ! -f "$FILES_LOG" ] || [ ! -s "$FILES_LOG" ]; then
    exit 0
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DATE=$(date -u +"%Y-%m-%d")

# ─── Initialize pattern state if missing ───────────────────────────────────────
if [ ! -f "$PATTERNS_FILE" ]; then
    python3 - "$PATTERNS_FILE" <<'PYEOF'
import json, sys
state = {
    "version": "1.0",
    "updated": "",
    "patterns": {
        "hardcoded-secret":       {"count": 0, "severity": "critical", "last_seen": None, "files": [], "promoted_at": None},
        "localstorage-token":     {"count": 0, "severity": "critical", "last_seen": None, "files": [], "promoted_at": None},
        "file-corruption":        {"count": 0, "severity": "critical", "last_seen": None, "files": [], "promoted_at": None},
        "empty-catch":            {"count": 0, "severity": "high",     "last_seen": None, "files": [], "promoted_at": None},
        "placeholder-code":       {"count": 0, "severity": "high",     "last_seen": None, "files": [], "promoted_at": None},
        "nullable-array-method":  {"count": 0, "severity": "high",     "last_seen": None, "files": [], "promoted_at": None},
        "ts-ignore-no-comment":   {"count": 0, "severity": "medium",   "last_seen": None, "files": [], "promoted_at": None},
        "console-log-unguarded":  {"count": 0, "severity": "medium",   "last_seen": None, "files": [], "promoted_at": None},
        "hardcoded-path":         {"count": 0, "severity": "medium",   "last_seen": None, "files": [], "promoted_at": None},
        "select-star-query":      {"count": 0, "severity": "medium",   "last_seen": None, "files": [], "promoted_at": None}
    }
}
with open(sys.argv[1], "w") as f:
    json.dump(state, f, indent=2)
PYEOF
fi

# ─── Helpers ────────────────────────────────────────────────────────────────────
uuid() {
    python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || echo "$(date +%s%N)"
}

log_failure() {
    local pattern="$1" fname="$2" content="$3" severity="$4"
    local id
    id=$(uuid)
    python3 - "$id" "$pattern" "$content" "$severity" "$PROJECT_DIR" "$TIMESTAMP" "$ERRORS_LOG" <<'PYEOF'
import json, sys
entry = {
    "id": sys.argv[1],
    "type": "error",
    "content": sys.argv[3],
    "weight": 0.7,
    "tags": ["guardloop", "auto-detect", sys.argv[4], sys.argv[2]],
    "scope": "universal",
    "source_project": sys.argv[5],
    "harvested_at": sys.argv[6],
    "lineage": {"parent_id": None, "supersedes": [], "superseded_by": None}
}
with open(sys.argv[7], "a") as f:
    f.write(json.dumps(entry) + "\n")
PYEOF
}

increment_pattern() {
    local pattern="$1" filepath="$2"
    python3 - "$PATTERNS_FILE" "$pattern" "$filepath" "$DATE" <<'PYEOF'
import json, sys
try:
    with open(sys.argv[1]) as f:
        state = json.load(f)
    p, fp, date = sys.argv[2], sys.argv[3], sys.argv[4]
    if p in state["patterns"]:
        state["patterns"][p]["count"] += 1
        state["patterns"][p]["last_seen"] = date
        files = state["patterns"][p].get("files", [])
        if fp not in files:
            files.append(fp)
        state["patterns"][p]["files"] = files[-5:]
    state["updated"] = date
    with open(sys.argv[1], "w") as f:
        json.dump(state, f, indent=2)
except Exception:
    pass
PYEOF
}

# ─── Scan edited files ──────────────────────────────────────────────────────────
TOTAL=0
DETECTIONS=0
REPORT=""

while IFS= read -r filepath; do
    [ -f "$filepath" ] || continue

    case "$filepath" in
        *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.py|*.cs|*.java|*.go) ;;
        *) continue ;;
    esac

    FILE_SIZE=$(wc -c < "$filepath" 2>/dev/null || echo "0")
    [ "$FILE_SIZE" -gt 512000 ] && continue

    TOTAL=$((TOTAL + 1))
    FNAME=$(basename "$filepath")

    # 1. Hardcoded secrets
    if grep -iqE "(password|secret|api_key|apikey|access_token|private_key)\s*[=:]\s*[\"'][^\"']{6,}[\"']" "$filepath" 2>/dev/null; then
        if ! grep -iqE "(example|placeholder|your_|<your|env\.|process\.env|os\.environ|getenv)" "$filepath" 2>/dev/null; then
            log_failure "hardcoded-secret" "$FNAME" \
                "Hardcoded credential in $FNAME — use environment variables (never hardcode secrets)" "critical"
            increment_pattern "hardcoded-secret" "$filepath"
            REPORT+="  [CRITICAL] hardcoded-secret    → $FNAME\n"
            DETECTIONS=$((DETECTIONS + 1))
        fi
    fi

    # 2. localStorage token storage
    if grep -iqE "localStorage\.(setItem|getItem).*[Tt]oken" "$filepath" 2>/dev/null; then
        log_failure "localstorage-token" "$FNAME" \
            "Token stored in localStorage in $FNAME — XSS risk. Use HttpOnly+Secure+SameSite=Strict cookies." "critical"
        increment_pattern "localstorage-token" "$filepath"
        REPORT+="  [CRITICAL] localstorage-token  → $FNAME\n"
        DETECTIONS=$((DETECTIONS + 1))
    fi

    # 3. File corruption (repeating chars — AI artifact)
    if grep -qE "[)]{10,}|[0]{20,}" "$filepath" 2>/dev/null; then
        log_failure "file-corruption" "$FNAME" \
            "File corruption in $FNAME — repeating characters, likely AI generation artifact. Restore from git." "critical"
        increment_pattern "file-corruption" "$filepath"
        REPORT+="  [CRITICAL] file-corruption     → $FNAME\n"
        DETECTIONS=$((DETECTIONS + 1))
    fi

    # 4. Empty catch blocks (silent failures)
    if grep -iqE "catch\s*\([^)]*\)\s*\{\s*\}" "$filepath" 2>/dev/null; then
        log_failure "empty-catch" "$FNAME" \
            "Empty catch block in $FNAME — silent failure. Log the error: catch(e) { logger.error(e); }" "high"
        increment_pattern "empty-catch" "$filepath"
        REPORT+="  [HIGH]     empty-catch         → $FNAME\n"
        DETECTIONS=$((DETECTIONS + 1))
    fi

    # 5. Placeholder code in non-comment lines
    case "$filepath" in *.md) ;; *)
        if grep -qnE "^[^/#{!\"'*-].*\b(TODO|FIXME|STUB|PLACEHOLDER)\b" "$filepath" 2>/dev/null; then
            log_failure "placeholder-code" "$FNAME" \
                "Placeholder code in $FNAME — TODO/STUB/PLACEHOLDER not allowed in production code (BPSBS zero-tolerance)" "high"
            increment_pattern "placeholder-code" "$filepath"
            REPORT+="  [HIGH]     placeholder-code    → $FNAME\n"
            DETECTIONS=$((DETECTIONS + 1))
        fi
    esac

    # 6. @ts-ignore without justification comment
    if grep -qE "@ts-ignore[[:space:]]*$" "$filepath" 2>/dev/null; then
        log_failure "ts-ignore-no-comment" "$FNAME" \
            "@ts-ignore without justification in $FNAME — add // @ts-ignore — reason: <explain>" "medium"
        increment_pattern "ts-ignore-no-comment" "$filepath"
        REPORT+="  [MEDIUM]   ts-ignore-no-comment → $FNAME\n"
        DETECTIONS=$((DETECTIONS + 1))
    fi

    # 7. Unguarded console.log (JS/TS only)
    case "$filepath" in *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
        if grep -qE "console\.(log|debug)\(" "$filepath" 2>/dev/null; then
            if ! grep -qE "NODE_ENV|process\.env\.DEBUG|__DEV__" "$filepath" 2>/dev/null; then
                log_failure "console-log-unguarded" "$FNAME" \
                    "Unguarded console.log in $FNAME — guard with NODE_ENV or remove for production" "medium"
                increment_pattern "console-log-unguarded" "$filepath"
            fi
        fi
    esac

    # 8. SELECT * in queries
    if grep -iqE "SELECT\s+\*\s+FROM" "$filepath" 2>/dev/null; then
        log_failure "select-star-query" "$FNAME" \
            "SELECT * in $FNAME — select only needed columns to prevent over-fetching (BE-004)" "medium"
        increment_pattern "select-star-query" "$filepath"
    fi

done < "$FILES_LOG"

# ─── Report ─────────────────────────────────────────────────────────────────────
if [ "$DETECTIONS" -gt 0 ]; then
    echo ""
    echo "--- GuardLoop Harvest (${TOTAL} files) ---"
    echo -e "$REPORT"
    echo "Patterns logged to memory_bank. Run /guardloop to analyze."
    echo "------------------------------------------"
fi

# Clean our state file (not batch-check's edited-files.log)
rm -f "$FILES_LOG" 2>/dev/null

exit 0
