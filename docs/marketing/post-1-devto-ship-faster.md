---
title: I Built 46 AI Agents That Ship Features for Me — Here's How
published: false
description: How a PRD-first framework with specialized agents and a 6-tier quality gate replaced my entire manual review process
tags: ai, productivity, showdev, claudeai
cover_image:
---

# I Built 46 AI Agents That Ship Features for Me — Here's How

I got tired of "vibe coding" with AI.

You know the pattern: you prompt Claude or Copilot, it writes code, you manually review everything, fix the security holes, add the tests it forgot, handle the edge cases it ignored, and repeat. For every feature, you're doing more reviewing than building.

So I built a framework that fixes this. 46 specialized agents, a 6-tier quality gate, and a PRD-first workflow that produces production-ready code — tested, documented, and security-audited.

## The Problem with AI-Assisted Development Today

Here's what I kept running into:

1. **No structure** — AI generates code based on vibes. No requirements document, no acceptance criteria, no definition of done.
2. **One-size-fits-all** — The same AI that writes your database schema also writes your CSS. It's a generalist pretending to be a specialist.
3. **Quality is your problem** — AI writes code. You verify it. Every. Single. Time.
4. **Context amnesia** — Lessons learned yesterday are forgotten today. Each session starts from zero.

## The Solution: PRD-First + Specialized Agents + Quality Gates

I built **Claude AS** (Agents & Skills) — an open-source framework that brings production discipline to AI-assisted development.

### Step 1: Write a PRD, Not a Prompt

```bash
> /prd "Add user authentication with JWT, role-based access, and password reset"
```

This generates a structured Product Requirements Document in `genesis/` with:
- Concrete problem statement
- User stories with acceptance criteria
- Security requirements
- Out-of-scope items
- Risk assessment

No PRD = no implementation. This single rule eliminates 80% of the "it works but it's wrong" problems.

### Step 2: Type `/go` and Walk Away

```bash
> /go
```

The framework:
1. Validates your PRD for completeness
2. Generates implementation stories
3. Dispatches specialized agents in parallel
4. Runs a 6-tier quality gate between every agent handoff
5. Produces production code with tests and docs

### The 46 Agents

Not one assistant — a team of specialists:

| Agent | What It Does |
|-------|-------------|
| **Coder** | TDD implementation, writes real code |
| **Tester** | Brutal edge-case testing |
| **Architect** | Multi-persona architecture review |
| **Security Specialist** | STRIDE, OWASP, vulnerability hunting |
| **Data Architect** | Schema design, query optimization |
| **SRE** | Incident response, SLOs, monitoring |
| **i18n Specialist** | Internationalization, localization |
| **UX/UI** | Accessibility audits, UI review |
| **Senior Engineer** | Assumption surfacing, push-back |
| And 37 more... | Each with a specific role |

Each agent has its own persona, rules, and quality criteria. The Coder doesn't do security — the Security Specialist does. The Architect doesn't write tests — the Tester does.

### The Anvil: 6-Tier Quality Gate

Between every agent handoff, code passes through "The Anvil":

```
T1: Shell Pre-Flight    → Syntax check, banned patterns (no TODO, no FIXME)
T2: Canary Smoke Test   → Can the module even import?
T3: Self-Adversarial    → Agent lists 3+ ways its own code could fail
T4: Scope Validation    → Expected vs actual file changes
T5: Contract Check      → Does the API match the story's spec?
T6: Shadow Tester       → Parallel risk assessment
```

If any tier fails, the code goes back to the agent — not to you. The framework has a self-healing pipeline that auto-fixes 90%+ of violations.

## Cross-Project Learning

The part that surprised me most: **knowledge compounds**.

When you fix a bug in Project A, the framework records it. When you start Project B, those lessons are already loaded. Mistakes in one project become guardrails in the next.

```
Project A: "JWT token stored in localStorage → XSS vulnerability"
                    ↓ knowledge-sync
Project B: Security agent blocks localStorage token storage automatically
```

This happens through a Knowledge Hub that syncs learnings to a shared repository. Over time, your agents get smarter — not because of fine-tuning, but because of accumulated context.

## Works on 4 Platforms

Same agents, same quality gates, same workflow:

- **Claude Code** — `/go`, `/prd`, `/coder`, etc.
- **GitHub Copilot CLI** — Same agents as Copilot custom agents
- **Cursor** — Same agents as Cursor rules
- **OpenAI Codex** — Same agents as Codex skills

Install once, use everywhere.

## Real Results

After 3 months of daily use across 20+ projects:

- **Zero placeholder code** — The framework has a zero-tolerance policy. No TODOs, no FIXMEs, no "coming soon"
- **Three-layer validation** — Every feature verified across DB + Backend + Frontend
- **90%+ auto-remediation** — Most quality violations fixed without my intervention
- **180 tests, 0 failures** — The framework itself is rigorously tested

## Try It

```bash
git clone https://github.com/samibs/claude_as.git ~/tools/claude_as
cd ~/projects/my-app
~/tools/claude_as/install.sh --platform=claude

# Then in Claude Code:
> /prd "your feature idea"
> /go
```

Open source. MIT license. Works today.

**GitHub**: [github.com/samibs/claude_as](https://github.com/samibs/claude_as)

---

*Built with Claude Code, battle-tested across 20+ production projects. The framework eats its own dog food — it was built using its own agents.*
