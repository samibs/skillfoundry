#!/usr/bin/env bash
# scripts/lib/story-index.sh
#
# INDEX.md regeneration for the story folder state machine.
# (Phase 2 of genesis/2026-05-08-folder-state-and-checkbox-reconciler.md)
#
# Public API:
#   regenerate_story_index <feature_dir>
#
# Properties:
#   - Deterministic output: stories sorted by ID, no timestamps, no run-specific
#     metadata in the file. Re-running with no story changes produces zero diff.
#   - State folders recognised: in-progress, blocked, todo, done.
#     Stories at the feature root (pre-migration) are listed under "Unmigrated".
#   - Title: parsed from the first `# STORY-...` heading, with the leading
#     "STORY-XXX " or "STORY-XXX — " stripped. Falls back to the filename.
#   - Dependencies: parsed from YAML frontmatter `depends_on:` (inline list or
#     block list). Best-effort — if frontmatter is malformed, deps are omitted.
#
# Note: this is a sourced library — it intentionally does NOT enable `set -u`
# or `set -e`, since those leak into the caller's shell. Entry-point scripts
# that source this lib are responsible for their own strict modes.

# shellcheck disable=SC2034
STORY_INDEX_LIB_VERSION="1.0.0"

_idx_log() {
    printf 'story-index level=%s %s\n' "$1" "$2" >&2
}

_idx_extract_title() {
    # Read up to the first ~30 lines, find the first H1 that mentions STORY-
    # and return the cleaned title.
    local file="$1" title=""
    title="$(awk '
        /^# +STORY-/ {
            sub(/^# +/, "")
            sub(/^STORY-[0-9]+[[:space:]]*[—:-][[:space:]]*/, "")
            sub(/^STORY-[0-9]+[[:space:]]+/, "")
            print
            exit
        }
        NR > 30 { exit }
    ' "$file")"

    if [ -z "$title" ]; then
        title="$(basename -- "$file" .md)"
    fi
    printf '%s\n' "$title"
}

_idx_extract_story_id() {
    # Pull STORY-NNN from the filename. If the filename doesn't match,
    # fall back to the filename without .md.
    local base id
    base="$(basename -- "$1" .md)"
    if [[ "$base" =~ ^(STORY-[0-9]+) ]]; then
        id="${BASH_REMATCH[1]}"
    else
        id="$base"
    fi
    printf '%s\n' "$id"
}

_idx_extract_depends_on() {
    # Parse `depends_on:` from YAML frontmatter (between leading `---` lines).
    # Supports inline `depends_on: [A, B]` and block `depends_on:\n  - A\n  - B`.
    # Echoes a comma+space separated list. Empty if none / not parseable.
    local file="$1"
    awk '
        BEGIN { in_fm = 0; in_block = 0; out = "" }
        NR == 1 && /^---[[:space:]]*$/ { in_fm = 1; next }
        in_fm && /^---[[:space:]]*$/ { exit }
        !in_fm { exit }
        in_block {
            if (match($0, /^[[:space:]]*-[[:space:]]+(STORY-[0-9]+)/, a)) {
                out = (out == "" ? a[1] : out ", " a[1])
                next
            } else {
                in_block = 0
            }
        }
        match($0, /^[[:space:]]*depends_on:[[:space:]]*\[([^]]*)\]/, m) {
            ids = m[1]
            gsub(/[[:space:]]+/, "", ids)
            n = split(ids, parts, ",")
            for (i = 1; i <= n; i++) {
                if (parts[i] != "") {
                    out = (out == "" ? parts[i] : out ", " parts[i])
                }
            }
            next
        }
        match($0, /^[[:space:]]*depends_on:[[:space:]]*$/) {
            in_block = 1
            next
        }
        END { print out }
    ' "$file"
}

_idx_list_stories_in() {
    # _idx_list_stories_in <dir>
    # Print one line per STORY-*.md found, sorted by story id.
    # Format: <story_id>\t<absolute_path>
    local dir="$1"
    [ -d "$dir" ] || return 0
    find "$dir" -maxdepth 1 -type f -name 'STORY-*.md' 2>/dev/null \
        | while IFS= read -r f; do
            printf '%s\t%s\n' "$(_idx_extract_story_id "$f")" "$f"
        done \
        | sort
}

_idx_emit_section() {
    # _idx_emit_section <heading> <feature_dir> <state_folder>
    local heading="$1" feature_dir="$2" state="$3"
    local dir="$feature_dir/$state"
    local rows=""
    while IFS=$'\t' read -r id path; do
        [ -z "$id" ] && continue
        local title deps
        title="$(_idx_extract_title "$path")"
        deps="$(_idx_extract_depends_on "$path")"
        local rel
        rel="$(basename -- "$path")"
        if [ -n "$deps" ]; then
            rows="${rows}| ${id} | ${title} | [${rel}](${state}/${rel}) | ${deps} |"$'\n'
        else
            rows="${rows}| ${id} | ${title} | [${rel}](${state}/${rel}) | — |"$'\n'
        fi
    done < <(_idx_list_stories_in "$dir")

    if [ -z "$rows" ]; then
        return 0
    fi

    printf '\n## %s\n\n' "$heading"
    printf '| Story | Title | File | Depends on |\n'
    printf '|-------|-------|------|------------|\n'
    printf '%s' "$rows"
}

_idx_emit_unmigrated_section() {
    # Stories sitting at the feature root (no state folder) — pre-migration.
    local feature_dir="$1"
    local rows=""
    while IFS=$'\t' read -r id path; do
        [ -z "$id" ] && continue
        local title deps rel
        title="$(_idx_extract_title "$path")"
        deps="$(_idx_extract_depends_on "$path")"
        rel="$(basename -- "$path")"
        if [ -n "$deps" ]; then
            rows="${rows}| ${id} | ${title} | [${rel}](${rel}) | ${deps} |"$'\n'
        else
            rows="${rows}| ${id} | ${title} | [${rel}](${rel}) | — |"$'\n'
        fi
    done < <(_idx_list_stories_in "$feature_dir")

    if [ -z "$rows" ]; then
        return 0
    fi

    printf '\n## Unmigrated (no state folder)\n\n'
    printf '> These stories live at the feature root. Run\n'
    printf '> `scripts/migrate-stories-to-folders.sh %s` to move them into state folders.\n\n' "$feature_dir"
    printf '| Story | Title | File | Depends on |\n'
    printf '|-------|-------|------|------------|\n'
    printf '%s' "$rows"
}

regenerate_story_index() {
    # regenerate_story_index <feature_dir>
    # Writes <feature_dir>/INDEX.md. Returns 0 on success, non-zero on I/O error.
    local feature_dir="$1"
    if [ -z "$feature_dir" ] || [ ! -d "$feature_dir" ]; then
        _idx_log error "feature-dir-missing:$feature_dir"
        return 1
    fi

    local feature_name
    feature_name="$(basename -- "$feature_dir")"

    local index="$feature_dir/INDEX.md"
    local tmp
    tmp="$(mktemp -- "${index}.idx.XXXXXX")" || {
        _idx_log error "mktemp-failed:$index"
        return 1
    }
    # shellcheck disable=SC2064
    trap "rm -f -- '$tmp'" RETURN

    {
        printf '# %s — Story Index\n\n' "$feature_name"
        printf '> Auto-generated by `scripts/lib/story-index.sh`. Do not edit by hand —\n'
        printf '> changes will be overwritten the next time a story moves between states.\n'

        _idx_emit_section "In Progress" "$feature_dir" "in-progress"
        _idx_emit_section "Blocked"     "$feature_dir" "blocked"
        _idx_emit_section "To Do"       "$feature_dir" "todo"
        _idx_emit_section "Done"        "$feature_dir" "done"
        _idx_emit_unmigrated_section    "$feature_dir"

        printf '\n'
    } > "$tmp"

    # Only replace the existing INDEX.md if content actually differs — keeps
    # `git status` clean when nothing meaningful changed (R-003 mitigation).
    if [ -f "$index" ] && cmp -s "$tmp" "$index"; then
        rm -f -- "$tmp"
        return 0
    fi

    if ! mv -- "$tmp" "$index"; then
        _idx_log error "mv-failed:$index"
        return 1
    fi
    return 0
}
