# Changelog

All notable changes to the SkillFoundry Framework will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.19] - 2026-02-28

### Added — Social Media Publishing Script

New shell script `scripts/social-publish.sh` for publishing posts directly to X (Twitter) and LinkedIn via their REST APIs.

- **Single posts**: `social-publish.sh publish x "content"` / `social-publish.sh publish linkedin "content"`
- **Threads**: `social-publish.sh thread x thread-file.txt` (sections split by `---`)
- **Dry-run mode**: Preview without posting (`--dry-run`)
- **History tracking**: All posts logged to `.claude/social-media-posts.jsonl`
- **Status check**: Verify API connectivity and token validity
- **Setup wizard**: Interactive token configuration
- **Sourceable**: Other scripts can `source` it and call `social_publish()` directly
- Config via env vars (`CLAUDE_AS_X_BEARER_TOKEN`, `CLAUDE_AS_LINKEDIN_ACCESS_TOKEN`) or `.claude/social-media.json`
- Updated `/social-media` agent with Publishing section referencing the script

---

## [2.0.18] - 2026-02-28

### Added — 3 New Specialist Agents (56 agents, 63 skills)

Three new agents added to the framework, synced across all 5 platforms (Claude Code, Copilot, Cursor, Codex, Gemini):

- **SEO Specialist** (`/seo`) — Google Search Console analysis, technical SEO audits, Core Web Vitals, structured data/Schema.org validation, sitemap/robots.txt generation, crawl budget optimization, URL migration planning
- **Social Media Specialist** (`/social-media`) — Platform-specific content creation for X (Twitter), Medium, Reddit, XDA-Developers, and LinkedIn. Includes formatting rules, character limits, tone guidelines, content calendars, and engagement strategies per platform
- **Production Cleaner** (`/clean`) — Strips AI/LLM framework artifacts before production deployment. Generates production `.gitignore`/`.dockerignore`, removes AI modification markers from code, audits for leaked framework files, CI/CD integration for automated clean checks

Agent count: 53 → 56 | Skill count: 60 → 63

---

## [2.0.17] - 2026-02-27

### Fixed — Git Executable Permissions

31 scripts (`.sh`, `.ps1`, `bin/sf.js`, `sf` wrapper) were stored as `100644` (non-executable) in the git index. Every fresh `git clone` required a manual `chmod -R 755 *` before `install.sh` or `update.sh` would run. All 31 files now stored as `100755` — fresh clones have correct permissions out of the box.

---

## [2.0.16] - 2026-02-27

### Fixed — Update Script Self-Copy Bug

When running `update.ps1 .` or `update.sh .` from inside the framework directory, `$ScriptDir` and `$ProjectDir` resolve to the same path. Unguarded `Copy-Item`/`cp` calls for copilot helper files (helper.sh, WORKFLOW-GUIDE.md, SECURITY-INTEGRATION.md) crashed because the OS prevents overwriting a file with itself.

- **update.ps1**: Added `$isSameDir` guard; wrapped 2 unguarded `Copy-Item` calls
- **update.sh**: Added `is_same_dir` guard; wrapped 5 unguarded `cp` calls across 2 code paths

Hash-checked copy loops already handled this gracefully (identical hashes = skip), so only the direct copies needed the guard.

---

## [2.0.15] - 2026-02-27

### Added — Pipeline Finisher (Automated Post-Pipeline Housekeeping)

Deterministic 7th pipeline phase that eliminates the "forgot to bump version / update test counts / update docs" gap. Zero AI cost — fully mechanical checks that auto-fix what's safe and report what needs human judgment.

#### New: Finisher Module (`src/core/finisher.ts`)
- **Version sync**: Bumps patch version (when stories completed > 0) and syncs across `.version`, `package.json`, `README.md`, `USER-GUIDE-CLI.md`, `TEST-SUITE-REFERENCE.md`
- **Test count sync**: Runs vitest, compares actual count vs docs, auto-fixes stale references
- **Architecture listing**: Scans `src/core/*.ts` on disk, compares with tree diagram in docs, reports drift (no auto-fix — descriptions need human judgment)
- **Changelog**: Verifies `[current-version]` entry exists in CHANGELOG.md, inserts placeholder if missing
- **Git clean**: Detects uncommitted changes (report-only, never auto-commits)
- Two modes: `check` (read-only for dry-run) and `fix` (auto-correct what's mechanical)
- Execution order: version → test-count → architecture → changelog → git-clean

#### Updated: Pipeline Integration
- FINISH phase runs after DEBRIEF (7th of 7 phases)
- Non-blocking: drift or errors don't fail the pipeline
- `onFinisherCheck` callback fires per check for real-time progress
- Results attached to `PipelineResult.finisherSummary`
- Run bundle JSON updated with finisher data

#### Updated: Forge Command (`/forge`)
- Full pipeline shows finisher summary: `Finisher: X ok, Y fixed, Z drift`
- Dry-run mode (`--dry-run`) shows finisher checks in read-only mode
- Real-time progress shows each check with status icon

#### Tests
- 50 new unit tests (`finisher.test.ts`) covering all 5 checkers + integration
- 2 new pipeline integration tests (FINISH phase + callbacks)
- Total: 380 tests across 27 files (was 328/26)

---

## [2.0.14] - 2026-02-27

### Added — Post-Handoff Micro-Gates

Lightweight AI-powered quality reviews at pipeline handoff points. Agents now enforce quality on each other — security blocks insecure code, standards blocks non-compliant code — at ~15% cost increase vs ~400% for full cross-agent enforcement.

#### New: Micro-Gates Module (`src/core/micro-gates.ts`)
- **MG1 (Security)**: Post-coder per-story security review — checks OWASP Top 10, injection, hardcoded secrets, auth issues
- **MG2 (Standards)**: Post-coder per-story standards review — checks missing docs, magic numbers, naming, conventions
- **MG3 (Review)**: Pre-TEMPER cross-story consistency review — checks cross-story inconsistencies, arch issues (advisory only)
- Structured response parser: `VERDICT: PASS|FAIL|WARN` / `FINDINGS:` / `SUMMARY:` format
- Safety override: PASS verdict with CRITICAL/HIGH findings automatically escalated to FAIL
- Conservative defaults: unparseable AI responses default to WARN
- Read-only tool set (read, glob, grep) — micro-gates inspect but never modify code
- Each gate limited to 3 turns max for cost control

#### Updated: Pipeline Integration (`src/core/pipeline.ts`)
- MG1 + MG2 run after each story implementation, before T1 gate
- Micro-gate FAIL triggers fixer even when T1 passes
- Fixer prompt merges T1 violations + micro-gate findings into single remediation prompt
- MG3 runs once between FORGE and TEMPER phases (advisory only, does not block)
- Micro-gate costs tracked and included in pipeline totals
- Run bundle JSON includes `microGates` section with per-gate results

#### Updated: Forge Command (`src/commands/forge.ts`)
- Real-time `onMicroGateResult` callback shows gate progress during execution
- Final output includes micro-gate summary: `Micro-gates: 3P 0F 0W ($0.0150)`
- MG3 advisory warning displayed when verdict is not PASS

#### Updated: Types (`src/types.ts`)
- `MicroGateVerdict`, `MicroGateFinding`, `MicroGateResult` types
- `StoryExecution.microGateResults` for per-story results
- `PipelineCallbacks.onMicroGateResult` callback
- `PipelineResult.microGateSummary` with totals and advisory

#### Tests
- `micro-gates.test.ts`: 16 test cases (8 parser, 5 runner, 3 formatter)
- `pipeline.test.ts`: +4 integration tests (micro-gate wiring, fixer trigger, callbacks, advisory)
- All tests passing, 0 regressions

---

## [2.0.13] - 2026-02-27

### Updated — Documentation, CLI Help & Consistency

#### CLI Help & Setup
- Setup wizard now lists LM Studio as a separate option (option 6) alongside Ollama
- `/setup list` correctly shows lmstudio as "always available (local)"
- `/provider set lmstudio` no longer requires an API key
- `/config` now supports editing `route_local_first`, `local_provider`, `local_model`, `context_window`
- `/status` shows active local-first routing info when enabled

#### Documentation
- README.md: Updated version badge to 2.0.13, added providers badge, added Local-First Development section
- USER-GUIDE-CLI.md: Added Section 12 (Local-First Development) with routing, compaction, health checks, and cost savings docs
- USER-GUIDE-CLI.md: Updated architecture section with compaction.ts, health-check.ts, task-classifier.ts
- USER-GUIDE-CLI.md: Updated test suite count from 154 to 308 across 25 test files
- USER-GUIDE-CLI.md: Updated config reference with routing settings

---

## [2.0.12] - 2026-02-27

### Added — Local-First Development

Three new modules that enable effective use of local AI models (Ollama, LM Studio) for cost optimization and offline development.

#### New: Context Compaction Engine (`src/core/compaction.ts`)
- Token estimation using conservative 3.5 chars-per-token ratio
- Context window defaults for 20+ models (cloud and local)
- System prompt compression: strips code blocks, examples, tables when over budget
- Message sliding window: keeps first user message + last N turns that fit
- Summary injection: prepends "[N earlier messages omitted...]" when pruning
- Automatically applied for local providers (Ollama, LM Studio) in the agentic loop

#### New: Provider Health Checks (`src/core/health-check.ts`)
- `pingProvider()` — HTTP ping to local endpoint with 500ms timeout
- Cached results with 60-second TTL (avoids per-turn latency)
- `resolveProvider()` — graceful fallback to cloud with user-visible warning
- `listLocalModels()` — queries /v1/models endpoint for available models
- `isLocalProvider()` / `getLocalBaseUrl()` helpers

#### New: Task Complexity Classifier (`src/core/task-classifier.ts`)
- Keyword-based simple/complex task classification (no LLM call needed)
- Simple keywords: docstring, format, explain, readme, changelog, etc.
- Complex keywords: architect, security, refactor, implement, test, etc.
- Default to complex (safer — cloud handles ambiguous tasks)
- `selectProvider()` — combines classification + health check for routing decisions

#### Updated: Config & Types
- New `SfConfig` fields: `route_local_first`, `local_provider`, `local_model`, `context_window`
- Default: routing disabled (opt-in via `route_local_first = true` in config.toml)

#### Updated: Cost Command
- Shows local vs cloud token breakdown when both providers have been used
- Estimates savings from local routing: "Saved: ~$X.XX by routing locally"

#### Updated: AI Runner
- Applies context compaction before each turn when using local providers
- Uses model-specific context windows for sliding-window pruning

#### Tests
- `compaction.test.ts`: 20 test cases (token estimation, sliding window, summary injection, compression)
- `health-check.test.ts`: 11 test cases (ping, caching, fallback, local detection)
- `task-classifier.test.ts`: 17 test cases (classification, routing, provider selection)
- All 308 tests passing, 0 regressions

---

## [2.0.11] - 2026-02-27

### Added — LM Studio Provider & Local-First PRD

#### New: LM Studio Provider
- Added LM Studio as the 6th supported provider (OpenAI-compatible at `localhost:1234/v1`)
- Factory function `createLMStudioProvider()` in `providers/openai.ts`
- Registered in `AVAILABLE_PROVIDERS` with default model `qwen2.5-coder-7b`
- Auto-detected as always available (same as Ollama — no API key needed)
- Credential mapping via `LMSTUDIO_BASE_URL` environment variable
- Deprioritized in auto-selection (local providers don't override cloud)

#### New: Local-First Development PRD
- Created `genesis/2026-02-27-local-first-development.md` PRD covering:
  - Context compaction engine for small-context local models (4K-32K)
  - Local-first cost routing (simple tasks → local, complex → cloud)
  - Provider health checks with graceful fallback
  - Task complexity classification (keyword-based, no LLM call)
- Based on analysis of XDA article "How I built a Claude Code workflow with LM Studio"

#### Updated
- Provider tests updated: 260 tests passing (2 new: lmstudio detection + creation)
- README.md: LM Studio added to provider table
- USER-GUIDE-CLI.md: LM Studio added to setup wizard, capabilities table, env var docs

---

## [2.0.10] - 2026-02-26

### Added — The Forge Pipeline Engine

The `/forge` command is now a real executable pipeline. Previously it was a read-only scanner that reported PRD/story status and gate results. Now it drives the full development lifecycle: discover PRDs, generate stories via AI, implement each story with tools, run quality gates, and produce working code.

#### New: Standalone Agentic Loop (`src/core/ai-runner.ts`)
- Extracted the multi-turn tool-use loop from `useStream.ts` into a standalone module
- Zero React dependencies — can be called from both interactive mode and batch pipelines
- Supports callbacks for streaming, tool execution, permissions, and turn progress
- Budget enforcement per-turn, abort signal support, retry with fallback provider

#### New: Pipeline Execution Engine (`src/core/pipeline.ts`)
- 6-phase pipeline: IGNITE → PLAN → FORGE → TEMPER → INSPECT → DEBRIEF
- **IGNITE**: Discovers and validates PRDs from `genesis/`
- **PLAN**: Generates stories from PRDs via AI (or reuses existing stories)
- **FORGE**: Implements each story sequentially via the agentic loop (25 turns max per story)
- **TEMPER**: Runs T1-T6 quality gates
- **INSPECT**: Isolates T4 security results
- **DEBRIEF**: Persists run metadata to `.skillfoundry/runs/{runId}.json`
- Auto-fixer: if T1 gate fails after story implementation, routes to fixer agent (max 2 retries)
- Real-time progress callbacks for UI integration

#### Refactored: useStream.ts
- The inline while-loop replaced with a call to `runAgentLoop()`
- All interactive behavior preserved — same tools, budget, permissions, streaming
- React state updates via callbacks (onStreamChunk, onToolStart, onToolComplete, etc.)

#### Updated: `/forge` Command
- `/forge` — Executes the full pipeline (AI-powered)
- `/forge --dry-run` — Read-only scan (backward compatible with pre-2.0.10 behavior)
- `/forge <prd-file>` — Filter to a specific PRD
- Real-time progress messages during pipeline execution

#### New Types
- `RunnerCallbacks`, `RunnerOptions`, `RunnerResult` — Agentic loop interfaces
- `PipelineCallbacks`, `PipelineOptions`, `PipelineResult` — Pipeline interfaces
- `StoryExecution`, `PipelinePhase`, `PipelinePhaseStatus` — Execution tracking

#### Tests
- `ai-runner.test.ts`: 8 test cases (single-turn, multi-turn, budget, permissions, abort, callbacks)
- `pipeline.test.ts`: 12 test cases (PRD scan, story generation, execution, fixer retry, persistence, callbacks)
- Total: 258 tests passing (20 new, 0 regressions)

---

## [2.0.9] - 2026-02-26

### Added — Reflection Protocols for 5 Key Orchestrators

Completed the reflection coverage gap from v2.0.8. The 5 most-used orchestrator agents now have full reflection protocols with pre/post execution self-assessment and scoring thresholds.

#### Reflection Protocols Added
- **auto.md**: Classification accuracy, pipeline completeness, escalation quality, token efficiency. Fixed 4 incorrect `docs/prd/` references to `genesis/`.
- **context.md**: Estimation accuracy, compaction timing, context preservation, budget health.
- **fixer.md**: Routing accuracy, fix quality, escalation rate, regression prevention.
- **gate-keeper.md**: Decision accuracy, violation detection, standards consistency, false positive rate.
- **go.md**: Orchestration completeness, gate compliance, context management, delivery quality.

#### Knowledge Promotion Pipeline
- **New**: `scripts/promote-knowledge.sh` — Full promotion pipeline for knowledge bank
  - Scans `knowledge/staging/`, validates YAML frontmatter and body sections
  - Deduplicates against `knowledge/promoted/`
  - Scores lessons (0-5) with minimum threshold of 3 to promote
  - Commands: `promote`, `scan`, `force`, `reject <id>`, `stats`
  - Pure bash, no external dependencies

#### Visual Overhaul Verification
- All 11 CLI components confirmed using theme.ts (hex colors, Unicode symbols, custom borders)
- No hardcoded colors remaining — visual overhaul from v2.0.8 plan is 100% complete

### Synced
- 5 command files synced to 4 platforms (20 copies total)

---

## [2.0.8] - 2026-02-26

### Changed — Self-Introspection: Full Agent Quality Overhaul

Comprehensive self-introspection cycle across all 60 agents. Each agent audited itself for quality gaps, then specialist agents cross-reviewed and corrected each other. The largest single improvement in framework history.

#### Phase 1: IGNITE — Full Audit
- All 60 agents scored against 7 quality dimensions (Structure, Examples, Output, Reflection, Integration, Specificity, Completeness)
- 8 Gold (60+), 23 Silver (50-59), 14 Bronze (35-49), 15 Failing (<35)
- Weakest dimensions framework-wide: Reflection (75% scored 0), Integration (38% operated as islands)

#### Phase 2: FORGE — Self-Improvement (45 agents modified, +8,830 lines)

**Full Rewrites (15 agents, score < 35):**
- `gosm` (18→359), `goma` (17→383), `blitz` (21→463), `cost` (22→365), `undo` (20→431)
- `profile` (26→382), `status` (28→393), `health` (30→362), `ship` (27→485), `gohm` (30→383)
- `evaluator` (30→371), `workflow` (32→371), `nuke` (33→361), `debugger` (34→456), `swarm` (34→522)

**Major Enhancements (14 agents, score 35-49):**
- `coder`, `forge`, `anvil`, `metrics`, `context`, `replay`, `version`
- `performance`, `api-design`, `accessibility`, `ops`, `tech-lead`, `auto`, `dependency`

**Reflection/Integration Added (16 agents, score 50-59):**
- `i18n`, `sre`, `release`, `math-check`, `educate`, `layer-check`, `security`
- `data-architect`, `senior-engineer`, `prd`, `orchestrate`, `memory`, `stories`, `ux-ui`, `migration`

#### Phase 3: TEMPER — Cross-Agent Peer Review

**Security Agent reviewed 5 agents (12 fixes):**
- `devops`: SAST/DAST checklist, credential rotation, pipeline secrets handling
- `api-design`: Default-deny auth policy, CORS configuration guidance, request body limits
- `ops`: Admin access hardening, audit logging, file upload security
- `sre`: Security incident response, security monitoring signals, security SLIs

**Tester Agent reviewed 5 agents (8 fixes):**
- `coder`: Phase 4 rewrite mandating test execution, deliverables upgrade
- `refactor`: Coverage comparison before/after refactoring
- `migration`: Automated test file mandate, testing checklist expansion
- `fixer`: Regression test requirement for all fix types
- `debugger`: Tester documentation standards for regression tests

**Architect Agent reviewed 5 agents (8 fixes):**
- `data-architect`: Architect approval gate, scalability patterns, ADR checklist
- `api-design`: ADR requirement, backwards compatibility enforcement protocol
- `tech-lead`: Architect escalation rule for boundary decisions
- `coder`: Architect approval check in Phase 1 validation
- `delegate`: Selection Rule 6 for implicit architectural decisions

**Evaluator reviewed 15 agents (22 fixes):**
- 2 Output Format expansions (blitz, swarm)
- 5 Integration table restructures (profile, status, health, ship, gohm)
- 15 Required Challenge additions (all 15 rewritten agents)

#### Phase 4: INSPECT — Quality Gate
- Zero banned pattern violations
- All 45 modified agents verified for structural integrity
- Reflection, Integration, and Output sections present in all improved agents

### Changed
- `.version` bumped to 2.0.8 (from 2.0.7)
- `sf_cli/package.json` version bumped to 2.0.8
- All agents synced across 5 platforms (Claude, Codex, Copilot, Cursor, Gemini)

---

## [2.0.7] - 2026-02-26

### Changed — Documentation Agent Rewrite & Release Version Protocol

Major rewrite of the docs agent to prevent version drift and documentation inconsistencies across the framework. The release agent now cross-references the docs agent's version bump protocol.

#### Docs Agent (`/docs`) — Full Rewrite
- **PHASE 1: VERSION & CONSISTENCY AUDIT** (mandatory first step) — version reconciliation checklist, timestamp verification, terminology consistency, rule: "NEVER hardcode a version in prose"
- **PHASE 2: CONTEXT GATHERING** — required inputs table, rejection criteria for incomplete requests
- **PHASE 3: DOCUMENTATION WRITING** — document types table, required structure template (Version/Last Updated/Status header), code examples standard, API documentation standard
- **PHASE 4: CROSS-DOCUMENT CONSISTENCY VERIFICATION** — consistency matrix, cross-reference integrity, staleness detection
- **PHASE 5: DOCUMENTATION HEALTH SCAN** — `/docs health` and `/docs audit` commands, 6-point scan checklist, health report format
- **PHASE 6: VERSION BUMP DOCUMENTATION PROTOCOL** — checklist of ~15 files that must update on every version bump, automated version check command

#### Release Agent (`/release`) — Version Checklist Enhancement
- Pre-release versioning checklist now references `.version` as single source of truth
- Added mandatory `/docs audit` step (docs agent Phase 6) to release preparation
- Expanded checklist to cover all ~15 files that need version updates (README, AGENTS, QUICK-REFERENCE, DOCUMENTATION-INDEX, HOW-TO, sub-package.json files)
- Added "Last Updated" timestamp refresh requirement

#### Platform Sync
- Docs agent synced to 6 targets: command, persona, Codex, Copilot, Cursor, Gemini
- Release agent synced to 6 targets: command, persona, Codex, Copilot, Cursor, Gemini

### Changed
- `.version` bumped to 2.0.7 (from 2.0.6)
- `sf_cli/package.json` version bumped to 2.0.7

---

## [2.0.6] - 2026-02-26

### Added — Chunk Dispatch Protocol

New protocol for splitting large work items across multiple instances of the same agent type. Addresses LLM quality degradation on long files by chunking work at natural boundaries, dispatching shards in parallel, and merging results with a consistency pass.

#### Protocol (`agents/_chunk-dispatch-protocol.md`)
- **When to chunk**: Input >300 lines, output >300 lines, repetitive structure, quality risk
- **Where to split**: Natural boundaries (section headers, class/function boundaries, file boundaries)
- **Context brief**: Shared context (types, imports, style guide) each shard receives for consistency
- **Chunk limits**: Per-agent max lines (docs: 200, coder: 150, refactor: 100, review: 250)
- **Merge strategies**: Concatenate, concatenate with TOC, interleave, file-per-chunk
- **Consistency pass**: 5-check verification (naming, style, cross-references, completeness, tone)
- **Agent-specific strategies**: Detailed chunking guidance for docs, coder, tester, refactor, review, migration, i18n

#### Agent Updates (7 agents, 35 files across 5 platforms)
- `docs`: Chunk Dispatch Support section added (split by `## ` headers, 200 lines/chunk)
- `coder`: Chunk Dispatch Support section added (split by class/file, 150 lines/chunk)
- `tester`: Chunk Dispatch Support section added (split by module, 200 lines/chunk)
- `refactor`: Chunk Dispatch Support section added (split by file/module, 100 lines/chunk)
- `review`: Chunk Dispatch Support section added (split by PR file, 250 lines/chunk)
- `migration`: Chunk Dispatch Support section added (split by table/entity, 150 lines/chunk)
- `i18n`: Chunk Dispatch Support section added (split by locale/section, 200 lines/chunk)

### Changed
- `.version` bumped to 2.0.6 (from 2.0.5)
- `sf_cli/package.json` version bumped to 2.0.6

---

## [2.0.5] - 2026-02-24

### Changed — Agent Quality Enhancement Sweep

Comprehensive quality upgrade across 10 specialist agents. Every enhanced agent now has numbered phases, concrete code examples (good vs bad), structured output formats, reflection protocols, integration maps, and peer improvement signals.

#### Agents Enhanced (Major Rewrite)

| Agent | Before | After | Key Additions |
|-------|--------|-------|---------------|
| **devops** | 190 lines | 510 | 8 phases: git workflows, GitHub ops, Azure DevOps, CI/CD, IaC, backup/DR, cleanup, monitoring |
| **tester** | 85 lines | 236 | New Phase 3: mandatory test documentation (WHAT/WHY/WHERE/HOW/HOW COME), Arrange/Act/Assert, behavior-driven naming |
| **analytics** | 83 lines | 569 | 4 phases: data collection, analysis with trend detection, ASCII visualizations, pattern-based recommendations |
| **explain** | 65 lines | 553 | 4 phases: context gathering from 9 sources, trace reconstruction, 3 explanation levels (quick/verbose/story), impact assessment |
| **architect** | 97 lines | 524 | 5 phases: requirements interrogation, design patterns catalog, ADR format, persona chain with handoff format, validation checklist |
| **bpsbs** | 73 lines | 543 | 4 phases: scope assessment, rule-by-rule audit with BAD/GOOD code examples, severity classification, remediation guidance |
| **delegate** | 140 lines | 525 | 5 phases: complexity classification, agent selection matrix, concrete workflow examples, failure recovery, progress reporting |
| **security-scanner** | 127 lines | 566 | 5 phases: grep patterns per vulnerability, data flow tracing, severity with SLAs, remediation fix patterns per language, verification re-scan |
| **standards** | 190 lines | 727 | 4 phases: scope identification with applicability matrix, pillar-by-pillar with violation/compliant examples, language-specific standards (Rust/TS/Python/C#), weighted scoring |
| **learn** | 223 lines | 584 | 4 phases: needs assessment, resource curation, guided practice with exercises, knowledge verification (Feynman technique) |

#### Cross-Platform Sync

All 10 agents updated across all 5 platforms:
- Claude Code (`.claude/commands/`)
- OpenAI Codex (`.agents/skills/`)
- GitHub Copilot (`.copilot/custom-agents/`)
- Cursor (`.cursor/rules/`)
- Google Gemini (`.gemini/skills/`)

**Total: 50 files updated, ~20K lines added**

#### Quality Standards Now Enforced

Every specialist agent now includes:
- **Numbered PHASES** with clear workflow steps
- **Concrete examples** (code blocks, command examples, BAD vs GOOD patterns)
- **Structured OUTPUT FORMAT** with copy-paste templates
- **Reflection Protocol** (pre/post self-assessment, self-score)
- **Integration with Other Agents** (handoff matrix, data flow)
- **Peer Improvement Signals** (upstream/downstream reviewers)

### Fixed

- PowerShell Windows compatibility: replaced here-strings with string concatenation for LF line ending compatibility
- PowerShell Windows compatibility: replaced all Unicode characters with ASCII equivalents across 6 `.ps1` files (fixes parse errors on Windows PowerShell 5.1 where UTF-8 multi-byte chars corrupt under Windows-1252 encoding)
- Added `.gitattributes` to force CRLF for `.ps1`/`.cmd` files

### Added

- README: "Two Ways to Use SkillFoundry" section (IDE-native vs CLI usage)
- README: "Persistent Memory (Lessons Learned)" section with memory_bank structure
- README: "Knowledge Sync (Cross-Project Learning)" section
- README: "Autonomous Mode" section with intent classification table
- README: "Agent Evolution" section

---

## [2.0.4] - 2026-02-23

### Changed — Visual Overhaul ("Modern Hacker" Style)

Full visual overhaul across all 11 CLI components. Rich Unicode borders, gradient accents, structured visual hierarchy.

#### Theme System (`src/utils/theme.ts`)
- **Color palette**: 20+ hex colors organized by role (accent, secondary, success, warning, error, text, border, role)
- **Unicode symbols**: 30+ symbols for status, navigation, tools, pipeline, dividers — no emoji
- **Custom borders**: 4 BoxStyle presets (header `┏━┓`, double `╔═╗`, input `╭─╮`, card `┌─┐`)
- **Chalk wrappers**: `theme.accent()`, `theme.success()`, etc. for consistent chalk formatting
- **Helpers**: `statusColor()`, `divider()`, `formatTokens()`

#### Banner — Gradient ASCII Art
- 3-color gradient: cyan `#00d4ff` → blue `#4488ff` → purple `#6e7dff`
- Tagline with `●` bullet separators, amber version number
- Heavy divider `━` below banner

#### Component Visual Changes
- **Header**: Heavy-top border `┏━━━━┓`, cyan accent top edge, `●` separators, `◆` title prefix
- **StatusBar**: Thin divider line above, `/help` in accent color, `○` streaming indicator
- **Input**: Round corners `╭╮╯╰`, cyan left-accent edge, `⟫` chevron prompt
- **Message**: Left-border accent per role (cyan/green/amber/purple), `▸` prompt prefix
- **StreamingMessage**: Green left-border accent, styled token counter, accent spinner
- **ToolCall**: Unicode tool icons (`▸◉◈✶≣`), purple theme, left-border result containers
- **DiffPreview**: Card border, `◆` file header, styled `+`/`-` prefixes
- **ApprovalPrompt**: Double border `╔═╗` in green, `⟫`/`▹` selection indicators
- **PermissionPrompt**: Double border `╔═╗` in amber, `◆` warning prefix
- **GateTimeline**: Pipeline tree `┣━`/`┗━`, Unicode status icons `◉✗◆─○`, verdict card

### Changed
- `.version` bumped to 2.0.4 (from 2.0.3)
- `sf_cli/package.json` version bumped to 2.0.4

---

## [2.0.3] - 2026-02-23

### Added — Active Agent Display & Live Token Usage

Real-time visibility into which agent is working and how many tokens are being consumed during streaming.

#### StreamingMessage Agent Attribution
- Shows `sf:coder>` (routed agent name) instead of generic `sf>` during streaming
- Displays live turn count and session token totals below streaming content: `[turn 3 | 12.4k in / 2.1k out]`

#### Header Token Totals
- Cumulative session token count displayed in header info line (e.g. `14.2k tok`)
- Formatted with `k` suffix for readability (1000+ tokens)

#### StatusBar Agent Indicator
- Shows `coder working` instead of `streaming...` when an agent is active
- Turn indicator `(turn N)` shown for multi-turn agentic loops

#### Streaming Metadata State
- `useStream` now exposes `streamingAgent`, `streamingTurnCount`, `sessionInputTokens`, `sessionOutputTokens` as React state
- Session token accumulators track total input/output tokens across all messages

### Changed
- `.version` bumped to 2.0.3 (from 2.0.2)
- `sf_cli/package.json` version bumped to 2.0.3

---

## [2.0.2] - 2026-02-23

### Added — Team Summon (Multi-Agent Auto-Routing)

Summon a team of agents once with `/team <name>`, and every subsequent message is automatically routed to the best-matching team member via lightweight keyword scoring — no manual `/agent` switching needed.

#### `/team` Command
- **6 preset teams**: `dev`, `fullstack`, `security`, `ops`, `review`, `ship`
- **Custom teams**: `/team custom coder tester reviewer` (min 2 agents)
- **Subcommands**: `/team off`, `/team list`, `/team status`
- **Mutual exclusion**: activating a team clears any single agent, and vice versa

#### Keyword-Based Auto-Router
- 30+ agents mapped to weighted regex patterns in `team-router.ts`
- Scoring: sum matched keyword weights per team member, highest wins
- Confidence levels: high (>=6), medium (>=3), low (>=1), fallback (0)
- Deterministic, no LLM calls — ~300 regex tests worst case

#### UI Integration
- **Header**: shows `team:dev (5 agents)` when team active
- **StatusBar**: shows `/team off` hint when team active
- **Message labels**: `sf:coder>` shows which agent handled each message
- **Metadata**: `routedAgent`, `routingConfidence`, `activeTeam` tracked per message

#### Session State
- `activeTeam` in SessionContext with mutual exclusion against `activeAgent`
- Team routing integrated into `useStream.sendMessage()` pipeline

### Changed
- `.version` bumped to 2.0.2 (from 2.0.1)
- `sf_cli/package.json` version bumped to 2.0.2
- 237 tests across 20 test files (26 new: 15 router + 11 command)

---

## [2.0.1] - 2026-02-23

### Performance — Multi-Layer Caching

Token usage and latency optimizations across the CLI provider layer.

#### Anthropic Prompt Caching
- System prompt and last tool definition now marked with `cache_control: { type: 'ephemeral' }` in both `stream()` and `streamWithTools()`
- ~90% token discount on repeated system prompt + tool schema tokens across agentic turns

#### Provider Singleton
- Provider SDK instances cached via `useRef` — no longer reinstantiated on every `sendMessage()` call
- Separate refs for primary and fallback providers, invalidated only when provider name changes

#### In-Memory Budget Cache
- `checkBudget()` accepts optional pre-loaded `UsageData`, eliminating `readFileSync` on every budget check
- Budget data loaded from disk once per session, updated in-memory after each `recordUsage()` call
- Eliminates 2+ synchronous disk reads per agentic turn

#### Tool Transform Memoization
- `toOpenAITools()` and `toGeminiTools()` results memoized by tool-name key
- Tool schemas are identical every turn of the agentic loop — avoids redundant array mapping

### Changed
- `.version` bumped to 2.0.1 (from 2.0.0)
- `sf_cli/package.json` version bumped to 2.0.1

---

## [2.0.0] - 2026-02-23

### Added — Interactive CLI (Node.js + Ink)

Major release: SkillFoundry now ships with an interactive terminal CLI (`sf`) built on Node.js + Ink (React for terminals). The CLI provides a Claude Code / Gemini CLI style experience with streaming AI responses, agentic tool execution, quality gates, and multi-provider support.

#### Phase 1: Foundation MVP

- **Interactive REPL** with streaming markdown rendering in the terminal
- **Anthropic Claude adapter** with full streaming support (`content_block_start/delta/stop`)
- **Session state machine** persisted to `.claude/state.json` (IDLE, GENERATING_STORIES, VALIDATED, EXECUTING_STORY, COMPLETED, FAILED)
- **TOML configuration** loader for `.skillfoundry/config.toml` and `policy.toml`
- **Secret redaction** pipeline (API keys, passwords, tokens, connection strings)
- **Slash command system** with registry: `/help`, `/status`
- **React terminal components**: Header, MessageList, Message, StreamingMessage, Input, StatusBar
- **Terminal markdown** rendering via `marked` + `marked-terminal`
- **Timeline logger** writing to `.skillfoundry/timeline.log`
- **CLI entry point** with Commander: `sf`, `sf init`, `sf chat`
- **23 unit tests** passing (config, redact, command parsing)

#### Phase 2: Tool System

- **5 tool definitions** for Anthropic tool_use API: bash, read, write, glob, grep
- **Tool executor** with `child_process.execSync` for bash, `fs` for file operations, `glob` for pattern matching, `rg`/`grep` for content search
- **Permission engine** with 4 modes: auto, ask, deny, trusted
- **Dangerous command blocking** — `rm -rf /`, `mkfs`, `dd`, `curl|bash` always blocked
- **Sensitive operation detection** — `git push`, `npm publish` always prompt
- **Agentic loop** — up to 25 tool turns per conversation with automatic tool_use → execute → tool_result cycling
- **ToolCall component** displaying tool execution with status spinners
- **PermissionPrompt component** with keyboard-driven Allow/Deny/Always-allow
- **Extended types**: ContentBlock, AnthropicMessage, AnthropicContentBlock, ActiveToolExecution
- **42 additional tests** (tools, executor, permissions)

#### Phase 3: Workflow Integration

- **`/plan <task>`** — Read-only plan generation with PRD context from `genesis/`, saved to `.skillfoundry/plans/`
- **`/apply [plan-id]`** — Plan execution with pre-apply quality gate checks, run bundles saved to `.skillfoundry/runs/`
- **`/gates [target]`** — Independent quality gate execution
- **`/forge`** — Full 5-phase pipeline: Ignite (PRD validation), Forge (story checks), Temper (quality gates), Inspect (security audit), Debrief (summary)
- **Quality gate runner** wrapping `scripts/anvil.sh` with inline fallbacks:
  - T1: Banned pattern scan (TODO/FIXME/HACK) + syntax check
  - T2: Type check (tsc --noEmit, pyright)
  - T3: Test suite (npm test, vitest, pytest)
  - T4: Security scan (hardcoded secrets, eval/exec patterns)
  - T5: Build verification (npm run build, cargo build)
  - T6: Scope validation (changes match story)
- **DiffPreview component** with colorized inline diff rendering
- **GateTimeline component** with real-time gate progress display
- **ApprovalPrompt component** for approve/reject/edit checkpoints
- **27 additional tests** (gates, diff parsing, forge pipeline)

#### Phase 4: Polish — Multi-Provider & Runtime Features

- **5 AI provider adapters**:
  - Anthropic Claude (native SDK with streaming + tool_use)
  - OpenAI (SDK — also used for xAI and Ollama via baseURL)
  - xAI Grok (OpenAI-compatible at api.x.ai/v1)
  - Google Gemini (native fetch + SSE streaming)
  - Ollama local (OpenAI-compatible at localhost:11434/v1)
- **Provider registry** with `AVAILABLE_PROVIDERS`, `createProvider()` factory, `detectAvailableProviders()`
- **Budget enforcement**: per-run and monthly cost caps, usage persisted to `.skillfoundry/usage.json`
- **Memory system**: JSONL knowledge recall with relevance scoring + recency boost, capture to `memory_bank/knowledge/`
- **`/provider [list|set <name>]`** — List available providers or switch active provider
- **`/config [key] [value]`** — View or edit configuration with type coercion
- **`/cost`** — Token usage and cost report with provider breakdown
- **`/memory [stats|recall|capture]`** — Knowledge base operations
- **`/lessons <content>`** — Quick-capture a lesson learned
- **Model pricing tables** for cost estimation across all providers
- **28 additional tests** (providers, budget, memory)

#### Phase 5: Global Deployment & Credential Management

- **Global CLI wrapper** — `install.sh` builds the CLI and creates `~/.local/bin/sf` so users can run `sf` from any project directory
- **`SF_FRAMEWORK_ROOT` env var** — Shell wrapper sets this so the CLI finds framework resources (scripts/anvil.sh, genesis/TEMPLATE.md) regardless of CWD
- **Framework root discovery** (`core/framework.ts`) — resolves framework location from env var or file-based detection
- **`sf setup` CLI subcommand** — Non-interactive credential configuration: `sf setup --provider anthropic --key sk-ant-...`
- **`/setup` slash command** — Configure API keys from within the REPL session
- **Credential storage** at `~/.config/skillfoundry/credentials.toml` with `0600` permissions
- **First-run setup wizard** — Interactive provider selection with API key URLs when no credentials detected
- **`ANTHROPIC_AUTH_TOKEN`** support — Bearer token auth in addition to API key
- **`GEMINI_API_KEY`** alt env var detection for Google Gemini
- **Credential injection** at startup — stored keys injected into `process.env` so SDK constructors auto-discover them (env vars always take precedence)
- **Improved auth error messages** — Auth failures now suggest `sf setup` or `/setup` instead of cryptic SDK errors
- **ASCII art banner** on CLI startup with colored gradient
- **`/exit` and `/quit` commands** — Clean exit from REPL (replaces Ctrl+C guidance)
- **`update.sh` CLI rebuild** — Framework updates now rebuild the CLI and regenerate the wrapper
- **Dynamic version** from `.version` file via `getFrameworkVersion()`

#### CLI Summary

- **30+ source files** across core, commands, components, hooks, utils
- **154 tests** across 14 test files, all passing
- **13 slash commands**: help, status, setup, plan, apply, gates, forge, provider, config, cost, memory, lessons, exit
- **5 AI providers** supported out of the box
- **5 tools** with permission controls and dangerous command blocking
- **Global `sf` command** available system-wide after install

### Changed

- `.version` bumped to 2.0.0 (from 1.9.0.23)
- `sf_cli/package.json` version bumped to 2.0.0
- Version references updated in README.md, AGENTS.md, DOCUMENTATION-INDEX.md, QUICK-REFERENCE.md
- README.md rewritten to feature the Interactive CLI prominently
- New visual user guide: `docs/USER-GUIDE-CLI.md`
- `install.sh` now builds CLI and deploys shell wrapper (Phase 3)
- `update.sh` now rebuilds CLI on framework updates
- Status bar shows `/exit quit` instead of `Ctrl+C exit`
- Provider detection now checks alternate env vars (`ANTHROPIC_AUTH_TOKEN`, `GEMINI_API_KEY`)

---

## [1.9.0.23] - 2026-02-23

### Added — 53-Agent Security Evolution (Full Pipeline Hardening)

Systematic audit of all 53 agents revealed that data isolation, Top 12 security checks, error leakage prevention, and version enforcement were inconsistently applied. This release hardens every agent in the pipeline.

#### Top 7 → Top 12 Security Checks (Framework-Wide)
- **All platforms updated**: `.agents/skills/`, `.claude/commands/`, `.cursor/rules/`, `.copilot/custom-agents/`, `.gemini/skills/`, `agents/`, `bpsbs.md`, `DOCUMENTATION-INDEX.md`, `docs/API-REFERENCE.md`, `docs/MARKET-COMPARISON.md`
- **5 new checks added**: Data isolation/query scoping, pagination/input size limits, error information leakage, concurrent modification safety (optimistic locking), session/token lifecycle

#### Critical Pipeline Agents
- **blitz/SKILL.md**: Non-Negotiable Security Gate — Top 12 checks never skipped even in speed mode
- **ship/SKILL.md**: Steps 2.5 (Data Isolation Spot-Check), 2.6 (Top 12 Security Gate), 2.7 (Version Verification)
- **anvil/SKILL.md**: T1 expanded with data isolation + error leakage scans; T3 expanded with mandatory failure modes
- **go/SKILL.md**: Pre-story data isolation check blocks stories missing ownership specs; project completion expanded
- **gate-keeper/SKILL.md**: 6 new violation types (unscoped query, missing WHERE, scope from params, error leakage, missing pagination, missing idempotency)
- **stories/SKILL.md**: Security checklist expanded (6 items), definition of done expanded, Gherkin cross-user isolation scenarios
- **_autonomous-protocol.md**: Execution rules 7-8 (Top 12 scan, data isolation escalation), 3 new escalation triggers

#### Review & Scanner Agents
- **review/SKILL.md**: Data Isolation & Query Scoping Review section, Extended Security Review section, items 8-12 added
- **security-scanner/SKILL.md**: Quick Scan expanded to Top 12, Prevention Mode expanded with items 8-12
- **senior-engineer/SKILL.md**: Security checks expanded to Top 12 with descriptions
- **forge/SKILL.md**: Phase 3 TEMPER + Phase 4 INSPECT expanded with data isolation and Top 12
- **fixer/SKILL.md**: 6 new violation types in routing table

#### Development Agents
- **debugger/SKILL.md**: Data isolation check in root cause summary, Security-Aware Debugging Checklist
- **refactor/SKILL.md**: Core principle 6 (Security Preservation), Security Invariants Check section
- **migration/SKILL.md**: Data Isolation Requirements section (8 requirements)
- **performance/SKILL.md**: Query & Pagination Safety section (7 checklist items)
- **dependency/SKILL.md**: Package hallucination check enhanced with AI hallucination rate + backdoor checking

#### Operations & Infrastructure Agents
- **devops/SKILL.md**: Test stage + best practices expanded with Top 12, cross-user tests, observability
- **sre/SKILL.md**: SEV1 expanded with cross-tenant exposure, Non-Negotiable Requirements section
- **release/SKILL.md**: Pre-Release Security Gate (MANDATORY) with 8 checklist items
- **ops/SKILL.md**: Data Isolation Monitor section, admin panel scope note
- **health/SKILL.md**: Security configuration checks expanded (3 new items)
- **nuke/SKILL.md**: Safety checks before nuking section (4 items)
- **data-architect/SKILL.md** (skill): Anti-patterns expanded, requirements checklist expanded

### Changed
- `.version` bumped to 1.9.0.23
- Version references updated in README.md, AGENTS.md, DOCUMENTATION-INDEX.md, QUICK-REFERENCE.md

---

## [1.9.0.22] - 2026-02-22

### Added — Data Isolation & 27 Enforcement Gap Fixes

Real-world testing revealed that the agent pipeline enforced authentication and role-based access but never verified data ownership. A systematic audit uncovered 27 gaps where agents mention concerns but lack concrete enforcement. This release closes all of them.

#### PRD Template (`genesis/TEMPLATE.md`)
- **Entity Cards**: `Data Ownership` and `Access Scope` rows — forces specifying which column scopes rows and the access boundary
- **Permissions Matrix**: `Data Scope` column mapping each action to a concrete WHERE clause pattern
- **Section 6.7 — Data Isolation Specification**: query scope rules, isolation enforcement, cross-tenant rules, mandatory test cases
- **Section 4.2 — Security**: session lifecycle, rate limits, CORS policy, concurrent access, file uploads, error handling
- **Section 4.5 — Observability**: structured logging, health checks, monitoring, audit logging requirements
- **API Contract**: pagination max cap, rate limits, data scoping on endpoints
- **Error Codes**: `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `PAYLOAD_TOO_LARGE`
- **PRD Checklist**: data isolation, observability, pagination, rate limits, concurrent modification

#### Layer-Check (`layer-check/SKILL.md`)
- **Database**: ownership columns, version/ETag for optimistic locking, migration safety (backward compat, NOT NULL backfill, idempotent, perf on large tables), soft delete scoping, cascade documentation, UTC timestamps
- **Backend API**: input size limits, error leakage prevention, CORS specifics, session management, file upload validation, structured logging with correlation ID, health/readiness probes, config validation on startup, circuit breaker
- **Backend Evidence**: negative tests, boundary tests, concurrent access, rate limit verification required
- **Documentation Gate**: version bump enforcement added

#### Coder Skills (`coder/SKILL.md`, `ruthless-coder.md`)
- **Top 7 → Top 12** critical security checks
- New checks: pagination/input size limits, error information leakage, concurrent modification safety (optimistic locking), session/token lifecycle

#### Data Architect (`data-architect.md`)
- **Query Anti-Pattern**: `Unscoped Query on Owned Entity`
- **New Checklist Categories**: Data Ownership, Concurrent Modification, Soft Delete Integrity, Cascade Rules, Timestamp Standards

#### API Design (`api-design/SKILL.md`)
- **Design Checklist**: pagination caps, input constraints, idempotency, optimistic locking, deprecation policy
- **Security Checklist**: expanded from 6 to 15 items — data isolation, file uploads, bulk endpoint limits, session lifecycle, structured error responses

#### Security Specialist (`security-specialist.md`)
- **STRIDE**: cross-user/cross-tenant exposure added to Info Disclosure
- **OWASP A01**: unscoped queries, missing ownership WHERE, scope from request params
- **OWASP A04**: optimistic locking, unbounded endpoints, idempotency
- **OWASP A05**: verbose errors, CORS wildcard, config validation, secrets in config
- **OWASP A07**: token expiry, session invalidation, refresh token rotation, auth rate limiting
- **OWASP A09**: WHO/WHAT/WHICH/WHEN audit, failed access logging, correlation ID, bulk op logging

#### Tester (`ruthless-tester.md`, `tester/SKILL.md`)
- **Test Categories**: expanded from 6 to 15 — data isolation, concurrent modification, pagination abuse, rate limit verification, input size attacks, error leakage audit, idempotency, session lifecycle, soft delete verification
- **Coverage Summary**: expanded from 4 to 9 checkpoints

#### Merciless Evaluator (`merciless-evaluator.md`)
- **What to Look For**: 6 new evaluation criteria (unbounded endpoints, optimistic locking, error leakage, negative tests, session lifecycle, audit logging)
- **BPSBS Compliance**: expanded from 3 to 7 checks

### Changed
- Version bump from `1.9.0.21` to `1.9.0.22`
- Documentation gate now requires version bump on framework changes

---

## [1.9.0.21] - 2026-02-22

### Added — Google Gemini Platform Support
- **`.gemini/skills/*.md`** — New Gemini skill target directory generated from framework command sources
- **`install.sh` / `install.ps1`** — Added `gemini` to platform selection, validation, dry-run summaries, install copy, and quick-start output
- **`update.sh` / `update.ps1`** — Added Gemini platform detection, version marker propagation, and per-platform skill updates
- **`scripts/install-unified.sh` / `scripts/install-unified.ps1`** — Added Gemini auto-detection, menu selection, and post-install guidance
- **`scripts/sync-platforms.sh`** — Extended sync/check/list/diff flows to include Gemini as 5th generated platform

### Changed
- **Platform count** updated from 4 to 5 in install/update headers and sync summaries
- **Documentation** updated to reflect 5-platform support (Claude Code, GitHub Copilot CLI, Cursor, OpenAI Codex, Google Gemini)

### Notes
- Bash validation/runtime steps could not be executed in this environment due local `bash.exe` WSL mount failure; PowerShell script parsing completed successfully

---

## [1.9.0.20] - 2026-02-22

### Added — 53-Agent Evolution & Perfection Loop
- **`scripts/agent-evolution.ps1`** — Debate -> implement -> iterate engine with deterministic peer reviewers, strict debate findings, auto-remediation, and `perfection_achieved` gate
- **`scripts/agent-evolution.sh`** — Bash parity for analyze/cycle workflows with roster-aware target counts
- **`config/core-agents-53.txt`** — Canonical 53-agent core roster (default baseline)
- **`config/core-agents-46.txt`** — Legacy roster fallback for compatibility
- **`docs/AGENT-EVOLUTION.md`** — Complete usage guide: analyze/debate/cycle, reports, perfection criteria, 100-iteration stress command
- **`tests/test-agent-evolution.ps1`** and **`tests/test-agent-evolution.sh`** — Validation for report schema and debate/perfection signals

### Changed
- **`.agents/skills/*/SKILL.md`** — Added continuous-improvement contracts, peer-improvement signals, and explicit execution sections to support iterative hardening
- **`README.md`** — Updated with v1.9.0.20 highlights and current version bump
- **`DOCUMENTATION-INDEX.md`** — Updated framework version and references to 53-agent core roster
- **`docs/QUICK-REFERENCE.md`** — Updated version and added agent evolution command set
- **`docs/AGENTS.md`** — Updated headline statistics for 53-agent core / 60 skills

### Verified
- 100-iteration forced cycle executed with auto-fix:
  - `core_count=53`
  - `debate_open_findings=0`
  - `perfection_score=100`
  - `perfection_achieved=true`

---

## [1.9.0.19] - 2026-02-20

### Added — Autonomous Developer Loop & Knowledge Sync
- **`agents/_autonomous-protocol.md`** — Intent routing rules, execution pipeline, review format. Classifies every user input as FEATURE/BUG/REFACTOR/QUESTION/OPS/MEMORY and routes to the correct pipeline
- **`agents/_intent-classifier.md`** — Classification examples, edge cases, confidence thresholds, disambiguation rules
- **`.claude/commands/autonomous.md`** — `/autonomous` toggle command (on/off/status) with flag file `.claude/.autonomous`
- **`scripts/knowledge-sync.sh`** — Background daemon (1295 lines): init, start, stop, sync, status, register, promote, log. Interval-based sync (default 5 min) with PID management and log rotation
- **`scripts/sanitize-knowledge.sh`** — Pre-commit sanitizer (601 lines): strips secrets (API_KEY, TOKEN, PASSWORD, PRIVATE_KEY, AWS_ACCESS), normalizes paths to `$PROJECT_ROOT`, validates JSON/JSONL, skips .env/.key/.pem files
- **`scripts/session-init.sh`** — Session start: pulls global knowledge from remote, starts sync daemon
- **`scripts/session-close.sh`** — Session end: records session end, forces final sync, runs promotion check, stops daemon
- **Global knowledge repo structure** — `global/` (lessons, preferences, anti-patterns, tech-stack) + `projects/<name>/` (per-project knowledge, sessions, agent stats)
- **Lesson promotion engine** — Patterns appearing 3+ times in `errors.jsonl` auto-promoted to `global/lessons.jsonl`
- **PRD** — `genesis/2026-02-20-autonomous-developer-loop.md` with 9 stories, dependency graph, parallel execution groups
- **CLAUDE.md** — Added Autonomous Developer Loop section with protocol files, session lifecycle, quick start

### Fixed
- **PowerShell Linux dotfile handling** — `Get-Item` cannot find files starting with `.` on Linux without `-Force` flag; added to `install.ps1` and `update.ps1`
- **install.ps1 rollback safety** — Error trap rollback now checks `$resolvedTarget` against `$ScriptDir` to prevent deleting the framework source directories when `TargetDir` defaults to `.`

---

## [1.9.0.18] - 2026-02-15

### Fixed
- **install.ps1 execution order** — Dry-run check was placed after file installation, step counter was initialized after use, duplicate directory creation; restructured entire post-validation flow
- **memory_bank seed files not tracked** — `.gitignore` blanket `memory_bank/*` rule had no negation for `relationships/` and `retrieval/` directories; 4 JSON seed files never committed (fixed 8 test failures)
- **wizard.sh macOS syntax error** — `$(case $REPLY in 1) echo ...)` pattern fails on bash 3.2 (macOS default) because parser interprets case `)` as closing `$(`; replaced with portable case blocks
- **macOS bash 4+ incompatibilities** — `declare -A` (associative arrays) in `install.sh` caused all install tests to fail with exit code 2 on macOS bash 3.2; replaced with loop-based dedup and `eval`-based variables. `${var^^}` case conversion in `notify.sh`, `heartbeat.sh`, `compliance-evidence.sh` replaced with `tr`. Added bash 4 version guards to `parallel/visualize.sh` and `scripts/monorepo.sh` which require associative arrays for graph algorithms

### Changed — Script Modernization (all 6 scripts)
- **`--yes`/`-y`/`-Yes`** non-interactive mode on all install and update scripts (bash + PowerShell)
- **`--dry-run`/`-DryRun`** preview mode on install scripts
- **`--help`/`-Help`** and **`--version`/`-Version`** flags on install scripts
- **Progress indicators** `[1/N]` step counter through installation phases
- **Elapsed timer** shows duration in completion summary
- **What's New** parses CHANGELOG.md and displays latest version highlights
- **Compact summary** replaces 130-line verbose output with ~35-line quick-start
- **Auto-derived dates** from `.version` file mtime instead of hardcoded strings
- **Modern headers** `┌───┐` box style with version and date
- **Unified installers** now use single `install.sh --platform=csv --yes` call instead of per-platform loop

### Fixed — update.sh
- **`local` outside function** bug at line 1176 (pre-existing)
- **`$CHANGELOG_FILE`** variable defined but never used — now referenced in What's New display

---

## [1.9.0.17] - 2026-02-17

### Added — OpenClaw-Inspired Monitoring & Developer Memory

Three new features inspired by OpenClaw's proactive intelligence:

#### Heartbeat — Proactive Monitoring Daemon
- **`scripts/heartbeat.sh`** — Background daemon for project health monitoring
- **Commands:** `start`, `stop`, `status`, `run-once`, `logs`, `init`
- **5 health checks:** Test suite, git health (secrets/uncommitted/divergence), session health, gate rejection rate, disk/log health
- **User-editable `HEARTBEAT.md`** at project root enables/disables checks and sets severity
- **Daemon pattern:** Background loop with PID file, configurable interval via `HEARTBEAT_INTERVAL` env var (default: 30 min)
- **State tracking:** `.claude/heartbeat-state.json` stores last check results
- **Log rotation:** `logs/heartbeat.log` keeps last 1000 lines

#### Notify — Multi-Channel Notification System
- **`scripts/notify.sh`** — Multi-channel notification dispatcher
- **Commands:** `send`, `test`, `config`, `history`, `init`
- **4 channels:** Slack (webhook), Discord (webhook), desktop (notify-send/osascript), terminal (colored stderr + bell)
- **5 notification levels:** info, success, warning, error, critical (color-coded)
- **Throttling:** SHA-256 message hashing, suppress duplicates within configurable window (default: 5 min)
- **Quiet hours:** Optional time range to suppress non-critical notifications
- **Sourceable:** `notify()` function callable from other scripts

#### Preferences — Developer Behavioral Memory
- **`scripts/preferences.sh`** — Persistent developer preference management
- **Commands:** `set`, `get`, `list`, `learn`, `inject`, `init`, `reset`
- **Auto-learning:** Scans codebase for indentation, naming conventions, frameworks (package.json/requirements.txt), test patterns, commit style
- **Confidence scoring:** Each preference has 0.0-1.0 confidence; only >0.7 injected into agents
- **Preference hierarchy:** Project overrides global, explicit overrides learned
- **`inject` command:** Generates ~20-30 line markdown summary for agent prompt injection
- **`agents/_preferences-protocol.md`** — Shared module enforcing preference compliance across all agents

### Changed
- **Companion panel** — Added `/heartbeat`, `/notify`, `/prefs` to always-available commands
- **`.gitignore`** — Added heartbeat.pid, heartbeat-state.json, notifications.json/jsonl, preferences.json

---

## [1.9.0.16] - 2026-02-15

### Added — Competitive Leap: CI/CD + Quality Intelligence + Moonshots

Full execution of the Competitive Leap PRD — 17 stories across 6 phases.

#### Phase 0-1: CI/CD & Bug Fixes
- **GitHub Actions CI pipeline** — Automated test suite on every push and PR with multi-OS matrix (Ubuntu 22.04, Ubuntu 24.04, macOS)
- **CI platform sync verification** — `sync-platforms.sh check` runs in CI to catch platform drift
- **CI shell syntax validation** — `bash -n` validation on all scripts
- **CI status badge** in README.md

#### Phase 3: Standards & Capture
- **Agent Trace format** — `scripts/attribution.sh --format=agent-trace` outputs Cursor-compatible Agent Trace JSON
- **Prompt/response capture** — `scripts/session-recorder.sh prompt` with opt-in recording, sanitization (redacts keys/tokens), SHA-256 hashing, 50KB per-entry limit
- **Cost-aware routing** — `scripts/cost-router.sh` routes agents to haiku/sonnet/opus based on task complexity. Disabled by default, configurable via `.claude/routing.json`

#### Phase 4: Quality & Intelligence
- **Quality-at-generation primer** — `agents/_quality-primer.md` injects banned patterns, security rules, and test requirements into agent generation prompts
- **Rejection tracker** — `scripts/rejection-tracker.sh` records gate rejections, auto-proposes rules after 3+ identical patterns, supports approve/reject/inject lifecycle
- **Self-improving quality rules** — Rejection patterns auto-propose rules → human approves → `rules inject` updates quality primer

#### Phase 5: Moonshots
- **A2A protocol agent cards** — `scripts/a2a-server.sh` generates A2A-compatible JSON cards for all 62 agents per Google/Linux Foundation spec. Commands: `card`, `cards`, `discover`, `validate`
- **Arena mode** — `scripts/arena-evaluate.sh` + `agents/_arena-protocol.md` for competitive agent evaluation. Weighted scoring: correctness (40%), quality (25%), security (20%), performance (15%)
- **Compliance-as-code pipeline** — `compliance/` directory with HIPAA (15 checks), SOC2 (12 checks), GDPR (10 checks). Each profile: `checks.sh`, `profile.json`, `README.md`
- **Compliance evidence collection** — `scripts/compliance-evidence.sh` with SHA-256 tamper-evident manifests. Commands: `collect`, `package`, `verify`, `report`

#### PRD & Stories
- **Competitive Leap PRD** — `genesis/2026-02-15-competitive-leap.md` with 6 phases, 17 stories, 46 functional requirements
- **17 implementation stories** in `docs/stories/competitive-leap/`

### Fixed
- **`harvest.sh --status`** — Exit code 1 on empty `.project-registry-meta.jsonl` (grep on empty file under `set -o pipefail`). Added `-s` file check and `|| true` guard.

### Security
- **Removed `eval()` command injection** in `rejection-tracker.sh` — replaced with safe `jq` filtering
- **Secured `mktemp`** in `rejection-tracker.sh` — project-dir + `chmod 600` instead of world-readable `/tmp`
- **Replaced unsafe `sed`** with `awk` for quality primer rule injection (no delimiter injection)
- **Added input validation** with category allowlist in rejection tracker

### Removed
- **`scripts/convert-to-copilot.sh`** — Deprecated script superseded by `sync-platforms.sh` since v1.9.0.3
- **`.project-registry-meta.jsonl`** — Removed 0-byte file; harvest.sh already handles missing file gracefully

---

## [1.9.0.15] - 2026-02-15

### Added — Observability & Reasoning Layer

Native session tracking, line attribution, named checkpoints, and structured commit metadata — inspired by Entire.io concepts but built natively into the framework.

- **`scripts/attribution.sh`** — Line attribution tracking (human vs AI code %). Commands: `baseline` (snapshot before agent session), `calculate` (diff after session), `report` (per-file breakdown), `trailer` (git commit trailer format), `status`. Stores results in `.claude/attribution/`.
- **`scripts/session-recorder.sh`** — Session lifecycle management. Creates session entry when agent starts, logs events/decisions/file operations, records outcome. Commands: `start`, `log`, `decision`, `file`, `end`, `show` (timeline), `list` (recent sessions). Stores in `logs/sessions/{date}/session-{id}.jsonl`.
- **`scripts/checkpoint.sh`** — Named rewindable save points using lightweight git tags. Commands: `create "description"`, `list`, `rewind <name|index>`, `diff <a> <b>`, `show`, `clean`. Tag format: `cas-cp-{timestamp}-{description}`.
- **`agents/_commit-trailers.md`** — Shared module defining structured git commit metadata. Trailers: `Claude-AS-Agent`, `Claude-AS-Story`, `Claude-AS-Session`, `Claude-AS-Attribution`, `Claude-AS-Gate`. Referenced by `/coder`, `/go`, `/ship`, `/forge`.
- **`agents/_session-protocol.md`** — Shared module defining mandatory session lifecycle and decision logging. Four phases: START (baseline + recorder), ACTIVE (log decisions/events/files), CLOSING (end session + attribution), END (harvest + trailers). Minimum 1 decision record per story.
- **`/replay --show`** — New session viewer mode. List recent sessions and display full timeline with events, decisions, file operations, and gate results. Read-only (no re-execution). Available across all 4 platforms.

### Changed
- `/replay` enhanced from "Replay Last Execution" to "Replay & Session Viewer" across all 4 platforms
- Documentation updated for observability layer (DOCUMENTATION-INDEX, QUICK-REFERENCE, AGENTS.md)
- Tests added for all 3 new scripts and 2 new shared modules

---

## [1.9.0.14] - 2026-02-13

### Added
- **OpenAI Codex platform support** — 4th platform with native Skills integration
- **60 Codex Skills** — `.agents/skills/*/SKILL.md` generated from agent sources + standalone commands
- **AGENTS.md** — Root-level Codex always-on context (framework overview, skill index)
- **Sync engine 4-platform support** — `sync-platforms.sh` now generates Claude, Copilot, Cursor, and Codex files
- **Codex SKILL.md format** — YAML frontmatter with `name` and `description` for implicit activation
- **Anvil skill scripts** — Symlinked `scripts/anvil.sh` for native Codex execution

### Changed
- Platform sync now generates 4 x agents files (was 3 x)
- Install scripts detect and support Codex CLI (`codex` command)
- Companion panel recognizes Codex platform
- `sync-platforms.sh list` shows 4-column status `[C|P|R|X]`
- Documentation updated for quad-platform support

---

## [1.9.0.13] - 2026-02-09

### Added — The Anvil (6-Tier Quality Gate System)

LLMs generate code optimistically (forward, single-pass) but debug analytically (backwards from evidence). **The Anvil** inserts 6 tiers of validation between every agent phase to catch issues early before they cascade through the pipeline.

- **The Anvil** — 6-tier quality gate system running between every agent handoff:
  - **T1: Shell Pre-Flight** (`scripts/anvil.sh`) — Pure bash, no LLM. Syntax validation, banned pattern scan, import resolution, scope check. Runs between EVERY agent handoff.
  - **T2: Canary Smoke Test** (`agents/_canary-smoke-test.md`) — Quick single test after Coder: can the module import? Does it compile? FAIL skips Tester entirely → routes to Fixer.
  - **T3: Self-Adversarial Review** (`agents/_self-adversarial-review.md`) — Forces Coder to list 3+ failure modes with mitigations before handoff. Verdict: RESILIENT or VULNERABLE.
  - **T4: Scope Validation** (`agents/_scope-validation.md`) — Compares story's `Expected Changes` against `git diff --name-only`. Missing files → BLOCK, unexpected files → WARN.
  - **T5: Contract Enforcement** (`agents/_contract-enforcement.md`) — Validates API implementation matches story's declared API Contract table. Missing endpoint → BLOCK.
  - **T6: Shadow Tester** (`agents/_shadow-tester.md`) — Read-only parallel agent generating prioritized risk list for Tester. HIGH/MEDIUM/LOW severity.
- **`scripts/anvil.sh`** — T1 shell validation script (~340 lines). Commands: `check`, `syntax`, `patterns`, `imports`, `scope`, `--help`. Exit codes: 0=pass, 1=warn, 2=block.
- **`agents/_anvil-protocol.md`** — Master protocol defining all 6 tiers, pipeline integration, severity levels (BLOCK/WARN/INFO), output format.
- **`/anvil` command** — Manual Anvil invocation across all 3 platforms (Claude Code, Cursor, Copilot). Run specific tiers or full report.
- **Pipeline integration** — `go.md` updated: `Architect → ANVIL T1 → Coder (+T6 Shadow) → ANVIL T1+T2+T3 → Tester → ANVIL T1 → Gate-Keeper (T4+T5)`
- **Fast-fail behavior** — T1/T2 failures skip downstream agents to avoid wasting tokens
- **`--no-anvil` flag** — Disable Anvil checks in `/go` for debugging
- **Story template** — `stories.md` now includes `Expected Changes` section for T4 scope validation

### Changed

- **`coder.md`** — Added mandatory Self-Adversarial Review (T3) section across all 3 platforms
- **`tester.md`** — Added Canary Smoke Test pre-condition (T2) and Shadow Tester risk input (T6) across all 3 platforms
- **`gate-keeper.md`** — Added Scope Validation (T4) and Contract Enforcement (T5) integration across all 3 platforms
- **`go.md`** — Added ANVIL INTEGRATION section with checkpoint details, fast-fail, and `--no-anvil` flag
- **`forge.md`** — Added Anvil reference in Phase 2 (FORGE) description

---

## [1.9.0.12] - 2026-02-09

### Added — Enhanced DX + Templates + Analytics

- **4 new commands** across all 3 platforms: `/status`, `/profile`, `/replay`, `/analytics`
  - `/status` — Project status dashboard (PRDs, stories, layers, memory, execution state)
  - `/profile` — Session profile manager (load/create workflow presets: default, blitz, cautious, autonomous)
  - `/replay` — Re-run last execution (with `--failed`, `--from=<phase>`, `--dry-run`)
  - `/analytics` — Agent usage analytics dashboard (invocations, success rates, trends)
- **Session profiles** — 4 built-in profiles in `.claude/profiles/` (default, blitz, cautious, autonomous)
- **PRD templates library** — `genesis/TEMPLATES/` with 4 quick-start templates:
  - `api-service.md` — REST APIs and backend services
  - `cli-tool.md` — Command-line tools and automation
  - `fullstack-feature.md` — Full-stack features (DB + Backend + Frontend)
  - `dashboard.md` — Analytics and data visualization dashboards
- **Agent usage analytics** — `memory_bank/knowledge/agent-stats.jsonl` for tracking invocations
- **Forge Phase 6: Debrief** — Auto-writes scratchpad summary to `.claude/scratchpad.md` after `/forge`

### Fixed

- **Reflection protocol tests** — Added reflection protocol sections to coder, tester, and architect across all 3 platforms (9 files)
- **DX command sync** — Synced cost, explain, undo, health, swarm to Cursor and Copilot (10 files)
- **`/gohm --push`** — Added auto-commit + push flag across all 3 platforms
- **`/nuke` confirmation** — Replaced typed "NUKE" confirmation with standard (y/N) pattern

---

## [1.9.0.11] - 2026-02-09

### Added — Shortcut Commands + The Forge

- **The Forge** — The 46-agent team now has an official name: "The Forge" (cold-blooded agents forging production code)
- **7 new shortcut commands** across all 3 platforms (Claude Code, Cursor, Copilot):
  - `/forge` — Full pipeline: validate PRDs + implement (semi-auto+parallel) + layer-check + security audit + harvest memory
  - `/gosm` — Go Semi-Auto (`/go --mode=semi-auto`) — recommended default
  - `/goma` — Go Autonomous (`/go --mode=autonomous`)
  - `/blitz` — Lightning mode: parallel + TDD + semi-auto
  - `/gohm` — Harvest memory from current project
  - `/ship` — Pre-release pipeline: layer-check + security audit + release prepare
  - `/nuke` — Clean slate: rollback + clean state (requires confirmation)
- **21 new files** — 7 per platform (.claude/commands, .cursor/rules, .copilot/custom-agents)
- **No install script changes needed** — existing wildcard copy picks up new files automatically

---

## [1.9.0.10] - 2026-02-09

### Added — Auto-Memory Recording

- **Orchestrator & Coder agents** now automatically record lessons learned after each story
  - `memory_bank/knowledge/decisions.jsonl` — Architectural choices, trade-offs
  - `memory_bank/knowledge/corrections.jsonl` — Bugs found, wrong assumptions fixed
  - `memory_bank/knowledge/patterns.jsonl` — Reusable code patterns discovered
- **Updated across all 3 platforms** — 8 files (2 shared agents + 6 platform copies: Claude Code, Cursor, Copilot)
- **End-to-end knowledge lifecycle**: Install → Agents learn automatically → Harvest → Git push → Available everywhere
- JSONL format with reality anchors, tags, and lineage tracking

---

## [1.9.0.9] - 2026-02-08

### Fixed — Memory Bank Install Gap

- **install.sh / install.ps1** — Now create `memory_bank/knowledge/` directory in target projects
  - Seeds with `bootstrap.jsonl` (framework facts) so agents can write lessons from session one
  - Previously missing: harvest would fail with "No knowledge directory" on every installed project
- **Knowledge lifecycle now works end-to-end**:
  - Install creates `memory_bank/knowledge/` with bootstrap
  - Agents write lessons during sessions (via `/memory`)
  - `scripts/memory.sh harvest <project>` collects lessons into framework
  - `git commit + push` shares lessons across machines

---

## [1.9.0.8] - 2026-02-08

### Changed — Documentation Deduplication & Cleanup

- **CLAUDE.md** — Slimmed from 2023 lines to 267 lines (framework-specific only)
  - Removed sections duplicating global `~/.claude/CLAUDE.md` (path safety, security heuristics, LLM failures, test coverage, module skeleton, etc.)
  - Relocated enterprise production patterns to `docs/enterprise-standards.md`
  - Added header referencing global rules, enterprise standards, and ANTI_PATTERNS
- **docs/enterprise-standards.md** (NEW, ~1352 lines) — Relocated production operations reference:
  - .gitignore security, auth/token management, admin credentials, LoggerService
  - PM2 deployment, SEO, DB migrations, observability, incident response
  - Graceful shutdown, API versioning, concurrency, error resilience
  - Dependency management, feature flags, caching, performance budgets
  - Soft delete/data retention, load testing
- **ANTI_PATTERNS install path** — Files now install to `docs/` instead of project root
  - Updated `install.sh`, `update.sh`, `install.ps1`, `update.ps1`
  - `update.sh` auto-migrates existing root files to `docs/`
  - Updated 68+ file references across agents, commands, cursor rules, and copilot agents
- **bpsbs.md** — No longer copied to target projects (covered by CLAUDE.md + global rules)
  - All references across 51 files updated from `bpsbs.md` to `CLAUDE.md`
- **Token savings** — ~13,000 tokens/session reduced by eliminating triple-injection of same rules

---

## [1.9.0.7] - 2026-02-08

### Added - Deliberation Protocol

- **Deliberation Protocol** (`agents/_deliberation-protocol.md`) — Structured multi-perspective design review before implementation
  - Mandatory triggers: architectural decisions, security-sensitive changes, multiple valid approaches, cross-cutting concerns
  - 3-phase format: Proposal (architect) → Challenge (perspectives) → Synthesis (architect)
  - 3 depth levels: Quick (low-risk), Standard (moderate), Deep (irreversible/security-critical)
  - Resolution rules: reality anchors win, security escalates, simplicity breaks ties
  - Decision records preserved append-only in scratchpad

### Changed
- `agents/project-orchestrator.md` — Added Deliberation Phase between Architecture and Implementation
- `agents/cold-blooded-architect.md` — Architect opens and closes deliberation, synthesizes feedback

---

## [1.9.0.6] - 2026-02-08

### Added — NASAB Framework Integration

7 concepts from the NASAB framework (Pillars 3, 4, 7, 8, 9, 10) absorbed into existing agents:

- **`agents/_bidirectional-iteration.md`** — Track fix-break oscillation cycles, detect convergence, recommend refactoring over patching (Pillar 9)
- **`agents/_dissent-resolution.md`** — Protocol for resolving conflicting agent recommendations: reality anchor wins, thin consensus escalates, security always escalates (Pillar 4)
- **`agents/gate-keeper.md`** — Evidence-based capability gates: 5 levels (syntax → execution → domain → ambiguity → financial) with evidence accumulation thresholds (Pillar 3)
- **`agents/cold-blooded-architect.md`** — Constraint classification: Physical/Conventional/Regulatory/BestPractice. Explore alternatives for non-physical constraints (Pillar 10)
- **`agents/memory-curator.md`** — Pattern detection (parental inheritance): 6 pattern types, unconscious pattern surfacing, conscious marking (Pillar 8)
- **`agents/mathematical-ground-checker.md`** — Context-aware usage validation: check formula assumptions against current context, warn when violated (Pillar 7)
- **`agents/fixer-orchestrator.md`** — Oscillation detection: stop retrying when fix-break cycles detected, escalate with refactoring recommendation (Pillar 9)

### Changed

- **`agents/_agent-protocol.md`** — Added disagreement resolution section referencing dissent protocol

---

## [1.9.0.5] - 2026-02-08

### Added

#### Git-Based Knowledge Hub — Remote Distribution & Cross-Machine Sync
Framework is now a git repository. Knowledge, scratchpads, and metrics sync across machines via GitHub.

- **`scripts/companion.sh`** - Context-aware tmux companion panel:
  - Reads `.claude/scratchpad.md` to determine current phase, task, and agent
  - Shows phase-relevant commands (architecture, implementation, testing, validation, docs, ops)
  - Displays hub sync status and modified files
  - Auto-refreshes every 5 seconds, press 'q' to quit
  - `--tmux` flag: auto-creates a tmux side pane (35 columns)
  - `--once` flag: render once and exit
  - Pure bash, ANSI colors, zero dependencies beyond tmux

- **`scripts/knowledge-sync.sh`** - Hub sync engine (remote transport layer):
  - `setup <repo-url> [--machine-id=name]` - Configure hub URL and machine identity
  - `push [lesson-file]` - Push knowledge (markdown lessons or promoted JSONL) to hub
  - `pull` - Pull latest from hub with conflict handling (rebase with merge fallback)
  - `scratchpad push` - Push project scratchpad for cross-machine continuity
  - `scratchpad pull [machine-id]` - Pull scratchpad from another machine
  - `metrics push` - Aggregate and push usage metrics
  - `status` - Show hub configuration, sync state, and knowledge counts
  - Offline-first: all push commands commit locally, push when online

- **Hub directories**:
  - `knowledge/promoted/` - Curated markdown lessons
  - `knowledge/staging/` - Submitted lessons awaiting review
  - `knowledge/schema.md` - Lesson format specification
  - `scratchpads/` - Cross-machine session state
  - `metrics/` - Aggregated usage metrics

- **`.claude/hub.json`** - Per-machine hub configuration (hub_url, machine_id, sync timestamps)

### Changed

- **`.gitignore`** - Selectively un-ignore central knowledge files (bootstrap.jsonl, *-universal.jsonl) for distribution
- **`update.sh`** - Added `--remote` flag to pull from hub before updating projects
- **`scripts/install-unified.sh`** - Added GitHub clone option for framework installation
- **`scripts/harvest.sh`** - Auto-push promoted knowledge to hub after promotion cycle
- **`scripts/memory.sh`** - Added `hub` command (delegates to knowledge-sync.sh)
- **`tests/run-tests.sh`** - Added 7 hub test functions under `--test hub` filter, 4 companion tests under `--test companion`
- **`agents/_agent-protocol.md`** - Hub pull added to session boot sequence (step 0, silent, non-blocking)
- **`agents/_context-discipline.md`** - Hub push added to post-action protocol; new session end protocol
- **`agents/_state-machine.md`** - Hub sync in INITIALIZING and COMPLETED transition actions

---

## [1.9.0.4] - 2026-02-08

### Changed

#### Persistent Scratchpad — Cross-Platform Session Continuity
Scratchpad is now a live file on disk (`.claude/scratchpad.md`) instead of an in-memory concept. Agents write it after every major action and read it on session start. When a user hits the context limit in Claude Code and switches to Copilot CLI or Cursor, the next session picks up exactly where the previous one left off — automatically, no manual handoff needed.

- **`agents/_context-discipline.md`** - Scratchpad management rewritten:
  - Scratchpad persisted to `.claude/scratchpad.md` after every major action
  - Read on session start with staleness detection (>24h triggers verification)
  - New scratchpad format: includes timestamp, platform, agent, continuation notes
  - New "Cross-Platform Continuity" section with platform-specific resume behavior
  - Persistence rules (write-after-action, overwrite-not-append, 200-400 token target)

- **`agents/_agent-protocol.md`** - Session boot sequence added:
  - Every agent session reads `.claude/scratchpad.md` on start
  - Platform switch detection (announces continuation from previous platform)
  - Cross-references with `.claude/state.json` for `/go` executions
  - Agent response format extended with `scratchpad_update` field

- **`agents/_state-machine.md`** - Scratchpad integrated into state machine:
  - `persist_scratchpad` added to transition actions (INITIALIZING, EXECUTING_STORY)
  - `.claude/scratchpad.md` added to state file locations
  - Resume protocol updated: scratchpad loaded alongside state.json

---

## [1.9.0.3] - 2026-02-07

### Added

#### Platform Sync Engine
Generates all 3 platform command files (Claude Code, Copilot, Cursor) from agent source files, eliminating manual triple-file creation when adding new agents.

- **`scripts/sync-platforms.sh`** - Platform Sync Engine:
  - `sync [--all | agent-name]` - Generate platform files from agent source
  - `check` - Verify all agents have in-sync platform files
  - `list` - Show agent-to-command mapping with sync status
  - `diff [agent-name]` - Show differences between existing and generated files
  - `--dry-run` flag for preview without writing
  - Section stripping: removes "Integration with Other Agents" and "Context Discipline" sections
  - Persona injection: adds persona reference after first paragraph
  - Claude/Cursor: identical stripped content; Copilot: metadata wrapper + usage boilerplate

- **`command:` YAML frontmatter field** - Added to all 26 public agent files:
  - Maps agent filename to command name (e.g., `ruthless-coder` → `coder`)
  - 24 agents mapped to commands, 2 set to `none` (agent-profile, knowledge-curator)

### Changed

- **72 platform files regenerated** - All 24 agent-backed commands across 3 platforms synced from source
- **`scripts/convert-to-copilot.sh`** - Added deprecation notice (superseded by sync-platforms.sh)
- **`tests/run-tests.sh`** - Added 5 platform sync test functions
- **`DOCUMENTATION-INDEX.md`** - Added sync-platforms.sh reference, updated version to 1.9.0.3
- **`README.md`** - Added sync-platforms.sh to scripts section

---

## [1.9.0.2] - 2026-02-07

### Added

#### Ops Tooling Generator Agent
Operational tooling generation for completed projects: admin panels, debug overlays, and feedback systems.

- **`agents/ops-tooling-generator.md`** - Ops Tooling Generator agent (46th agent):
  - `/ops admin` - Admin/monitoring panel: console log viewer, API health monitor, system metrics
  - `/ops debug` - Debug mode overlay activated via Ctrl+Shift+D: element inspector showing component name, file path, event handlers, API calls; network inspector panel; state diff viewer
  - `/ops feedback` - End-user feedback system: bug/issue reports, feature requests, screenshot upload (file picker + clipboard paste), automatic context capture
  - `/ops all` - Generate all three components
  - Tech stack detection: React/Next.js, Angular, Vue, ASP.NET, FastAPI, vanilla JS
  - Output directory: `src/ops/` with admin/, debug/, feedback/ subdirectories
  - Dark-mode-first design, WCAG AA accessibility, responsive

- **`/ops` command** - Available on all 3 platforms:
  - Modes: admin, debug, feedback, all
  - `.claude/commands/ops.md`, `.copilot/custom-agents/ops.md`, `.cursor/rules/ops.md`

### Changed

- **`DOCUMENTATION-INDEX.md`** - Added Ops Tooling Generator, updated version to 1.9.0.2, agent count to 46
- **`docs/AGENTS.md`** - Added Ops Tooling Generator to agent list, updated count to 46
- **`README.md`** - Updated agent count references (45 -> 46)
- **`tests/run-tests.sh`** - Added 5 ops-tooling-generator test functions

---

## [1.9.0.1] - 2026-02-07

### Added

#### Project Educator Agent
End-user learning material generation for completed projects.

- **`agents/project-educator.md`** - Project Educator agent (45th agent):
  - Quick-start guides ("Get started in 5 minutes")
  - Comprehensive user guides
  - Project-specific glossary generation
  - User journey maps with Mermaid diagrams
  - Step-by-step tutorials with difficulty levels
  - FAQ/troubleshooting generation
  - Multi-level concept explainers (beginner, intermediate, advanced)
  - Output directory: `docs/guides/`
  - Runs after or alongside documentation-codifier at project end

- **`/educate` command** - Available on all 3 platforms:
  - Modes: quick-start, guide, glossary, journey, tutorial, faq, concepts, all
  - `.claude/commands/educate.md`, `.copilot/custom-agents/educate.md`, `.cursor/rules/educate.md`

### Changed

- **`DOCUMENTATION-INDEX.md`** - Added Project Educator, updated version to 1.9.0.1, agent count to 45
- **`docs/AGENTS.md`** - Added Project Educator to agent list, updated count to 45
- **`README.md`** - Updated agent count references (44 -> 45)
- **`tests/run-tests.sh`** - Added 5 project-educator test functions

---

## [1.9.0.0] - 2026-02-07

### Added

#### Phase 4: Advanced Intelligence
Semantic knowledge search, agent learning profiles, compliance presets, and monorepo support. This is the fourth and final phase of the Framework Evolution PRD.

- **`scripts/semantic-search.sh`** - TF-IDF Knowledge Search (FR-030):
  - Natural language query over all JSONL knowledge files
  - Keyword-weighted ranking: exact phrase (+100), word match (+10), type match (+20), weight bonus
  - Searches framework and project knowledge bases
  - Supports `--type` filter, `--limit`, and `--json` output
  - Not ML-based; uses TF-IDF inspired keyword matching

- **`scripts/monorepo.sh`** - Cross-Package Dependency Resolution (FR-036):
  - Detects packages across 6 ecosystems: Node.js, Python, Rust, Go, .NET
  - Commands: detect, deps, order, status
  - Extracts cross-package workspace dependencies
  - Topological sort for build order (Kahn's algorithm)
  - Supports up to 20 packages per monorepo
  - JSON output mode for tooling integration

- **`agents/agent-profile.md`** - Agent Learning Profile Protocol (FR-031, FR-032):
  - Style pattern detection: naming, formatting, imports, error handling, tests, comments, architecture
  - Pattern promotion pipeline: PROJECT_LOCAL (0.3) -> HARVESTED (0.5) -> CANDIDATE (0.7) -> PROMOTED (0.9)
  - Cross-agent learning: fixer patterns teach gate-keeper prevention, coder adapts proactively
  - Knowledge categories: error patterns, security fixes, test patterns, performance, style

- **`agents/compliance-profiles/`** - Compliance Presets (FR-033):
  - **HIPAA.md**: 22 rules across encryption (ENC), audit logging (AUD), access control (ACC), data handling (DAT), BAA requirements. PHI field identifiers and scan patterns.
  - **SOC2.md**: 28 rules across 5 Trust Service Criteria (Security, Availability, Processing Integrity, Confidentiality, Privacy) plus change management. Monitoring requirements.
  - **GDPR.md**: 27 rules across consent, data subject rights (DSR), data protection by design (DPD), security, breach notification, international transfers. Cookie compliance and PII field identifiers.
  - All presets are additive (never weaken existing gate-keeper rules)
  - Activated via `/go --compliance=hipaa|soc2|gdpr`

### Changed

- **`DOCUMENTATION-INDEX.md`** - Added Advanced Intelligence section, updated version to 1.9.0.0, agent count to 44
- **`tests/run-tests.sh`** - Added 13 advanced intelligence test functions

---

## [1.8.0.2] - 2026-02-07

### Added

#### Phase 3: Developer Experience & Observability
New slash commands and tooling for execution visibility, cost tracking, and framework diagnostics. This is the third phase of the Framework Evolution PRD.

- **`scripts/cost-tracker.sh`** - Token Usage Tracker (FR-022):
  - Record token usage per agent, story, and phase
  - Generate reports grouped by agent, story, phase, or all
  - Quick summary with totals and unique counts
  - Commands: record, report, summary, reset, status

- **`scripts/dashboard.sh`** - Live Execution Dashboard (FR-028):
  - Terminal UI with auto-refresh (default 2s)
  - Progress bar visualization with completion percentage
  - Shows swarm task status, active agents, scratchpad alerts
  - Displays file conflict warnings and cost summary
  - Reads state passively (never blocks agent execution)
  - Supports `--once` for single render and `--refresh=N` for custom interval

- **`.claude/commands/explain.md`** - `/explain` Slash Command (FR-023):
  - Explains last agent action in plain English
  - References story/PRD requirements
  - Shows file changes and next steps

- **`.claude/commands/undo.md`** - `/undo` Slash Command (FR-024):
  - Reverts last reversible agent action
  - Checks reversibility before proceeding
  - Requires confirmation (per CLI confirmation matrix)

- **`.claude/commands/cost.md`** - `/cost` Slash Command (FR-022):
  - Token usage report via cost-tracker.sh
  - Supports grouping by agent, story, phase

- **`.claude/commands/health.md`** - `/health` Slash Command (FR-025):
  - Framework self-diagnostic
  - Checks version, structure, agents, memory bank, swarm, security, PRDs

### Changed

- **`DOCUMENTATION-INDEX.md`** - Added Developer Experience section
- **`tests/run-tests.sh`** - Added 10 developer experience test functions

---

## [1.8.0.1] - 2026-02-07

### Added

#### Phase 2: Swarm Agent Coordination
Self-organizing agent coordination replaces top-down wave dispatch. Agents independently pull tasks from a shared queue, communicate via scratchpad, and detect file conflicts in real-time. This is the second phase of the Framework Evolution PRD.

- **`parallel/swarm-queue.sh`** - Shared Task Queue (FR-010, FR-015, FR-016, FR-017):
  - SwarmTask CRUD with full state machine enforcement (PRD Section 6.1)
  - States: QUEUED -> CLAIMED -> IN_PROGRESS -> COMPLETE/FAILED/BLOCKED
  - Invalid transition guards (COMPLETE is terminal, QUEUED cannot skip to IN_PROGRESS)
  - File-based locking via flock for concurrent access safety
  - Max concurrent agent limit (5, configurable)
  - Dependency checking before task claim
  - File conflict detection during claim
  - Retry with exponential backoff (max 3 retries)
  - Agent availability pool tracking
  - Commands: init, add, claim, start, complete, fail, block, unblock, list, status, pool, reset

- **`parallel/swarm-scratchpad.sh`** - Inter-agent Communication (FR-012):
  - Agents write notes about interface changes, decisions, warnings
  - Project-scoped (never crosses project boundaries per security req)
  - Priority levels: normal, high (for breaking changes)
  - Acknowledge mechanism for read tracking
  - Filter by target agent, task, or unread status
  - Commands: write, read, list, ack, clear, status

- **`parallel/conflict-detector.sh`** - File Conflict Detection (FR-014):
  - Register file locks per task before starting work
  - Real-time conflict detection when multiple agents touch same file
  - Resolution strategies: serialize (wait) or skip (omit file)
  - Confirmation required per CLI confirmation matrix
  - Commands: register, release, check, status, resolve, list

- **`agents/_swarm-coordinator.md`** - Swarm Coordination Protocol Agent:
  - Defines SwarmTask state machine and valid transitions
  - Documents dynamic handoffs (FR-011) between agents
  - Agent availability pool rules and configuration
  - Swarm vs wave mode decision criteria
  - Automatic fallback to wave mode on coordination failure (FR-016)
  - References all shell tools in parallel/

- **`.claude/commands/swarm.md`** - `/swarm` Slash Command:
  - Unified swarm management interface
  - Subcommands: status, queue, scratchpad, conflicts, pool, init, fallback
  - Integrates with swarm-queue.sh, swarm-scratchpad.sh, conflict-detector.sh

### Changed

- **`agents/_parallel-dispatch.md`** - Added swarm tool references to Shell Tool References section
- **`DOCUMENTATION-INDEX.md`** - Added Swarm Agent Coordination section, updated agent count to 43, updated parallel execution section
- **`tests/run-tests.sh`** - Added 10 swarm coordination test functions

---

## [1.8.0.0] - 2026-02-07

### Added

#### Phase 1: Bidirectional Knowledge Exchange
Projects now harvest learned knowledge back to the central framework, making every future installation smarter. This is the first phase of the Framework Evolution PRD.

- **`scripts/harvest.sh`** - Knowledge Harvest Engine (FR-001, FR-003, FR-004, FR-007):
  - Extracts learned knowledge from project memory_bank to central framework
  - Security sanitization: blocks secrets, API keys, tokens, PII from harvesting
  - Deduplication: detects exact-match duplicates, boosts weight on re-encounter
  - Scope detection: distinguishes project-specific vs universal knowledge
  - Promotion cycle: HARVESTED -> CANDIDATE (2+ projects) -> PROMOTED (3+ projects OR weight > 0.8)
  - Promoted entries auto-added to bootstrap.jsonl for future installations
  - Supports `--all` to harvest from all registered projects
  - Supports `--promote` to run standalone promotion cycle
  - Supports `--status` to show harvest statistics

- **`scripts/registry.sh`** - Project Registry Manager:
  - CRUD operations for project registry with rich metadata (JSONL)
  - Commands: register, unregister, list, dashboard, status, update-meta
  - Dashboard shows all projects with version, platform, health, knowledge count
  - Metadata tracking: last_harvested, health_status, total_go_runs, total_tokens_used
  - Confirmation prompts for destructive operations (per CLI confirmation matrix)

- **`agents/knowledge-curator.md`** - Knowledge Curator Agent:
  - Evaluates and promotes harvested knowledge entries
  - Implements KnowledgeEntry promotion state machine (PRD Section 6.2)
  - Quality gates: content quality, security, scope, weight thresholds
  - Knowledge categories: decision, error, fact, pattern, preference

- **Universal Knowledge Files** (central framework knowledge stores):
  - `memory_bank/knowledge/decisions-universal.jsonl` - Promoted decisions from all projects
  - `memory_bank/knowledge/errors-universal.jsonl` - Promoted error patterns
  - `memory_bank/knowledge/patterns-universal.jsonl` - Promoted code patterns

### Changed

- **`scripts/memory.sh`** - Added `harvest` and `sync` subcommands:
  - `memory.sh harvest` delegates to scripts/harvest.sh
  - `memory.sh sync` performs bidirectional knowledge exchange (push central -> project, pull project -> central)
  - Sync requires confirmation prompt (per CLI confirmation matrix)

- **`update.sh`** - Harvest integration (FR-006):
  - Now runs `harvest.sh` on each project during update cycle
  - Knowledge automatically flows back to central framework during updates

- **`install.sh`** - Registry integration:
  - Now registers projects in enhanced registry with metadata via registry.sh
  - Tracks platform, version, knowledge count at install time

### Tests Added

- 10 new test functions for Knowledge Exchange (knowledge test category):
  - harvest.sh existence, executability, --help support
  - registry.sh existence, executability, --help support
  - knowledge-curator.md agent validation (3 required sections)
  - Universal knowledge files existence (3 files)
  - memory.sh harvest/sync command presence
  - update.sh harvest integration verification
  - harvest.sh security sanitization (5 sensitive patterns)
  - harvest.sh deduplication logic presence
  - harvest.sh scope detection presence
  - harvest.sh promotion criteria verification (3+ projects OR weight > 0.8)

---

## [1.7.0.2] - 2026-02-07

### Added

#### Autonomous Execution System
Eliminates Claude Code permission prompts during Dream Team agent execution by pre-approving safe operations at the tool level, while keeping framework guardrails (Gate Keeper, Fixer, Evaluator) as the real safety net.

- **`.claude/settings.json`** - Shared permission profile with comprehensive allowlists:
  - All file operations (Read, Edit, Write, Glob, Grep) pre-approved
  - Development tools (npm, python, dotnet, pytest) pre-approved
  - Git operations (status, diff, commit, branch, merge, rebase) pre-approved
  - Framework scripts (./parallel/*, ./scripts/*) pre-approved
  - Docker read + compose operations pre-approved
  - GitHub CLI operations pre-approved
  - Task (subagent) dispatch pre-approved
  - Destructive operations always denied (rm -rf /, force push main, mkfs, etc.)

- **`.claude/hooks/validate-bash.sh`** - PreToolUse safety hook:
  - Emergency deny patterns for system-destructive commands
  - Network piped execution detection (curl | bash)
  - Protected branch force push detection
  - Environment exfiltration detection
  - Suspicious pattern warnings (sudo, eval, exec) logged to audit
  - Fail-open design: only explicitly dangerous patterns blocked

- **`docs/AUTONOMOUS-EXECUTION.md`** - Setup guide:
  - Two-layer safety architecture explained
  - Quick setup (automatic via install.sh or manual)
  - Pre-approved vs denied operations table
  - Permission customization guide
  - Framework execution mode combination matrix
  - Troubleshooting guide

### Changed

#### Installer Updates
- **`install.sh`** now deploys `.claude/settings.json` and `.claude/hooks/` during Claude platform installation
- Creates `.claude/hooks/` directory in installation structure
- Installation summary shows hooks and permission profile

---

## [1.7.0.1] - 2026-02-06

### Added

#### Populated Empty Directories

Three previously empty directory structures now contain practical, high-value content:

##### Project Templates (`templates/`)
- **`templates/README.md`** - Directory guide and usage instructions
- **`templates/prd-web-app.md`** - Full-stack web app PRD template (auth, DB, UI, API)
- **`templates/prd-api.md`** - REST API PRD template (endpoints, rate limiting, OpenAPI)
- **`templates/prd-cli.md`** - CLI tool PRD template (arg parsing, exit codes, output formats)
- **`templates/prd-library.md`** - Library/package PRD template (public API, semver, packaging)
- Templates use `{{VARIABLE}}` substitution, wired into `scripts/wizard.sh`

##### Parallel Execution Tooling (`parallel/`)
- **`parallel/README.md`** - Architecture overview and usage guide
- **`parallel/wave-planner.sh`** - Topological sort (Kahn's algorithm) for wave computation from story dependencies
- **`parallel/dispatch-state.sh`** - CRUD for `.claude/dispatch-state.json` (init, update, query, report)
- **`parallel/visualize.sh`** - ASCII DAG and Mermaid diagram generation from story dependencies
- All shell-based (consistent with framework tooling, no Node.js required)

##### Memory Bank Seed Files (`memory_bank/`)
- **`memory_bank/README.md`** - Architecture overview and schema documentation
- **`memory_bank/knowledge/README.md`** - JSONL schema documentation with field descriptions
- **`memory_bank/knowledge/bootstrap.jsonl`** - 15 pre-seeded framework facts, decisions, and error patterns
- **`memory_bank/relationships/knowledge-graph.json`** - Valid empty graph structure
- **`memory_bank/relationships/lineage.json`** - Valid empty lineage structure
- **`memory_bank/retrieval/query-cache.json`** - Valid empty cache structure
- **`memory_bank/retrieval/weights.json`** - Valid empty weights structure

### Changed

#### Wizard Template Integration
- **`scripts/wizard.sh`** now copies from `templates/prd-{type}.md` with variable substitution instead of generating inline PRD
- Fallback to inline generation for custom/unknown project types

#### Memory Manager Improvements
- **`scripts/memory.sh`** `init_memory_bank()` now writes valid JSON structures (not empty files)
- Copies `bootstrap.jsonl` to new projects on first init
- **`scripts/memory.ps1`** updated with same improvements for Windows

#### Parallel Dispatch Agent
- **`agents/_parallel-dispatch.md`** updated with shell tool references

#### Documentation Updates
- **`docs/PARALLEL-EXECUTION.md`** updated to reference shell scripts instead of JavaScript
- **`DOCUMENTATION-INDEX.md`** updated with templates/, parallel/, memory_bank/ entries
- **`tests/run-tests.sh`** expanded with tests for new directories and files

### Statistics
- **16 new files** created across 3 directories
- **8 existing files** updated
- **Version**: 1.7.0.0 -> 1.7.0.1 (iteration bump)

---

## [1.7.0.0] - 2026-02-05

### Added

#### Auto-Remediation & Autonomous Execution System

**Game-Changing Feature:** Self-healing development pipeline that fixes 90%+ of violations autonomously.

#### Version Management System

**NEW:** Comprehensive versioning system with semantic versioning format `MAJOR.FEATURE.DATABASE.ITERATION`

##### Version Components
- **MAJOR** (1) - Breaking changes, requires fresh install
- **FEATURE** (7) - New features, safe update
- **DATABASE** (0) - Schema changes, requires migration
- **ITERATION** (0) - Patches and bug fixes, safe update

##### New Tools
- **Version Check Script** (`scripts/version-check.sh`) - Detects installed version, compares with available, recommends action
- **Version Command** (`/version`) - Show version information and check for updates
- **Install/Update Integration** - Automatic version display and comparison during installation/updates

##### Update Decision Logic
- **UP_TO_DATE** - No action needed
- **PATCH_UPDATE** (X.X.X.0 → X.X.X.1) - Safe update, run `./update.sh`
- **FEATURE_UPDATE** (X.X.0.0 → X.Y.0.0) - Safe update, run `./update.sh`
- **DATABASE_MIGRATION** (X.X.0.0 → X.X.1.0) - Backup first, run `./update.sh --migrate`
- **MAJOR_UPDATE** (1.X.X.X → 2.X.X.X) - Backup first, run `./install.sh --force`

##### Version Display
- Version banner in install.sh and update.sh
- `/version` command for detailed version information
- `--version` flag in update.sh shows full version breakdown
- Version comparison when updating existing installations

##### New Agent: Fixer Orchestrator (`/fixer`)
- Auto-remediation intelligence that routes violations to appropriate specialists
- Smart retry loops (3 attempts with exponential backoff)
- Escalation only when necessary (critical decisions requiring user expertise)
- Parallel remediation (independent violations fixed simultaneously)
- Full audit trail (`logs/remediations.md`, `logs/escalations.md`)

##### Three Execution Modes
- **Supervised Mode** (default) - Stop at every violation, user approves all fixes
- **Semi-Autonomous Mode** (recommended) - Auto-fix routine violations, escalate critical decisions
- **Autonomous Mode** - Full autonomy, user checkpoint only at phase/project end

##### Auto-Fix Capabilities
**Routine Violations (No User Interruption):**
- Missing tests → Tester generates them
- Security headers missing → Security Specialist adds them
- Dead code detected → Refactor Agent removes it
- N+1 query patterns → Data Architect optimizes them
- Performance bottlenecks → Performance Optimizer fixes them
- Accessibility violations → Accessibility Specialist corrects them
- Missing documentation → Documentation Codifier generates them

**Critical Decisions (Escalated to User):**
- Architectural choices (multiple valid approaches with trade-offs)
- Business logic ambiguities not specified in PRD
- Security/compliance policy decisions
- Breaking API changes affecting external consumers
- Domain expertise required (tax rules, legal requirements)

##### Enhanced Gate Keeper
- Added **auto-fix mode** alongside traditional blocking mode
- Routes violations to Fixer Orchestrator for remediation
- Re-validates after fixes applied
- Maintains all existing quality standards while enabling automation

##### New Documentation
- **Escalation Criteria Matrix** (`docs/ESCALATION-CRITERIA.md`) - Complete guide on when to auto-fix vs. escalate
- **Remediation Logs** (`logs/remediations.md`) - Audit trail of all auto-fixes
- **Escalation Logs** (`logs/escalations.md`) - Record of all user decisions

##### Enhanced `/go` Command
New execution mode flags:
- `/go --mode=supervised` - Traditional blocking behavior
- `/go --mode=semi-auto` - Auto-fix routine, escalate critical (recommended)
- `/go --mode=autonomous` - Full autonomy, minimal interruptions

##### Violation → Agent Routing Table
Complete mapping of 20+ violation types to appropriate specialist agents:
- Missing tests → Tester
- Security issues → Security Specialist
- Dead code → Refactor Agent
- Database issues → Data Architect
- Performance → Performance Optimizer
- Accessibility → Accessibility Specialist
- i18n gaps → i18n Specialist
- Missing observability → SRE Specialist
- Architectural ambiguity → **ESCALATE**
- Business logic unclear → **ESCALATE**

### Changed

#### Gate Keeper Enhancements
- Added operating modes: `--mode=block`, `--mode=auto-fix`, `--mode=report`
- Generates structured violation reports in JSON format for Fixer Orchestrator
- Maintains existing validation rigor while enabling auto-remediation

#### Workflow Improvements
- **90%+ reduction** in user interruptions for routine quality issues
- **Faster execution** - No waiting for manual test/doc/security fixes
- **Consistent quality** - Standards automatically enforced
- **User time focused** on strategic decisions, not routine quality tasks

### Dream Team Audit (Self-Audit - 2026-02-06)

Framework audited itself using 6 specialist agents (81 findings). All remediated:

#### P0 - Critical Security Fixes
- **Created `.gitignore`** - Framework was missing gitignore entirely; added BPSBS-compliant exclusions
- **Fixed `rm -rf` safety** in `install.sh` - Added path validation, root/home protection
- **Fixed injection vulnerabilities** in `scripts/memory.sh` - jq `--arg`, `grep -F --`, type whitelist
- **Added `set -o pipefail`** to all 11 shell scripts
- **Fixed symlink race** in `scripts/test-version-system.sh` - Uses `mktemp -d` now

#### P1 - This Release Fixes
- **Updated version references** from 1.6.0 → 1.7.0.0 across all documentation
- **Fixed agent counts** 38/39 → 41 across README, AGENTS.md, QUICK-REFERENCE, DOCUMENTATION-INDEX, version files
- **Deleted temp files** (.goutputstream-SUL1I3, install.sh.backup)
- **Renamed .mdf → .md** in `.cursor/rules/` (fixer, version)

#### P2 - User-Directed Improvements
- **Ported security-scanner** to Claude Code + Cursor (new agent, counts 40→41)
- **Merged reptilian-gate-keeper.md** into gate-keeper.md (removed duplicate)
- **Moved ANTI_PATTERNS** to `docs/` (updated all installer paths in .sh and .ps1)
- **Moved scripts** install-unified.sh/ps1, convert-to-copilot.sh → `scripts/`
- **Moved docs** CLAUDE-SUMMARY, V1.1.0-RELEASE-NOTES, AGENTS-ENHANCEMENT-COMPLETE → `docs/`
- **Archived 9 historical docs** to `docs/archive/`
- **Wired 11 shared modules** into 33 platform files (agents/ persona references)
- **Documented 5 Copilot-only agents** in docs/AGENTS.md (GitHub-specific)

### Statistics
- **41 agents** (was 38) - Added Fixer Orchestrator, Version, Security Scanner agents
- **46 Copilot agents** (41 shared + 5 GitHub-specific)
- **3 execution modes** - Supervised, Semi-Autonomous, Autonomous
- **20+ auto-fixable** violation types
- **Target: >90%** auto-fix rate, <10% escalation rate
- **33 platform files** wired to shared agent modules

---

## [1.6.0] - 2026-02-03

### Added

#### The Dream Team - 8 New Specialist Agents

Completing the full software development lifecycle:

##### Security Specialist (`/security`)
- STRIDE threat modeling for new features
- OWASP Top 10 audit checklist
- Penetration testing mindset
- Attack vector enumeration
- Security-focused code review
- Incident response guidance
- System hardening recommendations

##### Data Architect (`/data-architect`)
- Schema design with ERD generation
- Query optimization with execution plan analysis
- Normalization analysis and recommendations
- Safe migration strategy (non-breaking changes)
- Index decision framework
- Database health audits
- Anti-pattern detection (EAV, God tables, N+1)

##### Release Manager (`/release`)
- Semantic versioning enforcement
- Keep a Changelog format
- User-facing release notes generation
- Pre-release and post-release checklists
- Rollback plan templates
- Hotfix process guidance
- Error budget integration

##### i18n Specialist (`/i18n`)
- Internationalization infrastructure setup
- Hardcoded string detection and extraction
- ICU message format for plurals/gender
- RTL (right-to-left) support with logical CSS
- Locale-specific formatting (numbers, dates, currencies)
- Translation quality review
- Multi-country context (Luxembourg, Belgium, France)

##### Tech Lead (`/tech-lead`)
- Technical decision arbitration (RFC process)
- Cross-team coordination
- Technical mentorship
- Project planning with milestones
- Technical debt management
- Stakeholder communication
- Technical health metrics

##### SRE Specialist (`/sre`)
- Incident response framework (SEV1-4)
- SLO/SLI/Error budget definition
- Four Golden Signals monitoring
- Blameless postmortem templates
- Operational runbook creation
- Chaos engineering experiments
- Alert design principles

##### UX/UI Specialist (`/ux-ui`)
- UI audit protocol (visual, responsive, a11y, interactions)
- Design system enforcement (tokens, patterns)
- Framework migration (Bootstrap→Tailwind, etc.)
- Component rewrite protocol
- Anti-pattern detection (magic numbers, !important chains)
- Dark mode requirements
- Responsive breakpoint strategy

##### Senior Software Engineer (`/senior-engineer`)
- Assumption surfacing (explicit ASSUMPTIONS blocks)
- Confusion management (stop and clarify)
- Push-back when warranted (not a yes-machine)
- Simplicity enforcement (1000 lines when 100 suffice = fail)
- Scope discipline (surgical precision)
- Dead code hygiene (ask before removing)
- Inline planning for multi-step tasks

#### Documentation
- **[docs/AGENTS.md](docs/AGENTS.md)** - Complete agent team reference
- Updated **[docs/QUICK-REFERENCE.md](docs/QUICK-REFERENCE.md)** - All agent modes and commands
- Updated **[DOCUMENTATION-INDEX.md](DOCUMENTATION-INDEX.md)** - New agent listings

#### Platform Support
- All 8 new agents available on Claude Code, GitHub Copilot CLI, and Cursor
- 38 shared agent modules in `agents/` directory
- Consistent behavior across all three platforms

### Changed

#### Statistics
- Claude Code Skills: 30 → 38 (+8)
- Copilot CLI Agents: 36 → 44 (+8)
- Cursor Rules: 30 → 38 (+8)
- Shared Modules: 28 → 36 (+8)
- Total: 96 → 120 agents/skills/rules

---

## [1.5.0] - 2026-01-25

### Added

#### Phase 4: Observability & Tracing System

##### Observability Infrastructure
- **Observability Manager** (`observability/observability-manager.js`):
  - Unified interface for tracing, metrics, and auditing
  - Singleton pattern for global access
  - Automatic metrics collection and saving

- **Trace Logger** (`observability/trace-logger.js`):
  - Structured logging to JSONL files
  - Session-based trace organization
  - Span-based distributed tracing
  - Automatic trace ID and span ID generation
  - Decision logging support

- **Metrics Collector** (`observability/metrics-collector.js`):
  - Token usage tracking (total, by agent, by action)
  - Latency measurement (average, by agent, by action)
  - Error rate calculation
  - Action counting and status tracking
  - Session tracking
  - Metrics persistence to JSON file

- **Audit Logger** (`observability/audit-logger.js`):
  - Story completion tracking
  - Security event logging
  - Decision logging
  - File operation logging
  - Agent action logging
  - Audit trail search functionality

##### Trace Viewer
- **Trace Viewer Server** (`observability/trace-viewer-server.js`):
  - Express.js server for trace visualization
  - RESTful API endpoints for traces, metrics, and audit trails
  - Session listing and trace retrieval

- **Trace Viewer Client** (`logs/dashboards/trace-viewer.html`):
  - Web-based trace visualization interface
  - Timeline view of agent activities
  - Metrics summary dashboard
  - Session selection and filtering
  - Detailed trace entry inspection

##### Start Scripts
- `scripts/start-trace-viewer.sh` (Linux/Mac)
- `scripts/start-trace-viewer.ps1` (Windows)

##### Documentation
- `docs/OBSERVABILITY-TRACING.md` - Complete implementation guide

### Enhanced
- **Log Directory Structure**: Organized logs into traces/, audit/, and dashboards/ subdirectories
- **Package Management**: Added `observability/package.json` with uuid dependency

---

## [1.4.1] - 2026-01-25

### Added

#### Full Node.js Implementation for Phase 3 Features

##### MCP Servers - Complete Implementation
- **Filesystem Server** (`mcp-servers/filesystem/server.js`):
  - Full Node.js implementation with all 6 tools (read_file, write_file, list_directory, create_directory, delete_file, search_files)
  - Permission model with confirmation requirements
  - File size limits and safety checks
  - Package.json with MCP SDK dependency

- **Database Server** (`mcp-servers/database/server.js`):
  - Full Node.js implementation with PostgreSQL support
  - Schema inspection (tables, columns, constraints)
  - Read-only query execution (SELECT only)
  - Migration file generation and management
  - Migration status checking
  - Package.json with pg dependency

- **Testing Server** (`mcp-servers/testing/server.js`):
  - Full Node.js implementation with test framework detection
  - Support for Jest, Mocha, Vitest, pytest
  - Test execution, coverage, and listing
  - Watch mode support
  - Package.json with MCP SDK dependency

- **Security Server** (`mcp-servers/security/server.js`):
  - Full Node.js implementation for security scanning
  - Dependency vulnerability scanning (npm, yarn, pip, maven, gradle)
  - Code scanning for hardcoded secrets
  - Permission auditing
  - Comprehensive security report generation
  - Package.json with MCP SDK dependency

##### Dashboard - Complete Implementation
- **Dashboard Server** (`dashboard/server/index.js`):
  - Full Express.js server implementation
  - RESTful API endpoints for PRDs, stories, agents, and metrics
  - In-memory data storage (JSON files)
  - Health check endpoint
  - Package.json with Express dependency

- **Dashboard Client** (`dashboard/client/`):
  - Complete HTML/CSS/JS frontend
  - Tabbed interface (Overview, PRDs, Stories, Agents, Metrics)
  - Real-time data loading and rendering
  - Summary cards with statistics
  - List views for PRDs, stories, and agent activity
  - Filtering and search capabilities
  - Modern dark theme UI

### Enhanced
- **MCP Server READMEs**: Updated with installation and usage instructions
- **Dashboard Start Scripts**: Ready to use with `npm start`

---

## [1.4.0] - 2026-01-25

### Added

#### Phase 3: Advanced Features

##### Persistent Memory System
- **Memory Bank Structure**: `memory_bank/` directory with knowledge, relationships, and retrieval subdirectories
- **CLI Tools**: `scripts/memory.sh` (Linux/Mac) and `scripts/memory.ps1` (Windows)
- **Commands**: `/remember`, `/recall`, `/correct` for knowledge management
- **Storage Format**: JSONL-based append-only storage with weight management
- **Weight Algorithm**: Automatic weight calculation based on recency, validation, usage, and reality anchors
- **Documentation**: `docs/PERSISTENT-MEMORY-IMPLEMENTATION.md` with full technical details
- **Integration**: Updated memory agents across all platforms (Claude Code, Copilot CLI, Cursor)

##### MCP (Model Context Protocol) Integration
- **MCP Server Framework**: `mcp-servers/` directory structure
- **Four MCP Servers**:
  - `mcp-skillfoundry-filesystem` - Safe file operations with permission model
  - `mcp-skillfoundry-database` - Database schema inspection and migration management
  - `mcp-skillfoundry-testing` - Test runner integration
  - `mcp-skillfoundry-security` - Security scanning and vulnerability detection
- **Documentation**: `docs/MCP-INTEGRATION.md` with server specifications and usage
- **Server READMEs**: Individual README files for each MCP server

##### Visual Dashboard
- **Dashboard Structure**: `dashboard/` directory with server and client components
- **Features**: PRD management, story tracking, agent activity log, metrics dashboard, project health
- **Tech Stack**: Node.js + Express backend, vanilla HTML/CSS/JS frontend
- **Start Scripts**: `scripts/start-dashboard.sh` and `scripts/start-dashboard.ps1`
- **API Endpoints**: RESTful API for PRDs, stories, agents, and metrics
- **Documentation**: `docs/VISUAL-DASHBOARD.md` with architecture and implementation details

##### Parallel Execution
- **DAG-Based Execution**: `parallel/` directory with DAG builder and executor
- **Dependency Resolution**: Automatic dependency analysis and batch creation
- **Parallel Batches**: Execute independent tasks concurrently
- **Error Handling**: Circular dependency detection, task failure handling, resource conflict resolution
- **Documentation**: `docs/PARALLEL-EXECUTION.md` with usage examples and architecture

### Enhanced
- **Memory Agents**: Updated to reference CLI tools and implementation documentation
- **Documentation Index**: Added entries for all Phase 3 features

---

## [1.3.5] - 2026-01-25

### Added

#### Phase 2 Polish - Reflection Protocol Expansion
- **Reflection Protocol** added to 8 specialized agents:
  - Refactor Agent
  - Performance Optimizer
  - Dependency Manager
  - Code Review Agent
  - Migration Specialist
  - API Design Specialist
  - DevOps Specialist
  - Accessibility Specialist
- All agents now include pre/post reflection, self-scoring, and contradiction detection

#### Enhanced Integration Tests
- **Wizard Workflow Test**: Validates quick start wizard end-to-end
- **Update Workflow Test**: Validates update preserves custom files
- **Multi-Platform Test**: Validates multiple platforms can coexist
- Total integration tests: 19 → 22+ tests

#### Windows PowerShell Error Handling
- **Comprehensive error handling** in `install.ps1` and `update.ps1`
- Automatic rollback on failed installations
- Restore from backup on failed updates
- Enhanced error messages with actionable solutions
- Diagnostic mode (`--Debug` flag)
- Error codes (0-8) matching bash scripts

#### Enhanced Diagnostic Collection
- **Additional system information**: Computer name, platform selection, debug mode
- **Better permission details**: AccessToString for PowerShell, detailed ls output for bash
- **Update status tracking**: Projects processed, failures
- **Recent operations log**: Last 20 operations (bash)

### Enhanced
- **Install Scripts**: Better error handling, rollback, diagnostics
- **Update Scripts**: Better error handling, diagnostics, backup restore
- **Test Suite**: More comprehensive integration test coverage

### Changed
- Error messages now include actionable solutions across all platforms
- Diagnostic information more comprehensive
- All specialized agents now engage in structured self-reflection

---

## [1.3.4] - 2026-01-25

### Added

#### Phase 2: Core Enhancements

- **Agent Reflection Protocol** (`agents/_reflection-protocol.md`)
  - Pre-action reflection (risks, assumptions, patterns, simplicity)
  - Post-action reflection (goal achievement, edge cases, quality, learning)
  - Contradiction detection protocol
  - Self-scoring system (0-10 on 4 dimensions: Completeness, Quality, Security, Confidence)
  - Reflection output format
  - Integrated into Coder, Tester, and Architect agents

- **Enhanced Test Suite**
  - **Agent Protocol Tests** (2 tests): Reflection protocol validation
  - **Integration Tests** (2 tests): Install/update workflows, all platforms
  - **Performance Tests** (2 tests): Install speed, file count validation
  - **Security Tests** (2 tests): Security pattern detection, agent security references
  - **Cross-Platform Tests** (2 tests): Script existence, unified installer validation
  - Total: 19+ tests across 8 categories (up from 9 tests)

- **Error Handling & Recovery Protocol** (`agents/_error-handling-protocol.md`)
  - Actionable error messages (what, why, where, how)
  - Error categories (FATAL, ERROR, WARNING, INFO)
  - Automatic recovery mechanisms
  - Rollback on failure
  - Diagnostic mode (`--debug` flag)
  - Error codes (0-8)
  - Retry with exponential backoff
  - Graceful degradation

### Enhanced

- **Install Script** (`install.sh`)
  - Added comprehensive error handling
  - Automatic rollback on failure
  - Diagnostic information collection
  - Debug mode (`--debug` flag)
  - Enhanced error messages with solutions
  - Better error codes

- **Test Suite** (`tests/run-tests.sh`)
  - Expanded from 9 to 19+ tests
  - Added 5 new test categories
  - Improved test documentation

### Changed
- Error messages now include actionable solutions
- Test suite provides comprehensive coverage
- Agents now engage in structured self-reflection

---

## [1.3.3] - 2026-01-25

### Added

#### Quick Wins - Enhanced Onboarding
- **One-Click Installation Scripts** (`install-unified.sh`, `install-unified.ps1`)
  - Auto-detects platform (Claude Code, Copilot CLI, Cursor)
  - Auto-detects OS (Linux, Mac, Windows)
  - Interactive mode with smart defaults
  - Single command installation: `curl ... | bash` or `iwr ... | iex`

- **Quick Start Wizard** (`scripts/wizard.sh`, `scripts/wizard.ps1`)
  - Interactive project setup wizard
  - Platform selection
  - Project type selection (Web App, API, CLI, Library)
  - Tech stack selection
  - Auto-generates starter PRD template

- **Enhanced Documentation with Examples**
  - `docs/EXAMPLES/example-web-app.md` - Complete web app walkthrough
  - `docs/EXAMPLES/example-api.md` - REST API implementation guide
  - Real-world examples with step-by-step instructions
  - Common issues and solutions

- **Strategic Improvement Plan**
  - `docs/IMPROVEMENT-PLAN.md` - Comprehensive roadmap
  - `docs/MARKET-COMPARISON.md` - Competitive analysis
  - Prioritized enhancement list

### Changed
- Updated installation documentation to include one-click installer
- Enhanced README with quick start wizard instructions

### Fixed
- Installation scripts now handle edge cases better
- Improved error messages for better user experience

---

## [1.3.2] - 2026-01-25

### Added

#### New Specialized Agents (8 Agents)
- **Refactor Agent** (`refactor.md`) - Code quality improvement with TDD safety net
  - Common code smells identification
  - Refactoring techniques (Extract Method, Extract Class, Rename, etc.)
  - Safety-first approach with test verification
  - Integration with Tester agent

- **Performance Optimizer** (`performance.md`) - Performance bottleneck identification
  - Measurement-first approach (never optimize without metrics)
  - Performance profiling and analysis
  - Common performance issues (N+1 queries, missing indexes, etc.)
  - Performance budgets (frontend and backend)

- **Dependency Manager** (`dependency.md`) - Secure dependency management
  - Vulnerability scanning and assessment
  - Update strategy (patch/minor/major)
  - Dependency optimization (remove unused, consolidate)
  - Package hallucination detection (AI-specific vulnerability)

- **Code Review Agent** (`review.md`) - Merciless code review
  - High signal-to-noise ratio (only real issues)
  - Security review (Top 7 vulnerabilities)
  - Test coverage review
  - Code quality and architecture review

- **Migration Specialist** (`migration.md`) - Database schema changes
  - Safety-first migrations (never lose data)
  - Reversibility (every migration has rollback)
  - Migration types and risk assessment
  - Data migration patterns

- **API Design Specialist** (`api-design.md`) - API interface design
  - RESTful design principles
  - HTTP status codes and URL design
  - Request/response design
  - API versioning strategies
  - OpenAPI/Swagger documentation

- **DevOps Specialist** (`devops.md`) - CI/CD and infrastructure
  - CI/CD pipeline design
  - Infrastructure as code
  - Deployment strategies (Blue-Green, Canary, etc.)
  - Monitoring and observability

- **Accessibility Specialist** (`accessibility.md`) - WCAG compliance
  - WCAG 2.1 Level AA compliance
  - Accessibility audit and testing
  - Common accessibility issues
  - Keyboard navigation and screen reader support

#### Platform Expansion
- **Claude Code**: 22 → 30 skills (+8)
- **Copilot CLI**: 28 → 36 agents (+8)
- **Cursor**: 22 → 30 rules (+8)
- **Total**: 72 → 96 agents/skills/rules (+24)

### Enhanced

#### Existing Agents Enhanced
- **Coder Agent**: Added references to refactor and performance agents
- **Tester Agent**: Added references to performance testing
- **Architect Agent**: Added Performance, Accessibility, and DevOps personas
- **Go Agent**: Enhanced workflow with optional specialized agents (Refactor → Performance → Review → Migration)

### Changed

- All new agents available on all platforms (Claude Code, Copilot CLI, Cursor)
- Enhanced agent integration across workflow
- Improved documentation and examples

---

## [1.3.1] - 2026-01-20

### Added

#### TDD Enforcement Protocol
Adopted from SkillsMP Superpowers collection.

- **`agents/_tdd-protocol.md`** - Complete TDD enforcement specification
  - RED-GREEN-REFACTOR cycle enforcement
  - Test-first requirement before implementation
  - Enforcement levels: STRICT (block), WARN (log), OFF (track)
- **TDD state tracking** - `.claude/tdd-state.json` for cycle metrics
- **TDD anti-patterns** - Detection and blocking of test-after development
- **Framework patterns** - Jest/Vitest, pytest, xUnit examples
- **Integration with /coder** - Automatic TDD mode activation

#### Parallel Agent Dispatching
Adopted from SkillsMP Superpowers collection.

- **`agents/_parallel-dispatch.md`** - Concurrent subagent execution
  - Wave execution mode (groups of independent tasks)
  - Eager execution mode (start as dependencies complete)
  - Conservative mode (limit concurrent agents)
- **Dispatch state tracking** - `.claude/dispatch-state.json`
- **Conflict detection** - File overlap and resource conflicts
- **Speedup calculation** - Parallel vs sequential comparison
- **Integration with /go** - `--parallel` flag for story execution
- **Integration with /delegate** - Enhanced orchestration with waves

#### Git Worktree Isolation
Based on git worktree best practices.

- **`agents/_git-worktrees.md`** - Isolated branch development
  - PRD-level worktree creation
  - Safe experimentation without affecting main
  - Easy rollback (delete worktree folder)
  - Parallel PRD development support
- **Worktree state tracking** - `.claude/worktree-state.json`
- **Post-create hooks** - Automatic environment setup
- **Conflict resolution** - Rebase/merge strategies
- **Integration with /go** - `--worktree` flag for isolated execution

#### Systematic Debugging Protocol
Adopted from SkillsMP Superpowers collection.

- **`agents/_systematic-debugging.md`** - Four-phase debugging
  - Phase 1: OBSERVE - Gather facts without assumptions
  - Phase 2: HYPOTHESIZE - Form testable explanations
  - Phase 3: TEST - Validate/invalidate hypotheses
  - Phase 4: VERIFY - Confirm fix, add regression tests
- **Five Whys technique** - Trace to root cause
- **Debug session tracking** - `.claude/debug-state.json`
- **Defense in depth** - Add guards after every fix
- **Integration with /debugger** - Enhanced debugging workflow

### Changed

- `/coder` skill updated with mandatory TDD enforcement
- `/debugger` skill updated with four-phase protocol
- `/delegate` skill updated with parallel dispatch capabilities
- `/go` skill updated with worktree and parallel flags
- Framework version bumped to 1.3.1

### New /go Flags

```
/go --parallel           Enable parallel story execution
/go --parallel=EAGER     Use eager execution mode
/go --parallel=2         Limit concurrent agents
/go --no-parallel        Force sequential execution
/go --worktree           Execute PRD in isolated worktree
/go --no-worktree        Force inline execution
/go --tdd                Enforce TDD mode (STRICT)
/go --tdd=WARN           TDD in warning mode
```

---

## [1.3.0] - 2026-01-20

### Added

#### Execution State Machine
Based on crash recovery and rollback requirements.

- **`agents/_state-machine.md`** - Complete state machine specification
  - States: IDLE → INITIALIZING → LOADING_PRD → VALIDATING → GENERATING_STORIES → EXECUTING_STORY → VALIDATING_LAYERS → SECURITY_AUDIT → DOCUMENTING → COMPLETED
  - Error state with recovery options
  - Rolling back state for undo operations
- **`.claude/state.json`** - Persistent execution state
- **State transitions** - Deterministic flow with action triggers
- **Recovery protocol** - Automatic detection of interrupted executions

#### Rollback Protocol
- **`agents/_rollback-protocol.md`** - Complete rollback specification
- **Automatic backups** - Files backed up before modification to `.claude/backups/`
- **Rollback manifest** - Tracks all changes for reversal
- **Database rollback** - Migration down scripts executed
- **Package rollback** - Installed packages tracked and removed
- **Partial rollback** - Rollback to specific story point with `--rollback STORY-XXX`

#### Story Dependency Graph
- **`agents/_story-dependency-graph.md`** - Dependency management specification
- **Dependency types** - Hard (blocks) and soft (prefers) dependencies
- **INDEX.md template** - Automatic generation of story index with Mermaid graph
- **Parallel execution** - Independent stories can run simultaneously
- **Critical path calculation** - Identifies bottleneck sequence
- **Cycle detection** - Fatal error on circular dependencies

#### Inter-PRD Dependencies
- **`agents/_prd-dependencies.md`** - PRD coordination specification
- **Dependency metadata** - `requires`, `recommends`, `blocks`, `shared_with` fields
- **PRD validation** - Checks dependencies before execution
- **Execution waves** - PRDs grouped by dependency level
- **Impact analysis** - Shows downstream effects of PRD changes

#### Metrics & Analytics System
- **`agents/_metrics-system.md`** - Complete metrics specification
- **`.claude/commands/metrics.md`** - New `/metrics` skill
  - `/metrics` - Dashboard view
  - `/metrics agents` - Agent performance breakdown
  - `/metrics stories` - Story completion analysis
  - `/metrics errors` - Error analysis and patterns
  - `/metrics trends` - Trend analysis over time
  - `/metrics export [format]` - Export to JSON/CSV/Markdown
- **Automatic collection** - Metrics gathered during `/go` execution
- **Agent tracking** - Success rates, token usage, response times
- **Story tracking** - By complexity, by layer, completion rates
- **Error categorization** - By type, by agent, recovery rates
- **Trend analysis** - Weekly/monthly comparisons

#### Agent Communication Protocol
- **`agents/_agent-protocol.md`** - Inter-agent messaging standard
- **Request/Response format** - Structured JSON messages
- **Status codes** - SUCCESS, PARTIAL, FAILED, BLOCKED
- **Handoff protocol** - Clean agent-to-agent transitions
- **Error propagation** - Standardized error codes and handling
- **Chain execution** - Sequential, parallel, and conditional flows
- **Traceability** - Correlation IDs and audit trail

#### Test Execution Integration
- **`agents/_test-execution.md`** - Cross-framework test running
- **Auto-detection** - Detects Jest, Vitest, pytest, dotnet test, cargo test, go test
- **Unified result format** - Normalized test output across frameworks
- **Failure categorization** - assertion, timeout, type_error, network, database, etc.
- **Coverage analysis** - Line, branch, function coverage with thresholds
- **Integration with gate-keeper** - Test evidence for capability gates

#### Gate Verification Commands
- **`agents/_gate-verification.md`** - Automated capability checks
- **Verification commands**:
  - `/verify tests` - Run tests and verify all pass
  - `/verify build` - Verify clean build with no warnings
  - `/verify coverage [--threshold X]` - Check coverage meets threshold
  - `/verify lint` - Verify code passes all linting
  - `/verify security` - Run security scans
  - `/verify api` - Check API health and smoke tests
  - `/verify migration` - Test database migrations and rollback
  - `/verify docs` - Check documentation completeness
  - `/verify patterns` - Scan for banned patterns
- **Composite gates** - `/verify production` runs all checks
- **Custom gates** - Define in `.claude/gates.json`

#### PRD Schema Validation
- **`genesis/.schema.json`** - JSON Schema for PRD validation
- **Required fields** - prd_id, title, status, problem_statement, user_stories, security_requirements, out_of_scope
- **Dependency metadata** - requires, recommends, blocks, shared_with
- **Validation rules** - Critical checks that block implementation

#### Enhanced /go Command
- **`--resume`** - Resume interrupted execution from saved state
- **`--rollback`** - Rollback all changes from last execution
- **`--rollback STORY-X`** - Rollback to before specific story
- **`--skip STORY-XXX`** - Skip specific story during execution
- **`--from STORY-XXX`** - Start from specific story
- **`--state`** - Show raw state file
- **`--clean`** - Clear state file and start fresh
- **`--deps`** - Show PRD dependency graph
- **`--metrics`** - Show execution metrics dashboard

#### Update Script Enhancements
- **`--sync PATH`** - Validate/regenerate CLAUDE-SUMMARY.md
- **Summary sync validation** - Checks CLAUDE.md and CLAUDE-SUMMARY.md are aligned
- **PRD schema installation** - Auto-copies genesis/.schema.json

### Changed
- Framework version bumped to 1.3.0
- PRD template updated with dependency metadata section
- `/go` skill updated with state machine, rollback, and metrics integration
- `update.sh` enhanced with sync validation and schema copying

### Technical Details
- State machine provides deterministic execution flow
- Rollback uses manifest-based file tracking
- Dependency graphs use topological sort for ordering
- Metrics stored in JSON for easy export and analysis
- All new shared modules follow `_` prefix convention

---

## [1.2.0] - 2026-01-18

### Added

#### Context Engineering
Based on [Recursive Language Models (arXiv:2512.24601)](https://arxiv.org/abs/2512.24601) and [Anthropic's Context Engineering Guide](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).

- **CLAUDE-SUMMARY.md** - Condensed standards (~2K tokens) for active context loading
- **`/context` skill** - New context management command
  - `/context` - Show status and budget
  - `/context compact` - Force context compaction
  - `/context budget` - Detailed token breakdown
  - `/context load <level>` - Load specific context level
  - `/context clear` - Clear non-essential context
  - `/context scratchpad` - View/update session tracking
- **Hierarchical Context Loading** - Level 1/2/3 strategy for token efficiency
- **Token Budget Thresholds** - GREEN (<50K), YELLOW (50-100K), RED (>100K)
- **Auto-compaction** - Triggers at 100K tokens or every 5 stories

#### Recursive Task Decomposition
- **`agents/_recursive-decomposition.md`** - Shared protocol for task breakdown
- **Decision function** - When to decompose (complexity, budget, parallelization)
- **Isolated context execution** - Each subtask gets minimal, focused context
- **Maximum recursion depth** - 3 levels enforced
- **Result aggregation** - Combine subtask outcomes with conflict detection

#### Shared Agent Modules
- **`agents/_context-discipline.md`** - Token-aware behavior protocol for all agents
- **`agents/_subagent-response-format.md`** - Standardized <500 token response format
- **Scratchpad pattern** - Persistent notes across turns for all agents

#### Enhanced /go Command
- **Phase 0: Context Preparation** - Mandatory context budget check
- **Context-aware story execution** - Budget check before each story
- **Sub-agent delegation rules** - Enforces response format
- **Story complexity estimation** - Simple/Medium/Complex classification
- **Emergency compaction protocol** - Handles approaching context limits
- **Session summary format** - Structured end-of-session reporting

### Changed
- All 13 agent personas updated with Context Discipline section
- Agent Orchestrator enhanced with recursive decomposition workflow
- Project Orchestrator enhanced with sub-phase isolation

### Technical Details
- Estimated token counts using ~4 chars per token heuristic
- Level 1 context: ~5-10K tokens (essential only)
- Level 2 context: ~20-40K tokens (working set)
- Level 3 context: ~50-80K tokens (extended, reference only)

---

## [1.1.0] - 2026-01-18

### Added

#### Security
- `.gitignore Security (MANDATORY)` - Comprehensive .gitignore template with all sensitive patterns
- Pre-commit hook template for secret detection
- Emergency recovery steps for accidentally committed secrets
- Sensitive data verification checklist

#### LoggerService
- Full LoggerService implementation pattern with sanitization
- ESLint `no-console` rule enforcement
- Verification commands to confirm all console.* replaced
- Sign-off template for LoggerService compliance

#### Production Readiness
- **Database Migration Strategy** - Migration workflow, naming conventions, rollback testing
- **Observability/APM** - Required stack, RED metrics, log schema, alert thresholds
- **Incident Response Protocol** - P0-P4 severity levels, runbooks, postmortem template
- **Graceful Shutdown** - SIGTERM handling, connection draining, PM2 config
- **API Versioning Strategy** - URL path versioning, deprecation headers, changelog requirements
- **Concurrency/Locking** - Optimistic locking pattern, deadlock prevention
- **Error Resilience Patterns** - Circuit breaker, exponential backoff, bulkhead pattern
- **Dependency Management** - Security scanning, CVE response times, license compliance
- **Feature Flags** - Flag types, lifecycle management, cleanup requirements
- **Caching Strategy** - Cache layers, TTL guidelines, invalidation patterns
- **Performance Budgets** - Core Web Vitals targets, API latency budgets
- **Soft Delete/Retention** - Data retention policies, GDPR compliance
- **Load Testing** - k6/Artillery tools, test scenarios, capacity planning

#### Framework Management
- `update.sh` - Push latest framework version to existing projects
- Project registry for tracking installations
- Version markers in projects
- Diff preview before updates
- Backup system for updates

### Changed
- Enhanced Zero Tolerance banned patterns table with 6 additional patterns
- Philosophy section updated with "ONLY REAL LOGIC" and "Three-Layer Completeness" principles
- PM2 scripts now include graceful shutdown configuration

---

## [1.0.0] - 2026-01-17

### Added
- Initial release of SkillFoundry Framework
- Genesis-first development workflow
- PRD and Story templates
- Three-layer enforcement (Database, Backend, Frontend)
- Zero tolerance policy for placeholders/TODOs
- Skills system with `/go`, `/prd`, `/layer-check` commands
- CLAUDE.md with BPSBS standards
- `install.sh` for framework installation
- Authentication & token management security standards
- Admin password security requirements
- PM2 production deployment scripts
- SEO implementation checklist

---

## Version History Summary

| Version | Date | Focus |
|---------|------|-------|
| 1.9.0.14 | 2026-02-13 | OpenAI Codex platform support: 4th platform, 60 Codex Skills, AGENTS.md, quad-platform sync engine |
| 1.9.0.13 | 2026-02-09 | The Anvil: 6-tier quality gate (shell pre-flight, canary, self-adversarial, scope, contract, shadow) |
| 1.9.0.5 | 2026-02-08 | Knowledge Hub: git-based distribution, cross-machine scratchpad/knowledge sync |
| 1.9.0.4 | 2026-02-08 | Persistent scratchpad: cross-platform session continuity (Claude/Copilot/Cursor) |
| 1.9.0.3 | 2026-02-07 | Platform Sync Engine: generate platform files from agent source, command: field |
| 1.7.0.2 | 2026-02-07 | Autonomous execution: permission profiles, safety hooks, zero-prompt workflow |
| 1.7.0.1 | 2026-02-06 | Populated templates/, parallel/, memory_bank/ with practical content |
| 1.7.0.0 | 2026-02-05 | Auto-remediation, fixer orchestrator, 3 execution modes, security scanner, dream team audit |
| 1.6.0 | 2026-02-03 | Dream Team (8 specialist agents), full SDLC coverage |
| 1.5.0 | 2026-01-25 | Observability & tracing system |
| 1.4.1 | 2026-01-25 | Full Node.js MCP/dashboard implementation |
| 1.4.0 | 2026-01-25 | Persistent memory, MCP integration, dashboard, parallel execution |
| 1.3.5 | 2026-01-25 | Reflection protocol expansion, Windows error handling |
| 1.3.4 | 2026-01-25 | Agent reflection protocol, enhanced test suite |
| 1.3.3 | 2026-01-25 | Quick start wizard, one-click installers |
| 1.3.2 | 2026-01-25 | 8 new specialized agents (refactor, performance, dependency, etc.) |
| 1.3.1 | 2026-01-20 | TDD enforcement, parallel dispatch, git worktrees, systematic debugging |
| 1.3.0 | 2026-01-20 | State machine, rollback, metrics, dependency graphs, gate verification |
| 1.2.0 | 2026-01-18 | Context engineering, recursive decomposition, token optimization |
| 1.1.0 | 2026-01-18 | Production readiness, security enhancements, update system |
| 1.0.0 | 2026-01-17 | Initial release |

---

## Upgrade Guide

### From 1.6.0 to 1.7.0.0

1. Run the update script:
   ```bash
   /path/to/skillfoundry/update.sh /path/to/your/project
   ```

2. New files added:
   - `.claude/commands/fixer.md` - Fixer Orchestrator (auto-remediation)
   - `.claude/commands/version.md` - Version management
   - `.claude/commands/security-scanner.md` - AI vulnerability scanner
   - `docs/ESCALATION-CRITERIA.md` - Auto-fix vs escalation matrix
   - `.gitignore` - BPSBS-compliant security exclusions

3. Moved files (paths updated automatically):
   - `ANTI_PATTERNS_BREADTH.md` → `docs/ANTI_PATTERNS_BREADTH.md`
   - `ANTI_PATTERNS_DEPTH.md` → `docs/ANTI_PATTERNS_DEPTH.md`
   - `CLAUDE-SUMMARY.md` → `docs/CLAUDE-SUMMARY.md`
   - `install-unified.sh` → `scripts/install-unified.sh`

4. Deleted files:
   - `agents/reptilian-gate-keeper.md` (merged into `agents/gate-keeper.md`)

5. Updated files:
   - All `.claude/commands/*.md` - Added persona references to shared modules
   - All `.cursor/rules/*.md` - Added persona references to shared modules
   - `agents/gate-keeper.md` - Added auto-fix mode, regression detection
   - All shell scripts - Added `set -o pipefail`

6. Using new features:
   ```
   /go --mode=semi-auto       # Auto-fix routine violations
   /fixer                     # View auto-remediation stats
   /security-scanner          # AI-specific vulnerability scan
   /version                   # Check version and updates
   ```

---

### From 1.3.0 to 1.3.1

1. Run the update script:
   ```bash
   /path/to/skillfoundry/update.sh /path/to/your/project
   ```

2. New files added:
   - `agents/_tdd-protocol.md` - TDD enforcement
   - `agents/_parallel-dispatch.md` - Parallel agent execution
   - `agents/_git-worktrees.md` - Git worktree isolation
   - `agents/_systematic-debugging.md` - Four-phase debugging

3. Updated files:
   - `.claude/commands/coder.md` - TDD enforcement added
   - `.claude/commands/debugger.md` - Four-phase protocol added
   - `.claude/commands/delegate.md` - Parallel dispatch added
   - `.claude/commands/go.md` - New flags (--parallel, --worktree, --tdd)

4. Using new features:
   ```
   # TDD enforcement (default: STRICT)
   /go --tdd              # Enforce TDD mode
   /go --tdd=WARN         # Warning mode

   # Parallel execution
   /go --parallel         # Enable wave-based parallel
   /go --parallel=EAGER   # Eager mode
   /go --parallel=2       # Limit to 2 concurrent

   # Git worktree isolation
   /go --worktree         # Execute in isolated worktree
   ```

5. The /coder agent now requires tests FIRST:
   - RED phase: Write failing test
   - GREEN phase: Minimal implementation
   - REFACTOR phase: Improve quality

6. The /debugger agent now uses four phases:
   - OBSERVE: Gather facts
   - HYPOTHESIZE: Form explanations
   - TEST: Validate hypotheses
   - VERIFY: Confirm fix

---

### From 1.2.0 to 1.3.0

1. Run the update script:
   ```bash
   /path/to/skillfoundry/update.sh /path/to/your/project
   ```

2. New files added:
   - `agents/_state-machine.md` - Execution state machine
   - `agents/_rollback-protocol.md` - Rollback protocol
   - `agents/_story-dependency-graph.md` - Story dependencies
   - `agents/_prd-dependencies.md` - PRD dependencies
   - `agents/_metrics-system.md` - Metrics system
   - `agents/_agent-protocol.md` - Agent communication
   - `agents/_test-execution.md` - Test integration
   - `agents/_gate-verification.md` - Gate verification
   - `.claude/commands/metrics.md` - New `/metrics` skill
   - `genesis/.schema.json` - PRD validation schema

3. Updated files:
   - `genesis/TEMPLATE.md` - Now includes dependency metadata
   - `.claude/commands/go.md` - New flags and features
   - `update.sh` - New `--sync` command

4. Using new features:
   ```
   /go --status        # Check current state
   /go --resume        # Resume interrupted execution
   /go --rollback      # Undo last execution
   /go --metrics       # View execution metrics
   /metrics            # Dedicated metrics dashboard
   ```

5. PRD dependencies:
   - Add dependency metadata to PRDs:
     ```yaml
     dependencies:
       requires: [other-prd]
       blocks: [dependent-prd]
     ```

6. Story dependencies:
   - Stories now support `depends_on` and `blocks` fields
   - INDEX.md generated with dependency graph

7. Validate sync:
   ```bash
   /path/to/skillfoundry/update.sh --sync /path/to/your/project
   ```

### From 1.1.0 to 1.2.0

1. Run the update script:
   ```bash
   /path/to/skillfoundry/update.sh /path/to/your/project
   ```

2. New files added:
   - `CLAUDE-SUMMARY.md` - Use this for active context instead of full CLAUDE.md
   - `.claude/commands/context.md` - New context management skill
   - `agents/_context-discipline.md` - Shared agent module
   - `agents/_subagent-response-format.md` - Sub-agent format standard
   - `agents/_recursive-decomposition.md` - Task decomposition protocol

3. Using context engineering:
   ```
   /context           # Check current token budget
   /context compact   # Force compaction when needed
   /go                # Now includes Phase 0 context prep
   ```

4. All agents now include:
   - Scratchpad pattern for session tracking
   - Token-aware behavior
   - Structured output format

### From 1.0.0 to 1.1.0

1. Run the update script:
   ```bash
   /path/to/skillfoundry/update.sh /path/to/your/project
   ```

2. Review the diff first (optional):
   ```bash
   /path/to/skillfoundry/update.sh --diff /path/to/your/project
   ```

3. Choose how to handle CLAUDE.md:
   - **Overwrite**: Get all new sections (backup saved)
   - **Keep**: Preserve your customizations
   - **Merge**: Save new version as `.new` file for manual merge

4. Verify new requirements:
   - [ ] .gitignore updated with security patterns
   - [ ] LoggerService implemented (if frontend exists)
   - [ ] Pre-commit hooks configured (optional but recommended)
