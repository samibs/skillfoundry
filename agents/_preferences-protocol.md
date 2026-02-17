# Developer Preferences Protocol v1.0.0

> Shared module: all agents MUST respect developer preferences.
> Load via: `scripts/preferences.sh inject`

---

## Purpose

Ensure all agents follow the developer's code style, framework choices, and workflow conventions. Preferences are auto-learned from the codebase and can be explicitly overridden.

---

## Loading Preferences

Before generating code, agents MUST load preferences:

```bash
PREFS=$(scripts/preferences.sh inject)
```

This outputs a markdown summary (~20-30 lines) containing detected conventions. Only high-confidence preferences (>0.7) are included.

---

## Rules

### Code Style

When generating code, follow detected conventions:

**Python:**
- If `code.naming.python` = `snake_case`: use `calculate_total()`, NOT `calculateTotal()`
- If `code.indent.python` = `4 spaces`: indent with 4 spaces, NOT tabs or 2 spaces

**JavaScript/TypeScript:**
- If `code.naming.javascript` = `camelCase`: use `calculateTotal()`, NOT `calculate_total()`
- If `code.indent.javascript` = `2 spaces`: indent with 2 spaces

### Frameworks

When implementing features, use the preferred stack:
- If `framework.backend` = `FastAPI`: use FastAPI patterns, NOT Flask or Django
- If `framework.frontend` = `React`: use React components, NOT Vue or Angular
- If `framework.testing` = `pytest`: write pytest tests, NOT unittest

### Testing

- If `testing.coverage` = `80`: target 80%+ coverage
- If `testing.style` = `TDD`: follow RED-GREEN-REFACTOR (see `_tdd-protocol.md`)
- If `testing.style` = `BDD`: use given/when/then structure

### Commits

- If `commit.format` = `conventional`: use `feat:`, `fix:`, `docs:` prefixes
- If `commit.format` = `freeform`: no prefix required

---

## Override Priority

1. **User explicit instruction** (highest) — always wins
2. **Existing file convention** — match the file you're editing
3. **Explicit preferences** (source=explicit, confidence=1.0)
4. **Learned preferences** (source=learned, confidence varies)

---

## Confidence Levels

| Range | Meaning | Action |
|-------|---------|--------|
| > 0.9 | Very confident | Always follow |
| 0.7-0.9 | Confident | Follow unless explicitly overridden |
| < 0.7 | Low confidence | Not injected into agent context |

---

## Commands

```bash
scripts/preferences.sh get <key>        # Get single preference
scripts/preferences.sh set <key> <val>  # Set explicit preference
scripts/preferences.sh learn            # Re-scan codebase
scripts/preferences.sh inject           # Markdown for prompt injection
```

---

*Preferences Protocol v1.0.0 — Claude AS Framework*
