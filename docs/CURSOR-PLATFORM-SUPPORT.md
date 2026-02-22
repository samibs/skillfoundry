# Cursor Platform Support - Release Notes

**Date**: January 25, 2026  
**Version**: 1.3.1  
**Feature**: Cursor Platform Integration

---

## Overview

SkillFoundry Framework now supports **Cursor** as a third platform alongside Claude Code and GitHub Copilot CLI. Cursor users can now leverage the same powerful agent workflows through Cursor's rule-based system.

---

## What's New

### Cursor Rules Integration

- **22 Rules Created**: All Claude Code skills converted to Cursor rules format
- **Automatic Loading**: Rules are automatically loaded by Cursor from `.cursor/rules/`
- **Same Functionality**: Full feature parity with Claude Code skills
- **Easy Usage**: Reference rules by name in Cursor chat

### Installation

**Windows PowerShell**:
```powershell
cd C:\DevLab\MyNewProject
C:\DevLab\IDEA\skillfoundry\install.ps1 -Platform cursor
```

**Linux/Mac (bash)**:
```bash
cd ~/DevLab/MyNewProject
~/DevLab/IDEA/skillfoundry/install.sh --platform=cursor
```

### Directory Structure

After installation:
```
YourProject/
├── .cursor/
│   └── rules/              # 22 rules for Cursor
│       ├── go.md           # Project kickstart
│       ├── prd.md          # PRD creation
│       ├── coder.md        # Implementation
│       ├── tester.md       # Testing
│       └── ...             # 18 more rules
├── agents/                 # Shared modules
├── genesis/                # PRD repository
└── [your code]
```

---

## Usage in Cursor

### Basic Usage

1. **Open Cursor** in your project directory
2. **Rules are automatically loaded** from `.cursor/rules/`
3. **Reference rules** in Cursor chat:
   - "use go rule" - Start project implementation
   - "follow coder rule" - Implement with TDD
   - "use layer-check rule" - Validate three layers
   - "follow prd rule" - Create PRD

### Example Workflow

```
User: "Use go rule to implement all PRDs in genesis/"
Cursor: [Follows go.md rule - validates PRDs, generates stories, implements]

User: "Follow coder rule to implement authentication service"
Cursor: [Follows coder.md rule - TDD implementation with security checks]

User: "Use layer-check rule to validate database layer"
Cursor: [Follows layer-check.md rule - validates database migrations]
```

---

## Available Rules

All 22 rules from Claude Code are available:

| Rule | Purpose |
|------|---------|
| `go.md` | Project kickstart orchestrator |
| `prd.md` | PRD creation |
| `coder.md` | Ruthless implementation with TDD |
| `tester.md` | Brutal testing |
| `architect.md` | Architecture review |
| `layer-check.md` | Three-layer validation |
| `debugger.md` | Systematic debugging |
| `evaluator.md` | BPSBS compliance |
| `gate-keeper.md` | Capability verification |
| `standards.md` | Standards enforcement |
| `context.md` | Context management |
| `metrics.md` | Metrics dashboard |
| `memory.md` | Memory curation |
| `docs.md` | Documentation |
| `workflow.md` | Workflow guidance |
| `orchestrate.md` | Project orchestration |
| `delegate.md` | Task delegation |
| `auto.md` | Auto-discovery |
| `learn.md` | Learning mode |
| `math-check.md` | Mathematical validation |
| `CLAUDE.md` | BPSBS standards |
| `stories.md` | Story generation |

---

## Platform Comparison

| Feature | Claude Code | Copilot CLI | Cursor |
|---------|-------------|-------------|--------|
| **Command Syntax** | `/command` | `task()` | Rule reference |
| **Rules/Skills/Agents** | 22 skills | 28 agents | 22 rules |
| **Auto-loading** | ✅ | ✅ | ✅ |
| **GitHub Integration** | ❌ | ✅ | ❌ |
| **Security Scanner** | ✅ | ✅ | ✅ |
| **TDD Enforcement** | ✅ | ✅ | ✅ |
| **Parallel Execution** | ✅ | ✅ | ✅ |

---

## Migration from Other Platforms

### From Claude Code to Cursor

1. Install Cursor platform:
   ```bash
   install.sh --platform=cursor
   ```

2. Rules are automatically available
3. Use same workflows, just reference rules instead of commands

### From Copilot CLI to Cursor

1. Install Cursor platform:
   ```bash
   install.sh --platform=cursor
   ```

2. Rules provide similar functionality to agents
3. Reference rules by name instead of using `task()` tool

---

## Windows Support

### PowerShell Scripts

**New Files**:
- `install.ps1` - PowerShell installer for Windows
- `update.ps1` - PowerShell updater for Windows

**Usage**:
```powershell
# Install
.\install.ps1 -Platform cursor

# Update
.\update.ps1 -Project C:\path\to\project
.\update.ps1 -All
```

**Features**:
- ✅ Full feature parity with bash scripts
- ✅ Windows path handling
- ✅ Color-coded output
- ✅ Error handling
- ✅ Platform detection

---

## Technical Details

### Rule Format

Cursor rules are markdown files in `.cursor/rules/` directory. They follow the same structure as Claude Code skills but are optimized for Cursor's rule-based system.

### Platform Detection

The installer and updater automatically detect the platform:
- Checks for `.claude/` → Claude Code
- Checks for `.copilot/` → Copilot CLI
- Checks for `.cursor/` → Cursor

### Update Compatibility

The `update.sh` and `update.ps1` scripts automatically:
- Detect platform type
- Update platform-specific files
- Preserve custom configurations
- Create backups before updates

---

## Benefits

1. **Consistency**: Same workflows across all platforms
2. **Flexibility**: Choose the platform that fits your workflow
3. **Cross-Platform**: Works on Windows, Linux, and Mac
4. **Easy Migration**: Switch platforms without losing functionality

---

## Next Steps

1. **Install Cursor platform** in your project
2. **Open Cursor** and start using rules
3. **Reference rules** by name in chat
4. **Enjoy** the same powerful workflows

---

**Version**: 1.3.1  
**Date**: January 25, 2026  
**Platform**: Cursor + Windows PowerShell
