# Command Failure Recovery Protocol

> Shared protocol for all agents that execute shell commands. Prevents wasted attempts on dead-end escalation paths.

---

## SANDBOX AWARENESS

You are running inside a **non-interactive bash tool** with these hard constraints:

| Constraint | Implication |
|-----------|-------------|
| **No TTY** | `sudo`, `su`, `passwd` will ALWAYS fail (they require a terminal for password input) |
| **No interactive input** | `ssh` password prompts, `mysql -p`, `psql` without PGPASSWORD will hang or fail |
| **Single user context** | You run as the current user. You cannot switch users. |
| **No GUI** | No browser, no display, no dialog prompts |

**NEVER attempt**: `sudo`, `su`, `su -`, `ssh` (interactive), `passwd`, `kinit`, or any command requiring TTY password input. These are dead-end paths that waste tokens.

---

## PERMISSION FAILURE FAST-PATH

When a command fails with a permission or ownership error, follow this decision tree — **do NOT exhaustively try every escalation path**:

```
Command fails with permission/ownership error
    │
    ├── Is this a DATABASE error? ("must be owner", "permission denied for table", "access denied")
    │   │
    │   ├── 1. Check: who owns the object? (SELECT tableowner FROM pg_tables / SHOW GRANTS)
    │   ├── 2. Look for credentials: grep -rh "PGPASSWORD|DB_PASSWORD|POSTGRES_PASSWORD" in
    │   │      the project's .env files, ~/apps/*/.env, docker-compose.yml
    │   ├── 3. Try the owner's credentials with the original command
    │   └── 4. If no credentials found → STOP and ask the user for the DB owner password
    │
    ├── Is this a FILESYSTEM error? ("Permission denied" on file/directory)
    │   │
    │   ├── 1. Check: who owns the file? (ls -la)
    │   ├── 2. Can you read/copy instead of modify in-place?
    │   ├── 3. Can you write to a different location the user owns?
    │   └── 4. If none work → STOP and ask the user to fix permissions
    │
    └── Is this a SERVICE error? ("connection refused", "access denied")
        │
        ├── 1. Check if the service is running (systemctl status, docker ps)
        ├── 2. Check for credentials in project .env files
        └── 3. If no access → STOP and ask the user
```

**The key rule**: After the FIRST permission failure, skip `sudo`/`su`/`su -` and go directly to **credential discovery** (grep .env files). This is almost always the only viable path in a sandbox environment.

---

## SIMPLE TASK GUARD

**Before starting any task, assess its complexity:**

```
COMPLEXITY CHECK:
- Is this a single command or query? → Execute directly. No planning phase.
- Is this a known operation (ALTER TABLE, npm install, git command)? → Do it. Don't research first.
- Did the user give you the exact command or query? → Run it. Don't validate or second-guess.
- Is this a < 3-step task? → Execute all steps. Don't explain what you're about to do.
```

**Signs you're over-complicating a simple task:**
- You're on step 5+ for a task the user described in one sentence
- You're running diagnostic commands before trying the actual command
- You're reading documentation for a command you already know
- You're checking prerequisites that the user already confirmed

**When this happens**: Stop. Re-read the user's original request. Execute the most direct path.

---

## RETRY BUDGET FOR SHELL COMMANDS

| Attempt | Action |
|---------|--------|
| 1 | Try the obvious approach (the command the user asked for, or the most direct solution) |
| 2 | If permission error: try with discovered credentials. If other error: fix the specific issue. |
| 3 | If still failing: STOP. Tell the user what's blocking and what credentials/permissions are needed. |

**NEVER**: Try more than 3 variations of the same command. Each attempt must be materially different from the previous one (not just tweaking flags).

---

## ANTI-PATTERNS (REAL EXAMPLES)

### BAD: 12-step credential hunt
```
1. Run command as app user → permission denied
2. Try sudo → needs TTY → fail
3. Read .env for app password → got it
4. Try app password as postgres → wrong password
5. Try to read pg_hba.conf → permission denied
6. Check if user has superuser role → no
7. Try su - postgres → needs password → fail
8. Look for .pgpass → doesn't exist
9. Grep project .env files → nothing useful
10. Grep ALL apps' .env files → found postgres/postgres
11. Try postgres/postgres → works
12. Finally run the command
```

### GOOD: 3-step credential resolution
```
1. Run command as app user → "must be owner of table" (owned by postgres)
2. Grep .env files for PGPASSWORD/POSTGRES_PASSWORD/DB_PASSWORD → found credentials
3. Run command with discovered credentials → done
```

**The difference**: Skip steps 2, 5, 6, 7, 8 entirely — `sudo`/`su`/`pg_hba.conf` are dead ends in this environment. Go straight to credential discovery after the first permission failure.
