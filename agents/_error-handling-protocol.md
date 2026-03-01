# Error Handling & Recovery Protocol

**Version**: 1.0  
**Status**: ACTIVE  
**Applies To**: All Scripts and Agents

---

## Purpose

This protocol ensures all scripts and agents provide actionable error messages, automatic recovery where possible, and diagnostic information for troubleshooting.

---

## Error Handling Principles

### 1. Actionable Error Messages

**BAD** ❌:
```
Error: Installation failed
```

**GOOD** ✅:
```
Error: Installation failed - Could not create .claude/commands directory
  Reason: Permission denied
  Location: /path/to/project/.claude/commands
  Solution: Run with appropriate permissions or use: chmod 755 /path/to/project
```

### 2. Error Categories

| Category | Severity | Action | Recovery |
|----------|----------|--------|----------|
| **FATAL** | Critical | Stop immediately | Manual intervention required |
| **ERROR** | High | Stop current operation | Automatic recovery attempted |
| **WARNING** | Medium | Continue with caution | User confirmation requested |
| **INFO** | Low | Log and continue | No action needed |

### 3. Error Context

Every error message MUST include:
- **What**: What operation failed
- **Why**: Why it failed (root cause)
- **Where**: Where it failed (file, line, function)
- **How**: How to fix it (actionable solution)

---

## Recovery Mechanisms

### Automatic Recovery

**For transient failures**:
- Network timeouts → Retry with exponential backoff (3 attempts)
- File locks → Wait and retry (5 seconds, 3 attempts)
- Permission issues → Suggest fix, don't retry automatically

**For recoverable errors**:
- Missing directory → Create it automatically
- Missing file → Use default template
- Invalid version → Use latest known version

### Rollback Mechanisms

**For failed installations**:
1. Detect failure point
2. Identify what was created/modified
3. Rollback changes in reverse order
4. Restore original state
5. Report what was rolled back

**Rollback Checklist**:
- [ ] Remove created directories
- [ ] Remove created files
- [ ] Restore original files (if backed up)
- [ ] Remove version markers
- [ ] Clean up temporary files

---

## Diagnostic Mode

### Debug Flag: `--debug` or `-d`

When enabled, scripts should:
- Show detailed execution steps
- Display variable values
- Show file operations (create, copy, delete)
- Display command execution
- Show error stack traces
- Log all operations to file

### Diagnostic Information Collection

When errors occur, collect:
- System information (OS, shell, versions)
- Framework version
- Project path and permissions
- Disk space available
- Recent operations log
- Error stack trace

---

## Error Handling Patterns

### Pattern 1: File Operations

```bash
# BAD
cp "$SOURCE" "$DEST"

# GOOD
if ! cp "$SOURCE" "$DEST" 2>&1; then
    error="Failed to copy $SOURCE to $DEST"
    reason=$(errno_to_string $?)
    log_error "$error" "$reason" "$SOURCE" "Check file permissions and disk space"
    rollback_file_operations
    exit 1
fi
```

### Pattern 2: Directory Operations

```bash
# BAD
mkdir -p "$DIR"

# GOOD
if ! mkdir -p "$DIR" 2>&1; then
    error="Failed to create directory $DIR"
    reason="Permission denied or disk full"
    log_error "$error" "$reason" "$DIR" "Run: chmod 755 $(dirname $DIR) && mkdir -p $DIR"
    
    # Attempt recovery
    if [ -w "$(dirname $DIR)" ]; then
        log_info "Attempting to fix permissions..."
        chmod 755 "$(dirname $DIR)" && mkdir -p "$DIR"
    else
        exit 1
    fi
fi
```

### Pattern 3: Command Execution

```bash
# BAD
some_command

# GOOD
if ! some_command 2>&1 | tee "$LOG_FILE"; then
    exit_code=$?
    error="Command failed: some_command"
    reason="Exit code: $exit_code"
    log_error "$error" "$reason" "$LOG_FILE" "Check log file for details: $LOG_FILE"
    
    # Attempt recovery if applicable
    if [ $exit_code -eq 1 ] && [ -f "$RECOVERY_SCRIPT" ]; then
        log_info "Attempting automatic recovery..."
        bash "$RECOVERY_SCRIPT"
    else
        exit $exit_code
    fi
fi
```

---

## Error Message Format

### Standard Format

```
[CATEGORY] Error: [What failed]
  Reason: [Why it failed]
  Location: [Where it failed]
  Solution: [How to fix it]
  
  [Additional context if --debug]
```

### Examples

#### Example 1: File Permission Error

```
[ERROR] Failed to create directory: /project/.claude/commands
  Reason: Permission denied
  Location: /project/.claude
  Solution: Run: chmod 755 /project && retry installation
  
  Debug info (--debug):
    User: john
    Permissions: drwxr-xr-x
    Owner: root
```

#### Example 2: Network Timeout

```
[ERROR] Failed to download framework files
  Reason: Network timeout after 30 seconds
  Location: https://example.com/framework.tar.gz
  Solution: Check internet connection and retry, or use offline installation
  
  Recovery attempted:
    Retry 1: Failed (timeout)
    Retry 2: Failed (timeout)
    Retry 3: Failed (timeout)
```

#### Example 3: Invalid Configuration

```
[WARNING] Invalid platform specified: 'invalid-platform'
  Reason: Platform must be 'claude', 'copilot', or 'cursor'
  Location: install.sh line 45
  Solution: Use --platform=claude, --platform=copilot, or --platform=cursor
  
  Continuing with interactive selection...
```

---

## Recovery Strategies

### Strategy 1: Retry with Backoff

```bash
retry_with_backoff() {
    local max_attempts=3
    local delay=1
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if "$@"; then
            return 0
        fi
        
        if [ $attempt -lt $max_attempts ]; then
            log_info "Attempt $attempt failed, retrying in ${delay}s..."
            sleep $delay
            delay=$((delay * 2))  # Exponential backoff
        fi
        
        ((attempt++))
    done
    
    return 1
}
```

### Strategy 2: Rollback on Failure

```bash
rollback_on_failure() {
    local operation=$1
    local rollback_func=$2
    
    if ! $operation; then
        log_error "Operation failed, rolling back..."
        $rollback_func
        exit 1
    fi
}
```

### Strategy 3: Graceful Degradation

```bash
graceful_degradation() {
    local preferred=$1
    local fallback=$2
    
    if $preferred; then
        log_success "Using preferred method"
        return 0
    else
        log_warning "Preferred method failed, using fallback"
        $fallback
        return $?
    fi
}
```

---

## Diagnostic Information

### System Information Collection

```bash
collect_diagnostics() {
    cat > "$DIAGNOSTIC_FILE" <<EOF
# Diagnostic Information
Generated: $(date)

## System Information
OS: $(uname -s)
Version: $(uname -r)
Shell: $SHELL
User: $(whoami)
Home: $HOME

## Framework Information
Framework Version: $(cat .version)
Framework Path: $FRAMEWORK_DIR
Project Path: $PROJECT_DIR

## Disk Space
$(df -h $PROJECT_DIR)

## Permissions
Project Directory: $(ls -ld $PROJECT_DIR)
Framework Directory: $(ls -ld $FRAMEWORK_DIR)

## Recent Operations
$(tail -20 $LOG_FILE)
EOF
}
```

---

## Integration with Scripts

### Install Script Error Handling

```bash
# At start of install.sh
set -e  # Exit on error
set -o pipefail  # Catch errors in pipes

# Error handler
trap 'handle_error $? $LINENO' ERR

handle_error() {
    local exit_code=$1
    local line=$2
    
    log_error "Installation failed at line $line" "Exit code: $exit_code"
    
    # Rollback if partial installation
    if [ -d "$TARGET_DIR/.claude" ] || [ -d "$TARGET_DIR/.copilot" ] || [ -d "$TARGET_DIR/.cursor" ]; then
        log_info "Rolling back partial installation..."
        rollback_installation
    fi
    
    # Collect diagnostics
    if [ "$DEBUG" = "true" ]; then
        collect_diagnostics
        log_info "Diagnostics saved to: $DIAGNOSTIC_FILE"
    fi
    
    exit $exit_code
}
```

### Update Script Error Handling

```bash
# Similar error handling for update.sh
trap 'handle_update_error $? $LINENO' ERR

handle_update_error() {
    local exit_code=$1
    local line=$2
    
    log_error "Update failed at line $line" "Exit code: $exit_code"
    
    # Restore backup if update was partial
    if [ -f "$BACKUP_DIR" ]; then
        log_info "Restoring from backup..."
        restore_from_backup
    fi
    
    exit $exit_code
}
```

---

## Error Codes

| Code | Meaning | Recovery |
|------|---------|----------|
| 0 | Success | N/A |
| 1 | General error | Check logs |
| 2 | Invalid arguments | Fix command line |
| 3 | Permission denied | Fix permissions |
| 4 | File not found | Check paths |
| 5 | Network error | Check connection |
| 6 | Disk full | Free up space |
| 7 | Invalid configuration | Fix config |
| 8 | Partial failure | Rollback |

---

## Best Practices

1. **Always provide context**: What, why, where, how
2. **Suggest solutions**: Don't just report problems
3. **Enable recovery**: Automatic recovery where safe
4. **Log everything**: For debugging and audit
5. **Collect diagnostics**: When errors occur
6. **Rollback safely**: Don't make things worse
7. **User-friendly**: Avoid technical jargon when possible

---

**Last Updated**: January 25, 2026  
**Version**: 1.0
