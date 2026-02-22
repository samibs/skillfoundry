#!/bin/bash
# Claude AS Framework - Bash Command Validation Hook
# PreToolUse hook for Bash commands
#
# Exit codes:
#   0 = Allow the command
#   2 = Block the command (reason on stderr)
#
# This hook acts as the last-resort safety net when broad permissions
# are granted via settings.json. It catches dangerous patterns that
# might slip through wildcard permission rules.
#
# Version: 1.7.0.2
# Part of: Claude AS Framework - Autonomous Execution System

set -o pipefail

# Read the tool input from stdin (JSON format)
INPUT=$(cat)

# Extract the command being executed
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# If we can't parse the command, allow it (fail-open for non-bash tools)
if [ -z "$COMMAND" ]; then
    exit 0
fi

# ═══════════════════════════════════════════════════════════════
# EMERGENCY DENY LIST - Patterns that are NEVER safe
# These catch commands that could destroy the system regardless
# of how they're constructed (pipes, subshells, etc.)
# ═══════════════════════════════════════════════════════════════

EMERGENCY_DENY_PATTERNS=(
    # Destructive filesystem operations on system paths
    "rm -rf /$"
    "rm -rf /\*"
    "rm -rf /[a-z]"
    "rm -rf ~$"
    "rm -rf ~/\*"
    "rm -rf \\\$HOME"
    "rm -rf /home$"
    "rm -rf /usr"
    "rm -rf /etc"
    "rm -rf /var"
    "rm -rf /boot"
    "rm -rf /root"

    # Disk destruction
    "mkfs\."
    "dd if=.* of=/dev/"
    "> /dev/sd"
    "> /dev/nvme"

    # Fork bomb
    ":\(\)\{.*\|.*&.*\}.*:"

    # System permission destruction
    "chmod -R 777 /$"
    "chmod 777 /$"
    "chown -R .* /$"

    # Piped execution from network (command injection vector)
    "curl .* \| *bash"
    "curl .* \| *sh"
    "wget .* \| *bash"
    "wget .* \| *sh"
    "curl .* \| *sudo"
    "wget .* \| *sudo"

    # Force push to protected branches
    "git push --force.* main$"
    "git push --force.* master$"
    "git push -f.* main$"
    "git push -f.* master$"

    # Hard reset that destroys work
    "git reset --hard origin/"
    "git clean -fdx"

    # Environment variable exfiltration
    "env \| curl"
    "env \| nc "
    "printenv \| curl"
    "cat /etc/shadow"
    "cat /etc/passwd.*curl"

    # Crypto mining patterns
    "xmrig"
    "minerd"
    "stratum\+tcp"
)

for pattern in "${EMERGENCY_DENY_PATTERNS[@]}"; do
    if echo "$COMMAND" | grep -qiE "$pattern" 2>/dev/null; then
        echo "BLOCKED by Claude AS safety hook: Command matches emergency deny pattern" >&2
        echo "Pattern: $pattern" >&2
        echo "Command: $COMMAND" >&2
        exit 2
    fi
done

# ═══════════════════════════════════════════════════════════════
# SUSPICIOUS PATTERN WARNINGS
# These don't block but log warnings for audit purposes
# ═══════════════════════════════════════════════════════════════

SUSPICIOUS_PATTERNS=(
    "sudo "
    "su -"
    "eval "
    "exec "
    "nohup "
)

for pattern in "${SUSPICIOUS_PATTERNS[@]}"; do
    if echo "$COMMAND" | grep -qF "$pattern" 2>/dev/null; then
        echo "[WARN] Claude AS hook: Suspicious pattern detected: $pattern" >&2
        # Don't block, just warn - the command may be legitimate
        break
    fi
done

# ═══════════════════════════════════════════════════════════════
# ALLOW - Command passed all safety checks
# ═══════════════════════════════════════════════════════════════
exit 0
