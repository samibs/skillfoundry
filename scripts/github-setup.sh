#!/bin/bash

# GitHub Repository Setup — Run once after making the repo public
# Requires: gh CLI authenticated (gh auth login)

set -e

REPO="samibs/claude_as"

echo "Setting repository description..."
gh repo edit "$REPO" \
  --description "The missing production discipline layer for AI-assisted development. 46 agents, 6-tier quality gate, PRD-first workflow. Works with Claude Code, GitHub Copilot CLI, Cursor, and OpenAI Codex."

echo "Setting repository topics..."
gh repo edit "$REPO" \
  --add-topic claude-code \
  --add-topic ai-agents \
  --add-topic developer-tools \
  --add-topic cursor \
  --add-topic github-copilot \
  --add-topic openai-codex \
  --add-topic ai-framework \
  --add-topic productivity \
  --add-topic code-quality \
  --add-topic prd \
  --add-topic quality-gate \
  --add-topic ai-assisted-development \
  --add-topic claude \
  --add-topic anthropic \
  --add-topic devtools

echo "Setting homepage..."
gh repo edit "$REPO" --homepage "https://github.com/samibs/claude_as#readme"

echo ""
echo "Done! Verify at: https://github.com/$REPO"
echo ""
echo "Next steps:"
echo "  1. Add a social preview image (Settings > General > Social preview)"
echo "     Recommended: 1280x640px with the pipeline diagram"
echo "  2. Pin the repo on your GitHub profile"
echo "  3. Enable Discussions (Settings > General > Features > Discussions)"
