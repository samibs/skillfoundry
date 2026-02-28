#!/usr/bin/env bash

# Social Media Publisher
# Publishes posts to X (Twitter) and LinkedIn via their REST APIs.
# Supports single posts, threads, history tracking, and dry-run mode.
# Can be sourced by other scripts for the publish functions.
#
# USAGE:
#   ./scripts/social-publish.sh publish <platform> "<content>"
#   ./scripts/social-publish.sh thread <platform> <content-file>
#   ./scripts/social-publish.sh history [platform] [--last=N]
#   ./scripts/social-publish.sh status
#   ./scripts/social-publish.sh setup
#   ./scripts/social-publish.sh --help

set -e
set -o pipefail

# ═══════════════════════════════════════════════════════════════
# CONSTANTS
# ═══════════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"

CONFIG_FILE="$PROJECT_DIR/.claude/social-media.json"
HISTORY_FILE="$PROJECT_DIR/.claude/social-media-posts.jsonl"

# Platform limits
X_CHAR_LIMIT=280
LINKEDIN_CHAR_LIMIT=3000

# API endpoints
X_API_BASE="https://api.x.com/2"
LINKEDIN_API_BASE="https://api.linkedin.com/rest"

# ═══════════════════════════════════════════════════════════════
# HELP
# ═══════════════════════════════════════════════════════════════

show_help() {
    echo -e "${BOLD}Social Media Publisher${NC}"
    echo ""
    echo "Publishes posts to X (Twitter) and LinkedIn via their REST APIs."
    echo "Supports single posts, threads, history tracking, and dry-run mode."
    echo ""
    echo -e "${BOLD}USAGE:${NC}"
    echo "  ./scripts/social-publish.sh <command> [args] [flags]"
    echo ""
    echo -e "${BOLD}COMMANDS:${NC}"
    echo "  publish <platform> \"<content>\"    Publish a post to X or LinkedIn"
    echo "  thread  <platform> <file>          Post a thread (sections split by ---)"
    echo "  history [platform] [--last=N]      Show post history (default: last 20)"
    echo "  status                             Check API connectivity and token validity"
    echo "  setup                              Interactive setup wizard for API tokens"
    echo "  config                             Show current configuration"
    echo ""
    echo -e "${BOLD}PLATFORMS:${NC}"
    echo "  x, twitter       X (formerly Twitter) — 280 char limit"
    echo "  linkedin, li      LinkedIn — 3000 char limit"
    echo ""
    echo -e "${BOLD}FLAGS:${NC}"
    echo "  --dry-run          Preview post without publishing"
    echo "  --no-confirm       Skip confirmation prompt"
    echo "  --json             Output results as JSON"
    echo "  --hashtags=\"a,b\"   Append hashtags to content"
    echo ""
    echo -e "${BOLD}CONFIGURATION:${NC}"
    echo "  Config file: .claude/social-media.json"
    echo "  History log: .claude/social-media-posts.jsonl"
    echo ""
    echo "  Environment variable overrides (take precedence over config):"
    echo "    CLAUDE_AS_X_BEARER_TOKEN          X API Bearer token"
    echo "    CLAUDE_AS_LINKEDIN_ACCESS_TOKEN    LinkedIn OAuth 2.0 access token"
    echo "    CLAUDE_AS_LINKEDIN_PERSON_URN      LinkedIn person URN (urn:li:person:ID)"
    echo ""
    echo -e "${BOLD}EXAMPLES:${NC}"
    echo "  # First-time setup"
    echo "  ./scripts/social-publish.sh setup"
    echo ""
    echo "  # Publish to X"
    echo "  ./scripts/social-publish.sh publish x \"Just shipped v2.0.19!\""
    echo ""
    echo "  # Publish to LinkedIn"
    echo "  ./scripts/social-publish.sh publish linkedin \"Excited to announce our latest release\""
    echo ""
    echo "  # Dry-run (preview without posting)"
    echo "  ./scripts/social-publish.sh publish x \"Test post\" --dry-run"
    echo ""
    echo "  # Thread from file (sections separated by ---)"
    echo "  ./scripts/social-publish.sh thread x ./thread-content.txt"
    echo ""
    echo "  # Check API status"
    echo "  ./scripts/social-publish.sh status"
    echo ""
    echo "  # View history"
    echo "  ./scripts/social-publish.sh history --last=10"
    echo "  ./scripts/social-publish.sh history x"
    echo ""
    echo -e "${BOLD}SOURCING (for use in other scripts):${NC}"
    echo "  source ./scripts/social-publish.sh"
    echo "  social_publish x \"Hello from my script!\""
}

# ═══════════════════════════════════════════════════════════════
# LOGGING HELPERS
# ═══════════════════════════════════════════════════════════════

log_info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ═══════════════════════════════════════════════════════════════
# DEPENDENCY CHECK
# ═══════════════════════════════════════════════════════════════

check_dependencies() {
    local missing=()
    command -v curl  >/dev/null 2>&1 || missing+=("curl")
    command -v jq    >/dev/null 2>&1 || missing+=("jq")

    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing required dependencies: ${missing[*]}"
        echo "  Install with: sudo apt install ${missing[*]}"
        return 1
    fi
    return 0
}

# ═══════════════════════════════════════════════════════════════
# CONFIG MANAGEMENT
# ═══════════════════════════════════════════════════════════════

default_config() {
    cat <<'EOF'
{
  "x_bearer_token": "",
  "linkedin_access_token": "",
  "linkedin_person_urn": "",
  "confirm_before_post": true,
  "dry_run": false,
  "default_hashtags": []
}
EOF
}

ensure_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        mkdir -p "$(dirname "$CONFIG_FILE")"
        default_config > "$CONFIG_FILE"
    fi
}

get_config_value() {
    local path="$1"
    local default="${2:-}"
    if [ -f "$CONFIG_FILE" ]; then
        local val
        val=$(jq -r "$path" "$CONFIG_FILE" 2>/dev/null)
        if [ "$val" != "null" ] && [ -n "$val" ]; then
            echo "$val"
            return
        fi
    fi
    echo "$default"
}

save_config_value() {
    local path="$1"
    local value="$2"
    ensure_config
    local tmp
    tmp=$(mktemp)
    jq "$path = \"$value\"" "$CONFIG_FILE" > "$tmp" && mv "$tmp" "$CONFIG_FILE"
}

# ═══════════════════════════════════════════════════════════════
# TOKEN RESOLUTION (env vars take precedence over config)
# ═══════════════════════════════════════════════════════════════

get_x_token() {
    local token="${CLAUDE_AS_X_BEARER_TOKEN:-}"
    if [ -z "$token" ]; then
        token=$(get_config_value '.x_bearer_token' '')
    fi
    echo "$token"
}

get_linkedin_token() {
    local token="${CLAUDE_AS_LINKEDIN_ACCESS_TOKEN:-}"
    if [ -z "$token" ]; then
        token=$(get_config_value '.linkedin_access_token' '')
    fi
    echo "$token"
}

get_linkedin_urn() {
    local urn="${CLAUDE_AS_LINKEDIN_PERSON_URN:-}"
    if [ -z "$urn" ]; then
        urn=$(get_config_value '.linkedin_person_urn' '')
    fi
    echo "$urn"
}

# ═══════════════════════════════════════════════════════════════
# VALIDATION
# ═══════════════════════════════════════════════════════════════

normalize_platform() {
    local platform="$1"
    case "$platform" in
        x|twitter|X|Twitter)    echo "x" ;;
        linkedin|li|LinkedIn)   echo "linkedin" ;;
        *)
            log_error "Unknown platform: $platform"
            echo "Supported: x (twitter), linkedin (li)"
            return 1
            ;;
    esac
}

validate_content() {
    local platform="$1"
    local content="$2"

    if [ -z "$content" ]; then
        log_error "Content cannot be empty"
        return 1
    fi

    local char_count=${#content}

    case "$platform" in
        x)
            if [ "$char_count" -gt "$X_CHAR_LIMIT" ]; then
                log_error "Content exceeds X character limit: $char_count/$X_CHAR_LIMIT"
                return 1
            fi
            ;;
        linkedin)
            if [ "$char_count" -gt "$LINKEDIN_CHAR_LIMIT" ]; then
                log_error "Content exceeds LinkedIn character limit: $char_count/$LINKEDIN_CHAR_LIMIT"
                return 1
            fi
            ;;
    esac
    return 0
}

validate_token() {
    local platform="$1"
    local token=""

    case "$platform" in
        x)
            token=$(get_x_token)
            if [ -z "$token" ]; then
                log_error "X Bearer token not configured"
                echo "  Set CLAUDE_AS_X_BEARER_TOKEN or run: ./scripts/social-publish.sh setup"
                return 1
            fi
            ;;
        linkedin)
            token=$(get_linkedin_token)
            if [ -z "$token" ]; then
                log_error "LinkedIn access token not configured"
                echo "  Set CLAUDE_AS_LINKEDIN_ACCESS_TOKEN or run: ./scripts/social-publish.sh setup"
                return 1
            fi
            local urn
            urn=$(get_linkedin_urn)
            if [ -z "$urn" ]; then
                log_error "LinkedIn person URN not configured"
                echo "  Set CLAUDE_AS_LINKEDIN_PERSON_URN or run: ./scripts/social-publish.sh setup"
                return 1
            fi
            ;;
    esac
    return 0
}

# ═══════════════════════════════════════════════════════════════
# CONFIRMATION PROMPT
# ═══════════════════════════════════════════════════════════════

confirm_post() {
    local platform="$1"
    local content="$2"
    local char_count=${#content}
    local limit

    case "$platform" in
        x)        limit=$X_CHAR_LIMIT ;;
        linkedin) limit=$LINKEDIN_CHAR_LIMIT ;;
    esac

    local platform_display
    case "$platform" in
        x)        platform_display="X (Twitter)" ;;
        linkedin) platform_display="LinkedIn" ;;
    esac

    echo ""
    echo -e "${BOLD}┌─────────────────────────────────────────────┐${NC}"
    echo -e "${BOLD}│${NC} Platform:   ${CYAN}$platform_display${NC}"
    echo -e "${BOLD}│${NC} Characters: ${CYAN}$char_count${NC}/${DIM}$limit${NC}"
    echo -e "${BOLD}│${NC}"

    # Show content preview (truncated for display)
    local preview="$content"
    if [ ${#preview} -gt 200 ]; then
        preview="${preview:0:200}..."
    fi
    while IFS= read -r line; do
        echo -e "${BOLD}│${NC}   ${DIM}$line${NC}"
    done <<< "$preview"

    echo -e "${BOLD}│${NC}"
    echo -e "${BOLD}└─────────────────────────────────────────────┘${NC}"
    echo ""

    read -r -p "Post this? [y/N] " response
    case "$response" in
        [yY]|[yY][eE][sS]) return 0 ;;
        *) return 1 ;;
    esac
}

# ═══════════════════════════════════════════════════════════════
# HISTORY
# ═══════════════════════════════════════════════════════════════

record_post() {
    local platform="$1"
    local content="$2"
    local post_id="$3"
    local status="$4"
    local error_msg="${5:-}"

    mkdir -p "$(dirname "$HISTORY_FILE")"

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local char_count=${#content}

    jq -nc \
        --arg ts "$timestamp" \
        --arg platform "$platform" \
        --arg content "$content" \
        --arg post_id "$post_id" \
        --arg status "$status" \
        --argjson char_count "$char_count" \
        --arg error "$error_msg" \
        '{timestamp:$ts,platform:$platform,content:$content,post_id:$post_id,status:$status,char_count:$char_count,error:$error}' \
        >> "$HISTORY_FILE"
}

# ═══════════════════════════════════════════════════════════════
# HASHTAG APPENDER
# ═══════════════════════════════════════════════════════════════

append_hashtags() {
    local content="$1"
    local hashtags="$2"
    local platform="$3"

    if [ -z "$hashtags" ]; then
        echo "$content"
        return
    fi

    # Convert comma-separated to space-separated hashtags
    local formatted=""
    IFS=',' read -ra tags <<< "$hashtags"
    for tag in "${tags[@]}"; do
        tag=$(echo "$tag" | xargs)  # trim whitespace
        if [[ "$tag" != \#* ]]; then
            tag="#$tag"
        fi
        formatted+=" $tag"
    done

    local result="$content$formatted"

    # Validate final length
    local limit
    case "$platform" in
        x)        limit=$X_CHAR_LIMIT ;;
        linkedin) limit=$LINKEDIN_CHAR_LIMIT ;;
    esac

    if [ ${#result} -gt "$limit" ]; then
        log_warn "Content with hashtags exceeds limit (${#result}/$limit), posting without hashtags"
        echo "$content"
    else
        echo "$result"
    fi
}

# ═══════════════════════════════════════════════════════════════
# X (TWITTER) API v2
# ═══════════════════════════════════════════════════════════════

x_verify_token() {
    local token
    token=$(get_x_token)

    local response http_code body
    response=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer $token" \
        "$X_API_BASE/users/me" 2>/dev/null)

    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')

    case "$http_code" in
        200)
            local username
            username=$(echo "$body" | jq -r '.data.username // "unknown"' 2>/dev/null)
            echo -e "  ${GREEN}X:${NC}        Authenticated as ${CYAN}@$username${NC}"
            return 0
            ;;
        401)
            echo -e "  ${RED}X:${NC}        Token invalid or expired"
            return 1
            ;;
        403)
            echo -e "  ${RED}X:${NC}        Token lacks required permissions"
            return 1
            ;;
        429)
            echo -e "  ${YELLOW}X:${NC}        Rate limited — try again later"
            return 1
            ;;
        *)
            echo -e "  ${RED}X:${NC}        HTTP $http_code — $body"
            return 1
            ;;
    esac
}

x_publish() {
    local content="$1"
    local reply_to="${2:-}"
    local token
    token=$(get_x_token)

    local payload
    if [ -n "$reply_to" ]; then
        payload=$(jq -nc --arg text "$content" --arg reply_id "$reply_to" \
            '{text:$text,reply:{in_reply_to_tweet_id:$reply_id}}')
    else
        payload=$(jq -nc --arg text "$content" '{text:$text}')
    fi

    local response http_code body
    response=$(curl -s -w "\n%{http_code}" \
        -X POST "$X_API_BASE/tweets" \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>/dev/null)

    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')

    case "$http_code" in
        201)
            local tweet_id
            tweet_id=$(echo "$body" | jq -r '.data.id // "unknown"' 2>/dev/null)
            echo "$tweet_id"
            return 0
            ;;
        401)
            log_error "X: Token invalid or expired (HTTP 401)"
            echo "  Re-authenticate at https://developer.x.com/"
            record_post "x" "$content" "" "error" "HTTP 401: Token invalid"
            return 1
            ;;
        403)
            log_error "X: Forbidden — check app permissions (HTTP 403)"
            local detail
            detail=$(echo "$body" | jq -r '.detail // .errors[0].message // "unknown"' 2>/dev/null)
            echo "  Detail: $detail"
            record_post "x" "$content" "" "error" "HTTP 403: $detail"
            return 1
            ;;
        429)
            local reset
            reset=$(echo "$body" | jq -r '.errors[0].message // "unknown"' 2>/dev/null)
            log_error "X: Rate limited (HTTP 429)"
            echo "  $reset"
            record_post "x" "$content" "" "error" "HTTP 429: Rate limited"
            return 1
            ;;
        *)
            local detail
            detail=$(echo "$body" | jq -r '.detail // .errors[0].message // "unknown"' 2>/dev/null)
            log_error "X: HTTP $http_code — $detail"
            record_post "x" "$content" "" "error" "HTTP $http_code: $detail"
            return 1
            ;;
    esac
}

x_thread() {
    local content_file="$1"

    if [ ! -f "$content_file" ]; then
        log_error "Thread file not found: $content_file"
        return 1
    fi

    # Split by --- separators
    local parts=()
    local current=""
    while IFS= read -r line || [ -n "$line" ]; do
        if [[ "$line" =~ ^---[[:space:]]*$ ]]; then
            if [ -n "$current" ]; then
                # Trim leading/trailing whitespace
                current=$(echo "$current" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
                parts+=("$current")
                current=""
            fi
        else
            current+="$line"$'\n'
        fi
    done < "$content_file"
    # Don't forget the last section
    if [ -n "$current" ]; then
        current=$(echo "$current" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
        parts+=("$current")
    fi

    if [ ${#parts[@]} -eq 0 ]; then
        log_error "No thread sections found in file"
        return 1
    fi

    # Validate all parts
    local i=1
    for part in "${parts[@]}"; do
        local char_count=${#part}
        if [ "$char_count" -gt "$X_CHAR_LIMIT" ]; then
            log_error "Thread part $i exceeds limit: $char_count/$X_CHAR_LIMIT"
            return 1
        fi
        if [ "$char_count" -eq 0 ]; then
            log_error "Thread part $i is empty"
            return 1
        fi
        i=$((i + 1))
    done

    log_info "Thread: ${#parts[@]} tweets to post"

    # Post thread
    local prev_id=""
    local tweet_num=1
    for part in "${parts[@]}"; do
        local tweet_id
        tweet_id=$(x_publish "$part" "$prev_id")
        if [ $? -ne 0 ]; then
            log_error "Thread failed at tweet $tweet_num"
            return 1
        fi
        record_post "x" "$part" "$tweet_id" "published" ""
        log_success "Tweet $tweet_num/${#parts[@]} posted (ID: $tweet_id)"
        prev_id="$tweet_id"
        tweet_num=$((tweet_num + 1))

        # Brief delay between tweets to avoid rate limits
        if [ "$tweet_num" -le "${#parts[@]}" ]; then
            sleep 1
        fi
    done

    log_success "Thread posted: ${#parts[@]} tweets"
    return 0
}

# ═══════════════════════════════════════════════════════════════
# LINKEDIN SHARE API
# ═══════════════════════════════════════════════════════════════

linkedin_verify_token() {
    local token
    token=$(get_linkedin_token)

    local response http_code body
    response=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer $token" \
        -H "LinkedIn-Version: 202401" \
        -H "X-Restli-Protocol-Version: 2.0.0" \
        "$LINKEDIN_API_BASE/me" 2>/dev/null)

    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')

    case "$http_code" in
        200)
            local name
            name=$(echo "$body" | jq -r '(.localizedFirstName // "") + " " + (.localizedLastName // "")' 2>/dev/null)
            name=$(echo "$name" | xargs)  # trim
            if [ -z "$name" ] || [ "$name" = " " ]; then
                name="(authenticated)"
            fi
            echo -e "  ${GREEN}LinkedIn:${NC} Authenticated as ${CYAN}$name${NC}"
            return 0
            ;;
        401)
            echo -e "  ${RED}LinkedIn:${NC} Token invalid or expired"
            return 1
            ;;
        403)
            echo -e "  ${RED}LinkedIn:${NC} Token lacks required permissions (w_member_social)"
            return 1
            ;;
        429)
            echo -e "  ${YELLOW}LinkedIn:${NC} Rate limited — try again later"
            return 1
            ;;
        *)
            echo -e "  ${RED}LinkedIn:${NC} HTTP $http_code"
            return 1
            ;;
    esac
}

linkedin_publish() {
    local content="$1"
    local token urn
    token=$(get_linkedin_token)
    urn=$(get_linkedin_urn)

    local payload
    payload=$(jq -nc \
        --arg author "$urn" \
        --arg commentary "$content" \
        '{
            author: $author,
            lifecycleState: "PUBLISHED",
            visibility: "PUBLIC",
            commentary: $commentary,
            distribution: {
                feedDistribution: "MAIN_FEED",
                targetEntities: [],
                thirdPartyDistributionChannels: []
            }
        }')

    local response http_code body
    response=$(curl -s -w "\n%{http_code}" \
        -X POST "$LINKEDIN_API_BASE/posts" \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -H "LinkedIn-Version: 202401" \
        -H "X-Restli-Protocol-Version: 2.0.0" \
        -d "$payload" 2>/dev/null)

    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')

    case "$http_code" in
        201)
            local post_id
            post_id=$(echo "$body" | jq -r '.id // "unknown"' 2>/dev/null)
            # LinkedIn sometimes returns header-only, extract from x-restli-id
            if [ "$post_id" = "unknown" ] || [ "$post_id" = "null" ] || [ -z "$post_id" ]; then
                post_id="li-$(date +%s)"
            fi
            echo "$post_id"
            return 0
            ;;
        401)
            log_error "LinkedIn: Token invalid or expired (HTTP 401)"
            echo "  Re-authenticate at https://www.linkedin.com/developers/"
            record_post "linkedin" "$content" "" "error" "HTTP 401: Token invalid"
            return 1
            ;;
        403)
            local detail
            detail=$(echo "$body" | jq -r '.message // "unknown"' 2>/dev/null)
            log_error "LinkedIn: Forbidden (HTTP 403)"
            echo "  Detail: $detail"
            echo "  Ensure your app has 'w_member_social' permission"
            record_post "linkedin" "$content" "" "error" "HTTP 403: $detail"
            return 1
            ;;
        422)
            local detail
            detail=$(echo "$body" | jq -r '.message // "unknown"' 2>/dev/null)
            log_error "LinkedIn: Validation error (HTTP 422)"
            echo "  Detail: $detail"
            record_post "linkedin" "$content" "" "error" "HTTP 422: $detail"
            return 1
            ;;
        429)
            log_error "LinkedIn: Rate limited (HTTP 429)"
            record_post "linkedin" "$content" "" "error" "HTTP 429: Rate limited"
            return 1
            ;;
        *)
            local detail
            detail=$(echo "$body" | jq -r '.message // "unknown"' 2>/dev/null)
            log_error "LinkedIn: HTTP $http_code — $detail"
            record_post "linkedin" "$content" "" "error" "HTTP $http_code: $detail"
            return 1
            ;;
    esac
}

# ═══════════════════════════════════════════════════════════════
# SOURCEABLE FUNCTION
# ═══════════════════════════════════════════════════════════════

social_publish() {
    local platform="$1"
    local content="$2"

    platform=$(normalize_platform "$platform") || return 1
    validate_content "$platform" "$content" || return 1
    validate_token "$platform" || return 1

    local post_id
    case "$platform" in
        x)        post_id=$(x_publish "$content") ;;
        linkedin) post_id=$(linkedin_publish "$content") ;;
    esac

    if [ $? -eq 0 ] && [ -n "$post_id" ]; then
        record_post "$platform" "$content" "$post_id" "published" ""
        echo "$post_id"
        return 0
    fi
    return 1
}

# ═══════════════════════════════════════════════════════════════
# COMMANDS
# ═══════════════════════════════════════════════════════════════

cmd_publish() {
    local platform="${1:-}"
    local content="${2:-}"
    local dry_run="${FLAG_DRY_RUN:-false}"
    local no_confirm="${FLAG_NO_CONFIRM:-false}"
    local hashtags="${FLAG_HASHTAGS:-}"
    local json_output="${FLAG_JSON:-false}"

    if [ -z "$platform" ] || [ -z "$content" ]; then
        log_error "Usage: social-publish.sh publish <platform> \"<content>\""
        return 1
    fi

    platform=$(normalize_platform "$platform") || return 1

    # Append hashtags if provided
    if [ -n "$hashtags" ]; then
        content=$(append_hashtags "$content" "$hashtags" "$platform")
    fi

    # Also check for default hashtags from config
    local default_tags
    default_tags=$(get_config_value '.default_hashtags | join(",")' '')
    if [ -n "$default_tags" ] && [ -z "$hashtags" ]; then
        content=$(append_hashtags "$content" "$default_tags" "$platform")
    fi

    validate_content "$platform" "$content" || return 1

    # Dry run mode
    if [ "$dry_run" = "true" ]; then
        local char_count=${#content}
        local limit
        case "$platform" in
            x)        limit=$X_CHAR_LIMIT ;;
            linkedin) limit=$LINKEDIN_CHAR_LIMIT ;;
        esac

        if [ "$json_output" = "true" ]; then
            jq -nc \
                --arg platform "$platform" \
                --arg content "$content" \
                --argjson chars "$char_count" \
                --argjson limit "$limit" \
                '{mode:"dry-run",platform:$platform,content:$content,char_count:$chars,char_limit:$limit}'
        else
            echo -e "${YELLOW}[DRY RUN]${NC} Would post to ${CYAN}$platform${NC}:"
            echo ""
            echo -e "  ${DIM}$content${NC}"
            echo ""
            echo -e "  Characters: $char_count/$limit"
        fi
        return 0
    fi

    # Validate token
    validate_token "$platform" || return 1

    # Confirmation prompt
    if [ "$no_confirm" != "true" ]; then
        local config_confirm
        config_confirm=$(get_config_value '.confirm_before_post' 'true')
        if [ "$config_confirm" = "true" ]; then
            if ! confirm_post "$platform" "$content"; then
                log_info "Post cancelled"
                return 0
            fi
        fi
    fi

    # Publish
    log_info "Publishing to $platform..."
    local post_id
    case "$platform" in
        x)        post_id=$(x_publish "$content") ;;
        linkedin) post_id=$(linkedin_publish "$content") ;;
    esac

    local exit_code=$?
    if [ $exit_code -eq 0 ] && [ -n "$post_id" ]; then
        record_post "$platform" "$content" "$post_id" "published" ""

        if [ "$json_output" = "true" ]; then
            jq -nc \
                --arg platform "$platform" \
                --arg post_id "$post_id" \
                --arg status "published" \
                --argjson chars "${#content}" \
                '{platform:$platform,post_id:$post_id,status:$status,char_count:$chars}'
        else
            log_success "Published to $platform (ID: $post_id)"
        fi
        return 0
    else
        return $exit_code
    fi
}

cmd_thread() {
    local platform="${1:-}"
    local content_file="${2:-}"
    local dry_run="${FLAG_DRY_RUN:-false}"
    local no_confirm="${FLAG_NO_CONFIRM:-false}"

    if [ -z "$platform" ] || [ -z "$content_file" ]; then
        log_error "Usage: social-publish.sh thread <platform> <content-file>"
        return 1
    fi

    platform=$(normalize_platform "$platform") || return 1

    if [ ! -f "$content_file" ]; then
        log_error "File not found: $content_file"
        return 1
    fi

    # Currently only X supports threads
    if [ "$platform" != "x" ]; then
        log_error "Threads are only supported on X (Twitter)"
        return 1
    fi

    # Parse sections for preview
    local parts=()
    local current=""
    while IFS= read -r line || [ -n "$line" ]; do
        if [[ "$line" =~ ^---[[:space:]]*$ ]]; then
            if [ -n "$current" ]; then
                current=$(echo "$current" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
                parts+=("$current")
                current=""
            fi
        else
            current+="$line"$'\n'
        fi
    done < "$content_file"
    if [ -n "$current" ]; then
        current=$(echo "$current" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
        parts+=("$current")
    fi

    if [ ${#parts[@]} -eq 0 ]; then
        log_error "No thread sections found in file"
        return 1
    fi

    # Dry run: show preview
    if [ "$dry_run" = "true" ]; then
        echo -e "${YELLOW}[DRY RUN]${NC} Thread preview (${#parts[@]} tweets):"
        echo ""
        local i=1
        for part in "${parts[@]}"; do
            echo -e "  ${CYAN}[$i/${#parts[@]}]${NC} (${#part} chars)"
            echo -e "  ${DIM}$part${NC}"
            echo ""
            i=$((i + 1))
        done
        return 0
    fi

    validate_token "$platform" || return 1

    # Confirmation
    if [ "$no_confirm" != "true" ]; then
        local config_confirm
        config_confirm=$(get_config_value '.confirm_before_post' 'true')
        if [ "$config_confirm" = "true" ]; then
            echo ""
            echo -e "${BOLD}Thread preview (${#parts[@]} tweets):${NC}"
            local i=1
            for part in "${parts[@]}"; do
                echo -e "  ${CYAN}[$i]${NC} (${#part} chars): ${DIM}${part:0:80}${NC}..."
                i=$((i + 1))
            done
            echo ""
            read -r -p "Post this thread? [y/N] " response
            case "$response" in
                [yY]|[yY][eE][sS]) ;;
                *) log_info "Thread cancelled"; return 0 ;;
            esac
        fi
    fi

    x_thread "$content_file"
}

cmd_history() {
    local filter_platform="${1:-}"
    local limit="${FLAG_LAST:-20}"
    local json_output="${FLAG_JSON:-false}"

    if [ ! -f "$HISTORY_FILE" ]; then
        echo -e "${YELLOW}No post history yet.${NC}"
        return 0
    fi

    if [ "$json_output" = "true" ]; then
        if [ -n "$filter_platform" ]; then
            filter_platform=$(normalize_platform "$filter_platform" 2>/dev/null || echo "$filter_platform")
            tail -"$limit" "$HISTORY_FILE" | jq -s --arg p "$filter_platform" '[.[] | select(.platform == $p)]'
        else
            tail -"$limit" "$HISTORY_FILE" | jq -s '.'
        fi
        return 0
    fi

    echo -e "${BOLD}Post History${NC} (last $limit)"
    echo ""

    local count=0
    while IFS= read -r line; do
        local ts platform content status char_count post_id
        ts=$(echo "$line" | jq -r '.timestamp' 2>/dev/null)
        platform=$(echo "$line" | jq -r '.platform' 2>/dev/null)
        content=$(echo "$line" | jq -r '.content' 2>/dev/null)
        status=$(echo "$line" | jq -r '.status' 2>/dev/null)
        char_count=$(echo "$line" | jq -r '.char_count' 2>/dev/null)
        post_id=$(echo "$line" | jq -r '.post_id' 2>/dev/null)

        # Apply platform filter
        if [ -n "$filter_platform" ]; then
            local norm_filter
            norm_filter=$(normalize_platform "$filter_platform" 2>/dev/null || echo "$filter_platform")
            if [ "$platform" != "$norm_filter" ]; then
                continue
            fi
        fi

        local status_color="$GREEN"
        [ "$status" = "error" ] && status_color="$RED"

        local preview="${content:0:60}"
        [ ${#content} -gt 60 ] && preview+="..."

        echo -e "  ${DIM}$ts${NC}  ${CYAN}$platform${NC}  ${status_color}$status${NC}  ${DIM}($char_count chars)${NC}"
        echo -e "    $preview"
        echo ""
        count=$((count + 1))
    done < <(tail -"$limit" "$HISTORY_FILE")

    if [ "$count" -eq 0 ]; then
        echo -e "  ${DIM}No matching entries${NC}"
    fi

    local total
    total=$(wc -l < "$HISTORY_FILE")
    echo -e "Total entries: $total"
}

cmd_status() {
    check_dependencies || return 1
    ensure_config

    echo -e "${BOLD}Social Media Publisher — Status${NC}"
    echo ""

    # Check X
    local x_token
    x_token=$(get_x_token)
    if [ -n "$x_token" ]; then
        x_verify_token || true
    else
        echo -e "  ${DIM}X:${NC}        Not configured"
    fi

    # Check LinkedIn
    local li_token
    li_token=$(get_linkedin_token)
    local li_urn
    li_urn=$(get_linkedin_urn)
    if [ -n "$li_token" ]; then
        linkedin_verify_token || true
        if [ -n "$li_urn" ]; then
            echo -e "  ${DIM}          URN: $li_urn${NC}"
        else
            echo -e "  ${YELLOW}          Person URN not set${NC}"
        fi
    else
        echo -e "  ${DIM}LinkedIn:${NC} Not configured"
    fi

    echo ""

    # History stats
    if [ -f "$HISTORY_FILE" ]; then
        local total x_count li_count errors
        total=$(wc -l < "$HISTORY_FILE")
        x_count=$(grep -c '"platform":"x"' "$HISTORY_FILE" 2>/dev/null || echo 0)
        li_count=$(grep -c '"platform":"linkedin"' "$HISTORY_FILE" 2>/dev/null || echo 0)
        errors=$(grep -c '"status":"error"' "$HISTORY_FILE" 2>/dev/null || echo 0)

        echo -e "  ${BOLD}History:${NC}"
        echo -e "    Total posts:  $total"
        echo -e "    X:            $x_count"
        echo -e "    LinkedIn:     $li_count"
        echo -e "    Errors:       $errors"
    else
        echo -e "  ${DIM}No post history yet${NC}"
    fi

    echo ""
    echo -e "  Config: $CONFIG_FILE"
    echo -e "  History: $HISTORY_FILE"
}

cmd_config() {
    ensure_config
    echo -e "${BOLD}Social Media Configuration${NC}"
    echo -e "${CYAN}File:${NC} $CONFIG_FILE"
    echo ""
    # Mask tokens for display
    jq '{
        x_bearer_token: (if .x_bearer_token == "" then "(not set)" else "****" + (.x_bearer_token | .[-4:]) end),
        linkedin_access_token: (if .linkedin_access_token == "" then "(not set)" else "****" + (.linkedin_access_token | .[-4:]) end),
        linkedin_person_urn: (if .linkedin_person_urn == "" then "(not set)" else .linkedin_person_urn end),
        confirm_before_post: .confirm_before_post,
        dry_run: .dry_run,
        default_hashtags: .default_hashtags
    }' "$CONFIG_FILE"
}

cmd_setup() {
    ensure_config
    echo -e "${BOLD}Social Media Publisher — Setup${NC}"
    echo ""
    echo "This wizard helps you configure API tokens."
    echo "Tokens are stored in .claude/social-media.json (gitignored)."
    echo ""

    # X setup
    echo -e "${CYAN}── X (Twitter) ──${NC}"
    echo "  1. Go to https://developer.x.com/en/portal/dashboard"
    echo "  2. Create or select a project/app"
    echo "  3. Generate a Bearer Token (OAuth 2.0)"
    echo "  4. Ensure your app has Read and Write permissions"
    echo ""
    read -r -p "Enter X Bearer Token (or press Enter to skip): " x_token
    if [ -n "$x_token" ]; then
        save_config_value '.x_bearer_token' "$x_token"
        log_success "X Bearer Token saved"
    else
        log_info "X setup skipped"
    fi

    echo ""

    # LinkedIn setup
    echo -e "${CYAN}── LinkedIn ──${NC}"
    echo "  1. Go to https://www.linkedin.com/developers/apps"
    echo "  2. Create or select an app"
    echo "  3. Request 'w_member_social' permission under Products"
    echo "  4. Generate an OAuth 2.0 access token"
    echo "  5. Find your Person URN: GET https://api.linkedin.com/v2/me"
    echo ""
    read -r -p "Enter LinkedIn Access Token (or press Enter to skip): " li_token
    if [ -n "$li_token" ]; then
        save_config_value '.linkedin_access_token' "$li_token"
        log_success "LinkedIn Access Token saved"
    fi

    read -r -p "Enter LinkedIn Person URN (urn:li:person:XXXX, or press Enter to skip): " li_urn
    if [ -n "$li_urn" ]; then
        save_config_value '.linkedin_person_urn' "$li_urn"
        log_success "LinkedIn Person URN saved"
    fi

    echo ""
    echo -e "${GREEN}Setup complete.${NC} Run ${CYAN}./scripts/social-publish.sh status${NC} to verify."
}

# ═══════════════════════════════════════════════════════════════
# ARGUMENT PARSING & DISPATCH
# ═══════════════════════════════════════════════════════════════

# Only run dispatch if script is executed directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    check_dependencies || exit 1

    COMMAND="${1:-}"
    shift 2>/dev/null || true

    # Parse global flags
    FLAG_DRY_RUN="false"
    FLAG_NO_CONFIRM="false"
    FLAG_JSON="false"
    FLAG_HASHTAGS=""
    FLAG_LAST="20"
    POSITIONAL_ARGS=()

    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)        FLAG_DRY_RUN="true"; shift ;;
            --no-confirm)     FLAG_NO_CONFIRM="true"; shift ;;
            --json)           FLAG_JSON="true"; shift ;;
            --hashtags=*)     FLAG_HASHTAGS="${1#*=}"; shift ;;
            --last=*)         FLAG_LAST="${1#*=}"; shift ;;
            --help)           show_help; exit 0 ;;
            *)                POSITIONAL_ARGS+=("$1"); shift ;;
        esac
    done

    # Also check config-level dry_run
    if [ "$FLAG_DRY_RUN" = "false" ] && [ -f "$CONFIG_FILE" ]; then
        local_dry_run=$(get_config_value '.dry_run' 'false')
        if [ "$local_dry_run" = "true" ]; then
            FLAG_DRY_RUN="true"
        fi
    fi

    case "$COMMAND" in
        publish)  cmd_publish "${POSITIONAL_ARGS[@]}" ;;
        thread)   cmd_thread "${POSITIONAL_ARGS[@]}" ;;
        history)  cmd_history "${POSITIONAL_ARGS[@]}" ;;
        status)   cmd_status ;;
        config)   cmd_config ;;
        setup)    cmd_setup ;;
        --help|help) show_help ;;
        "")       show_help ;;
        *)
            log_error "Unknown command: $COMMAND"
            echo "Run ./scripts/social-publish.sh --help for usage."
            exit 1
            ;;
    esac
fi
