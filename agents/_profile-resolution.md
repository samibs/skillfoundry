# Profile Resolution Protocol

> **CORE FRAMEWORK MODULE**
> Defines the merge order for configuration: global profile → shared project config → explicit flags.
> Enables agency/team profiles that deploy instantly to any new project.
> Referenced by: `onboard`, `feature-lifecycle` (Pre-flight P4), `testloop`, `forge`

---

## Purpose

Agency developers onboard each client repo from scratch. Team leads re-configure the same
rules across every project. This protocol enables a personal profile at `~/.claude/skillfoundry-profile.json`
that provides default values for any new project, reducing per-project setup to seconds.

---

## Resolution Order (Last Writer Wins)

```
1. Built-in defaults (SkillFoundry hardcoded)
   ↓ overridden by
2. Global profile (~/.claude/skillfoundry-profile.json)
   ↓ overridden by
3. Team profile (.claude/shared/team-profile.json, if pulled)
   ↓ overridden by
4. Project config (.claude/shared/config.json)
   ↓ overridden by
5. Explicit CLI flags (--tone, --exec-mode, --max, etc.)
```

At each level, only keys that are explicitly set override lower levels. Absent keys fall
through to the next level. No level can remove a key set by a lower level — only override it.

---

## Global Profile

Location: `~/.claude/skillfoundry-profile.json`

This file is personal, never committed to any project repo. It travels with the developer
across all projects on the same machine.

```json
{
  "_comment": "Personal SkillFoundry defaults. Applied to every project on this machine.",

  "tone": "professional",
  "execution_mode": "auto",

  "testloop": {
    "max_iterations": 3
  },

  "feature": {
    "max_challenge_cycles": 2,
    "shadow_tester": true
  },

  "semgrep": {
    "enabled": "auto"
  },

  "reports": {
    "generate_html": true,
    "output_dir": "reports/"
  },

  "commit": {
    "co_authored_by": "Claude Sonnet 4.6 <noreply@anthropic.com>"
  },

  "agency": {
    "default_story_prefix": "FEAT",
    "always_prompt_for_prd": false,
    "client_name_in_commits": false
  },

  "audit_webhook": ""
}
```

---

## Team Profile

Location: `.claude/shared/team-profile.json` (committed to the project repo)

Pulled during `/onboard --team-profile <url>` from a shared standards repo:

```bash
# Pull team profile from company standards repo
/onboard --team-profile https://github.com/mycompany/skillfoundry-standards/raw/main/team-profile.json

# Or from a local path
/onboard --team-profile ../company-standards/skillfoundry-team-profile.json
```

The team profile is written to `.claude/shared/team-profile.json` and committed.
All developers on the project get team defaults via git pull.

```json
{
  "_comment": "ACME Corp SkillFoundry team standards. Do not edit per-project.",
  "tone": "professional",
  "semgrep": { "enabled": "always" },
  "testloop": { "max_iterations": 5, "coverage_threshold_lines": 85 },
  "audit_webhook": "https://acme-compliance.internal/webhook/code-quality"
}
```

---

## Resolution at Runtime

When any agent needs a configuration value, it calls the resolution chain:

```
RESOLVE("tone"):
  1. Check CLI flag --tone → not set
  2. Check .claude/shared/config.json → not set
  3. Check .claude/shared/team-profile.json → "professional"
  4. ✓ Return "professional"

RESOLVE("testloop.max_iterations"):
  1. Check CLI flag --max → "--max 7" set
  2. ✓ Return 7 (CLI wins)

RESOLVE("reports.generate_html"):
  1. Check CLI flag → not set
  2. Check .claude/shared/config.json → "true"
  3. ✓ Return true
```

---

## Creating a Global Profile

During `/onboard`, if no global profile exists, offer to create one:

```
GLOBAL PROFILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
No global profile found at ~/.claude/skillfoundry-profile.json

Create one now? Your answers will apply to every new project.

  Tone: [1] cold-blooded  [2] professional
  HTML reports by default: [1] yes  [2] no
  Max testloop iterations: [default: 5]

(You can edit ~/.claude/skillfoundry-profile.json at any time)
```

If the user declines, onboard continues with SkillFoundry defaults only.

---

## Importing Profile Into New Project

For agency developers starting a new client engagement:

```bash
# Start onboard — global profile auto-applied
/onboard

PROFILE RESOLUTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Global profile:   ~/.claude/skillfoundry-profile.json ✓
Team profile:     none
Project config:   .claude/shared/config.json (new — will be created)

Effective settings:
  Tone:           professional (from global profile)
  Semgrep:        auto (from global profile)
  HTML reports:   true (from global profile)
  Max iterations: 3 (from global profile)

These will be written to .claude/shared/config.json.
Per-project overrides can be made there.
```

---

*Profile Resolution Protocol v1.0.0 — SkillFoundry Framework*
*Global profile → team profile → project config → CLI flags. Last writer wins.*
