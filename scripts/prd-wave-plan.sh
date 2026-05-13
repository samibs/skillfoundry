#!/usr/bin/env bash
# scripts/prd-wave-plan.sh
#
# Computes PRD execution waves from dependency metadata in genesis/*.md front matter.
# Used by /go Phase 2.5 to determine the order PRDs should be implemented.
#
# USAGE:
#   ./scripts/prd-wave-plan.sh [genesis-dir]
#   ./scripts/prd-wave-plan.sh --json [genesis-dir]
#
# OUTPUT:
#   Prints wave execution plan (or JSON with --json flag)
#
# EXIT CODES:
#   0  Plan computed successfully
#   1  Cycle detected (deadlock)
#   2  Usage error

set -eo pipefail

GENESIS_DIR="${2:-${1:-genesis}}"
JSON_MODE=0
[ "${1:-}" = "--json" ] && { JSON_MODE=1; GENESIS_DIR="${2:-genesis}"; }

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

if ! command -v python3 &>/dev/null; then
    echo "Error: python3 required" >&2
    exit 2
fi

if [ ! -d "$GENESIS_DIR" ]; then
    echo "Error: genesis directory not found: $GENESIS_DIR" >&2
    exit 2
fi

python3 - "$GENESIS_DIR" "$JSON_MODE" <<'PYEOF'
import sys, os, re, json

genesis_dir = sys.argv[1]
json_mode = sys.argv[2] == "1"

def parse_prd(filepath):
    """Extract prd_id, title, status, and dependencies.requires from front matter."""
    with open(filepath, encoding="utf-8") as f:
        content = f.read()

    basename = os.path.basename(filepath)
    prd_id = basename.replace(".md", "")
    title = prd_id
    status = "DRAFT"
    requires = []
    recommends = []

    # Extract YAML front matter
    fm_match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not fm_match:
        return {"id": prd_id, "title": title, "status": status, "requires": requires, "recommends": recommends, "file": filepath}

    fm = fm_match.group(1)

    # prd_id
    m = re.search(r"^prd_id:\s*(.+)", fm, re.MULTILINE)
    if m: prd_id = m.group(1).strip().strip('"\'')

    # title
    m = re.search(r"^title:\s*(.+)", fm, re.MULTILINE)
    if m: title = m.group(1).strip().strip('"\'')

    # status
    m = re.search(r"^status:\s*(.+)", fm, re.MULTILINE)
    if m: status = m.group(1).strip().strip('"\'')

    # dependencies block — requires list
    deps_match = re.search(r"dependencies:(.*?)(?=\n[a-z]|\Z)", fm, re.DOTALL)
    if deps_match:
        deps_block = deps_match.group(1)
        req_match = re.search(r"requires:\s*\[([^\]]*)\]", deps_block)
        if req_match:
            items = req_match.group(1).strip()
            requires = [i.strip().strip('"\'') for i in items.split(",") if i.strip()]
        rec_match = re.search(r"recommends:\s*\[([^\]]*)\]", deps_block)
        if rec_match:
            items = rec_match.group(1).strip()
            recommends = [i.strip().strip('"\'') for i in items.split(",") if i.strip()]

    return {"id": prd_id, "title": title, "status": status, "requires": requires, "recommends": recommends, "file": filepath}

# Load all PRDs (skip template and README)
prds = {}
for fname in sorted(os.listdir(genesis_dir)):
    if not fname.endswith(".md"):
        continue
    if fname in ("TEMPLATE.md", "README.md", "INDEX.md"):
        continue
    fpath = os.path.join(genesis_dir, fname)
    prd = parse_prd(fpath)
    prds[prd["id"]] = prd

if not prds:
    print(json.dumps({"error": "No PRDs found", "genesis": genesis_dir}) if json_mode else "No PRDs found in genesis/")
    sys.exit(0)

# Topological sort with wave grouping
completed = {pid for pid, p in prds.items() if p["status"] in ("COMPLETED", "DONE")}
remaining = {pid for pid in prds if pid not in completed}
waves = []
blocked = {}
MAX_ITERATIONS = len(remaining) + 1

iteration = 0
while remaining:
    iteration += 1
    if iteration > MAX_ITERATIONS:
        # Cycle or unresolvable deps
        cycle_prds = [prds[pid]["id"] for pid in remaining]
        if json_mode:
            print(json.dumps({"error": "CYCLE_OR_DEADLOCK", "affected": cycle_prds}))
        else:
            print(f"\033[0;31m❌ DEPENDENCY CYCLE OR DEADLOCK\033[0m")
            print(f"Cannot resolve order for: {', '.join(cycle_prds)}")
            print("Check for circular dependencies in genesis/ front matter.")
        sys.exit(1)

    ready = []
    for pid in sorted(remaining):
        prd = prds[pid]
        unmet = [r for r in prd["requires"] if r not in completed]
        # Only include deps that actually exist in this genesis/ (skip external refs)
        unmet_known = [r for r in unmet if r in prds]
        if not unmet_known:
            ready.append(pid)
        else:
            blocked[pid] = unmet_known

    if not ready:
        # All remaining have unmet deps — deadlock
        if json_mode:
            print(json.dumps({"error": "DEADLOCK", "blocked": blocked}))
        else:
            print(f"\033[0;31m❌ DEADLOCK: Unresolvable dependencies\033[0m")
            for pid, deps in blocked.items():
                print(f"  {pid} → waiting for: {', '.join(deps)}")
        sys.exit(1)

    waves.append(ready)
    completed.update(ready)
    remaining -= set(ready)

# Build result
result = {
    "waves": [
        {
            "wave": i + 1,
            "label": "Foundation" if i == 0 else f"Wave {i+1}",
            "prds": [{"id": pid, "title": prds[pid]["title"], "status": prds[pid]["status"]} for pid in wave]
        }
        for i, wave in enumerate(waves)
    ],
    "total_prds": len(prds),
    "already_completed": sorted(p for p in prds if prds[p]["status"] in ("COMPLETED","DONE")),
}

if json_mode:
    print(json.dumps(result, indent=2))
    sys.exit(0)

# Human-readable output
print(f"\033[0;36mPRD EXECUTION PLAN\033[0m")
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print()

for winfo in result["waves"]:
    wnum = winfo["wave"]
    wlabel = winfo["label"]
    wprds = winfo["prds"]
    parallel = len(wprds) > 1
    pflag = " (parallel)" if parallel else ""
    print(f"\033[1;34mWave {wnum} — {wlabel}{pflag}:\033[0m")
    for p in wprds:
        status_icon = "✓" if p["status"] in ("COMPLETED","DONE") else "○"
        print(f"  {status_icon} {p['id']}  [{p['status']}]")
    print()

if result["already_completed"]:
    print(f"\033[0;32mAlready completed (skipped):\033[0m")
    for cid in result["already_completed"]:
        print(f"  ✓ {cid}")
    print()

print(f"Total PRDs: {result['total_prds']}  Waves: {len(result['waves'])}")
PYEOF
