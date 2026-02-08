# Git Worktree Isolation Protocol v1.0.0

> Shared module for isolated branch development using git worktrees.
> Referenced by: `/go`, `/coder`, `/architect`

---

## Purpose

Enable safe, isolated development by using git worktrees. Each PRD or story can execute in its own worktree, with changes only merged back after validation passes.

---

## What Are Git Worktrees?

```
┌─────────────────────────────────────────────────────────────────┐
│                    GIT WORKTREE ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  project/                    ← Main worktree (main branch)      │
│  ├── .git/                   ← Shared git directory             │
│  ├── src/                                                       │
│  └── ...                                                        │
│                                                                 │
│  project-prd-auth/           ← Worktree for auth PRD            │
│  ├── .git (file, points to main)                                │
│  ├── src/                    ← Isolated working copy            │
│  └── ...                     ← Can break things safely          │
│                                                                 │
│  project-story-001/          ← Worktree for STORY-001           │
│  ├── .git (file)                                                │
│  ├── src/                                                       │
│  └── ...                                                        │
│                                                                 │
│  ALL WORKTREES SHARE:                                           │
│  - Same commit history                                          │
│  - Same remotes                                                 │
│  - Same configuration                                           │
│                                                                 │
│  EACH WORKTREE HAS:                                             │
│  - Its own branch checked out                                   │
│  - Its own working directory state                              │
│  - Its own staged changes                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Benefits for Claude AS

| Benefit | Description |
|---------|-------------|
| **Isolation** | Break things without affecting main branch |
| **Parallel work** | Multiple PRDs/stories can develop simultaneously |
| **Easy rollback** | Just delete the worktree folder |
| **Clean testing** | Fresh environment for each feature |
| **Safe merging** | Only merge after all validations pass |
| **No stash needed** | Each worktree has its own state |

---

## Worktree Lifecycle

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ CREATE  │ ──► │ DEVELOP │ ──► │ VALIDATE│ ──► │  MERGE  │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
     │                               │               │
     │                               ▼               ▼
     │                          ┌─────────┐    ┌─────────┐
     │                          │  FAIL   │    │ CLEANUP │
     │                          └────┬────┘    └─────────┘
     │                               │
     │                               ▼
     │                          ┌─────────┐
     └─────────────────────────►│ ROLLBACK│
                                └─────────┘
```

---

## Commands Reference

### Basic Operations

```bash
# Create worktree with new branch
git worktree add ../project-feature -b feature/my-feature

# Create worktree for existing branch
git worktree add ../project-hotfix hotfix/urgent-fix

# List all worktrees
git worktree list

# Remove worktree (when done)
git worktree remove ../project-feature

# Prune stale worktree references
git worktree prune
```

### Claude AS Integration Commands

```bash
# Create worktree for PRD
/worktree create prd-auth

# Create worktree for story
/worktree create story-001

# List active worktrees
/worktree list

# Switch to worktree
/worktree switch prd-auth

# Merge and cleanup
/worktree complete prd-auth

# Rollback and delete
/worktree abort prd-auth
```

---

## Worktree Naming Convention

```
{project}-{type}-{identifier}

Examples:
  myapp-prd-user-auth           # PRD worktree
  myapp-story-001               # Story worktree
  myapp-hotfix-login-bug        # Hotfix worktree
  myapp-experiment-new-cache    # Experimental worktree
```

### Branch Naming

```
{type}/{identifier}

Examples:
  prd/user-authentication
  story/STORY-001-user-model
  hotfix/login-session-fix
  experiment/redis-caching
```

---

## Worktree Configuration

```json
// .claude/config.json
{
  "worktrees": {
    "enabled": true,
    "base_path": "..",
    "naming": "{project}-{type}-{id}",
    "auto_create_for_prd": true,
    "auto_create_for_story": false,
    "cleanup_on_success": true,
    "preserve_on_failure": true,
    "max_active_worktrees": 5
  }
}
```

---

## Worktree State Tracking

### State File Location

```
.claude/worktree-state.json
```

### State Schema

```json
{
  "active_worktrees": [
    {
      "name": "myapp-prd-auth",
      "path": "../myapp-prd-auth",
      "branch": "prd/user-authentication",
      "type": "prd",
      "prd_id": "PRD-20260120-001",
      "created_at": "2026-01-20T10:00:00Z",
      "status": "IN_PROGRESS",
      "stories_completed": 3,
      "stories_total": 7
    },
    {
      "name": "myapp-story-005",
      "path": "../myapp-story-005",
      "branch": "story/STORY-005-payment-api",
      "type": "story",
      "story_id": "STORY-005",
      "parent_worktree": "myapp-prd-auth",
      "created_at": "2026-01-20T11:30:00Z",
      "status": "VALIDATING"
    }
  ],
  "main_worktree": {
    "path": "/home/user/project",
    "branch": "main",
    "last_sync": "2026-01-20T09:00:00Z"
  },
  "completed_worktrees": [
    {
      "name": "myapp-prd-config",
      "merged_at": "2026-01-19T15:00:00Z",
      "commits_merged": 12
    }
  ]
}
```

---

## Workflow: PRD in Worktree

### Phase 1: Create Worktree

```bash
# Automated by /go when worktrees.auto_create_for_prd = true
cd /home/user/project
git worktree add ../project-prd-auth -b prd/user-authentication

# Setup worktree
cd ../project-prd-auth
npm install  # or equivalent
```

### Phase 2: Develop in Worktree

```bash
# All /go execution happens here
# Stories implemented, tests written
# Three-layer validation runs
# Security audit completes
```

### Phase 3: Validate Before Merge

```markdown
## PRE-MERGE VALIDATION CHECKLIST

- [ ] All stories complete
- [ ] All tests pass
- [ ] Three-layer validation passes
- [ ] Security audit passes
- [ ] No banned patterns detected
- [ ] Documentation complete
- [ ] No merge conflicts with main
```

### Phase 4: Merge to Main

```bash
# Switch to main
cd /home/user/project

# Merge the PRD branch
git merge prd/user-authentication --no-ff -m "Merge PRD: User Authentication"

# Delete the branch
git branch -d prd/user-authentication

# Remove the worktree
git worktree remove ../project-prd-auth
```

### Phase 5: Cleanup

```bash
# Verify worktree removed
git worktree list

# Prune any stale references
git worktree prune
```

---

## Workflow: Story in Worktree

For granular isolation, each story can have its own worktree:

```
main
 └── prd/user-authentication (PRD worktree)
      ├── story/STORY-001 (merged)
      ├── story/STORY-002 (in progress)
      └── story/STORY-003 (pending)
```

### Story Worktree Commands

```bash
# Create from PRD worktree
cd ../project-prd-auth
git worktree add ../project-story-002 -b story/STORY-002

# Work in story worktree
cd ../project-story-002
# ... implement story ...

# Merge back to PRD branch
cd ../project-prd-auth
git merge story/STORY-002 --no-ff

# Cleanup story worktree
git worktree remove ../project-story-002
```

---

## Parallel PRD Development

Multiple PRDs can develop simultaneously in separate worktrees:

```
project/                     ← main (production)
project-prd-auth/            ← Authentication PRD
project-prd-payments/        ← Payments PRD
project-prd-notifications/   ← Notifications PRD
```

### Handling Dependencies

```json
// When PRD-payments depends on PRD-auth
{
  "prd_id": "PRD-payments",
  "dependencies": {
    "requires": ["PRD-auth"]
  }
}

// Execution order:
// 1. Complete PRD-auth in its worktree
// 2. Merge PRD-auth to main
// 3. Start PRD-payments worktree FROM updated main
```

---

## Conflict Resolution

### Detecting Conflicts

```bash
# Before merge, check for conflicts
cd /home/user/project
git fetch origin
git merge-base --is-ancestor prd/user-authentication main
# Exit 0 = clean, Exit 1 = may have conflicts

# Dry-run merge
git merge --no-commit --no-ff prd/user-authentication
git merge --abort  # If conflicts detected
```

### Resolution Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│ CONFLICT DETECTED                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Option 1: REBASE (Recommended)                                  │
│   cd ../project-prd-auth                                        │
│   git rebase main                                               │
│   # Resolve conflicts                                           │
│   git rebase --continue                                         │
│                                                                 │
│ Option 2: MERGE MAIN INTO WORKTREE                              │
│   cd ../project-prd-auth                                        │
│   git merge main                                                │
│   # Resolve conflicts                                           │
│   git commit                                                    │
│                                                                 │
│ Option 3: MANUAL MERGE                                          │
│   Human intervention required                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Rollback with Worktrees

### Scenario: PRD Failed Validation

```bash
# Simply delete the worktree
git worktree remove --force ../project-prd-auth

# Delete the branch
git branch -D prd/user-authentication

# Main branch untouched!
```

### Scenario: Partial Rollback

```bash
# Reset worktree to earlier state
cd ../project-prd-auth
git reset --hard HEAD~5  # Go back 5 commits

# Or reset to specific commit
git reset --hard abc123
```

---

## Integration with /go

### When Worktrees Are Used

```yaml
# .claude/config.json
worktrees:
  enabled: true
  triggers:
    - prd_execution      # Always for PRD
    - story_complex      # For complex stories only
    - parallel_dispatch  # When running parallel agents
    - experimental       # When marked experimental
```

### /go Worktree Flags

```
/go --worktree           Force worktree creation
/go --no-worktree        Force inline execution (no worktree)
/go --worktree-per-story Create worktree for each story
/go --worktree-path DIR  Custom worktree base path
```

---

## Environment Setup in Worktrees

### Post-Create Hook

```bash
#!/bin/bash
# .claude/hooks/post-worktree-create.sh

# Install dependencies
if [ -f "package.json" ]; then
  npm install
fi

if [ -f "requirements.txt" ]; then
  pip install -r requirements.txt
fi

if [ -f "*.csproj" ]; then
  dotnet restore
fi

# Copy environment file
if [ -f ".env.example" ] && [ ! -f ".env" ]; then
  cp .env.example .env
fi

# Run any project-specific setup
if [ -f "scripts/setup-dev.sh" ]; then
  ./scripts/setup-dev.sh
fi
```

---

## Commands Reference

```
/worktree create [name]     Create new worktree
/worktree list              List all worktrees
/worktree status            Show worktree status
/worktree switch [name]     Switch context to worktree
/worktree sync              Sync with main branch
/worktree validate          Run validation in worktree
/worktree merge             Merge worktree to parent
/worktree abort             Abort and delete worktree
/worktree cleanup           Remove completed worktrees
```

---

## Metrics Collection

Worktree metrics feed into the main metrics system:

```json
{
  "worktree_metrics": {
    "total_created": 25,
    "total_merged": 22,
    "total_aborted": 3,
    "avg_lifetime_hours": 4.5,
    "conflicts_detected": 5,
    "conflicts_resolved": 5,
    "parallel_prds_max": 3
  }
}
```

---

## Best Practices

1. **One PRD per worktree** - Keep isolation clean
2. **Sync frequently** - Rebase/merge main regularly
3. **Clean up promptly** - Remove worktrees after merge
4. **Test before merge** - All validations in worktree
5. **Use descriptive names** - Easy to identify purpose
6. **Document worktree purpose** - In commit messages

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "fatal: is already checked out" | Branch already in another worktree |
| Worktree not showing in list | Run `git worktree prune` |
| Can't delete worktree | Use `--force` flag |
| Conflicts during merge | Rebase worktree on main first |
| Missing dependencies | Run post-create hook manually |

---

*Git Worktree Protocol v1.0.0 - Claude AS Framework*
