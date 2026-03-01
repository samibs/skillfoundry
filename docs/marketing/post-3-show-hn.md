# Show HN Post

## Title (max 80 chars):

Show HN: Claude AS – 46 AI agents with a 6-tier quality gate for production code

## Post body:

Hi HN,

I built an open-source framework that brings production discipline to AI-assisted coding. Instead of one AI assistant that does everything, Claude AS provides 46 specialized agents (coder, tester, architect, security, SRE, etc.) coordinated through a 6-tier quality gate called "The Anvil."

**The workflow:**
1. Write a PRD (Product Requirements Document) — not a prompt
2. Type `/go`
3. The framework generates stories, dispatches agents in parallel, and validates every handoff through 6 quality tiers
4. You get production code — tested, documented, security-audited

**What makes it different from prompting Claude/Copilot directly:**
- PRD-first: requirements before code (no "vibe coding")
- Specialized agents: the Security Specialist handles security, the Tester writes tests, the Architect reviews architecture
- The Anvil: 6 automated quality tiers between every agent handoff (syntax, smoke test, self-adversarial review, scope validation, contract enforcement, shadow testing)
- Self-healing: 90%+ of quality violations auto-fixed, only critical decisions escalated to you
- Knowledge Hub: mistakes in Project A become guardrails in Project B (cross-project learning)
- Works on 4 platforms: Claude Code, GitHub Copilot CLI, Cursor, OpenAI Codex

**Tech:** Pure bash install scripts (macOS 3.2+ compatible), PowerShell for Windows. No runtime dependencies beyond git and your AI tool. 180 tests, MIT license.

I've been using this daily across 20+ projects for 3 months. The framework eats its own dog food — it was built using its own agents.

GitHub: https://github.com/samibs/claude_as

Happy to answer questions about the architecture, the quality gate design, or the agent coordination model.

---

## Posting notes:

- Post on a weekday, ideally Tuesday-Thursday
- Best times: 8-10 AM EST (when HN traffic peaks)
- URL: https://github.com/samibs/claude_as
- Don't add "Show HN:" to the GitHub title — HN adds it
- Respond to every comment in the first 2 hours
- Be honest about limitations — HN respects candor
- If asked "why not just use Claude directly?" — answer: you can, but this adds structure and quality enforcement that raw prompting lacks
- If asked about token cost — answer: The Anvil T1 is pure bash (zero tokens), and the self-healing pipeline reduces wasted iterations
