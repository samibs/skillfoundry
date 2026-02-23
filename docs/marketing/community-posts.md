# Community Posts — Targeted by Platform

Post these to the relevant communities. Each is tailored to the audience.

---

## 1. r/ClaudeAI

**Title:** I built a framework with 46 specialized agents and a quality gate for Claude Code — open source

**Body:**

I've been using Claude Code daily for 3 months and kept running into the same problems: no structure to my prompts, quality issues I had to manually catch, and losing context between sessions.

So I built Claude AS — an open-source framework that adds:

- **46 specialized agents** as `/commands`: `/coder`, `/tester`, `/architect`, `/security`, `/sre`, `/data-architect`, etc.
- **PRD-first workflow**: write a Product Requirements Document, type `/go`, get production code
- **The Anvil**: 6-tier quality gate that runs between every agent handoff (syntax, smoke test, adversarial review, scope validation, contract check, shadow test)
- **Knowledge Hub**: mistakes in one project become guardrails in the next
- **Self-healing pipeline**: 90%+ of quality violations auto-fixed

The workflow:
```
/prd "your feature idea"
/go
# ...that's it
```

Works with Claude Code, Copilot CLI, Cursor, and OpenAI Codex.

MIT license, 180 tests, macOS/Linux/Windows.

GitHub: https://github.com/samibs/claude_as

Would love feedback from this community — especially on the agent design and quality gate approach.

---

## 2. r/cursor

**Title:** Open-source framework that adds 41 quality-enforced rules to Cursor — PRD-first workflow with specialized agents

**Body:**

I built a framework that installs 41 specialized rules into Cursor's `.cursor/rules/` directory, giving you:

- **Specialized agents**: coder, tester, architect, security, data architect, SRE, i18n, UX/UI — each with its own persona and quality criteria
- **PRD-first workflow**: requirements before code, enforced by the framework
- **Quality gate**: The Anvil — 6 validation tiers between agent handoffs
- **Cross-project learning**: Knowledge Hub syncs lessons across all your projects

Install:
```bash
git clone https://github.com/samibs/claude_as.git ~/tools/claude_as
cd your-project
~/tools/claude_as/install.sh --platform=cursor
```

Rules are automatically loaded by Cursor. Reference them in chat: "use coder rule" or "follow security rule."

Same framework also works with Claude Code, Copilot CLI, and OpenAI Codex — one install, four platforms.

MIT license: https://github.com/samibs/claude_as

---

## 3. r/programming

**Title:** Why AI-assisted development needs quality gates: a 6-tier automated review system

**Body:**

Research shows 40% of AI-generated code contains security vulnerabilities, and 86% has XSS issues. I've been building production software with AI assistants for months and the numbers track with my experience.

The problem isn't that AI writes bad code — it's that there's no automated quality infrastructure around it. We have CI/CD for human code. We have nothing equivalent for AI-generated code.

So I built one.

**The Anvil** is a 6-tier quality gate that runs between every agent handoff in an AI-assisted development pipeline:

1. **Shell Pre-Flight** — Syntax check, banned patterns (TODO, FIXME, hardcoded secrets). Pure bash, zero LLM cost.
2. **Canary Smoke Test** — Can the module import? If not, don't waste tokens on testing.
3. **Self-Adversarial Review** — The generating agent must list 3+ ways its code could fail. If it can't, BLOCK.
4. **Scope Validation** — Expected vs actual file changes. Catches scope creep.
5. **Contract Enforcement** — Does the implementation match the API spec?
6. **Shadow Tester** — Parallel risk assessment that prioritizes test effort.

When a tier fails, a Fixer agent auto-remediates (3 retries, exponential backoff). Only critical decisions escalate to the human.

This is part of Claude AS, an open-source framework (MIT) with 46 specialized AI agents. It's not tied to one AI tool — works with Claude Code, Copilot CLI, Cursor, and Codex.

GitHub: https://github.com/samibs/claude_as

I wrote a deeper technical post about the quality gate design here: [link to Dev.to Anvil post]

---

## 4. Claude Code Discord / Cursor Discord

**Message (keep it short for Discord):**

Built an open-source framework that adds 46 specialized agents + a 6-tier quality gate to Claude Code / Cursor / Copilot / Codex.

Instead of one assistant doing everything:
- `/coder` for implementation (TDD)
- `/tester` for brutal edge-case testing
- `/security` for STRIDE + OWASP scanning
- `/architect` for design review
- 42 more specialists

PRD-first workflow: `/prd "your idea"` → `/go` → production code.

180 tests, MIT license, macOS/Linux/Windows.

https://github.com/samibs/claude_as

---

## Posting Schedule

| Day | Platform | Post |
|-----|----------|------|
| Day 1 (Tue) | Show HN | post-3-show-hn.md |
| Day 1 (Tue) | r/ClaudeAI | Post #1 above |
| Day 2 (Wed) | Dev.to | post-1-devto-ship-faster.md |
| Day 2 (Wed) | r/cursor | Post #2 above |
| Day 3 (Thu) | Dev.to | post-2-anvil-quality-gate.md |
| Day 3 (Thu) | r/programming | Post #3 above |
| Day 4 (Fri) | Discord (Claude Code) | Post #4 above |
| Day 4 (Fri) | Discord (Cursor) | Post #4 above |

**Rules:**
- Respond to every comment within 2 hours on launch day
- Be honest about limitations
- Never cross-post identical content — each platform gets a tailored version
- Don't hard-sell. Share what you built, answer questions, take feedback
- If something gets traction on HN, hold off on Reddit until the next day (don't split your attention)
