#!/bin/bash

# Memory Manager - Command-line interface for persistent memory
# Provides /remember, /recall, /correct commands

set -e
set -o pipefail

MEMORY_BANK_DIR="${MEMORY_BANK_DIR:-memory_bank}"
KNOWLEDGE_DIR="$MEMORY_BANK_DIR/knowledge"
RELATIONSHIPS_DIR="$MEMORY_BANK_DIR/relationships"
RETRIEVAL_DIR="$MEMORY_BANK_DIR/retrieval"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
FORCE="${FORCE:-false}"

# Framework directory (for bootstrap data)
FRAMEWORK_DIR="${FRAMEWORK_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)}"

# Initialize memory bank structure
init_memory_bank() {
    mkdir -p "$KNOWLEDGE_DIR"
    mkdir -p "$RELATIONSHIPS_DIR"
    mkdir -p "$RETRIEVAL_DIR"

    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Create JSONL files if they don't exist
    touch "$KNOWLEDGE_DIR/facts.jsonl"
    touch "$KNOWLEDGE_DIR/decisions.jsonl"
    touch "$KNOWLEDGE_DIR/errors.jsonl"
    touch "$KNOWLEDGE_DIR/preferences.jsonl"

    # Create JSON files with valid initial structure (not empty)
    if [ ! -s "$RELATIONSHIPS_DIR/knowledge-graph.json" ]; then
        cat > "$RELATIONSHIPS_DIR/knowledge-graph.json" <<EOF
{"nodes":[],"edges":[],"metadata":{"created":"$timestamp","updated":"$timestamp","version":"1.0"}}
EOF
    fi

    if [ ! -s "$RELATIONSHIPS_DIR/lineage.json" ]; then
        cat > "$RELATIONSHIPS_DIR/lineage.json" <<EOF
{"entries":[],"corrections":[],"metadata":{"created":"$timestamp","updated":"$timestamp","version":"1.0"}}
EOF
    fi

    if [ ! -s "$RETRIEVAL_DIR/query-cache.json" ]; then
        cat > "$RETRIEVAL_DIR/query-cache.json" <<EOF
{"cache":[],"max_size":1000,"metadata":{"created":"$timestamp","updated":"$timestamp","version":"1.0"}}
EOF
    fi

    if [ ! -s "$RETRIEVAL_DIR/weights.json" ]; then
        cat > "$RETRIEVAL_DIR/weights.json" <<EOF
{"adjustments":[],"metadata":{"created":"$timestamp","updated":"$timestamp","version":"1.0"}}
EOF
    fi

    # Copy bootstrap knowledge if available and facts.jsonl is empty
    local bootstrap_src="$FRAMEWORK_DIR/memory_bank/knowledge/bootstrap.jsonl"
    local bootstrap_dst="$KNOWLEDGE_DIR/bootstrap.jsonl"
    if [ ! -s "$KNOWLEDGE_DIR/facts.jsonl" ] && [ -f "$bootstrap_src" ]; then
        # Avoid copying file onto itself when running from framework dir
        if [ "$(realpath "$bootstrap_src" 2>/dev/null)" != "$(realpath "$bootstrap_dst" 2>/dev/null)" ]; then
            cp "$bootstrap_src" "$bootstrap_dst"
            if [ "${MEMORY_QUIET_INIT:-false}" != "true" ]; then
                echo -e "${GREEN}Copied bootstrap knowledge to memory bank${NC}"
            fi
        fi
    fi
}

# Generate UUID v4
generate_uuid() {
    if command -v uuidgen &> /dev/null; then
        uuidgen
    elif command -v python3 &> /dev/null; then
        python3 -c "import uuid; print(uuid.uuid4())"
    else
        # Fallback: simple UUID-like string
        cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "$(date +%s)-$(shuf -i 1000-9999 -n 1)"
    fi
}

# Store knowledge
remember() {
    local content="$1"
    local type="${2:-fact}"
    local tags="${3:-}"
    
    if [ -z "$content" ]; then
        echo "Error: Content required"
        exit 1
    fi

    # Sanitize type - only allow known types (prevent path traversal)
    case "$type" in
        fact|decision|error|preference) ;;
        *)
            echo "Error: Invalid type '$type'. Must be: fact, decision, error, preference"
            exit 1
            ;;
    esac

    init_memory_bank

    local id=$(generate_uuid)
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local file="$KNOWLEDGE_DIR/${type}s.jsonl"
    
    # Extract tags from content if not provided
    if [ -z "$tags" ]; then
        tags=$(echo "$content" | tr '[:upper:]' '[:lower:]' | grep -oE '\b[a-z]{4,}\b' | head -5 | tr '\n' ',' | sed 's/,$//')
    fi
    
    # Create memory entry
    local entry=$(cat <<EOF
{
  "id": "$id",
  "type": "$type",
  "content": $(echo "$content" | jq -Rs .),
  "created_at": "$timestamp",
  "created_by": "user",
  "session_id": "${SESSION_ID:-unknown}",
  "context": {
    "prd_id": "${PRD_ID:-}",
    "story_id": "${STORY_ID:-}",
    "phase": "${PHASE:-}"
  },
  "weight": 0.5,
  "validation_count": 0,
  "retrieval_count": 0,
  "tags": [$(echo "$tags" | tr ',' '\n' | sed 's/^/    "/;s/$/",/' | sed '$ s/,$//')],
  "reality_anchor": {
    "has_tests": false,
    "test_file": null,
    "test_passing": false
  },
  "lineage": {
    "parent_id": null,
    "supersedes": [],
    "superseded_by": null
  }
}
EOF
)
    
    # Append to JSONL file
    echo "$entry" >> "$file"
    
    echo -e "${GREEN}MEMORY STORED${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "ID: $id"
    echo "Type: $type"
    echo "Content: ${content:0:100}..."
    echo "Weight: 0.5"
    echo "Tags: $tags"
    echo "Stored: $timestamp"
}

# Recall knowledge
recall() {
    local query="$1"
    local type="${2:-}"
    local limit="${3:-10}"
    
    if [ -z "$query" ]; then
        echo "Error: Query required"
        exit 1
    fi
    
    init_memory_bank
    
    echo -e "${CYAN}MEMORY SEARCH: \"$query\"${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Validate type if provided (prevent path traversal)
    if [ -n "$type" ]; then
        case "$type" in
            fact|decision|error|preference) ;;
            *)
                echo "Error: Invalid type '$type'. Must be: fact, decision, error, preference"
                exit 1
                ;;
        esac
    fi

    local files=()
    if [ -z "$type" ]; then
        files=("$KNOWLEDGE_DIR/facts.jsonl" "$KNOWLEDGE_DIR/decisions.jsonl" "$KNOWLEDGE_DIR/errors.jsonl" "$KNOWLEDGE_DIR/preferences.jsonl")
    else
        files=("$KNOWLEDGE_DIR/${type}s.jsonl")
    fi
    
    local count=0
    for file in "${files[@]}"; do
        if [ -f "$file" ] && [ -s "$file" ]; then
            while IFS= read -r line; do
                if [ -n "$line" ]; then
                    local content=$(echo "$line" | jq -r '.content' 2>/dev/null)
                    local weight=$(echo "$line" | jq -r '.weight // 0.5' 2>/dev/null)
                    
                    # Simple text search (case-insensitive, literal match)
                    if echo "$content" | grep -qiF -- "$query"; then
                        ((count++))
                        if [ $count -le $limit ]; then
                            echo ""
                            echo "[$count] [Weight: $weight] ${content:0:80}..."
                            echo "  [ID: $(echo "$line" | jq -r '.id' 2>/dev/null)]"
                        fi
                    fi
                fi
            done < "$file"
        fi
    done
    
    if [ $count -eq 0 ]; then
        echo "Found 0 items"
    else
        echo ""
        echo "Found $count items (showing top $limit)"
    fi
}

# Correct knowledge
correct() {
    local correction="$1"
    local old_id="$2"
    
    if [ -z "$correction" ]; then
        echo "Error: Correction content required"
        exit 1
    fi
    
    if [ -z "$old_id" ]; then
        echo "Error: Old entry ID required (--id=UUID)"
        exit 1
    fi
    
    init_memory_bank
    
    # Find old entry
    local old_entry=""
    local old_file=""
    for file in "$KNOWLEDGE_DIR"/*.jsonl; do
        if [ -f "$file" ]; then
            while IFS= read -r line; do
                if echo "$line" | jq -e --arg target_id "$old_id" '.id == $target_id' &>/dev/null; then
                    old_entry="$line"
                    old_file="$file"
                    break
                fi
            done < "$file"
        fi
    done
    
    if [ -z "$old_entry" ]; then
        echo "Error: Entry not found: $old_id"
        exit 1
    fi
    
    # Create new entry
    local old_type=$(echo "$old_entry" | jq -r '.type')
    local new_id=$(generate_uuid)
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Reduce old entry weight
    local old_weight=$(echo "$old_entry" | jq -r '.weight')
    local new_weight=$(echo "$old_weight * 0.3" | bc)
    
    # Update old entry in file
    local temp_file=$(mktemp)
    while IFS= read -r line; do
        if echo "$line" | jq -e --arg target_id "$old_id" '.id == $target_id' &>/dev/null; then
            echo "$line" | jq --argjson w "$new_weight" --arg nid "$new_id" '.weight = $w | .lineage.superseded_by = $nid' >> "$temp_file"
        else
            echo "$line" >> "$temp_file"
        fi
    done < "$old_file"
    mv "$temp_file" "$old_file"
    
    # Create new entry
    local new_entry=$(cat <<EOF
{
  "id": "$new_id",
  "type": "$old_type",
  "content": $(echo "$correction" | jq -Rs .),
  "created_at": "$timestamp",
  "created_by": "user",
  "session_id": "${SESSION_ID:-unknown}",
  "context": $(echo "$old_entry" | jq -c '.context'),
  "weight": 0.7,
  "validation_count": 0,
  "retrieval_count": 0,
  "tags": $(echo "$old_entry" | jq -c '.tags'),
  "reality_anchor": {
    "has_tests": false,
    "test_file": null,
    "test_passing": false
  },
  "lineage": {
    "parent_id": "$old_id",
    "supersedes": ["$old_id"],
    "superseded_by": null
  }
}
EOF
)
    
    echo "$new_entry" >> "$old_file"
    
    echo -e "${GREEN}KNOWLEDGE CORRECTED${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Old Entry: [ID: $old_id]"
    echo "  Weight: $old_weight → $new_weight (reduced)"
    echo ""
    echo "New Entry: [ID: $new_id]"
    echo "  Weight: 0.7 (initial)"
    echo "  Supersedes: $old_id"
}

# Main command dispatcher
case "${1:-}" in
    remember)
        shift
        remember "$@"
        ;;
    recall)
        shift
        recall "$@"
        ;;
    correct)
        shift
        # Parse --id flag
        OLD_ID=""
        CORRECTION=""
        while [[ $# -gt 0 ]]; do
            case $1 in
                --id=*)
                    OLD_ID="${1#*=}"
                    shift
                    ;;
                *)
                    CORRECTION="$1"
                    shift
                    ;;
            esac
        done
        correct "$CORRECTION" "$OLD_ID"
        ;;
    status)
        init_memory_bank
        echo -e "${CYAN}MEMORY STATUS${NC}"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        for file in "$KNOWLEDGE_DIR"/*.jsonl; do
            if [ -f "$file" ]; then
                count=$(wc -l < "$file" 2>/dev/null || echo "0")
                name=$(basename "$file" .jsonl)
                echo "$name: $count entries"
            fi
        done
        ;;
    harvest)
        shift
        HARVEST_SCRIPT="$FRAMEWORK_DIR/scripts/harvest.sh"
        if [ -f "$HARVEST_SCRIPT" ]; then
            bash "$HARVEST_SCRIPT" "$@"
        else
            echo "Error: harvest.sh not found at $HARVEST_SCRIPT"
            exit 1
        fi
        ;;
    sync)
        shift
        JSON_OUTPUT=false
        QUIET_OUTPUT=false
        PROJECT_DIR="."
        while [[ $# -gt 0 ]]; do
            case "$1" in
                --json) JSON_OUTPUT=true; shift ;;
                --quiet) QUIET_OUTPUT=true; shift ;;
                --force) FORCE=true; shift ;;
                *) PROJECT_DIR="$1"; shift ;;
            esac
        done
        if [ "$PROJECT_DIR" = "." ]; then
            PROJECT_DIR="$(pwd)"
        fi
        if [ "$JSON_OUTPUT" = "true" ] || [ "$QUIET_OUTPUT" = "true" ]; then
            MEMORY_QUIET_INIT=true init_memory_bank
        else
            init_memory_bank
        fi

        if [ "$JSON_OUTPUT" != "true" ] && [ "$QUIET_OUTPUT" != "true" ]; then
            echo -e "${CYAN}KNOWLEDGE SYNC${NC}"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo "Project: $PROJECT_DIR"
            echo "Framework: $FRAMEWORK_DIR"
            echo ""
        fi

        # Count entries for confirmation
        push_count=0
        pull_count=0
        created_files=0
        pulled_new=0
        pulled_dup=0

        # Count what would be pushed (project → central)
        for file in "$KNOWLEDGE_DIR"/*.jsonl; do
            if [ -f "$file" ] && [ -s "$file" ]; then
                lines=$(wc -l < "$file" 2>/dev/null || echo "0")
                push_count=$((push_count + lines))
            fi
        done

        # Count what would be pulled (central → project)
        CENTRAL_KNOWLEDGE_DIR="$FRAMEWORK_DIR/memory_bank/knowledge"
        for file in "$CENTRAL_KNOWLEDGE_DIR"/*-universal.jsonl "$CENTRAL_KNOWLEDGE_DIR/bootstrap.jsonl"; do
            if [ -f "$file" ] && [ -s "$file" ]; then
                lines=$(wc -l < "$file" 2>/dev/null || echo "0")
                pull_count=$((pull_count + lines))
            fi
        done

        # Confirmation (per CLI confirmation matrix, sync requires confirmation)
        if [ "$FORCE" != "true" ] && [ "$JSON_OUTPUT" != "true" ] && [ "$QUIET_OUTPUT" != "true" ]; then
            echo -e "${YELLOW}Sync will push ~$push_count entries and pull ~$pull_count entries. Continue?${NC}"
            read -p "(y/N): " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo -e "${YELLOW}Cancelled${NC}"
                exit 2
            fi
        fi

        # Phase 1: Pull (central → project)
        if [ "$JSON_OUTPUT" != "true" ] && [ "$QUIET_OUTPUT" != "true" ]; then
            echo -e "${BLUE}[STEP 1/2]${NC} Pulling universal knowledge to project..."
        fi
        for file in "$CENTRAL_KNOWLEDGE_DIR"/*-universal.jsonl "$CENTRAL_KNOWLEDGE_DIR/bootstrap.jsonl"; do
            if [ -f "$file" ] && [ -s "$file" ]; then
                src_name=$(basename "$file")
                dst_file="$KNOWLEDGE_DIR/$src_name"
                # Skip if same file (running from framework dir)
                if [ "$(realpath "$file" 2>/dev/null)" = "$(realpath "$dst_file" 2>/dev/null)" ]; then
                    continue
                fi
                if [ ! -f "$dst_file" ]; then
                    cp "$file" "$dst_file"
                    created_files=$((created_files + 1))
                    pulled_new=$((pulled_new + $(wc -l < "$file" 2>/dev/null || echo "0")))
                else
                    # Append only new entries (dedup by content)
                    while IFS= read -r entry; do
                        if [ -n "$entry" ]; then
                            entry_content=$(echo "$entry" | jq -r '.content // ""' 2>/dev/null)
                            if [ -n "$entry_content" ] && ! grep -qF "$entry_content" "$dst_file" 2>/dev/null; then
                                echo "$entry" >> "$dst_file"
                                pulled_new=$((pulled_new + 1))
                            else
                                pulled_dup=$((pulled_dup + 1))
                            fi
                        fi
                    done < "$file"
                fi
            fi
        done
        if [ "$JSON_OUTPUT" != "true" ] && [ "$QUIET_OUTPUT" != "true" ]; then
            echo -e "  Pulled $pulled_new new entries"
        fi

        # Phase 2: Push (project → central) via harvest
        if [ "$JSON_OUTPUT" != "true" ] && [ "$QUIET_OUTPUT" != "true" ]; then
            echo -e "${BLUE}[STEP 2/2]${NC} Harvesting project knowledge to central..."
        fi
        HARVEST_SCRIPT="$FRAMEWORK_DIR/scripts/harvest.sh"
        harvest_json='{"status":"ok","harvested":0,"skipped":{"sensitive":0,"duplicate":0,"scope":0}}'
        if [ -f "$HARVEST_SCRIPT" ]; then
            harvest_json=$(bash "$HARVEST_SCRIPT" "$PROJECT_DIR" --json --quiet 2>/dev/null || echo "$harvest_json")
        fi

        harvested_count=0
        harvest_dup=0
        harvest_scope=0
        harvest_sensitive=0
        harvested_count=$(echo "$harvest_json" | jq -r '.harvested // 0' 2>/dev/null || echo 0)
        harvest_dup=$(echo "$harvest_json" | jq -r '.skipped.duplicate // 0' 2>/dev/null || echo 0)
        harvest_scope=$(echo "$harvest_json" | jq -r '.skipped.scope // 0' 2>/dev/null || echo 0)
        harvest_sensitive=$(echo "$harvest_json" | jq -r '.skipped.sensitive // 0' 2>/dev/null || echo 0)

        if [ "$JSON_OUTPUT" = "true" ]; then
            jq -nc \
                --arg status "ok" \
                --arg project "$PROJECT_DIR" \
                --arg framework "$FRAMEWORK_DIR" \
                --argjson pull_candidates "$pull_count" \
                --argjson push_candidates "$push_count" \
                --argjson pulled_new "$pulled_new" \
                --argjson pulled_duplicates "$pulled_dup" \
                --argjson files_created "$created_files" \
                --argjson harvested "$harvested_count" \
                --argjson harvest_skipped_duplicate "$harvest_dup" \
                --argjson harvest_skipped_scope "$harvest_scope" \
                --argjson harvest_skipped_sensitive "$harvest_sensitive" \
                '{status:$status,project:$project,framework:$framework,pull:{candidates:$pull_candidates,new_entries:$pulled_new,duplicates_skipped:$pulled_duplicates,files_created:$files_created},push:{candidates:$push_candidates,harvested:$harvested,skipped:{duplicate:$harvest_skipped_duplicate,scope:$harvest_skipped_scope,sensitive:$harvest_skipped_sensitive}}}'
        elif [ "$QUIET_OUTPUT" != "true" ]; then
            echo ""
            echo -e "${GREEN}[PASS]${NC} Sync complete"
            echo -e "  Pull: $pulled_new new, $pulled_dup duplicates skipped, $created_files files created"
            echo -e "  Push: $harvested_count harvested, $harvest_dup duplicate/$harvest_scope scope/$harvest_sensitive sensitive skipped"
        fi
        ;;
    hub)
        shift
        HUB_SCRIPT="$FRAMEWORK_DIR/scripts/knowledge-sync.sh"
        if [ -f "$HUB_SCRIPT" ] && [ -x "$HUB_SCRIPT" ]; then
            bash "$HUB_SCRIPT" "$@"
        else
            echo "Error: knowledge-sync.sh not found at $HUB_SCRIPT"
            exit 1
        fi
        ;;
    *)
        echo "Usage: $0 {remember|recall|correct|status|harvest|sync|hub} [args]"
        echo ""
        echo "Commands:"
        echo "  remember <content> [--type=fact|decision|error|preference] [--tags=tag1,tag2]"
        echo "  recall <query> [--type=fact|decision|error|preference] [--limit=N]"
        echo "  correct <content> --id=<uuid>"
        echo "  status"
        echo "  harvest [path|--all|--promote|--status]"
        echo "  sync [project-path]"
        echo "  hub [setup|push|pull|scratchpad|metrics|status]"
        exit 1
        ;;
esac
