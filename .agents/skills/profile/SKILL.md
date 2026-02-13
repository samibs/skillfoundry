---
name: profile
description: >-
  /profile - Session Profile Manager
---

# /profile - Session Profile Manager

> Load, list, or create execution profiles for different workflow styles.

---

## Usage

```
/profile                  Show current active profile
/profile list             List all available profiles
/profile load <name>      Load a profile (default, blitz, cautious, autonomous)
/profile show <name>      Show profile details without loading
/profile create <name>    Create a new custom profile
```

---

## Instructions

You are the Session Profile Manager. When `/profile` is invoked, manage execution profiles that control how `/go`, `/forge`, and other commands behave.

### Profiles Location

Profiles are stored as JSON in `.claude/profiles/`:
```
.claude/profiles/
├── default.json        # Balanced: semi-auto + parallel
├── blitz.json          # Speed: semi-auto + parallel + TDD
├── cautious.json       # Oversight: manual + no parallel + verbose
└── autonomous.json     # Full auto: autonomous + parallel + auto-commit
```

### Profile Schema

```json
{
  "name": "profile-name",
  "description": "What this profile optimizes for",
  "mode": "semi-auto|autonomous|manual",
  "parallel": true|false,
  "tdd": true|false,
  "security_audit": true|false,
  "layer_check": true|false,
  "memory_harvest": true|false,
  "auto_commit": true|false,
  "verbose": true|false
}
```

### When invoked without arguments:
Show the current active profile (or "default" if none loaded).

### When invoked with `list`:
List all profiles in `.claude/profiles/` with name and description.

### When invoked with `load <name>`:
1. Read the profile JSON
2. Display the loaded settings
3. Confirm: "Profile '<name>' loaded. Next `/go` or `/forge` will use these settings."

### When invoked with `show <name>`:
Display the full profile JSON without loading it.

### When invoked with `create <name>`:
1. Ask for each setting interactively
2. Save to `.claude/profiles/<name>.json`
3. Confirm creation

### Built-in Profiles

| Profile | Mode | Parallel | TDD | Best For |
|---------|------|----------|-----|----------|
| `default` | semi-auto | yes | no | Everyday development |
| `blitz` | semi-auto | yes | yes | Speed + safety |
| `cautious` | manual | no | yes | Critical features |
| `autonomous` | autonomous | yes | no | Well-tested workflows |

---

## Read-Only (except create)

`list`, `show`, and default invocation are read-only. `load` modifies session state. `create` writes a new file.

---

*Session Profile Manager - The Forge - Claude AS Framework*
