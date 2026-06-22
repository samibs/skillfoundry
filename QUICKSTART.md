# SkillFoundry — Quick Start

Get from zero to a working feature in under 15 minutes.

---

## Prerequisites

- [Claude Code](https://claude.ai/code) installed and authenticated
- A git repository (or an empty folder — SkillFoundry will `git init` for you)
- Node.js, Python, .NET, Go, or Rust project (any stack works)

---

## Step 1: Install

SkillFoundry is a Claude Code framework — no npm install, no binary. Just clone into your project's Claude config folder:

```bash
# From your project root
git clone https://github.com/samibs/skillfoundry .claude/skillfoundry

# Or copy the agents/ and .claude/commands/ folders manually
```

---

## Step 2: First run — onboard

Open Claude Code in your project and run:

```
/onboard
```

This detects your stack, confirms Claude Code can run shell commands, and walks you through your first workflow. Takes about 5 minutes.

---

## Step 3: Build your first feature

**Option A — From a story description (fastest):**
```
/feature "add a /health endpoint that returns {status: ok, version: x.y.z}"
```

**Option B — From a PRD (recommended for real features):**
```
/prd "user authentication with JWT login and refresh tokens"
```
Then review the generated PRD in `genesis/`, then:
```
/feature genesis/2026-06-22-user-authentication.md
```

---

## What happens

```
Stage 1: IMPLEMENT    Coder builds it. TDD: test first, then code.
Stage 2: TESTLOOP     Tests run. Failures feed back to coder. Repeats until green.
Stage 3: CHALLENGE    Evaluator grades the implementation. Fix briefs loop back to coder.
Stage 4: DOCUMENT     JSDoc + CHANGELOG + API reference updated.
Stage 5: COMMIT       Scoped git commit with evaluator verdict in the body.
```

You see output at each stage. The pipeline halts and asks you if anything needs a human decision.

---

## Full project build

For multiple features from a set of PRDs:

```
/forge
```

This runs the complete pipeline: validate all PRDs → implement all stories (each through `/feature`) → layer-check → security audit → knowledge harvest.

---

## Key commands

| Command | What it does |
|---------|-------------|
| `/feature "description"` | Build one feature end-to-end |
| `/prd "idea"` | Write a PRD before implementing |
| `/forge` | Build everything from all PRDs |
| `/testloop` | Re-run the test-fix loop on an existing implementation |
| `/quick "description"` | Lite mode — implement + test + commit, no full pipeline |
| `/evaluator` | Grade an existing implementation |
| `/security audit` | Security audit without full forge |
| `/onboard` | Re-run setup / detect stack changes |

---

## Common questions

**My tests are failing and the loop isn't converging.**
Run `/testloop --max 1` to see the raw failure, then fix manually. Resume with `/feature --from testloop`.

**I just want to write code without the pipeline.**
Use `/quick "what to build"`. Minimal ceremony — implement, test, commit. No evaluator, no full docs.

**How do I add a PRD for something complex?**
Use `/prd "idea"` to generate a structured PRD with acceptance criteria, then review it before running `/feature` or `/forge`.

**What if the evaluator keeps blocking me?**
Use `--override "reason"` on the blocked stage. The override is logged to `logs/overrides.md` and noted in the commit. It's a conscious tradeoff, not a bypass.

---

## Project layout after first feature

```
your-project/
├── genesis/           ← PRDs go here before implementation
├── docs/
│   └── stories/       ← Generated stories from PRDs
├── reports/           ← HTML reports (if enabled in .claude/config.json)
├── logs/
│   └── overrides.md   ← Logged --override decisions
└── .claude/
    ├── config.json    ← SkillFoundry configuration
    ├── stack-profile.json     ← Detected runtime + test commands
    └── execution-context.json ← Shell availability status
```

---

*SkillFoundry — PRD-first, test-gated, evaluator-challenged AI development*
