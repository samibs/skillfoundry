# SkillFoundry Release Notes

A one-screen summary of every release: what changed, why it matters, and where the detail
lives. Deep per-release notes are linked where they exist; the full technical record is in
[CHANGELOG.md](../CHANGELOG.md).

**Current version: 5.32.0** (2026-09-04)

| Layer | Audience | Document |
|-------|----------|----------|
| Summary of changes | Everyone | this file |
| Full technical record | Engineers upgrading or integrating | [CHANGELOG.md](../CHANGELOG.md) |
| Installation and usage | New users | [README.md](../README.md) |

---

## 5.32.0 — AI Delivery Efficiency (2026-09-04)

Effort now scales with risk, without weakening any correctness guarantee.

- Every task is classified LOW / MEDIUM / HIGH **deterministically** before implementation; the
  budget picks how much analysis, testing, and review the change warrants.
- Anything already proven against an unchanged state is not proven again; parallel workers
  share one validation instead of each running the full suite.
- Agents stop when the evidence says the work is done — no re-reading an unchanged diff, no
  unrequested cleanup.
- Auth, secrets, crypto, migrations, payments, and deployment classify HIGH automatically; a
  downgrade request is refused.

On by default; one setting restores always-validate-everything.
→ [Full notes](V5.32.0-RELEASE-NOTES.md) · [Guide](DELIVERY-EFFICIENCY.md) · [CHANGELOG `[5.32.0]`](../CHANGELOG.md)

## 5.31.0 — Governed Development Mission Protocol (2026-09-04)

`/mission` records what was actually **proven**, in `.ai/`, surviving the session.

- Catches a test runner that hung after its assertions passed, a dev server left orphaned, a
  change dropped in a merge, and a push mistaken for a publication.
- `/mission wave plan` builds one dependency graph across PRDs and defers colliding work;
  each writer gets its own git worktree — sharing one is refused.
- The ledger refuses to record a status the repository cannot back up.

→ [Full notes](V5.31.0-RELEASE-NOTES.md) · [Protocol](../MULTI_AGENT_PROTOCOL.md)

## 5.30.0 — AgentOS Follow-ups (2026-07-17)

Per-story state streaming (watch progress mid-run), opt-in agent-handoff contract validation,
and a declared output shape for every agent.
→ [Full notes](V5.30.0-RELEASE-NOTES.md)

## 5.29.0 — AgentOS: Shared State Kernel (2026-07-17)

Durable run-state kernel, gate barrier, schema-validated handoffs, lazy language projection.
→ [Full notes](V5.29.0-RELEASE-NOTES.md)

## 5.28.0 — Rationalization Tail (2026-07-13)

Retired the duplicate gate-keeper skill and de-theatered personas framework-wide.
→ [Full notes](V5.28.0-RELEASE-NOTES.md)

## 5.27.0 — Skill Rationalization & `/prune` (2026-07-13)

New `/prune` (dead-code and duplication remover), plus a rationalization pass that removed
prompt-era scaffolding with **zero capability lost**.
→ [Full notes](V5.27.0-RELEASE-NOTES.md)

## 5.26.0 — Domain Expert Synthesis (2026-07-11)

Project-scoped, review-only domain reviewers for specialized non-IT fields (legal, accounting,
medical): three-way detection, grounded in citable packs, promoted to the framework when they
recur across projects.
→ [Full notes](V5.26.0-RELEASE-NOTES.md) · [Guide](DOMAIN-EXPERTS.md)

## 5.25.0 — Security & Robustness Hardening (2026-07-07)

A full adversarial audit of the codebase, then remediation: RCE and exfiltration paths closed,
per-project memory isolation, gates that fail closed.
→ [Full notes](V5.25.0-RELEASE-NOTES.md)

## 5.24.0 — Injection Resistance & Prompt Discipline (2026-07-07)

Instructions embedded in PRDs, diffs, memory, and tool results are treated as **data, not
commands** (gate tampering is BLOCK); plus graduated relevance-based recall and a
stop-at-first-match `/auto` cascade.
→ [Full notes](V5.24.0-RELEASE-NOTES.md)

## 5.23.0 — Verification Layer (2026-07-07)

`/verify` runs the gates against **any** agent's diff for a PASS / WARN / BLOCK verdict;
`/prd-lint` finds contradictions and gaps before code exists; `/tester` adds property-based
testing.
→ [Full notes](V5.23.0-RELEASE-NOTES.md)

## 5.22.0 / 5.22.1 — Refinement Pass (2026-07-06)

~12,000 lines of repeated prompt ceremony removed; `/gosm`, `/goma`, and `/blitz` collapsed to
thin `/go` aliases; Anvil tiers moved to the A-namespace; skill and agent counts reconciled to
verifiable ground truth.
→ [Full notes](V5.22.0-RELEASE-NOTES.md)

## 5.21.0 — Codebase Agent Wiki (2026-07-05)

`/docs wiki` — a repo-wide, agent-facing wiki generator grounded in source and git evidence,
with surgical change-aware updates.
→ [Full notes](V5.21.0-RELEASE-NOTES.md)

## 5.20.0 — Autonomous Loop Engine (2026-06-23)

Ralph Loop protocol, self-prompt quality protocol, `/improve` continuous-improvement command,
and Loop Mode in the autonomous protocol. The agent finds the work, does the work, judges its
own output, and stops when there is nothing left.

## 5.19.0 — Structural Trust & Production Resilience (2026-06-22)

Multi-user state isolation (`.claude/local/` vs `.claude/shared/`), convention discovery,
`/hotfix` emergency pathway, evaluator calibration, durable audit trail, global profile
resolution, stack confidence hard block.
→ [Full notes](V5.19.0-RELEASE-NOTES.md)

## 5.18.0 — Web Security Checker (2026-06-12)

`/web-security-check` with 10 check groups (TLS, headers, cookies, DNS, info leakage,
redirects, ports, WHOIS, deps, WAF) and BLOCKER / WARN / INFO severity. A mandatory gate in
`/production-orchestrator` for public-facing URLs.
→ [Full notes](V5.18.0-RELEASE-NOTES.md)

## 5.17.0 — Codebase Comprehension Pre-Flight (2026-06-04)

Tree-sitter Code Map (`sf_codemap`): API contract surface, import graph, DB/layer map. New
`/preflight` command, wired into the `/forge` IGNITE phase. Pure WASM and advisory — it never
blocks.
→ [Full notes](release-notes/v5.17.0.md)

## 5.16.0 — Grok Platform & Provider Refresh (2026-05-31)

xAI Grok Build added as the 6th install platform (`.grok/skills/` with `AGENTS.md`); xAI
provider updated to `grok-4.3` with real pricing.

## 5.15.0 — Coding Discipline Protocol (2026-05-16)

Framework-wide behavioral guardrail (`agents/_coding-discipline.md`): Think-Before-Coding,
Simplicity-First, Surgical Changes, Goal-Driven Execution.
→ [Full notes](V5.15.0-RELEASE-NOTES.md)

## 5.14.0 — MCP Server Security Hardening (2026-05-13)

Bearer-token auth on every MCP and API route, plus remediation of every gap found by a full
BPSBS audit. Hardening only — no functional changes.
→ [Full notes](V5.14.0-RELEASE-NOTES.md)

## 5.13.0 — Pipeline Quality (2026-05-13)

`/guardloop` skill, `failure-scan.sh` and `guardloop-harvest.sh` hooks, adaptive rules file.
10 patterns tracked; CRITICAL patterns auto-promoted after 3 hits.
→ [Full notes](V5.13.0-RELEASE-NOTES.md)

## 5.12.0 — GuardLoop Integration (2026-05-13)

GuardLoop wired in as live hooks and a skill: the framework tracks its own failure patterns
across sessions and promotes them into enforced rules.
→ [Full notes](V5.12.0-RELEASE-NOTES.md)

## 5.11.0 — FolderFlow: Story State Machine (2026-05-08)

`/go` and `/layer-check` integration, story checkbox reconciler, folder state machine
(todo / in-progress / blocked / done), JSON artifact handlers, 83-case test suite.
→ [Full notes](V5.11.0-RELEASE-NOTES.md)

## 5.10.0 — Test Cartographer: `/test-map` (2026-05-07)

Automated test documentation across all platforms with three-tier classification
(HIGH / MEDIUM / BASELINE) and deep optimization for GitHub Copilot with the Claude model.

## 5.9.0 — `/self-validate` (2026-05-07)

Output verification loop: the agent validates its own work before handing it off.

## 5.8.0 — VS Code Extension v1.3.0 (2026-05-06)

Setup wizard with SecretStorage-backed keys, `sf` CLI detection with one-click install, and a
cancellable forge progress notification backed by a live phase monitor.

## 5.7.0 — Adversarial Intelligence (2026-05-06)

- **Local vector memory** — file-based cosine-similarity store with multi-provider embedding
  (Ollama → Transformers → OpenAI) and hybrid keyword + semantic recall.
- **Specter security engine** — an adversarial red-team phase in every pipeline, generating
  attack vectors with CVSS metadata and running safe, allowlisted simulations.
- **`/red-team-researcher`** — offensive/defensive research skill with 6 domain reference files.

## 5.6.0 — Parallel Dispatch + NL Cron (2026-04-19)

Parallel Dispatch Engine (`sf_parallel_analyze`) and Natural Language Cron
(`sf_cron_compile`).

## 5.5.0 — Hermes Intelligence (2026-04-19)

LLM context summarizer, memory nudge system across 13 tools, FTS5 session search
(`sf_memory_search`).

## 5.4.0 — Token Optimization (2026-04-19)

Response optimizer (JSON compaction, concise mode, output truncation), SQLite-persisted token
tracker, `sf_token_report`.

## 5.3.0 — Hook Enforcement (2026-04-16)

GateGuard (force-read-before-edit), config protection for 30+ linter and formatter configs,
session quality report, session lifecycle hooks.

## 5.2.0 — Multi-Tenant Security (2026-04-02)

Auto-injected security stories (SEC-001–SEC-006), multi-tenant isolation gate (7 checks), 10
deviation patterns (MT-001–MT-010).

## 5.1.0 / 5.0.0 — Harness Engineering + Learning Intelligence (2026-03-29 / 2026-04-02)

Tool agents, Secret Guard, Deviation Enforcer, Import Validator, Correction Loop, and health
scores — a feature set derived from 2,792 harvested artifacts and 115 session transcripts
across 49 projects.

---

## Earlier Releases

| Version | Summary |
|---------|---------|
| 4.0.0 (2026-03-29) | Tier 4 tool agents, fleet health monitoring, multi-platform artifact detection |
| 3.0.0 (2026-03-29) | Shift from installed prompt files to a centralized MCP agent server |
| 2.x and earlier | See [CHANGELOG.md](../CHANGELOG.md) and [V1.1.0-RELEASE-NOTES.md](V1.1.0-RELEASE-NOTES.md) |
