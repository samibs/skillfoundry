#!/usr/bin/env bash
# promote-experts.sh — Phase 3 cross-project promotion for Domain Expert Synthesis (FR-007)
#
# A domain reviewer synthesized in 3+ DISTINCT projects graduates from project-local to
# framework-shared (agents/<slug>-expert.md + packs/<slug>/). Provenance is aggregated from
# each registered project's memory_bank/knowledge/experts.jsonl (written by synth-expert.sh).
#
# Subcommands:
#   scan [--threshold N] [--registry <file>] [--framework <dir>]
#       Count distinct provenance projects per domain; list domains at/above the threshold
#       (default 3) that are not already framework-shared, as promotion candidates.
#   promote --domain <slug> [--from <project-dir>] [--registry <file>] [--framework <dir>] [--force]
#       Copy a project-local reviewer to the framework (scope=framework), scaffold the
#       framework pack if absent, and record framework-level provenance. Idempotent.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PACK_SCAFFOLD="$FRAMEWORK_DIR/templates/pack.scaffold"

if [ -t 1 ]; then
    RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; BLUE=$'\033[0;34m'; NC=$'\033[0m'
else RED=""; GREEN=""; YELLOW=""; BLUE=""; NC=""; fi
err()  { echo "${RED}error:${NC} $*" >&2; }
info() { echo "${BLUE}$*${NC}"; }
ok()   { echo "${GREEN}$*${NC}"; }
warn() { echo "${YELLOW}$*${NC}"; }

# emit "<slug>\t<provenance_project>" for every experts.jsonl line across all registered projects
collect_pairs() {
    local registry="$1" framework="$2" line proj f slug pp
    local -a sources=()
    [ -f "$registry" ] && while IFS= read -r proj; do
        [ -n "$proj" ] || continue
        case "$proj" in \#*) continue ;; esac
        sources+=("$proj/memory_bank/knowledge/experts.jsonl")
    done < "$registry"
    sources+=("$framework/memory_bank/knowledge/experts.jsonl")   # framework's own project
    for f in "${sources[@]}"; do
        [ -f "$f" ] || continue
        while IFS= read -r line; do
            [ -n "$line" ] || continue
            slug="$(sed -n 's/.*"domain_slug":"\([^"]*\)".*/\1/p' <<<"$line")"
            pp="$(sed -n 's/.*"provenance_project":"\([^"]*\)".*/\1/p' <<<"$line")"
            [ -n "$slug" ] && [ -n "$pp" ] && printf '%s\t%s\n' "$slug" "$pp"
        done < "$f"
    done
}

# distinct project count per slug -> "<count> <slug>" lines
distinct_counts() {
    sort -u | awk -F'\t' '{c[$1]++} END{for(s in c) print c[s], s}' | sort -rn
}

is_framework_shared() { [ -f "$1/agents/$2-expert.md" ]; }

# ── scan ─────────────────────────────────────────────────────────────────────
cmd_scan() {
    local threshold=3 registry="$FRAMEWORK_DIR/.project-registry" framework="$FRAMEWORK_DIR"
    while [ $# -gt 0 ]; do
        case "$1" in
            --threshold) threshold="$2"; shift 2 ;;
            --registry)  registry="$2"; shift 2 ;;
            --framework) framework="$2"; shift 2 ;;
            *) err "scan: unknown arg '$1'"; exit 2 ;;
        esac
    done
    local counts; counts="$(collect_pairs "$registry" "$framework" | distinct_counts || true)"
    if [ -z "$counts" ]; then info "No synthesized reviewers recorded across projects."; return 0; fi
    echo "Cross-project promotion scan (threshold ${threshold} distinct projects):"
    local found=0 count slug
    while read -r count slug; do
        [ -n "${slug:-}" ] || continue
        if [ "$count" -ge "$threshold" ]; then
            if is_framework_shared "$framework" "$slug"; then
                info "  · ${slug} (${count} projects) — already framework-shared; skipped"
            else
                ok "  ⚑ promote: ${slug}  (${count} distinct projects) — run:"
                echo "      bash scripts/promote-experts.sh promote --domain ${slug}"
                found=$((found+1))
            fi
        fi
    done <<< "$counts"
    [ "$found" -eq 0 ] && info "  (no new domains at/above threshold)"
    return 0
}

# find a project-local reviewer file for <slug>; echo its path or empty
find_source_reviewer() {
    local slug="$1" registry="$2" from="$3" proj f
    if [ -n "$from" ] && [ -f "$from/.claude/commands/$slug-expert.md" ]; then
        echo "$from/.claude/commands/$slug-expert.md"; return 0
    fi
    [ -f "$registry" ] && while IFS= read -r proj; do
        [ -n "$proj" ] || continue
        case "$proj" in \#*) continue ;; esac
        f="$proj/.claude/commands/$slug-expert.md"
        [ -f "$f" ] && { echo "$f"; return 0; }
    done < "$registry"
    return 1
}

# ── promote ──────────────────────────────────────────────────────────────────
cmd_promote() {
    local slug="" from="" registry="$FRAMEWORK_DIR/.project-registry" framework="$FRAMEWORK_DIR" force=0
    while [ $# -gt 0 ]; do
        case "$1" in
            --domain)    slug="$2"; shift 2 ;;
            --from)      from="$2"; shift 2 ;;
            --registry)  registry="$2"; shift 2 ;;
            --framework) framework="$2"; shift 2 ;;
            --force)     force=1; shift ;;
            *) err "promote: unknown arg '$1'"; exit 2 ;;
        esac
    done
    [ -n "$slug" ] || { err "promote: --domain required"; exit 2; }
    local dest="$framework/agents/${slug}-expert.md"
    if is_framework_shared "$framework" "$slug" && [ "$force" -eq 0 ]; then
        info "'${slug}-expert' is already framework-shared — nothing to do (use --force to refresh)."
        return 0
    fi
    local src; src="$(find_source_reviewer "$slug" "$registry" "$from" || true)"
    [ -n "$src" ] && [ -f "$src" ] || { err "no project-local '${slug}-expert' found to promote"; exit 1; }

    mkdir -p "$framework/agents"
    # generalize: project-scope → framework-scope in the provenance comment line
    sed -e 's/scope=project/scope=framework/g' \
        -e 's/provenance_project=[^ >]*/provenance_project=promoted-3plus/g' \
        -e 's/source_signal=[^ >]*/source_signal=promotion/g' \
        "$src" > "$dest"
    ok "✓ promoted  agents/${slug}-expert.md  (framework-shared, from $(basename "$(dirname "$(dirname "$src")")"))"

    # framework pack (scaffold if absent)
    local pack_dir="$framework/packs/${slug}"
    if [ ! -f "$pack_dir/pack.json" ] && [ -f "$PACK_SCAFFOLD/pack.json.tmpl" ]; then
        mkdir -p "$pack_dir/matrices"
        sed -e "s|{{DOMAIN_SLUG}}|$slug|g" -e "s|{{DOMAIN_TITLE}}|$slug|g" \
            -e "s|{{JURISDICTION}}|shared|g" -e "s|{{LANGUAGE}}|en|g" \
            -e "s|{{CREATED_AT}}|$(date -u +%Y-%m-%d)|g" \
            "$PACK_SCAFFOLD/pack.json.tmpl" > "$pack_dir/pack.json"
        [ -f "$pack_dir/rules.jsonl" ] || : > "$pack_dir/rules.jsonl"
        info "  ↳ scaffolded framework pack packs/${slug}/"
    fi

    # framework-level provenance
    local pfile="$framework/memory_bank/knowledge/experts.jsonl"
    mkdir -p "$(dirname "$pfile")"; [ -f "$pfile" ] || : > "$pfile"
    if ! grep -q "\"domain_slug\":\"$slug\".*\"scope\":\"framework\"" "$pfile" 2>/dev/null; then
        printf '{"domain_slug":"%s","scope":"framework","source_signal":"promotion","created_at":"%s"}\n' \
            "$slug" "$(date -u +%Y-%m-%d)" >> "$pfile"
    fi
    echo
    ok "Domain reviewer '${slug}-expert' is now framework-shared — every project inherits it."
}

main() {
    [ $# -ge 1 ] || { err "usage: promote-experts.sh {scan|promote} ..."; exit 2; }
    local sub="$1"; shift
    case "$sub" in
        scan)    cmd_scan "$@" ;;
        promote) cmd_promote "$@" ;;
        -h|--help) grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//' ;;
        *) err "unknown subcommand: $sub"; exit 2 ;;
    esac
}
main "$@"
