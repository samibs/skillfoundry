#!/usr/bin/env bash
# synth-expert.sh — Domain Expert Synthesis (review-only reviewers)
# Implements FR-002..FR-009 of genesis/2026-07-10-domain-expert-synthesis.md
#
# Subcommands:
#   slug "<free text>"                         Canonicalize free text to a domain slug
#   guard --domain <slug>                      Exit 0 = eligible, 10 = IT/already covered
#   synthesize --domain <slug> --jurisdiction <j> --language <l> [options]
#   list [--target <dir>]                      List synthesized reviewers + provenance
#
# synthesize options:
#   --title "<Title>"     Human title (default: derived from slug)
#   --signal <s>          self-flag | manual | promotion   (default: manual)
#   --project <name>      Provenance project (default: basename of target)
#   --target <dir>        Project root to write into        (default: cwd)
#   --confirm             Explicit human confirmation (skips the y/N prompt)
#   --force               Re-synthesize even if the reviewer already exists
#
# Safety: unattended (no TTY and no --confirm) NEVER creates a skill — it logs the gap
# and exits 20. Skills are only synthesized on an explicit human decision (FR-003).
set -euo pipefail

# ── locations ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_FILE="$FRAMEWORK_DIR/templates/expert-persona.md.tmpl"
PACK_SCAFFOLD="$FRAMEWORK_DIR/templates/pack.scaffold"

# ── colors (disabled when not a tty) ─────────────────────────────────────────
if [ -t 1 ]; then
    RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; BLUE=$'\033[0;34m'; NC=$'\033[0m'
else
    RED=""; GREEN=""; YELLOW=""; BLUE=""; NC=""
fi
err()  { echo "${RED}error:${NC} $*" >&2; }
info() { echo "${BLUE}$*${NC}"; }
ok()   { echo "${GREEN}$*${NC}"; }
warn() { echo "${YELLOW}$*${NC}"; }

# ── IT / already-covered denylist (FR-006) ───────────────────────────────────
# A slug touching any of these is an IT concern the framework already covers —
# never synthesize a domain reviewer for it.
IT_DENYLIST=(
    software api rest graphql database sql schema migration backend frontend ui ux
    devops infra infrastructure ci cd pipeline docker kubernetes k8s cloud aws gcp azure
    security auth authn authz jwt oauth crypto encryption testing test qa performance perf
    refactor architecture code coding programming javascript typescript python rust golang
    java csharp html css react angular vue node npm git github deployment observability
    logging monitoring caching networking algorithm datastructure
)

# ── helpers ──────────────────────────────────────────────────────────────────

# slugify "<free text>" -> canonical slug on stdout; exits 2 if the result is invalid.
slugify() {
    local raw="$1" s
    # transliterate accents to ASCII where possible (LU/FR/BE domains use accents)
    if command -v iconv >/dev/null 2>&1; then
        s="$(printf '%s' "$raw" | iconv -f UTF-8 -t ASCII//TRANSLIT 2>/dev/null || printf '%s' "$raw")"
    else
        s="$raw"
    fi
    s="$(printf '%s' "$s" | tr '[:upper:]' '[:lower:]')"
    s="$(printf '%s' "$s" | tr ' _/.' '-')"      # spaces, underscores, slashes, dots -> hyphen
    s="$(printf '%s' "$s" | tr -cd 'a-z0-9-')"   # drop everything else (kills ../ ; $ etc.)
    s="$(printf '%s' "$s" | tr -s '-')"          # collapse repeats
    s="${s#-}"; s="${s%-}"                        # trim ends
    if [ -z "$s" ] || [ "${#s}" -gt 64 ]; then
        err "cannot derive a valid slug from: '$raw'"
        return 2
    fi
    printf '%s\n' "$s"
}

# derive a Title Case name from a slug
title_from_slug() {
    printf '%s\n' "$1" | tr '-' ' ' | awk '{for(i=1;i<=NF;i++)$i=toupper(substr($i,1,1)) substr($i,2)}1'
}

# is_it_or_covered <slug> <target_dir> -> 0 if IT/covered, 1 if eligible
is_it_or_covered() {
    local slug="$1" target="$2" term
    for term in "${IT_DENYLIST[@]}"; do
        # match whole slug or a hyphen-bounded token
        case "-$slug-" in
            *-"$term"-*) COVER_REASON="IT concern ('$term') — already covered by the framework"; return 0 ;;
        esac
    done
    # existing skill in framework or target registries
    local d
    for d in "$FRAMEWORK_DIR/.claude/commands" "$FRAMEWORK_DIR/agents" \
             "$target/.claude/commands" "$target/agents"; do
        if [ -f "$d/$slug.md" ] || [ -f "$d/$slug-expert.md" ]; then
            COVER_REASON="a skill named '$slug' already exists in the registry"
            return 0
        fi
    done
    COVER_REASON=""
    return 1
}

# render <template-file> : reads placeholders from the exported R_* env, writes to stdout
render() {
    sed -e "s|{{DOMAIN_SLUG}}|$R_SLUG|g" \
        -e "s|{{DOMAIN_TITLE}}|$R_TITLE|g" \
        -e "s|{{JURISDICTION}}|$R_JUR|g" \
        -e "s|{{LANGUAGE}}|$R_LANG|g" \
        -e "s|{{SCOPE}}|$R_SCOPE|g" \
        -e "s|{{SOURCE_SIGNAL}}|$R_SIGNAL|g" \
        -e "s|{{CREATED_AT}}|$R_DATE|g" \
        -e "s|{{PROVENANCE_PROJECT}}|$R_PROJECT|g" \
        -e "s|{{BOUND_PACK}}|$R_BOUND_PACK|g" \
        "$1"
}

# ── subcommand: slug ─────────────────────────────────────────────────────────
cmd_slug() {
    [ $# -ge 1 ] || { err "usage: synth-expert.sh slug \"<free text>\""; exit 2; }
    slugify "$*"
}

# ── subcommand: guard ────────────────────────────────────────────────────────
cmd_guard() {
    local slug="" target="$PWD"
    while [ $# -gt 0 ]; do
        case "$1" in
            --domain) slug="$(slugify "$2")"; shift 2 ;;
            --target) target="$2"; shift 2 ;;
            *) err "guard: unknown arg '$1'"; exit 2 ;;
        esac
    done
    [ -n "$slug" ] || { err "guard: --domain required"; exit 2; }
    if is_it_or_covered "$slug" "$target"; then
        warn "BLOCKED ($slug): $COVER_REASON"
        exit 10
    fi
    ok "ELIGIBLE ($slug): non-IT and not in the registry"
    exit 0
}

# ── subcommand: synthesize ───────────────────────────────────────────────────
cmd_synthesize() {
    local slug="" jur="unknown" lang="en" title="" signal="manual" project="" target="$PWD"
    local confirm=0 force=0
    while [ $# -gt 0 ]; do
        case "$1" in
            --domain)       slug="$(slugify "$2")"; shift 2 ;;
            --jurisdiction) jur="$2"; shift 2 ;;
            --language)     lang="$2"; shift 2 ;;
            --title)        title="$2"; shift 2 ;;
            --signal)       signal="$2"; shift 2 ;;
            --project)      project="$2"; shift 2 ;;
            --target)       target="$2"; shift 2 ;;
            --confirm)      confirm=1; shift ;;
            --force)        force=1; shift ;;
            *) err "synthesize: unknown arg '$1'"; exit 2 ;;
        esac
    done
    [ -n "$slug" ] || { err "synthesize: --domain required"; exit 2; }
    [ -f "$TEMPLATE_FILE" ] || { err "template not found: $TEMPLATE_FILE"; exit 1; }
    target="$(cd "$target" && pwd)"                     # normalize + verify it exists
    [ -n "$title" ] || title="$(title_from_slug "$slug")"
    [ -n "$project" ] || project="$(basename "$target")"

    # FR-006 registry/IT guard
    if is_it_or_covered "$slug" "$target"; then
        warn "No reviewer synthesized — $COVER_REASON."
        info "Use the existing skill instead."
        exit 10
    fi

    local skill_file="$target/.claude/commands/${slug}-expert.md"
    local pack_dir="$target/packs/${slug}"
    local exists=0
    [ -f "$skill_file" ] && exists=1

    # FR-003 confirmation gate
    if [ "$exists" -eq 1 ] && [ "$force" -eq 0 ]; then
        info "Reviewer '${slug}-expert' already exists — updating in place (idempotent)."
    elif [ "$confirm" -eq 0 ]; then
        if [ -t 0 ]; then
            echo
            echo "  DOMAIN EXPERTISE GAP DETECTED"
            echo "  Domain:   $title    Jurisdiction: $jur    Language: $lang"
            echo "  Signal:   $signal"
            echo "  A review-only reviewer (no advice) + knowledge pack will be created:"
            echo "    ${skill_file#"$target"/}"
            echo "    packs/${slug}/"
            printf "  Create project-scoped reviewer? (y/N): "
            local reply=""; read -r reply || reply=""
            case "$reply" in
                y|Y) : ;;
                *) warn "Declined — nothing written."; exit 0 ;;
            esac
        else
            # unattended, no explicit confirmation → never create (FR-003)
            warn "Non-interactive and no --confirm: logging gap, not creating '${slug}-expert'."
            log_gap "$target" "$slug" "$jur" "$lang" "$signal"
            exit 20
        fi
    fi

    # ── render + write the reviewer skill ────────────────────────────────────
    export R_SLUG="$slug" R_TITLE="$title" R_JUR="$jur" R_LANG="$lang" \
           R_SCOPE="project" R_SIGNAL="$signal" R_DATE="$(date -u +%Y-%m-%d)" \
           R_PROJECT="$project" R_BOUND_PACK="packs/${slug}/"
    mkdir -p "$(dirname "$skill_file")"
    render "$TEMPLATE_FILE" > "$skill_file"
    if [ "$exists" -eq 1 ]; then ok "✓ updated  ${skill_file#"$target"/}"; else ok "✓ created  ${skill_file#"$target"/}"; fi

    # mirror to any other installed platform dirs (FR-004)
    local pdir
    for pdir in ".cursor/rules" ".gemini/skills" ".grok/skills" ".agents/skills" ".copilot/custom-agents"; do
        if [ -d "$target/$pdir" ]; then
            cp "$skill_file" "$target/$pdir/${slug}-expert.md"
            info "  ↳ mirrored to $pdir/"
        fi
    done

    # ── scaffold the bound knowledge pack (FR-005) ───────────────────────────
    mkdir -p "$pack_dir/matrices"
    if [ ! -f "$pack_dir/pack.json" ]; then
        render "$PACK_SCAFFOLD/pack.json.tmpl" > "$pack_dir/pack.json"
    fi
    if [ ! -f "$pack_dir/SOURCES.md" ]; then
        render "$PACK_SCAFFOLD/SOURCES.md.tmpl" > "$pack_dir/SOURCES.md"
    fi
    [ -f "$pack_dir/rules.jsonl" ] || : > "$pack_dir/rules.jsonl"   # empty on scaffold
    ok "✓ pack    packs/${slug}/ (pack.json, rules.jsonl, SOURCES.md)"

    # ── provenance (FR-009) — idempotent per (slug, project) ─────────────────
    record_provenance "$target" "$slug" "$jur" "$lang" "$signal" "$project" "$R_DATE"

    echo
    ok "Domain reviewer '${slug}-expert' ready (review-only). Populate packs/${slug}/rules.jsonl with real, cited terminology."
}

# append one provenance line unless (slug, project) already recorded
record_provenance() {
    local target="$1" slug="$2" jur="$3" lang="$4" signal="$5" project="$6" date="$7"
    local kdir="$target/memory_bank/knowledge"
    local pfile="$kdir/experts.jsonl"
    mkdir -p "$kdir"
    [ -f "$pfile" ] || : > "$pfile"
    if grep -q "\"domain_slug\":\"$slug\"" "$pfile" 2>/dev/null && \
       grep -q "\"provenance_project\":\"$project\"" "$pfile" 2>/dev/null; then
        # only skip if BOTH appear on the same line
        if grep -E "\"domain_slug\":\"$slug\"" "$pfile" | grep -q "\"provenance_project\":\"$project\""; then
            info "  provenance already recorded for ($slug, $project) — not duplicated"
            return 0
        fi
    fi
    printf '{"domain_slug":"%s","jurisdiction":"%s","language":"%s","scope":"project","source_signal":"%s","provenance_project":"%s","created_at":"%s"}\n' \
        "$slug" "$jur" "$lang" "$signal" "$project" "$date" >> "$pfile"
    info "  provenance recorded → memory_bank/knowledge/experts.jsonl"
}

# log a detected-but-declined gap (unattended path)
log_gap() {
    local target="$1" slug="$2" jur="$3" lang="$4" signal="$5"
    local ldir="$target/logs"; mkdir -p "$ldir"
    printf '{"event":"gap-declined","domain_slug":"%s","jurisdiction":"%s","language":"%s","signal":"%s","at":"%s"}\n' \
        "$slug" "$jur" "$lang" "$signal" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$ldir/domain-experts.log"
}

# ── subcommand: list ─────────────────────────────────────────────────────────
cmd_list() {
    local target="$PWD"
    while [ $# -gt 0 ]; do
        case "$1" in
            --target) target="$2"; shift 2 ;;
            *) err "list: unknown arg '$1'"; exit 2 ;;
        esac
    done
    local dir="$target/.claude/commands"
    shopt -s nullglob
    local files=("$dir"/*-expert.md)
    shopt -u nullglob
    if [ "${#files[@]}" -eq 0 ]; then
        info "No synthesized reviewers in $target."
        return 0
    fi
    printf "%-22s %-8s %-6s %-12s %s\n" "REVIEWER" "JURIS" "LANG" "SIGNAL" "PROJECT"
    local f prov
    for f in "${files[@]}"; do
        prov="$(grep -m1 '<!-- provenance:' "$f" || true)"
        local slug jur lang sig proj
        slug="$(sed -n 's/.*domain_slug=\([^ ]*\).*/\1/p' <<<"$prov")"
        jur="$(sed -n 's/.*jurisdiction=\([^ ]*\).*/\1/p' <<<"$prov")"
        lang="$(sed -n 's/.*language=\([^ ]*\).*/\1/p' <<<"$prov")"
        sig="$(sed -n 's/.*source_signal=\([^ ]*\).*/\1/p' <<<"$prov")"
        proj="$(sed -n 's/.*provenance_project=\([^ ]*\).*/\1/p' <<<"$prov")"
        printf "%-22s %-8s %-6s %-12s %s\n" "${slug:-?}-expert" "${jur:-?}" "${lang:-?}" "${sig:-?}" "${proj:-?}"
    done
}

# ── dispatch ─────────────────────────────────────────────────────────────────
main() {
    [ $# -ge 1 ] || { err "usage: synth-expert.sh {slug|guard|synthesize|list} ..."; exit 2; }
    local sub="$1"; shift
    case "$sub" in
        slug)       cmd_slug "$@" ;;
        guard)      cmd_guard "$@" ;;
        synthesize) cmd_synthesize "$@" ;;
        list)       cmd_list "$@" ;;
        -h|--help)  grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//' ;;
        *) err "unknown subcommand: $sub"; exit 2 ;;
    esac
}
main "$@"
