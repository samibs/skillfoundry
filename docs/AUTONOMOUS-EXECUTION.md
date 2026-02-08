# Autonomous Execution Setup Guide

**Version**: 1.7.0.2
**Status**: IMPLEMENTATION
**Date**: February 7, 2026

---

## The Problem

When using the Dream Team agents in VS Code or Claude Code, every tool call (file edit, bash command, search) triggers a permission prompt. Even with `/go --mode=autonomous`, the framework's internal autonomy doesn't prevent Claude Code's own permission system from interrupting the workflow.

**Two separate permission layers exist:**

```
Layer 1: Claude Code Tool Permissions (the interrupting layer)
  ├── "Can I edit this file?" → [Allow] [Deny]
  ├── "Can I run npm test?"   → [Allow] [Deny]
  └── "Can I create this?"    → [Allow] [Deny]

Layer 2: Framework Quality Gates (the guardrail layer)
  ├── Gate Keeper → Quality validation
  ├── Fixer Orchestrator → Auto-remediation
  ├── Evaluator → Code review
  └── Layer Check → Three-layer validation
```

**Solution**: Configure Layer 1 to pre-approve safe operations, letting Layer 2 (which is much smarter and context-aware) handle safety.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SAFETY ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  LAYER 1: Claude Code Permissions (.claude/settings.json)│   │
│  │                                                          │   │
│  │  allow: [Read, Edit, Write, Bash(npm *), git *, ...]    │   │
│  │  deny:  [rm -rf /, force push main, mkfs, ...]         │   │
│  │  hooks: [validate-bash.sh → emergency deny patterns]    │   │
│  │                                                          │   │
│  │  Purpose: Pre-approve safe tool operations              │   │
│  │  Result:  No permission popups for normal dev work      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ↓ (tool calls pass through)            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  LAYER 2: Framework Guardrails (agents + quality gates)  │   │
│  │                                                          │   │
│  │  Gate Keeper    → Zero-tolerance quality enforcement     │   │
│  │  Fixer          → Auto-fix routine violations            │   │
│  │  Evaluator      → BPSBS compliance review               │   │
│  │  Layer Check    → DB → Backend → Frontend validation     │   │
│  │  Security Scan  → OWASP + anti-pattern detection         │   │
│  │  Escalation     → User decisions for ambiguous cases     │   │
│  │                                                          │   │
│  │  Purpose: Context-aware quality and safety enforcement   │   │
│  │  Result:  Code meets production standards automatically  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Setup

### Option 1: Fresh Install (Automatic)

When installing the framework with `install.sh --platform claude`, the permission profile and hooks are automatically deployed to your project.

### Option 2: Existing Installation (Manual)

Copy the configuration files to your project:

```bash
# From your project directory
FRAMEWORK_DIR="/path/to/claude_as"

# Copy shared settings (permission profile)
cp "$FRAMEWORK_DIR/.claude/settings.json" .claude/settings.json

# Copy hooks directory
mkdir -p .claude/hooks
cp "$FRAMEWORK_DIR/.claude/hooks/validate-bash.sh" .claude/hooks/
chmod +x .claude/hooks/validate-bash.sh
```

### Option 3: VS Code Settings

In VS Code with the Claude extension, you can also configure permissions through the extension settings. The `.claude/settings.json` file takes precedence for project-level configuration.

---

## What Gets Pre-Approved

### File Operations (All Allowed)

| Tool | Status | Reason |
|------|--------|--------|
| `Read` | Pre-approved | Read-only, zero risk |
| `Edit` | Pre-approved | Framework guardrails validate quality |
| `Write` | Pre-approved | Framework guardrails validate quality |
| `Glob` | Pre-approved | Search-only, zero risk |
| `Grep` | Pre-approved | Search-only, zero risk |
| `NotebookEdit` | Pre-approved | Same as Edit for notebooks |
| `WebSearch` | Pre-approved | Read-only research |

### Bash Commands (Categorized)

**Development Tools** (Pre-approved):
```
npm run *, npm test *, npm install *, npx *
python *, python3 *, pytest *
dotnet *
node *
```

**Git Operations** (Pre-approved):
```
git status, git diff, git log, git add, git commit
git branch, git checkout, git switch, git stash
git merge, git rebase, git worktree, git show
git rev-parse, git ls-files, git remote
```

**File System** (Pre-approved):
```
chmod, mkdir, cp, mv, ls, tree, wc, du
touch, head, tail, cat, sort, uniq, diff
stat, file, basename, dirname, realpath
```

**Docker** (Pre-approved, read + compose):
```
docker ps, docker logs, docker inspect, docker images
docker compose up, docker compose down, docker compose build
```

**Framework Scripts** (Pre-approved):
```
./parallel/*, ./scripts/*
bash *, sh *
```

**GitHub CLI** (Pre-approved):
```
gh pr *, gh issue *, gh api *, gh repo *
```

**Subagents** (Pre-approved):
```
Task (all subagent types)
```

### Denied Operations (Always Blocked)

| Command | Reason |
|---------|--------|
| `rm -rf /`, `rm -rf ~` | System destruction |
| `mkfs*`, `dd if=* of=/dev/*` | Disk destruction |
| `chmod 777 /` | System permission destruction |
| `curl * \| bash`, `wget * \| sh` | Remote code execution |
| `git push --force origin main/master` | Protected branch force push |
| `git reset --hard origin/*` | Unrecoverable history loss |
| `git clean -fdx` | Untracked file destruction |
| Fork bombs | System crash |

### Hook: Emergency Deny Patterns

The `validate-bash.sh` hook catches dangerous patterns that might slip through wildcard permission rules. It runs on **every** bash command and blocks:

- Destructive filesystem operations on system paths
- Disk destruction commands
- Piped execution from network (command injection vectors)
- Force push to protected branches
- Environment variable exfiltration attempts
- Cryptocurrency mining patterns

---

## Permission Scopes Explained

### Project Settings vs Local Settings

```
.claude/settings.json        ← Shared with team (committed to git)
.claude/settings.local.json  ← Your personal overrides (gitignored)
~/.claude/settings.json      ← Global user settings (all projects)
```

**Precedence**: `deny` rules always win, then project > user > defaults.

### Customizing Permissions

**To add more allowed commands** (e.g., your project uses `pnpm`):

Edit `.claude/settings.local.json`:
```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm *)",
      "Bash(turbo *)",
      "Bash(bun *)"
    ]
  }
}
```

**To restrict permissions** (e.g., block docker):

Edit `.claude/settings.local.json`:
```json
{
  "permissions": {
    "deny": [
      "Bash(docker *)"
    ]
  }
}
```

**To require approval for specific operations**:

Use the `ask` permission level in your local settings:
```json
{
  "permissions": {
    "ask": [
      "Bash(git push *)"
    ]
  }
}
```

---

## Combining with Framework Execution Modes

The permission profile works with all three framework execution modes:

| Framework Mode | Permission Profile | Result |
|----------------|-------------------|--------|
| `/go --mode=supervised` | Pre-approved tools | No tool prompts, but framework stops at every quality violation |
| `/go --mode=semi-auto` | Pre-approved tools | No tool prompts, auto-fixes routine issues, escalates critical decisions |
| `/go --mode=autonomous` | Pre-approved tools | No tool prompts, full auto-remediation, checkpoint only at project end |

**Recommended combination for maximum autonomy:**

```
/go --mode=autonomous
```

With the permission profile deployed, this gives you:
- Zero Claude Code permission interruptions
- Zero framework interruptions for routine quality fixes
- User checkpoint only at project completion
- Full audit trail in `logs/remediations.md` and `logs/escalations.md`

---

## Safety Guarantees

Even with full autonomy, the following safety layers remain active:

### Layer 1: Permission Deny List
- Destructive system commands are always blocked
- Force push to main/master is always blocked
- Remote code execution patterns are always blocked

### Layer 2: Validation Hook
- Emergency deny patterns catch dangerous commands that bypass wildcard rules
- Suspicious patterns (sudo, eval, exec) generate audit warnings

### Layer 3: Framework Quality Gates
- Gate Keeper enforces zero-tolerance banned patterns
- No TODO, FIXME, PLACEHOLDER, STUB, MOCK in production code
- Three-layer validation (DB, Backend, Frontend) must all pass
- Security scanner checks OWASP Top 10 + anti-patterns
- Evaluator performs BPSBS compliance review

### Layer 4: Escalation Criteria
- Architectural decisions always escalate to user
- Business logic ambiguities always escalate
- Security/compliance policy choices always escalate
- Breaking API changes always escalate

### Layer 5: Audit Trail
- All auto-fixes logged with timestamp, agent, story, attempt count
- All escalations logged with options presented and decision made
- Remediation log available for post-execution review

---

## Troubleshooting

### Still Getting Permission Prompts

1. **Check settings.json is in the right location**: Must be at `.claude/settings.json` in your project root
2. **Check the hook is executable**: `chmod +x .claude/hooks/validate-bash.sh`
3. **Check for conflicting settings**: Local settings (`.claude/settings.local.json`) `deny` rules override `allow`
4. **Reinstall**: Run the framework installer again to redeploy settings

### Hook Blocking Legitimate Commands

If the validation hook incorrectly blocks a command:

1. Check which pattern triggered: The error message includes the matched pattern
2. Review `validate-bash.sh` and adjust the `EMERGENCY_DENY_PATTERNS` array
3. The hook is designed to be fail-open: only explicitly dangerous patterns are blocked

### Adding Custom Commands

If your project uses tools not in the default allowlist:

```json
// .claude/settings.local.json
{
  "permissions": {
    "allow": [
      "Bash(your-custom-tool *)",
      "Bash(make *)",
      "Bash(cargo *)",
      "Bash(go *)"
    ]
  }
}
```

---

## Platform-Specific Notes

### Claude Code (Terminal)

The permission profile works natively. Use `--dangerously-skip-permissions` only for fully isolated environments (CI/CD containers). For normal development, the settings.json approach is safer and more granular.

### VS Code with Claude Extension

The `.claude/settings.json` file is automatically picked up by the Claude extension. No additional VS Code settings are needed.

### Cursor

Cursor uses `.cursor/rules/` for agent definitions. The `.claude/settings.json` permission system is Claude Code-specific. For Cursor, permissions are managed through the Cursor settings UI.

### GitHub Copilot CLI

Permission management is handled through the GitHub Copilot CLI configuration. The framework's quality gates (Gate Keeper, Evaluator) still apply regardless of platform.

---

**Last Updated**: February 7, 2026
**Version**: 1.7.0.2
