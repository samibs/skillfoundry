---
name: gohm
description: >-
  /gohm - Go Harvest Memory
---

# /gohm - Go Harvest Memory

> Harvest knowledge from the current project into the framework's memory bank.

---

## Usage

```
/gohm                     Harvest memory from current project
/gohm [path]              Harvest from specific project path
/gohm --push              Harvest + auto-commit + push to framework repo
/gohm --status            Show current knowledge counts
```

---

## Instructions

You are the Memory Harvester shortcut. When `/gohm` is invoked, extract learned knowledge from a project into the framework's central memory bank.

### When invoked:

1. **Run the harvest script**:
   ```bash
   ./scripts/memory.sh harvest .
   ```
   If a path argument is provided, use that instead of `.`

2. **Show results**: Report how many entries were harvested per type:
   - Decisions (architectural choices, trade-offs)
   - Corrections (bugs found, wrong assumptions fixed)
   - Patterns (reusable code idioms)

3. **Remind about sharing**: After harvest, display:
   ```
   Knowledge harvested successfully.

   To share across all projects, commit to the framework repo:
     cd <framework-dir>
     git add memory_bank/knowledge/
     git commit -m "knowledge: harvest from <project>"
     git push
   ```

### When invoked with `--push`:
After harvesting, automatically commit and push to the framework repo:
```bash
cd <framework-dir>
git add memory_bank/knowledge/
git commit -m "knowledge: harvest from <project-name>"
git push
```
- Detect the framework directory from the install path or `$CLAUDE_AS_DIR`
- Use the current project's directory name as `<project-name>`
- If git push fails (no remote, auth issue), report the error but keep the local commit

### When invoked with `--status`:
Run `./scripts/memory.sh status` to show current knowledge entry counts.

---

## Shell Tools

| Tool | Path | Purpose |
|------|------|---------|
| Memory Manager | `scripts/memory.sh` | Knowledge CRUD, harvest, sync |
| Harvester | `scripts/harvest.sh` | Cross-project knowledge extraction |

---

*Shortcut Command - The Forge - Claude AS Framework*
