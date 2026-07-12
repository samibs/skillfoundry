#!/usr/bin/env bash
# prune-scan.sh — Dead-code & duplicate-code detector for the /prune skill.
#
# Detects, deterministically and with no required dependencies:
#   - duplicate blocks (copy-paste), via N-line window matching
#   - unused imports (JS/TS/Python), with a safe --fix that removes fully-unused import lines
#   - unused-export candidates (JS/TS), reported only (removal is a judgement call)
# With --deep and a package.json, it also runs real tools when present (jscpd, knip, depcheck).
#
# Subcommands:
#   scan [--path <dir>] [--min-lines N] [--deep] [--json]   Everything, summarized
#   duplicates [--path <dir>] [--min-lines N] [--json]      Copy-paste blocks (report only)
#   deadcode [--path <dir>] [--fix] [--json]                Unused imports (+export candidates)
#
# Safety: report-only by default. --fix removes ONLY import statements whose every binding is
# unused in that file (high precision, whole-line). It never touches duplicates or exports.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -t 1 ]; then
    RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; BLUE=$'\033[0;34m'; NC=$'\033[0m'
else RED=""; GREEN=""; YELLOW=""; BLUE=""; NC=""; fi
err()  { echo "${RED}error:${NC} $*" >&2; }
info() { echo "${BLUE}$*${NC}"; }
ok()   { echo "${GREEN}$*${NC}"; }
warn() { echo "${YELLOW}$*${NC}"; }

# ── source-file discovery (excludes vendored/generated) ──────────────────────
list_sources() {
    local path="$1"
    find "$path" -type f \( \
        -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \
        -o -name '*.mjs' -o -name '*.cjs' -o -name '*.py' -o -name '*.go' \
        -o -name '*.rs' -o -name '*.java' -o -name '*.rb' \) \
        -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' \
        -not -path '*/build/*' -not -path '*/.next/*' -not -path '*/vendor/*' \
        -not -path '*/__pycache__/*' -not -path '*/coverage/*' -not -path '*/.venv/*' \
        -not -name '*.min.js' -not -name '*.d.ts' -not -name '*.bundle.js' 2>/dev/null | sort
}

# ── duplicate detection (window hashing, dependency-free) ────────────────────
# emits: "<count>\t<first loc>\t<other locs>" per duplicated N-line block
find_duplicates() {
    local path="$1" n="$2" tmp
    tmp="$(mktemp)"
    local f
    while IFS= read -r f; do
        [ -f "$f" ] || continue
        awk -v N="$n" -v F="$f" '
            function trivial(s){
                return (s ~ /^[[:space:]]*$/ \
                    || s ~ /^[[:space:]]*[{}()\[\];,.:]+[[:space:]]*$/ \
                    || s ~ /^[[:space:]]*(\/\/|#|\*|\/\*|\*\/)/)
            }
            {
                if (trivial($0)) next
                norm=$0; gsub(/[[:space:]]+/," ",norm); sub(/^ /,"",norm); sub(/ $/,"",norm)
                k[++m]=norm; ln[m]=NR
            }
            END{
                for(i=1;i+N-1<=m;i++){
                    key=k[i]; for(j=1;j<N;j++) key=key "\x1f" k[i+j]
                    print key "\t" F ":" ln[i]
                }
            }' "$f" >> "$tmp"
    done < <(list_sources "$path")

    # group identical keys; report those seen in >=2 locations
    sort "$tmp" | awk -F'\t' '
        { c[$1]++; if(c[$1]==1) first[$1]=$2; else if(c[$1]<=6) more[$1]=more[$1]" "$2 }
        END{ for(k in c) if(c[k]>=2) print c[k] "\t" first[k] "\t" more[k] }' | sort -rn
    rm -f "$tmp"
}

# ── unused imports + export candidates (JS/TS/Python) ────────────────────────
# analyze_file emits findings (UNUSED-IMPORT / PARTIAL-IMPORT). Pure detection — never mutates.
# Removal is done separately by fix_file so line-number shifts can't corrupt it.
analyze_file() {
    local f="$1"
    case "$f" in
        *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) analyze_js "$f" ;;
        *.py) analyze_py "$f" ;;
    esac
}

# Remove every fully-unused import line for a file, in DESCENDING line order so earlier
# deletions don't shift later line numbers. Prints the count removed on stdout.
fix_file() {
    local f="$1" lines ln n=0
    lines="$(analyze_file "$f" | awk -F'|' '$1=="UNUSED-IMPORT"{split($2,a,":"); print a[length(a)]}' | sort -rn -u)"
    for ln in $lines; do sed -i "${ln}d" "$f"; n=$((n+1)); done
    echo "$n"
}

# name used in the file body outside its own import line(s)?
name_used_in_body() {
    local f="$1" name="$2"
    # strip import lines, then word-match the identifier
    grep -vE '^\s*(import|export\s+\{|const\s+\{[^}]*\}\s*=\s*require)' "$f" 2>/dev/null \
        | grep -qwF "$name"
}

analyze_js() {
    local f="$1" lineno binding names name used_any
    # named imports:  import { A, B as C } from '...'
    while IFS= read -r lineno; do
        [ -n "$lineno" ] || continue
        local line; line="$(sed -n "${lineno}p" "$f")"
        binding="$(printf '%s' "$line" | sed -n 's/.*import[^{]*{\([^}]*\)}.*/\1/p')"
        [ -n "$binding" ] || continue
        names="$(printf '%s' "$binding" | tr ',' '\n' | sed -E 's/.* as //; s/^[[:space:]]*//; s/[[:space:]]*$//' | grep -v '^$')"
        used_any=0
        local unused=""
        while IFS= read -r name; do
            [ -n "$name" ] || continue
            if name_used_in_body "$f" "$name"; then used_any=1; else unused="$unused $name"; fi
        done <<< "$names"
        if [ -z "$unused" ]; then continue; fi
        if [ "$used_any" -eq 0 ]; then
            echo "UNUSED-IMPORT|$f:$lineno|whole import unused:$unused"
        else
            echo "PARTIAL-IMPORT|$f:$lineno|unused bindings:$unused (review)"
        fi
    done < <(grep -nE '^\s*import\s*\{' "$f" 2>/dev/null | cut -d: -f1)

    # default / namespace imports:  import X from '...'   |  import * as NS from '...'
    while IFS= read -r lineno; do
        [ -n "$lineno" ] || continue
        local line; line="$(sed -n "${lineno}p" "$f")"
        name="$(printf '%s' "$line" | sed -nE "s/^\s*import\s+(\*\s+as\s+)?([A-Za-z0-9_\$]+)\s+from.*/\2/p")"
        [ -n "$name" ] || continue
        if ! name_used_in_body "$f" "$name"; then
            echo "UNUSED-IMPORT|$f:$lineno|unused default/namespace: $name"
        fi
    done < <(grep -nE '^\s*import\s+(\*\s+as\s+)?[A-Za-z0-9_\$]+\s+from' "$f" 2>/dev/null | cut -d: -f1)
}

analyze_py() {
    local f="$1" lineno name
    #  from x import a, b   |   import os
    while IFS= read -r lineno; do
        [ -n "$lineno" ] || continue
        local line; line="$(sed -n "${lineno}p" "$f")"
        local names
        if printf '%s' "$line" | grep -qE '^\s*from\s'; then
            names="$(printf '%s' "$line" | sed -E 's/^\s*from\s+\S+\s+import\s+//' | tr ',' '\n' | sed -E 's/.* as //; s/[[:space:]]//g' | grep -v '^$')"
        else
            names="$(printf '%s' "$line" | sed -E 's/^\s*import\s+//' | tr ',' '\n' | sed -E 's/.* as //; s/[[:space:]]//g; s/\..*//' | grep -v '^$')"
        fi
        local unused="" used_any=0
        while IFS= read -r name; do
            [ -n "$name" ] || continue
            if grep -vE '^\s*(from|import)\s' "$f" | grep -qwF "$name"; then used_any=1; else unused="$unused $name"; fi
        done <<< "$names"
        [ -z "$unused" ] && continue
        if [ "$used_any" -eq 0 ]; then
            echo "UNUSED-IMPORT|$f:$lineno|whole import unused:$unused"
        else
            echo "PARTIAL-IMPORT|$f:$lineno|unused:$unused (review)"
        fi
    done < <(grep -nE '^\s*(from\s+\S+\s+import|import)\s' "$f" 2>/dev/null | cut -d: -f1)
}

# unused-export candidates (JS/TS): exported name never imported/used anywhere in the tree
find_unused_exports() {
    local path="$1" f name def_file
    while IFS= read -r f; do
        case "$f" in *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;; *) continue ;; esac
        while IFS= read -r name; do
            [ -n "$name" ] || continue
            # count references across the tree, excluding the definition line
            local refs
            refs="$(list_sources "$path" | xargs grep -lwF "$name" 2>/dev/null | grep -cv "^$f$" || true)"
            # also count in-file uses beyond the export def
            local selfuse
            selfuse="$(grep -vnE "export\s+(default\s+)?(async\s+)?(function|const|class|interface|type|enum)\s+$name\b" "$f" | grep -cwF "$name" || true)"
            if [ "${refs:-0}" -eq 0 ] && [ "${selfuse:-0}" -eq 0 ]; then
                echo "UNUSED-EXPORT|$f|$name (candidate — verify: not an entry point / dynamic ref)"
            fi
        done < <(grep -oE 'export\s+(default\s+)?(async\s+)?(function|const|class|interface|type|enum)\s+[A-Za-z0-9_\$]+' "$f" 2>/dev/null \
                    | sed -E 's/.*(function|const|class|interface|type|enum)\s+//')
    done < <(list_sources "$path")
}

# ── deep mode: real tools when available ─────────────────────────────────────
run_deep_tools() {
    local path="$1"
    if [ -f "$path/package.json" ] && command -v npx >/dev/null 2>&1; then
        info "deep: knip (unused files/exports/deps)"; npx --no-install knip 2>/dev/null || warn "  knip not installed (npx --no-install)"
        info "deep: depcheck (unused dependencies)"; npx --no-install depcheck "$path" 2>/dev/null || warn "  depcheck not installed"
        info "deep: jscpd (clone detection)"; npx --no-install jscpd "$path" 2>/dev/null || warn "  jscpd not installed"
    else
        warn "deep tools skipped (no package.json or npx). Fallback detection already ran."
    fi
}

# ── subcommands ──────────────────────────────────────────────────────────────
cmd_duplicates() {
    local path="$PWD" n=6
    while [ $# -gt 0 ]; do case "$1" in
        --path) path="$2"; shift 2;; --min-lines) n="$2"; shift 2;; --json) shift;;
        *) err "duplicates: unknown arg '$1'"; exit 2;; esac; done
    echo "Duplicate blocks (>= $n lines, normalized):"
    local found=0
    while IFS=$'\t' read -r count first more; do
        [ -n "${count:-}" ] || continue
        ok "  ${count}× starting at ${first}${more:+  also:$more}"
        found=$((found+1))
    done < <(find_duplicates "$path" "$n")
    [ "$found" -eq 0 ] && info "  none found" || warn "  $found duplicated block(s) — extract a shared function/module"
    return 0
}

cmd_deadcode() {
    local path="$PWD" fix=0
    while [ $# -gt 0 ]; do case "$1" in
        --path) path="$2"; shift 2;; --fix) fix=1; shift;; --json) shift;;
        *) err "deadcode: unknown arg '$1'"; exit 2;; esac; done
    local FIXED=0
    echo "Dead code:"
    local f imports=0 exports=0 finding
    while IFS= read -r f; do
        while IFS= read -r finding; do
            [ -n "$finding" ] || continue
            case "$finding" in
                UNUSED-IMPORT*|PARTIAL-IMPORT*) ok "  ${finding//|/  }"; imports=$((imports+1)) ;;
            esac
        done < <(analyze_file "$f")
        # remove fully-unused imports (descending line order, safe subset only)
        if [ "$fix" -eq 1 ]; then FIXED=$((FIXED + $(fix_file "$f") )); fi
    done < <(list_sources "$path")
    while IFS= read -r finding; do
        [ -n "$finding" ] || continue
        warn "  ${finding//|/  }"; exports=$((exports+1))
    done < <(find_unused_exports "$path")
    echo
    info "  unused/partial imports: $imports    unused-export candidates: $exports"
    [ "$fix" -eq 1 ] && ok "  removed $FIXED fully-unused import line(s)"
    [ "$fix" -eq 0 ] && [ "$imports" -gt 0 ] && info "  re-run with --fix to remove fully-unused imports (safe subset only)"
    return 0
}

cmd_scan() {
    local path="$PWD" n=6 deep=0
    while [ $# -gt 0 ]; do case "$1" in
        --path) path="$2"; shift 2;; --min-lines) n="$2"; shift 2;; --deep) deep=1; shift;; --json) shift;;
        *) err "scan: unknown arg '$1'"; exit 2;; esac; done
    path="$(cd "$path" && pwd)"
    echo "════ /prune scan: $path ════"
    cmd_duplicates --path "$path" --min-lines "$n"
    echo
    cmd_deadcode --path "$path"
    if [ "$deep" -eq 1 ]; then echo; echo "════ deep tools ════"; run_deep_tools "$path"; fi
    return 0
}

main() {
    [ $# -ge 1 ] || { err "usage: prune-scan.sh {scan|duplicates|deadcode} [opts]"; exit 2; }
    local sub="$1"; shift
    case "$sub" in
        scan) cmd_scan "$@" ;;
        duplicates) cmd_duplicates "$@" ;;
        deadcode) cmd_deadcode "$@" ;;
        -h|--help) grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//' ;;
        *) err "unknown subcommand: $sub"; exit 2 ;;
    esac
}
main "$@"
