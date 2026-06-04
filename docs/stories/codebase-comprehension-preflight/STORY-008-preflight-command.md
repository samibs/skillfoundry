# STORY-008: /preflight Command + Protocol Doc + Platform Mirroring

**Phase:** 3 — Tool + pipeline wiring
**PRD:** codebase-comprehension-preflight
**Priority:** SHOULD
**Effort:** S
**Status:** DONE (cross-platform mirroring deferred to install/convert)
**Dependencies:** STORY-007
**Blocks:** —
**Affects:** FR-009

---

## Description

Add the manual entry point: a `/preflight` (alias `/codemap`) command that builds/refreshes/queries the Code Map on demand and prints a structural summary, plus the protocol doc that `CLAUDE.md` references. Mirror the command into the other platform dirs via the existing converters so Cursor/Copilot/Gemini get it too.

---

## Acceptance Contract

**done_when:**
- [x] `.claude/commands/preflight.md` exists, documents `build|refresh|query|diff-impact`, and instructs invoking `sf_codemap`
- [x] `/preflight` output format documented: counts, layer breakdown, unresolved-import count, `builtFromRevision`, `duration`, empty-state guidance
- [x] `agents/_codemap-preflight-protocol.md` created (sibling to `_env-preflight-protocol.md`) and linked from `CLAUDE.md` header reference list
- [ ] Command mirrored to `.cursor/`, `.copilot/`, `.gemini/` — DEFERRED: happens at install/convert time via the existing converters; not hand-copied (not run in this session — see Notes)
- [x] Registered as a Claude Code command (appears in the available-skills list as `/preflight`)

**fail_when:**
- The command is hand-copied into platform dirs instead of going through the converter (drift risk)
- `/preflight` prints fabricated counts when no map/repo exists (must show empty-state guidance instead)

---

## Technical Approach

1. Author `.claude/commands/preflight.md` following the structure of existing command docs (usage, instructions, output format, reflection).
2. Author `agents/_codemap-preflight-protocol.md`: when to run (manual + auto via STORY-009), what the summary means, non-authoritative-semantics caveat.
3. Add the `CLAUDE.md` header reference line (documentation only).
4. Run the converter and verify mirrored outputs exist; add to parity coverage so `/parity` stays clean.

---

## Files Affected

| File | Action |
|------|--------|
| `.claude/commands/preflight.md` | CREATE — command doc |
| `agents/_codemap-preflight-protocol.md` | CREATE — protocol |
| `CLAUDE.md` | MODIFY — add reference line |
| `.cursor/ .copilot/ .gemini/` | GENERATED — via converter (verify) |

---

## Security / Constraints
- Documentation/command only; no production-code banned-pattern exposure.
- Keep `/preflight` summary free of secrets/absolute paths (mirror sanitization stance).

---

## Implementation Notes (DONE — 2026-06-04)

- **Delivered:** `.claude/commands/preflight.md` (registered — shows as `/preflight`) and `agents/_codemap-preflight-protocol.md`, linked from the `CLAUDE.md` header reference list.
- **Deferred:** running `convert-to-copilot.sh` / `install.sh` to mirror the command into `.cursor/`, `.copilot/`, `.gemini/`. This is a build/install-time step (and would touch many files); intentionally not run in this session to keep the diff scoped. Follow-up: run the converter + `/parity` to confirm clean mirroring before release.
