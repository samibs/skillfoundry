#!/usr/bin/env bash
# domain-gap-scan.sh — Phase 2 detection triggers for Domain Expert Synthesis
# Implements FR-012 (behavioral: same domain corrected 3+ times) and
#            FR-013 (declared: PRD `domains:` field).
# Both reuse synth-expert.sh's slug + guard so IT/covered domains are never surfaced.
#
# Subcommands:
#   record --domain <slug|free text> [--target <dir>]
#       Log one domain-correction event (behavioral signal source). Called by an agent
#       each time it revises specialized non-IT output (see agents/_domain-gap-protocol.md).
#   scan [--threshold N] [--target <dir>]
#       Count corrections per domain; report domains at/above the threshold (default 3)
#       that pass the guard and have no reviewer yet, as synthesis candidates.
#   from-prd <prd-file> [--target <dir>]
#       Read the PRD front-matter `domains:` list; report each as a declared candidate.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNTH="$SCRIPT_DIR/synth-expert.sh"

if [ -t 1 ]; then
    RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; BLUE=$'\033[0;34m'; NC=$'\033[0m'
else RED=""; GREEN=""; YELLOW=""; BLUE=""; NC=""; fi
err()  { echo "${RED}error:${NC} $*" >&2; }
info() { echo "${BLUE}$*${NC}"; }
ok()   { echo "${GREEN}$*${NC}"; }
warn() { echo "${YELLOW}$*${NC}"; }

corrections_file() { echo "$1/memory_bank/knowledge/domain-corrections.jsonl"; }

# canonical slug via synth-expert (single source of truth)
to_slug() { bash "$SYNTH" slug "$1"; }

# eligible <slug> <target> -> 0 if non-IT, uncovered, and no reviewer yet
eligible() {
    local slug="$1" target="$2"
    bash "$SYNTH" guard --domain "$slug" --target "$target" >/dev/null 2>&1 || return 1
    [ -f "$target/.claude/commands/${slug}-expert.md" ] && return 1   # already has a reviewer
    return 0
}

# ── record ───────────────────────────────────────────────────────────────────
cmd_record() {
    local raw="" target="$PWD"
    while [ $# -gt 0 ]; do
        case "$1" in
            --domain) raw="$2"; shift 2 ;;
            --target) target="$2"; shift 2 ;;
            *) err "record: unknown arg '$1'"; exit 2 ;;
        esac
    done
    [ -n "$raw" ] || { err "record: --domain required"; exit 2; }
    local slug; slug="$(to_slug "$raw")"
    target="$(cd "$target" && pwd)"
    local f; f="$(corrections_file "$target")"
    mkdir -p "$(dirname "$f")"; [ -f "$f" ] || : > "$f"
    printf '{"event":"domain-correction","domain_slug":"%s","at":"%s"}\n' \
        "$slug" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$f"
    info "recorded domain-correction: $slug"
}

# ── scan (behavioral, FR-012) ────────────────────────────────────────────────
cmd_scan() {
    local threshold=3 target="$PWD"
    while [ $# -gt 0 ]; do
        case "$1" in
            --threshold) threshold="$2"; shift 2 ;;
            --target)    target="$2"; shift 2 ;;
            *) err "scan: unknown arg '$1'"; exit 2 ;;
        esac
    done
    target="$(cd "$target" && pwd)"
    local f; f="$(corrections_file "$target")"
    if [ ! -s "$f" ]; then info "No domain corrections recorded in ${target}."; return 0; fi

    # count per slug (grep the field — no jq dependency)
    local counts; counts="$(grep -oE '"domain_slug":"[^"]+"' "$f" | sed 's/.*:"//;s/"$//' | sort | uniq -c | sort -rn)"

    local found=0
    echo "Behavioral domain-gap scan (threshold ${threshold}):"
    while read -r count slug; do
        [ -n "${slug:-}" ] || continue
        if [ "$count" -ge "$threshold" ]; then
            if eligible "$slug" "$target"; then
                ok "  ⚑ candidate: ${slug}  (${count} corrections) — propose:"
                echo "      bash scripts/synth-expert.sh synthesize --domain ${slug} --jurisdiction <j> --language <l> --signal behavioral"
                found=$((found+1))
            else
                info "  · ${slug} (${count}) — IT/covered or reviewer exists; skipped"
            fi
        fi
    done <<< "$counts"
    [ "$found" -eq 0 ] && info "  (no new eligible domains at/above threshold)"
    return 0
}

# ── from-prd (declared, FR-013) ──────────────────────────────────────────────
# Extracts the front-matter `domains:` value; supports inline [a, b] and block lists.
extract_prd_domains() {
    local prd="$1"
    awk '
        NR==1 && $0=="---" { infm=1; next }
        infm && $0=="---"  { exit }
        infm && /^[[:space:]]*domains:[[:space:]]*\[/ {
            line=$0; sub(/^[^\[]*\[/,"",line); sub(/\].*$/,"",line);
            n=split(line, a, ","); for(i=1;i<=n;i++){ gsub(/^[[:space:]"'"'"']+|[[:space:]"'"'"']+$/,"",a[i]); if(a[i]!="") print a[i] } next
        }
        infm && /^[[:space:]]*domains:[[:space:]]*$/ { inlist=1; next }
        infm && inlist && /^[[:space:]]*-[[:space:]]*/ { v=$0; sub(/^[[:space:]]*-[[:space:]]*/,"",v); gsub(/^[[:space:]"'"'"']+|[[:space:]"'"'"']+$/,"",v); if(v!="") print v; next }
        infm && inlist { inlist=0 }
    ' "$prd"
}

cmd_from_prd() {
    local prd="" target="$PWD"
    while [ $# -gt 0 ]; do
        case "$1" in
            --target) target="$2"; shift 2 ;;
            -*) err "from-prd: unknown arg '$1'"; exit 2 ;;
            *) prd="$1"; shift ;;
        esac
    done
    [ -n "$prd" ] && [ -f "$prd" ] || { err "from-prd: PRD file required and must exist"; exit 2; }
    target="$(cd "$target" && pwd)"
    local raw_domains; raw_domains="$(extract_prd_domains "$prd" || true)"
    if [ -z "$raw_domains" ]; then info "No 'domains:' declared in $(basename "$prd")."; return 0; fi

    echo "Declared domains in $(basename "$prd"):"
    local d slug
    while read -r d; do
        [ -n "${d:-}" ] || continue
        slug="$(to_slug "$d" 2>/dev/null || echo "")"
        [ -n "$slug" ] || { warn "  · '$d' — could not derive a slug; skipped"; continue; }
        if eligible "$slug" "$target"; then
            ok "  ⚑ candidate: ${slug} — propose:"
            echo "      bash scripts/synth-expert.sh synthesize --domain ${slug} --jurisdiction <j> --language <l> --signal declared"
        else
            info "  · ${slug} — IT/covered or reviewer exists; skipped"
        fi
    done <<< "$raw_domains"
    return 0
}

main() {
    [ $# -ge 1 ] || { err "usage: domain-gap-scan.sh {record|scan|from-prd} ..."; exit 2; }
    local sub="$1"; shift
    case "$sub" in
        record)   cmd_record "$@" ;;
        scan)     cmd_scan "$@" ;;
        from-prd) cmd_from_prd "$@" ;;
        -h|--help) grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//' ;;
        *) err "unknown subcommand: $sub"; exit 2 ;;
    esac
}
main "$@"
