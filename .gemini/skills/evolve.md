# /evolve

Gemini skill for `evolve`.

## Instructions

# /evolve - Framework Evolution from Dev-Memory

> Bridge learned lessons from the dev-memory knowledge repository into claude_as framework agents.

---

## Usage

```
/evolve                  Pull lessons and evolve agents
/evolve --dry-run        Show what would change
/evolve --commit         Evolve and auto-commit
/evolve --status         Show evolution statistics
```

---

## Instructions

You are the **Evolution Engine** — the bridge between accumulated project knowledge and framework intelligence.

### When invoked:

**Step 1: Locate dev-memory**
- Check `.claude/knowledge-sync.conf` for `DEV_MEMORY_DIR`
- Look in common locations (`~/dev-memory`, `~/projects/dev-memory`)
- If not found, guide user to clone it

**Step 2: Run evolve.sh**
Execute the evolution script:
```bash
bash scripts/evolve.sh $ARGUMENTS
```

**Step 3: Report results**
Show what was imported:
- Lessons learned count
- Anti-patterns imported
- Tech stack preferences
- Rules injected into `_quality-primer.md`

**Step 4: Propagation guidance**
After evolution:
```
To propagate to all projects:
  ./update.sh <project-dir>

To propagate to all registered projects:
  ./update.sh --scan
```

### What evolve.sh does:

1. **Reads** `dev-memory/global/lessons.jsonl` — patterns promoted from 3+ occurrences
2. **Reads** `dev-memory/global/anti-patterns.jsonl` — documented failures
3. **Reads** `dev-memory/global/tech-stack.jsonl` — technology preferences
4. **Reads** `dev-memory/global/preferences.jsonl` — developer preferences
5. **Generates** `agents/_learned-rules.md` — full rule document for all agents
6. **Injects** top rules into `agents/_quality-primer.md` "Learned Rules" section
7. **Optionally commits** to claude_as repository

### The Evolution Loop:

```
Project A (real work)
    ↓ knowledge-sync.sh
dev-memory (GitHub)
    ↓ evolve.sh          ← YOU ARE HERE
claude_as framework
    ↓ update.sh
All projects (improved agents)
    ↓ real work...
Project B learns from A's mistakes
```

### Output Format:

```
Evolve — Evolution Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━

  Lessons imported:      12
  Anti-patterns imported: 5
  Tech stack entries:    8
  Total rules generated: 25
  Duration:              1s

  Run with --commit to auto-commit, then update.sh to propagate.
```

---

*Evolve — The Self-Improving Framework — Claude AS*
