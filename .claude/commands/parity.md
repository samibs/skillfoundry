# /parity — Cross-Platform Skill Parity Detector

> Compares skills across Claude, Copilot, Cursor, Codex (OpenAI), and Gemini platforms. Detects missing skills and H1 title drift before they cause user-visible divergence.

---

## Usage

```
/parity                    Full parity report across all 5 platforms
/parity --missing          List only missing skills per platform
/parity --drift            List only drifted (title mismatch) skills
/parity --json             Machine-readable JSON output
/parity --skill <name>     Check a single skill across all platforms
```

---

## Instructions

You are the **Parity Detector**. When invoked, run the cross-platform skill comparison and report gaps.

### When invoked with no arguments:

Run `bash scripts/parity-check.sh` and report results.

### When invoked with `--missing`:

Run `bash scripts/parity-check.sh --missing` — show only skills absent from one or more platforms.

### When invoked with `--drift`:

Run `bash scripts/parity-check.sh --drift` — show only skills whose H1 title differs between the Claude reference and another platform (indicates out-of-sync regeneration).

### When invoked with `--skill <name>`:

Run `bash scripts/parity-check.sh --skill <name>` — check a single skill across all platforms, showing presence and title on each.

### When invoked with `--json`:

Run `bash scripts/parity-check.sh --json` — output structured JSON for pipeline use.

### After reporting gaps, suggest the fix:

- **Missing skills** → `./scripts/sync-platforms.sh sync --all` regenerates all platform files from `agents/`
- **Single missing skill** → `./scripts/sync-platforms.sh sync <agent-name>`
- **Drifted titles** → Re-run sync for the drifted agents: `./scripts/sync-platforms.sh sync <agent-name>`

---

## What the Parity Check Measures

| Check | Description |
|-------|-------------|
| Presence | Skill exists in `.copilot/custom-agents/`, `.cursor/rules/`, `.agents/skills/`, `.gemini/skills/` |
| Title parity | H1 title in each platform file matches `.claude/commands/` reference |
| Parity % | `present / total_claude_skills × 100` per platform |

**Reference platform:** `.claude/commands/` — the most complete set, used as ground truth.

**Platform paths:**

| Platform | Directory | Format |
|----------|-----------|--------|
| Claude | `.claude/commands/` | `<skill>.md` |
| Copilot | `.copilot/custom-agents/` | `<skill>.md` |
| Cursor | `.cursor/rules/` | `<skill>.md` |
| Codex | `.agents/skills/<skill>/` | `SKILL.md` inside subdirectory |
| Gemini | `.gemini/skills/` | `<skill>.md` |

---

## Output Format

```
SKILL PARITY REPORT  (reference: .claude/commands/)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Platform        Present  Missing  Drifted   Parity
  ──────────────────────────────────────────────────
  copilot              97        1        2    98%
  cursor               98        0        1   100%
  codex                98        0        0   100%
  gemini               97        1        3    98%

Missing from copilot (1):
  ✗ parity

Title drift in gemini (3):
  ~ forge
      claude:   /forge — The Forge Pipeline
      gemini:   # Forge — Multi-Phase Build Pipeline

VERDICT: GAPS DETECTED — 2 missing, 5 drifted
  Run: ./scripts/sync-platforms.sh sync --all  to resync all platforms
```

---

## Integration with /go and /forge

The parity check is a **maintenance gate**, not a blocking pre-flight. Run it:
- After adding a new skill to `.claude/commands/` to confirm sync ran correctly
- After bulk changes to `agents/` to verify all platforms updated
- Before a release to confirm 100% parity across all supported editors

---

## REFLECTION PROTOCOL

Before reporting results, verify:
- Did the script exit 0 (full parity) or 1 (gaps found)?
- Are missing skills truly absent, or just named differently?
- Is the drift in H1 titles meaningful (different feature) or cosmetic (punctuation)?
- Should `--fix` be suggested for missing skills?

**Threshold**: If 3+ platforms show parity below 95%, pause and suggest a full sync (`sync-platforms.sh sync --all`) rather than listing each gap individually.
