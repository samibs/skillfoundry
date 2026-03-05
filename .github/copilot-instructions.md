# GitHub Copilot — Project Instructions

> These instructions apply to all GitHub Copilot interactions in this project.
> For full framework rules, see `CLAUDE.md` in the project root.

---

## Memory Storage Policy

**Do NOT use Copilot's built-in `memory-tool` for this project.**

This project has its own cross-platform memory system at `memory_bank/`. All session knowledge — decisions, patterns, errors, corrections — must be saved there, not in Copilot's internal `WorkspaceStorage/`.

Why:
- `memory_bank/` is version-controlled and committed to the repo
- `memory_bank/` is portable across all 5 supported platforms (Claude Code, Copilot, Cursor, Codex, Gemini)
- Copilot's `WorkspaceStorage/` is opaque, local-only, and invisible to other platforms

### How to save knowledge

Use the `/gohm` harvester (Phase 5 in `/forge`), or write directly to:

```
memory_bank/knowledge/decisions-universal.jsonl   ← design decisions
memory_bank/knowledge/patterns-universal.jsonl    ← code patterns
memory_bank/knowledge/errors-universal.jsonl      ← error patterns
memory_bank/knowledge/bootstrap.jsonl             ← verified facts
```

Each entry is a single-line JSON object with this schema:

```json
{"id": "unique-id", "type": "DECISION|PATTERN|ERROR|FACT", "content": "...", "session": "...", "created_at": "ISO-8601", "retrieval_weight": 0.5, "source": "forge|manual|session", "tags": ["tag1"], "project": "skillfoundry"}
```

### What NOT to do

- Do NOT save forge results, session summaries, or learned patterns to Copilot's memory tool
- Do NOT create files in `WorkspaceStorage/` or any Copilot-internal path
- If Copilot's memory tool activates automatically, the knowledge should ALSO be written to `memory_bank/`

---

## General Rules

- Follow `CLAUDE.md` in the project root for all coding standards
- Follow `~/.claude/CLAUDE.md` (BPSBS) for universal agent behavior
- Use `memory_bank/` for all persistent knowledge
- Use `.claude/scratchpad.md` for session state (cross-platform handoff)
