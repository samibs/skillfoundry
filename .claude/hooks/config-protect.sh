#!/bin/bash
# Config Protection Hook — PreToolUse for Edit|Write
#
# Blocks modifications to linter, formatter, and build config files.
# Forces agents to fix the actual code instead of weakening rules.
#
# Exit codes:
#   0 = Allow (not a protected config file)
#   0 + deny JSON = Block (protected config)

set -o pipefail

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
    exit 0
fi

BASENAME=$(basename "$FILE_PATH")
DIRNAME=$(dirname "$FILE_PATH")

# Protected config file patterns
PROTECTED_CONFIGS=(
    # ESLint
    ".eslintrc"
    ".eslintrc.js"
    ".eslintrc.cjs"
    ".eslintrc.json"
    ".eslintrc.yml"
    ".eslintrc.yaml"
    "eslint.config.js"
    "eslint.config.mjs"
    "eslint.config.cjs"
    # Prettier
    ".prettierrc"
    ".prettierrc.js"
    ".prettierrc.cjs"
    ".prettierrc.json"
    ".prettierrc.yml"
    ".prettierrc.yaml"
    "prettier.config.js"
    "prettier.config.cjs"
    "prettier.config.mjs"
    # TypeScript
    "tsconfig.json"
    "tsconfig.build.json"
    "tsconfig.app.json"
    "tsconfig.spec.json"
    # Biome
    "biome.json"
    "biome.jsonc"
    # Stylelint
    ".stylelintrc"
    ".stylelintrc.json"
    ".stylelintrc.js"
    # EditorConfig
    ".editorconfig"
    # Ruff (Python)
    "ruff.toml"
    # Flake8
    ".flake8"
    # MyPy
    "mypy.ini"
    ".mypy.ini"
    # Pylint
    ".pylintrc"
    "pylintrc"
)

for config in "${PROTECTED_CONFIGS[@]}"; do
    if [ "$BASENAME" = "$config" ]; then
        cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Config Protection: '$BASENAME' is a protected linter/formatter config. Fix the code to satisfy the rules instead of changing the rules. If you genuinely need to update this config (e.g., adding a new plugin), ask the user for approval first."
  }
}
EOF
        exit 0
    fi
done

# Not a protected config — allow
exit 0
