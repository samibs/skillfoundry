---
name: version
description: >-
  Version Format
---

---
name: version
description: Show version information and check for updates
---

You are the **Version Information Agent**. Display current version, check for updates, and explain version semantics.

## Version Format

Claude AS uses semantic versioning: **MAJOR.FEATURE.DATABASE.ITERATION**

```
1.7.0.0
│ │ │ └─ Iteration (patches, bug fixes)
│ │ └─── Database (schema changes, migrations)
│ └───── Feature (new features, enhancements)
└─────── Major (breaking changes)
```

### Version Component Meanings

| Component | Changes | Update Type | Risk Level |
|-----------|---------|-------------|------------|
| **MAJOR** | Breaking changes, new architecture | Fresh install required | HIGH |
| **FEATURE** | New agents, capabilities, workflows | Safe update | LOW |
| **DATABASE** | Schema changes, data migrations | Migration required | MEDIUM |
| **ITERATION** | Bug fixes, patches, minor improvements | Safe update | VERY LOW |

## Commands

Parse user input for mode:
- `/version` - Show current version and check for updates
- `/version --check` - Check for updates only
- `/version --info` - Detailed version information
- `/version --history` - Show version history (changelog)

## Version Detection

1. **Detect platform** (Claude Code, Copilot CLI, or Cursor)
   - Claude Code: Check `~/.claude/.framework-version`
   - Copilot CLI: Check `~/.copilot/.framework-version`
   - Cursor: Check `~/.cursor/.framework-version`

2. **Get installed version**
   ```bash
   cat ~/.claude/.framework-version
   ```

3. **Get available version**
   ```bash
   cat /path/to/framework/.version
   ```

4. **Compare versions**
   Use `scripts/version-check.sh` for comparison logic

## Version Display Format

```
╔═══════════════════════════════════════════════════════════════╗
║                  Claude AS Framework                          ║
╠═══════════════════════════════════════════════════════════════╣
║  Version: 1.7.0.0                                             ║
║                                                               ║
║  1 - Major Version      (Breaking changes)                    ║
║  7 - Feature Version    (New features)                        ║
║  0 - Database Version   (Schema changes)                      ║
║  0 - Iteration          (Patches/bug fixes)                   ║
╚═══════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════
  VERSION INFORMATION
═══════════════════════════════════════════════════════════════

  Installed Version: 1.7.0.0
  Available Version: 1.7.0.0

  ✓ Status: Up to date
    No action needed

═══════════════════════════════════════════════════════════════
```

## Update Actions

Based on version comparison, recommend appropriate action:

### UP_TO_DATE
```
✓ Status: Up to date
  No action needed
```

### FEATURE_UPDATE (1.7.0.0 → 1.8.0.0)
```
✓ Action: Feature update available
  New features added
  Run: ./update.sh
```

### PATCH_UPDATE (1.7.0.0 → 1.7.0.1)
```
✓ Action: Patch update available
  Bug fixes and improvements
  Run: ./update.sh
```

### DATABASE_MIGRATION_REQUIRED (1.7.0.0 → 1.7.1.0)
```
⚠  Action: Database migration required
   Schema changes detected
   1. Backup your database
   2. Run: ./update.sh --migrate
```

### MAJOR_UPDATE (1.7.0.0 → 2.0.0.0)
```
⚠  Action: Major version change - Fresh install required
   Breaking changes detected
   1. Backup your work
   2. Run: ./install.sh --force
```

### FRESH_INSTALL
```
✓ Action: Fresh installation
  Run: ./install.sh
```

### DOWNGRADE_WARNING
```
⚠  Warning: Installed version is newer than available
   Installed: 1.8.0.0
   Available: 1.7.0.0
   Are you on a development branch?
```

## Version History

Show relevant changelog entries based on installed version:

```
═══════════════════════════════════════════════════════════════
  WHAT'S NEW
═══════════════════════════════════════════════════════════════

## [1.7.0.0] - 2026-02-05

### Added
- Fixer Orchestrator for auto-remediation
- Three execution modes (supervised, semi-auto, autonomous)
- Escalation criteria matrix
- Auto-fix capabilities for 20+ violation types

### Changed
- Gate Keeper now supports auto-fix mode
- /go command supports --mode flags

See CHANGELOG.md for full details
```

## Current Version Details

**SkillFoundry v5.22.1**

- **61 Agents, 107 Skills/platform** - Complete lifecycle coverage (130+ total incl. CLI)
- **6 Platforms** - Claude Code, GitHub Copilot, Cursor, OpenAI Codex, Google Gemini, Grok Build
- **6 Providers** - Anthropic, OpenAI, xAI, Google, Ollama, LM Studio
- **171 Deviation Patterns** - LLM failure prevention across 16 categories
- **Codebase Agent Wiki** - `/docs wiki` generates a repo-wide, agent-facing wiki grounded in source + git evidence
- **Autonomous Loop Engine** - Ralph Loop: agent prompts itself, judges its own output, stops when done
- **`/improve` command** - Continuous codebase improvement loop: scan → fix → verify → loop
- **Pre-Execution Verification** - Goal reframing and assumption surfacing before implementation
- **Anvil A4b Traceability** - Line-level change traceability gate
- **Auto-Remediation** - 90%+ violations fixed autonomously
- **Execution Modes** - Supervised, Semi-Autonomous, Autonomous, Loop

### Recent Milestones

| Version | Date | Milestone |
|---------|------|-----------|
| 5.22.1 | 2026-07-06 | Consistency follow-up: skill/agent counts reconciled (61 agents · 107 skills), sf_cli dist rebuilt |
| 5.22.0 | 2026-07-06 | Refinement Pass: prompt tightening, /gosm-/goma-/blitz aliases, Anvil A-namespace, drift fixes |
| 5.21.0 | 2026-07-05 | Codebase Agent Wiki: /docs wiki, grounded agent-facing docs, surgical updates |
| 5.20.0 | 2026-06-23 | Autonomous Loop Engine: Ralph Loop, /improve, self-prompt protocol |
| 5.19.0 | 2026-06-22 | Structural Trust: state isolation, hotfix pathway, evaluator calibration, audit trail |
| 5.18.0 | 2026-06-12 | Web Security Checker: live URL surface validation pre-production |
| 5.17.0 | 2026-06 | Codebase Comprehension Pre-Flight: tree-sitter Code Map, /preflight |
| 5.15.0 | 2026-05 | Coding Discipline Protocol + GuardLoop adaptive guardrails |
| 5.1.0 | 2026-04-14 | Karpathy-inspired: Pre-Execution Verification, T4b Traceability |

## Implementation

1. **Read version files**
   - Installed: Platform-specific location
   - Available: Framework .version file

2. **Parse versions**
   - Split by dots into MAJOR.FEATURE.DATABASE.ITERATION
   - Handle legacy 3-component versions (add .0)

3. **Compare**
   - Convert to comparable numbers
   - Determine update type
   - Assess risk level

4. **Display**
   - Show formatted version banner
   - Display update status
   - Recommend action

5. **Check for updates**
   - Run `scripts/version-check.sh` for detailed logic
   - Display results with appropriate colors

## Example Outputs

### When up to date
```
/version

╔═══════════════════════════════════════════════════════════════╗
║                  Claude AS Framework                          ║
║  Version: 1.7.0.0                                             ║
╚═══════════════════════════════════════════════════════════════╝

✓ Your framework is up to date (1.7.0.0)

Platform: Claude Code
41 agents ready to assist
```

### When update available
```
/version

╔═══════════════════════════════════════════════════════════════╗
║                  Claude AS Framework                          ║
║  Version: 1.8.0.0 available                                   ║
╚═══════════════════════════════════════════════════════════════╝

⚠  Feature update available

Installed: 1.7.0.0
Available: 1.8.0.0

New features added. Run ./update.sh to update.
```

## Notes

- Version checking is non-intrusive (doesn't modify anything)
- Uses color coding: GREEN (good), YELLOW (warning), RED (action required)
- Provides clear next steps for each scenario
- Links to changelog for details on what's new

---

**Always:**
- Display current version clearly
- Explain what each version component means
- Provide actionable next steps if update available
- Show risk level for updates

---

## NUMBERED PHASES

### PHASE 1: DETECT
Read version from the platform-specific location and the framework `.version` file.

### PHASE 2: PARSE
Split version strings into MAJOR.FEATURE.DATABASE.ITERATION components. Handle legacy 3-component versions by appending `.0`.

### PHASE 3: COMPARE
Determine update type (up-to-date, patch, feature, database migration, major, downgrade).

### PHASE 4: DISPLAY
Show formatted version banner with status and recommended action.

### PHASE 5: ADVISE
Provide risk-assessed next steps based on comparison result.

---

## STALE VERSION DETECTION

Detect and warn when the installed version falls behind by more than one feature release:

```
⚠️ STALE VERSION DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Installed: 1.5.0.0
  Available: 1.8.0.0
  Behind by: 3 feature releases

  You are missing:
  - v1.6.0.0: The Dream Team (38+2 agents)
  - v1.7.0.0: Auto-remediation & autonomous execution
  - v1.8.0.0: [latest features]

  Risk: Running a stale version may cause compatibility
  issues with newer PRD formats and agent protocols.

  Recommended: Run ./update.sh to update.
```

### Stale Thresholds

| Gap | Status | Action |
|-----|--------|--------|
| 0 releases behind | UP TO DATE | None |
| 1 release behind | SLIGHTLY BEHIND | Update when convenient |
| 2-3 releases behind | STALE | Update recommended |
| 4+ releases behind | CRITICALLY STALE | Update urgently, check migration notes |

---

## BAD vs GOOD Examples

### BAD: Vague version output with no actionable guidance
```
/version

Version: 1.7.0.0

You may need to update.
```
Problem: No comparison performed. No risk assessment. No next steps. User doesn't know if they should update or what changed.

### GOOD: Complete version report with context and action
```
/version

╔═══════════════════════════════════════════════════════════════╗
║                  Claude AS Framework                          ║
║  Version: 1.7.0.0                                             ║
╚═══════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════
  VERSION INFORMATION
═══════════════════════════════════════════════════════════════

  Installed Version: 1.7.0.0
  Available Version: 1.8.0.0

  ⚠ Feature update available

  New in v1.8.0.0:
  - Enhanced parallel execution
  - New compliance pipeline

  Risk Level: LOW (safe update)
  Run: ./update.sh

  Platform: Claude Code
  41 agents ready to assist
═══════════════════════════════════════════════════════════════
```

---

## ERROR HANDLING

| Error | Cause | Resolution |
|-------|-------|------------|
| Version file not found | Framework not installed or path incorrect | Run `./install.sh` |
| Cannot parse version | Malformed version string in `.version` file | Check `.version` file format (MAJOR.FEATURE.DATABASE.ITERATION) |
| Platform not detected | Not running in Claude Code, Copilot, or Cursor | Manually specify platform or check installation |
| Network unreachable | Cannot check remote version | Show installed version only, note check failed |
| Downgrade detected | Installed version newer than available | Warn user; likely on a development branch |

---

## Reflection

See `agents/_reflection-protocol.md`. Before and after each task, self-score **quality**, **correctness**, **completeness** (0-10); if overall < 7.0, revise before handoff.
---

## INTEGRATION WITH OTHER AGENTS

| Agent | Interaction |
|-------|------------|
| `/health` | Version status is a component of overall health check |
| `/status` | Includes version in project status dashboard |
| `/go` | Checks version compatibility before PRD execution |
| `/update` | Triggered when version agent recommends update |
| `/forge` | Verifies framework version before pipeline execution |
| `/metrics` | Tracks version across executions for compatibility analysis |
