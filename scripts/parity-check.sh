#!/usr/bin/env bash
# scripts/parity-check.sh
#
# Cross-platform skill parity detector.
# Compares .claude/commands/ (reference) against Copilot, Cursor, Codex, and Gemini
# platform directories. Reports presence gaps and H1 title drift.
#
# USAGE:
#   ./scripts/parity-check.sh                 Full parity report
#   ./scripts/parity-check.sh --missing       List only missing skills per platform
#   ./scripts/parity-check.sh --drift         List only drifted (title mismatch) skills
#   ./scripts/parity-check.sh --json          Machine-readable JSON output
#   ./scripts/parity-check.sh --skill <name>  Check a single skill across all platforms
#
# EXIT CODES:
#   0  Full parity — all platforms in sync
#   1  Gaps detected (missing or drifted skills)
#   2  Usage error

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ── Defaults ────────────────────────────────────────────────────────────
MODE="full"
SKILL_FILTER=""
JSON_MODE=0

while [ "$#" -gt 0 ]; do
    case "$1" in
        --missing)  MODE="missing"; shift ;;
        --drift)    MODE="drift"; shift ;;
        --json)     JSON_MODE=1; shift ;;
        --skill)    SKILL_FILTER="${2:-}"; shift 2 ;;
        --help|-h)
            sed -n '/^# USAGE:/,/^# EXIT/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        -*) echo "Unknown flag: $1"; exit 2 ;;
        *)  echo "Unexpected argument: $1"; exit 2 ;;
    esac
done

if ! command -v python3 &>/dev/null; then
    echo "Error: python3 required" >&2
    exit 2
fi

python3 - \
    "$FRAMEWORK_DIR" \
    "$MODE" \
    "$JSON_MODE" \
    "$SKILL_FILTER" \
<<'PYEOF'
import sys, os, re, json

framework_dir = sys.argv[1]
mode = sys.argv[2]
json_mode = sys.argv[3] == "1"
skill_filter = sys.argv[4]

PLATFORMS = {
    "claude":   {"dir": os.path.join(framework_dir, ".claude", "commands"), "ext": ".md",    "codex": False},
    "copilot":  {"dir": os.path.join(framework_dir, ".copilot", "custom-agents"), "ext": ".md", "codex": False},
    "cursor":   {"dir": os.path.join(framework_dir, ".cursor", "rules"), "ext": ".md",       "codex": False},
    "codex":    {"dir": os.path.join(framework_dir, ".agents", "skills"), "ext": "",          "codex": True},
    "gemini":   {"dir": os.path.join(framework_dir, ".gemini", "skills"), "ext": ".md",       "codex": False},
}

SKIP_FILES = {"README.md", "INDEX.md", "TEMPLATE.md", "_agent-protocol.md"}


def extract_h1(filepath):
    """Return the first H1 title found in a markdown file, or None."""
    try:
        with open(filepath, encoding="utf-8", errors="replace") as f:
            for line in f:
                m = re.match(r"^#\s+(.+)", line.strip())
                if m:
                    return m.group(1).strip()
    except OSError:
        pass
    return None


def get_skill_file(platform_key, slug):
    """Return path to the skill file for a given platform slug, or None if absent."""
    cfg = PLATFORMS[platform_key]
    d = cfg["dir"]
    if cfg["codex"]:
        path = os.path.join(d, slug, "SKILL.md")
    else:
        path = os.path.join(d, slug + cfg["ext"])
    return path if os.path.isfile(path) else None


def list_reference_skills():
    """Return sorted list of skill slugs from .claude/commands/ (reference platform)."""
    d = PLATFORMS["claude"]["dir"]
    if not os.path.isdir(d):
        return []
    slugs = []
    for fname in sorted(os.listdir(d)):
        if not fname.endswith(".md"):
            continue
        if fname in SKIP_FILES or fname.startswith("_"):
            continue
        slugs.append(fname[:-3])  # strip .md
    return slugs


all_slugs = list_reference_skills()
if skill_filter:
    all_slugs = [s for s in all_slugs if skill_filter.lower() in s.lower()]
    if not all_slugs:
        print(f"No skills matching '{skill_filter}' in .claude/commands/")
        sys.exit(1)

# ── Build parity matrix ────────────────────────────────────────────────
# result[slug][platform] = {"present": bool, "h1": str|None, "drifted": bool}

reference_h1 = {}
for slug in all_slugs:
    ref_path = get_skill_file("claude", slug)
    reference_h1[slug] = extract_h1(ref_path) if ref_path else None

matrix = {}
for slug in all_slugs:
    matrix[slug] = {}
    ref_title = reference_h1[slug]
    for pname in PLATFORMS:
        if pname == "claude":
            matrix[slug][pname] = {"present": True, "h1": ref_title, "drifted": False}
            continue
        path = get_skill_file(pname, slug)
        if path:
            h1 = extract_h1(path)
            drifted = bool(ref_title and h1 and ref_title.lower() != h1.lower())
            matrix[slug][pname] = {"present": True, "h1": h1, "drifted": drifted}
        else:
            matrix[slug][pname] = {"present": False, "h1": None, "drifted": False}

# ── Platform summary stats ─────────────────────────────────────────────
total = len(all_slugs)
platform_stats = {}
for pname in PLATFORMS:
    if pname == "claude":
        platform_stats[pname] = {"present": total, "missing": 0, "drifted": 0, "parity_pct": 100}
        continue
    present = sum(1 for s in all_slugs if matrix[s][pname]["present"])
    drifted = sum(1 for s in all_slugs if matrix[s][pname]["drifted"])
    missing = total - present
    parity_pct = round((present / total) * 100) if total else 100
    platform_stats[pname] = {"present": present, "missing": missing, "drifted": drifted, "parity_pct": parity_pct}

# ── JSON output ────────────────────────────────────────────────────────
if json_mode:
    out = {
        "reference": "claude",
        "total_skills": total,
        "platforms": platform_stats,
        "skills": {
            slug: {
                pname: matrix[slug][pname]
                for pname in PLATFORMS if pname != "claude"
            }
            for slug in all_slugs
        }
    }
    print(json.dumps(out, indent=2))
    sys.exit(0)

# ── Human-readable output ──────────────────────────────────────────────
print(f"\033[0;36mSKILL PARITY REPORT\033[0m  (reference: .claude/commands/)")
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print()

# Platform summary table
header = f"  {'Platform':<14} {'Present':>8} {'Missing':>8} {'Drifted':>8} {'Parity':>8}"
print(f"\033[1m{header}\033[0m")
print("  " + "─" * 50)
for pname, stats in platform_stats.items():
    if pname == "claude":
        continue
    parity = stats["parity_pct"]
    color = "\033[0;32m" if parity == 100 else ("\033[1;33m" if parity >= 90 else "\033[0;31m")
    print(f"  {pname:<14} {stats['present']:>8} {stats['missing']:>8} {stats['drifted']:>8}  {color}{parity}%\033[0m")
print()

# Per-skill breakdown
if mode in ("full", "missing"):
    for pname in [p for p in PLATFORMS if p != "claude"]:
        missing_skills = [s for s in all_slugs if not matrix[s][pname]["present"]]
        if missing_skills:
            print(f"\033[0;31mMissing from {pname} ({len(missing_skills)}):\033[0m")
            for s in missing_skills:
                print(f"  ✗ {s}")
            print()

if mode in ("full", "drift"):
    for pname in [p for p in PLATFORMS if p != "claude"]:
        drifted_skills = [s for s in all_slugs if matrix[s][pname]["drifted"]]
        if drifted_skills:
            print(f"\033[1;33mTitle drift in {pname} ({len(drifted_skills)}):\033[0m")
            for s in drifted_skills:
                ref = reference_h1[s] or "(none)"
                other = matrix[s][pname]["h1"] or "(none)"
                print(f"  ~ {s}")
                print(f"      claude:  {ref}")
                print(f"      {pname+':':<10} {other}")
            print()

# Overall verdict
total_missing = sum(s["missing"] for p, s in platform_stats.items() if p != "claude")
total_drifted = sum(s["drifted"] for p, s in platform_stats.items() if p != "claude")

print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
if total_missing == 0 and total_drifted == 0:
    print(f"\033[0;32m\033[1mVERDICT: FULL PARITY\033[0m — all {total} skills present and aligned across all platforms")
    sys.exit(0)
else:
    parts = []
    if total_missing: parts.append(f"{total_missing} missing")
    if total_drifted: parts.append(f"{total_drifted} drifted")
    print(f"\033[1;33m\033[1mVERDICT: GAPS DETECTED\033[0m — {', '.join(parts)}")
    print(f"  Run: ./scripts/sync-platforms.sh sync --all  to resync all platforms")
    sys.exit(1)
PYEOF
