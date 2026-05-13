#!/bin/bash
# GuardLoop Analyze — Pattern frequency report
#
# Reads the adaptive pattern state and recent knowledge entries to produce
# a human-readable analysis. Called by the /guardloop skill.
#
# Part of: GuardLoop × SkillFoundry integration

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
PATTERNS_FILE="$PROJECT_DIR/.claude/hooks/state/guardloop-patterns.json"
ERRORS_LOG="$PROJECT_DIR/memory_bank/knowledge/errors-universal.jsonl"

if [ ! -f "$PATTERNS_FILE" ]; then
    echo "No GuardLoop data yet. Pattern tracking begins after the first code edit session."
    echo "Hooks active: failure-scan.sh (PostToolUse) + guardloop-harvest.sh (Stop)"
    exit 0
fi

python3 - "$PATTERNS_FILE" "$ERRORS_LOG" <<'PYEOF'
import json, sys, os
from datetime import datetime, timezone

patterns_file = sys.argv[1]
errors_log = sys.argv[2]

try:
    with open(patterns_file) as f:
        state = json.load(f)
except Exception as e:
    print(f"Error reading pattern state: {e}")
    sys.exit(1)

patterns = state.get("patterns", {})
updated = state.get("updated") or "never"
PROMOTE_THRESHOLD = 3

# Sort: critical first, then by count descending
def sort_key(item):
    name, data = item
    sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    return (sev_order.get(data["severity"], 9), -data["count"])

sorted_patterns = sorted(patterns.items(), key=sort_key)

total_detections = sum(d["count"] for _, d in sorted_patterns)
promotable = [(n, d) for n, d in sorted_patterns if d["count"] >= PROMOTE_THRESHOLD and not d.get("promoted_at")]
already_promoted = [(n, d) for n, d in sorted_patterns if d.get("promoted_at")]

print("GuardLoop Pattern Analysis")
print(f"Last harvest: {updated}  |  Total detections: {total_detections}")
print()

# Pattern table
header = f"{'Pattern':<28} {'Severity':<10} {'Hits':<6} {'Status'}"
print(header)
print("─" * 65)

for name, data in sorted_patterns:
    count = data["count"]
    severity = data["severity"]
    promoted_at = data.get("promoted_at")

    if count == 0:
        status = "clean"
    elif promoted_at:
        status = f"promoted ({promoted_at})"
    elif count >= PROMOTE_THRESHOLD:
        status = "★ PROMOTE"
    else:
        status = f"watching ({count}/{PROMOTE_THRESHOLD})"

    print(f"{name:<28} {severity:<10} {count:<6} {status}")

print()

# Recent guardloop entries from knowledge base
if os.path.exists(errors_log):
    recent = []
    try:
        with open(errors_log) as f:
            for line in f:
                try:
                    entry = json.loads(line.strip())
                    tags = entry.get("tags", [])
                    if "guardloop" in tags:
                        recent.append(entry)
                except Exception:
                    continue
        recent = recent[-10:]  # Last 10
    except Exception:
        recent = []

    if recent:
        print(f"Recent detections (last {len(recent)}):")
        for entry in reversed(recent):
            harvested = entry.get("harvested_at", "")[:10]
            content = entry.get("content", "")[:80]
            print(f"  [{harvested}] {content}")
        print()

# Summary
if promotable:
    print(f"ACTION: {len(promotable)} pattern(s) ready for promotion → run /guardloop promote")
elif total_detections == 0:
    print("No failures detected yet. Pattern tracking is active.")
else:
    if already_promoted:
        print(f"{len(already_promoted)} rule(s) already promoted to agents/_guardloop-rules.md")
    else:
        print("Keep coding — patterns promote at 3+ occurrences.")
PYEOF
