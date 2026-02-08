# Troubleshooting Guide

Common issues and solutions for Claude AS Framework.

---

## Installation Issues

### Issue: `/go` command not found

**Symptoms**: Claude Code doesn't recognize `/go` command

**Causes**:
1. Framework folder copied into project instead of installed
2. `.claude/commands/` directory missing or incorrect location

**Solutions**:

```bash
# Check if you accidentally copied claude_as folder
ls -la | grep claude_as

# If found, remove it
rm -rf claude_as

# Reinstall properly
cd ~/your-project
~/path/to/claude_as/install.sh --platform=claude
```

**Verification**:
```bash
# Should show go.md and other commands
ls -la .claude/commands/
```

---

### Issue: Skills not recognized

**Symptoms**: Commands exist but Claude doesn't see them

**Causes**:
- `.claude/commands/` not at project root
- Wrong platform installed

**Solutions**:

```bash
# Verify location
pwd  # Should be project root
ls -la .claude/commands/go.md  # Should exist

# Check platform
cat .claude/.framework-platform  # Should be "claude" or "copilot"

# Reinstall if needed
~/path/to/claude_as/install.sh --platform=claude
```

---

### Issue: Install script fails

**Symptoms**: `install.sh` exits with error

**Common Causes**:

1. **Target directory doesn't exist**
   ```bash
   # Solution: Create directory first
   mkdir -p ~/my-project
   cd ~/my-project
   ~/path/to/claude_as/install.sh
   ```

2. **Permission denied**
   ```bash
   # Solution: Make script executable
   chmod +x ~/path/to/claude_as/install.sh
   ```

3. **Framework directory not found**
   ```bash
   # Solution: Use absolute path
   ~/dev_tools_20260120_latest/claude_as/install.sh
   ```

---

## Update Issues

### Issue: Update script doesn't find projects

**Symptoms**: `update.sh --list` shows no projects

**Causes**:
- Project not registered
- Registry file missing

**Solutions**:

```bash
# Register project manually
~/path/to/claude_as/update.sh --register /path/to/your/project

# Or scan for projects
~/path/to/claude_as/update.sh --scan ~/DevLab

# List registered projects
~/path/to/claude_as/update.sh --list
```

---

### Issue: Version mismatch after update

**Symptoms**: Framework version doesn't match after update

**Solutions**:

```bash
# Check current version
cat .claude/.framework-version

# Check framework version
cat ~/path/to/claude_as/.version

# Force update
~/path/to/claude_as/update.sh --force /path/to/your/project
```

---

## Workflow Issues

### Issue: `/go` finds no PRDs

**Symptoms**: `/go` reports "No PRDs found"

**Causes**:
- PRDs not in `genesis/` folder
- Wrong file extension or naming

**Solutions**:

```bash
# Check PRD location
ls -la genesis/

# PRDs should be:
# - In genesis/ folder
# - Have .md extension
# - Follow naming: YYYY-MM-DD-feature-name.md or feature-name.md

# Create PRD
/genesis/your-feature.md
# Or use /prd command
/prd "your feature idea"
```

---

### Issue: Stories not generating

**Symptoms**: `/go` validates PRDs but doesn't create stories

**Causes**:
- PRD validation failing
- Missing required PRD fields

**Solutions**:

```bash
# Validate PRD manually
/go --validate

# Check PRD template
cat genesis/TEMPLATE.md

# Ensure PRD has:
# - prd_id
# - title
# - problem_statement
# - user_stories
# - security_requirements
```

---

### Issue: Three-layer validation fails

**Symptoms**: `/layer-check` reports failures

**Common Causes**:

1. **Database layer**
   - Migrations not applied
   - Schema mismatch
   ```bash
   # Solution: Apply migrations
   # (framework-specific command)
   /layer-check db
   ```

2. **Backend layer**
   - Tests failing
   - Endpoints not working
   ```bash
   # Solution: Run tests
   /layer-check backend
   ```

3. **Frontend layer**
   - Mock data still present
   - API not connected
   ```bash
   # Solution: Connect real API
   /layer-check frontend
   ```

---

## Security Issues

### Issue: Security scanner finds vulnerabilities

**Symptoms**: Security scanner reports issues

**Solutions**:

1. **Review ANTI_PATTERNS guides**
   ```bash
   cat ANTI_PATTERNS_BREADTH.md
   cat ANTI_PATTERNS_DEPTH.md
   ```

2. **Use security scanner agent** (Copilot)
   ```bash
   task agent_type="explore" \
     prompt="Use security-scanner to scan src/ and fix issues"
   ```

3. **Fix common issues**:
   - Replace hardcoded secrets with env vars
   - Use parameterized queries
   - Escape user input
   - Use crypto RNG for tokens

---

## Platform-Specific Issues

### Claude Code Issues

**Issue**: Commands not working

```bash
# Verify installation
ls -la .claude/commands/

# Check Claude Code is running
# Restart Claude Code if needed
```

### Copilot CLI Issues

**Issue**: Agents not found

```bash
# Verify installation
ls -la .copilot/custom-agents/

# Check helper script
.copilot/helper.sh

# Verify task() tool is available
```

---

## Performance Issues

### Issue: `/go` is slow

**Causes**:
- Large PRDs
- Many stories
- Complex dependencies

**Solutions**:

```bash
# Use parallel execution
/go --parallel

# Use worktree isolation
/go --worktree

# Process specific PRD
/go genesis/specific-prd.md
```

---

## Context Issues

### Issue: Context overflow errors

**Symptoms**: Token limit exceeded

**Solutions**:

```bash
# Check context budget
/context

# Force compaction
/context compact

# Load specific level
/context load 1  # Level 1 only
```

---

## Getting Help

### Debug Information

Collect debug info:

```bash
# Framework version
cat .claude/.framework-version

# Platform
cat .claude/.framework-platform

# Project structure
tree -L 2 -I 'node_modules|__pycache__|.git'

# Recent changes
git log --oneline -10
```

### Logs

Check logs:
```bash
# Framework logs (if any)
ls -la .claude/logs/

# Project logs
ls -la logs/
```

---

## Common Error Messages

### "claude_as is a TEMPLATE - DO NOT copy it"

**Meaning**: You copied the framework folder into your project

**Fix**: Remove copied folder and use `install.sh`

### "Target directory does not exist"

**Meaning**: Installation target path is invalid

**Fix**: Create directory first or use existing path

### "No PRDs found in genesis/"

**Meaning**: No PRD files in genesis folder

**Fix**: Create PRDs using `/prd` command or manually

### "Version mismatch"

**Meaning**: Project version doesn't match framework version

**Fix**: Run `update.sh` to sync versions

---

## Still Having Issues?

1. **Check documentation**:
   - `README.md` - Overview
   - `docs/HOW-TO.md` - Detailed guide
   - `docs/QUICK-REFERENCE.md` - Quick reference

2. **Review examples**:
   - `genesis/TEMPLATE.md` - PRD template
   - `.copilot/WORKFLOW-GUIDE.md` - Workflow examples

3. **Validate setup**:
   ```bash
   # Run framework tests
   ~/path/to/claude_as/tests/run-tests.sh
   ```

4. **Check version compatibility**:
   ```bash
   cat .claude/.framework-version
   cat ~/path/to/claude_as/.version
   ```

---

**Last Updated**: 2026-01-25
