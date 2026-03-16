# Session Scratchpad
> Auto-persisted by agents. Read on session start. Do not edit manually during active sessions.
> Last updated: 2026-03-16T08:15:00Z
> Platform: claude-code

## Forge Session — 2026-03-16
- PRDs: 1 processed (phase1-make-it-reachable)
- Stories: 9/9 completed
- Issues: 6 security findings found, 6 auto-fixed
- Security: PASS (0 critical, 0 high after fixes)
- Knowledge: 4 entries harvested
- Tests: 882 passing (52 files) — +46 new tests
- New files: ~30 created across sf_cli, site-docs, .github/workflows, homebrew, docs
- Key deliverables: release.yml, Docusaurus site, baseline collector, HTML report, consent system, Homebrew formula, curl installer, VS Code 1.0.0

## Forge Session — 2026-03-15 (VS Code Extension)
- PRDs: 1 processed (vscode-extension)
- Stories: 15/18 (Phase 1-3 complete, Phase 4 marketplace/CI deferred)
- Tests: 28/28 passing (2 test files)
- Issues: 1 CRITICAL + 3 HIGH + 4 MEDIUM security findings found, all 8 remediated
- Security: PASS after remediation (0 critical, 0 high remaining)
- Knowledge: 3 entries (2 decisions, 1 fact)
- New package: skillfoundry-vscode/ (entire VS Code extension)
  - src/extension.ts — Entry point, activation, lifecycle
  - src/bridge.ts — Thin adapter to sf_cli core modules
  - src/providers/ — 7 providers (dashboard, gate-timeline, dependency, forge-monitor, diagnostics, codelens, statusbar)
  - src/commands/ — 3 command groups (gate, forge, memory) with 12 registered commands
  - __tests__/ — bridge.test.ts (13 tests), providers.test.ts (15 tests)
- Bundle: 41.6kb (esbuild, CJS, Node 20 target)
- Architecture: Bridge pattern — direct require() of sf_cli modules, not subprocess
- Key decisions:
  1. Bridge uses require() with __dirname-relative path resolution (not workspace-relative)
  2. Forge runs in integrated terminal (too heavy for direct import), monitored via forge-state.json
  3. Webview panels use strict CSP (default-src 'none'; style-src 'unsafe-inline')
  4. PRD command passes user input via env var to prevent shell injection
  5. All parsed JSON from workspace files gets runtime type validation
- Security fixes applied:
  1. CRITICAL: Command injection — shell metacharacter rejection + env var passthrough in PRD command
  2. HIGH: Path traversal — __dirname-relative sf_cli path resolution, removed workspace-parent traversal
  3. HIGH: Unsafe require() — pinned to resolved absolute paths only
  4. HIGH: Missing CSP — added Content-Security-Policy meta tag to webview
  5. MEDIUM: Incomplete HTML escaping — added " and ' to escapeHtml
  6. MEDIUM: Unvalidated URL — scheme check (https/http only) for advisory links
  7. MEDIUM: Path traversal in diagnostics — workspace boundary validation on parsed file paths
  8. MEDIUM: No schema validation — runtime type checking on all parsed JSON entries
- Delivery: 14/14 FRs covered, 19/25 planned files delivered (76%), 6 missing are optional/inline
- Build: 0 tsc errors, 28/28 tests, 41.6kb bundle

## Forge Session — 2026-03-15 (Quality Intelligence Layer)
- PRDs: 1 processed (quality-intelligence-layer)
- Stories: 12/12 completed (3 batches)
- Tests: 836/836 passing (101 new)
- Issues: 1 HIGH + 5 MEDIUM security findings found, all 6 remediated
- Security: PASS after remediation (0 critical, 0 high, 0 medium remaining)
- Knowledge: 5 entries harvested (3 decisions, 2 facts)
- New core modules:
  1. telemetry.ts (430 LOC) — JSONL event tracking with rotation + aggregation
  2. dependency-scanner.ts (394 LOC) — npm/pip/dotnet/cargo/go audit with platform detection
  3. weight-learner.ts (318 LOC) — retrieval boost, validation updates, time decay
  4. report-generator.ts (391 LOC) — Markdown/JSON quality reports with industry baselines
- New CLI commands: /gate, /hook, /metrics, /report, /benchmark (5 commands)
- Modified: gates.ts (T4 dependency scanner integration), commands/index.ts (5 registrations), logger.ts (3 new categories)
- Security fixes applied:
  1. HIGH: Command injection — allowlist (ALLOWED_AUDIT_COMMANDS) in dependency-scanner.ts
  2. MEDIUM: Path traversal — resolve() + startsWith() guard in report.ts --output
  3. MEDIUM: Shell injection — gate name regex /^t[0-6]$/ + timeout sanitization in hook.ts
  4. MEDIUM: Shell metachar — rejection pattern in gate.ts target parameter
  5. MEDIUM: Path traversal — resolve() guard in weight-learner.ts reality_anchor
  6. MEDIUM: Shell injection — fail_action enum restriction in hook.ts
- Delivery: 12/12 FRs delivered (100%), all planned files created
- Build: 0 tsc errors, 836/836 tests, 49/49 test files

## Forge Session — 2026-03-15 (Real Agents + Semgrep)
- PRDs: 2 processed (real-autonomous-agents, semgrep-security-integration)
- Stories: 6/6 completed (3 batches)
- Tests: 735/735 passing (92 new)
- Issues: 0 found
- Security: PASS (0 critical, 0 high)
- Knowledge: 3 entries harvested (2 decisions, 1 fact)
- New modules: agent.ts (Agent class + 4 archetypes), semgrep-scanner.ts (SAST + regex fallback)
- Modified: agent-registry.ts (archetype map + createAgentInstance), gates.ts (T4 Semgrep-first)
- Modified: security.md (Semgrep SAST section, synced to 3 platforms)
- Key decisions:
  1. Agent class wraps ai-runner.ts, not replaces it (backward compat)
  2. 4 archetypes: ImplementerAgent, ReviewerAgent, OperatorAgent, AdvisorAgent
  3. Delegation with budget partitioning + depth limiting (max 3)
  4. T4 gate: Semgrep-first, regex-fallback — no behavior change without Semgrep
  5. SecurityReport with OWASP categories, severity levels, structured findings

## Forge Session — 2026-03-15 (Passive Memory Engine)
- PRDs: 1 processed (passive-memory-engine)
- Stories: 7/7 completed (3 batches)
- Tests: 643/643 passing (54 new)
- Issues: 1 found (formatRelativeAge NaN on invalid date), 1 auto-fixed
- Security: PASS (0 critical, 0 high)
- Knowledge: 4 entries harvested (3 decisions, 1 fact)
- New modules: auto-harvest.ts, context-primer.ts, layered-recall.ts
- New scripts: generate-primer.sh
- New command: /recall (synced to 5 platforms)
- Session scripts updated: session-init.sh (Step 5: primer), session-close.sh (Step 2.5: primer regen)
- Inspiration: claude-mem (github.com/thedotmack/claude-mem) — took 3 patterns, rejected 6

## Forge Session — 2026-03-12
- PRDs: 1 processed (native-debugger-integration)
- Stories: 6/6
- Issues: 0 critical, 2 high (fixed), 3 medium (fixed)
- Security: PASS (all HIGH/MEDIUM findings remediated)
- Knowledge: Decisions harvested below
- Tests: 423/423 passing (18 new debugger tests)
- Version: 2.0.38 → 2.0.39

### Features Implemented
1. **CDP Protocol Adapter** (`debugger-cdp.ts`): MinimalWebSocket for Node 20 compat, full CDP command/event handling
2. **Debug Session Manager** (`debugger.ts`): Singleton enforcement, `node --inspect-brk=0` process spawning, timeout with SIGTERM→SIGKILL escalation
3. **6 Debug Tools**: debug_start, debug_breakpoint, debug_inspect, debug_evaluate, debug_step, debug_stop
4. **Async Tool Execution**: `executeTool` now returns `ToolResult | Promise<ToolResult>`, ai-runner uses `await Promise.resolve()`
5. **DEBUG Tool Category**: New agent tool category with FULL tools + 6 debug tools
6. **Security Hardening**: Localhost-only WebSocket, test runner whitelist, stderr buffer limit, signal handler cleanup

### Key Decisions
- MinimalWebSocket over native WebSocket for Node 20 compatibility (no polyfills)
- Singleton debug session (one at a time) — simplifies resource management
- `send()` made public on CDPAdapter to allow DebugSession direct CDP calls
- DebugSession uses static `start()` factory (private constructor) — enforces singleton pattern
- Test runner whitelist (jest, vitest, mocha, etc.) prevents command injection via testCommand

### Security Fixes
1. HIGH: Added localhost-only validation in CDPAdapter.connect() (prevents debug data exfiltration)
2. HIGH: Test runner whitelist (ALLOWED_TEST_RUNNERS) prevents command injection
3. MEDIUM: Stderr buffer limited to 1 MB (prevents memory exhaustion DoS)
4. MEDIUM: Signal handler cleanup in stop() (prevents handler accumulation leak)
5. LOW: Race condition awareness in error cleanup (use finally block)

### Files Created
- `src/core/debugger-cdp.ts`: CDP adapter (MinimalWebSocket + CDPAdapter)
- `src/core/debugger.ts`: Debug session lifecycle manager
- `src/core/debugger-tools.ts`: Tool definitions + executeDebugTool()
- `src/__tests__/debugger.test.ts`: 18 unit tests
- `.claude/commands/debug.md`: /debug skill definition
- `docs/stories/native-debugger-integration/INDEX.md`: Story index

### Files Modified
- `src/core/executor.ts`: Async debug tool routing
- `src/core/ai-runner.ts`: await Promise.resolve() for async tools
- `src/core/agent-registry.ts`: DEBUG tool category + debugger agent reassignment
- `src/core/tools.ts`: Re-exports debug tools
- `src/utils/logger.ts`: Added 'debugger' LogCategory
- `src/__tests__/agent-registry.test.ts`: Added DEBUG to VALID_CATEGORIES

## Forge Session — 2026-03-08
- PRDs: 1 processed (correctness-contracts)
- Stories: 5/5
- Issues: 0 critical, 0 high — all gates passing
- Security: PASS
- Knowledge: Decisions harvested below
- Tests: 405/405 passing (7 new micro-gates + pipeline test updates)
- Version: 2.0.37 (no bump — code feature, not release)

### Features Implemented
1. **MG0 — Pre-generation AC validation gate**: Validates done_when/acceptance criteria are objectively verifiable before coder fires. Returns WARN for legacy stories (backward compat).
2. **T0 — Correctness Contract gate**: Zero-cost static check in Anvil (T0 before T1). Fuzzy-matches done_when items against test file content. No AI calls.
3. **MG1.5 — Test documentation gate**: AI review checking @test-suite headers, GWT+WHY comments. On FAIL, re-triggers tester (not fixer).
4. **Pipeline wiring**: MG0 in FORGE phase (before coder), MG1.5 in POLISH phase (between MG1/MG2), T0 in TEMPER phase (before T1).
5. **Story format update**: STORY_GENERATION_PROMPT now includes done_when/fail_when blocks with objectivity guidance.
6. **Skills**: `/ac` (acceptance criteria validator), `/doc-tests` (test documentation checker)
7. **Agent updates**: ruthless-tester.md Phase 3.5 (intent docs), _anvil-protocol.md T0 tier

### Key Decisions
- MG0 FAIL is advisory (warn, don't block) — enforced by T0 in TEMPER
- MG1.5 re-triggers tester agent, not fixer — test docs need test expertise
- T0 uses fuzzy word matching (extract key words from done_when, check substring in test content)
- done_when/fail_when in story format is guidance, not enforcement at generation time

### Files Created
- `.claude/commands/ac.md`, `.claude/commands/doc-tests.md`
- `docs/stories/correctness-contracts/` (INDEX.md + 5 story files)

### Files Modified
- `sf_cli/src/core/micro-gates.ts`: Added MG0_AC_VALIDATION, MG1_5_TEST_DOCS configs + runPreGenerationGate(), runTestDocGate()
- `sf_cli/src/core/gates.ts`: Added runT0(), wired into runAllGates() + runSingleGate()
- `sf_cli/src/core/pipeline.ts`: Added MG0 before coder, MG1.5 in POLISH, updated story gen prompt
- `sf_cli/src/types.ts`: Updated MicroGateResult comment
- `sf_cli/src/__tests__/micro-gates.test.ts`: 7 new tests (MG0, MG1.5, safety override)
- `sf_cli/src/__tests__/pipeline.test.ts`: Updated mocks + counts for MG0/MG1.5
- `sf_cli/src/__tests__/gates.test.ts`: Updated for 7-tier (T0-T6)
- `agents/_anvil-protocol.md`: Added T0 tier
- `agents/ruthless-tester.md`: Added Phase 3.5 test intent documentation

## Forge Session — 2026-02-27
- PRDs: 1 processed (local-first-development)
- Stories: 3/3
- Issues: 1 found (MEDIUM: clearTimeout in catch), 1 auto-fixed
- Security: PASS (0 critical, 0 high, 0 medium after fix, 2 low acceptable)
- Knowledge: 6 entries harvested (3 patterns, 3 decisions)
- Version: 2.0.11 → 2.0.12
- New files: compaction.ts, health-check.ts, task-classifier.ts + 3 test files
- Tests: 308/308 passing (48 new), shell: 198/198 passing

## Forge Pipeline Engine Session — 2026-02-26
- Task: Made The Forge (`/forge`) a real executable pipeline (was read-only scanner)
- Created: `sf_cli/src/core/ai-runner.ts` — standalone agentic loop (zero React deps)
- Created: `sf_cli/src/core/pipeline.ts` — 6-phase pipeline engine (IGNITE→PLAN→FORGE→TEMPER→INSPECT→DEBRIEF)
- Refactored: `sf_cli/src/hooks/useStream.ts` — replaced inline while-loop with runAgentLoop()
- Rewritten: `sf_cli/src/commands/forge.ts` — wired to pipeline, added --dry-run flag
- Updated: `sf_cli/src/types.ts` — added Runner/Pipeline/StoryExecution types
- Tests: `ai-runner.test.ts` (8 tests), `pipeline.test.ts` (12 tests)
- Total: 258 tests passing (20 new, 0 regressions), build clean
- Version: 2.0.9 → 2.0.10

## Forge Session — 2026-02-26 (v2.0.9)
- Task 1: Added reflection protocols to 5 key orchestrators (auto, context, fixer, gate-keeper, go)
- Task 2: Visual overhaul verified complete — all 11 components using theme.ts
- Task 3: Built knowledge promotion pipeline (scripts/promote-knowledge.sh)
- Files modified: 5 commands + 20 platform copies + 1 new script + 8 version files
- Tests: 238 passing, build clean
- Version: 2.0.8 → 2.0.9

## Visual Overhaul Session — 2026-02-23
- Task: Full "Modern Hacker" visual overhaul of all CLI components
- Files modified: 12 (theme.ts, banner.ts, Header.tsx, StatusBar.tsx, Input.tsx, Message.tsx, StreamingMessage.tsx, ToolCall.tsx, DiffPreview.tsx, ApprovalPrompt.tsx, PermissionPrompt.tsx, GateTimeline.tsx)
- Tests: 238 passing across 20 files (no regressions)
- Version: 2.0.3 → 2.0.4

### Design System
1. **Color palette**: 20+ hex colors (accent:#00d4ff, secondary:#6e7dff, success:#00ff87, warning:#ffaa00, error:#ff3333, + text/border/role variants)
2. **Unicode symbols**: 30+ (✓✗◆○▸▹●⟫→◉◈✶≣━─┃┣┗)
3. **Custom borders**: header(┏━┓), double(╔═╗), input(╭─╮), card(┌─┐)
4. **Gradient banner**: cyan→blue→purple across 6 lines

### Component Changes
- Header: heavy-top border, accent gradient, ● separators
- StatusBar: divider line, accent slash commands, ○ streaming indicator
- Input: round corners, cyan left-accent edge, ⟫ chevron
- Message: left-border accent per role, ▸ prompt prefix
- StreamingMessage: green left-border, styled token counter
- ToolCall: Unicode icons (▸◉◈✶≣), purple theme, bordered results
- DiffPreview: card container, ◆ file header
- ApprovalPrompt: double border green, ⟫/▹ selection
- PermissionPrompt: double border amber, ◆ warning prefix
- GateTimeline: pipeline tree (┣━/┗━), ◉✗◆─○ icons, verdict card

## Agent Display & Token Usage Session — 2026-02-23
- Task: Show active agent name and token usage in real-time during streaming
- Files modified: 5 (useStream.ts, StreamingMessage.tsx, Header.tsx, StatusBar.tsx, app.tsx)
- Tests: 237 passing across 20 files (no regressions)
- Version: 2.0.2 → 2.0.3

### Features
1. **StreamingMessage agent label**: `sf:coder>` instead of generic `sf>` during streaming
2. **Live token display**: `[turn 3 | 12.4k in / 2.1k out]` below streaming content
3. **Header token totals**: cumulative session tokens (e.g. `14.2k tok`) in header info line
4. **StatusBar agent indicator**: `coder working (turn 2)` replaces generic `streaming...`
5. **Streaming metadata state**: `streamingAgent`, `streamingTurnCount`, `sessionInputTokens`, `sessionOutputTokens` exposed from `useStream`

## Team Summon Session — 2026-02-23
- Task: Multi-agent auto-routing — summon a team once, available all session
- Files created: 4 (team-registry.ts, team-router.ts, team.ts, 2 test files)
- Files modified: 10 (types.ts, useSession.ts, useStream.ts, app.tsx, agent.ts, index.ts, Header.tsx, StatusBar.tsx, Message.tsx, CHANGELOG.md)
- Tests: 237 passing across 20 files (26 new tests)
- Version: 2.0.1 → 2.0.2

### Features
1. **6 preset teams**: dev, fullstack, security, ops, review, ship
2. **Custom teams**: /team custom <agents...> (min 2)
3. **Keyword-based auto-router**: 30+ agents with weighted regex patterns, no LLM calls
4. **Confidence levels**: high/medium/low/fallback shown in message metadata
5. **UI integration**: team:name in header, sf:agent> labels per message, /team off in statusbar
6. **Mutual exclusion**: team clears single agent, agent clears team

## Performance Session — 2026-02-23
- Task: Multi-layer caching to reduce token usage and latency
- Files modified: 5 (provider.ts, useStream.ts, budget.ts, openai.ts, gemini.ts)
- Tests: 211 passing (no regressions)
- Version: 2.0.0 → 2.0.1

### Caching Layers Implemented
1. **Anthropic prompt caching**: `cache_control: { type: 'ephemeral' }` on system prompt + last tool def (~90% token discount)
2. **Provider singleton**: SDK instances cached via `useRef`, not reinstantiated per message
3. **In-memory budget cache**: `checkBudget()` reads disk once, reuses in-memory `UsageData` afterward
4. **Tool transform memoization**: `toOpenAITools()` / `toGeminiTools()` cached by tool-name key

## Forge Session — 2026-02-23
- PRDs: 8 new enhancement PRDs generated in genesis/
- Stories: N/A (assessment + Tier 1 implementation)
- Issues: 11 found (4 critical, 4 high, 3 medium), 4 auto-fixed
- Security: HARDENED (placeholder keys removed, bash defense-in-depth, symlink blocking, extended redaction)
- Knowledge: Audit findings documented
- Tests: 211 passing (15 new tests added across 4 files)
- Version: 2.0.0

### Tier 1 Fixes Implemented
1. **Budget enforcement**: checkBudget() wired into useStream.ts (pre-request + per-turn), recordUsage() after every response
2. **Provider fallback & retry**: new retry.ts with exponential backoff (1s/2s/4s), auto-fallback to fallback_provider
3. **Security hardening**:
   - OpenAI/Gemini: throw on missing API key (no more placeholder)
   - Executor: DANGEROUS_BASH_PATTERNS check at execution layer (defense-in-depth)
   - Path validation: lstatSync symlink detection and blocking
   - Redaction: +5 new patterns (Bearer, JWT, MongoDB, PostgreSQL, MySQL URIs)

### Enhancement PRDs Generated
1. `2026-02-23-budget-enforcement.md` — Cost guardrails (HIGH)
2. `2026-02-23-provider-fallback-retry.md` — Retry + fallback (HIGH)
3. `2026-02-23-security-hardening.md` — Security fixes (HIGH)
4. `2026-02-23-session-persistence.md` — Session resume (MEDIUM)
5. `2026-02-23-diff-preview-approval.md` — Diff before write (MEDIUM)
6. `2026-02-23-audit-logging.md` — JSONL audit logs (MEDIUM)
7. `2026-02-23-multi-provider-routing.md` — Smart cost routing (LOW)
8. `2026-02-23-memory-recall-integration.md` — Agent memory context (LOW)

### Per-Agent Optimization (completed earlier this session)
- 60 agents registered with tool categories and system prompts
- 6 tool categories: FULL(21), CODE(10), REVIEW(9), OPS(9), INSPECT(8), NONE(2)
- /agent command: activate, deactivate, list, info
- 65% of agents use fewer tools, saving 70-350 tokens per request

## Forge Session — 2026-02-15/16
- PRDs: 1 processed (competitive-leap)
- Stories: 17/17 implemented (ALL phases complete including Phase 5 moonshots)
- Issues: 6 security findings found, 5 fixed (1 info-only)
- Security: HARDENED (eval injection removed, mktemp secured, sed injection fixed)
- Knowledge: 10 entries harvested (4 decisions, 4 patterns, 2 errors)
- Tests: 25 new tests added — all passing (14 competitive-leap + 11 moonshot)
- Version: 1.9.0.15 → 1.9.0.16

## Current Focus
- Task: Competitive Leap — v1.9.0.16
- Story: Framework enhancement (observability + quality infrastructure)
- PRD: genesis/2026-02-15-competitive-leap.md
- Phase: complete (Forge pipeline finished)
- Agent: forge

## Stories Implemented (v1.9.0.16)
- [x] STORY-001: Fix known script bugs (harvest.sh, deprecated files)
- [x] STORY-002: GitHub Actions CI pipeline (multi-OS matrix)
- [x] STORY-003: CI sync verification (included in CI workflow)
- [x] STORY-004: Dead code cleanup (convert-to-copilot.sh, .project-registry-meta.jsonl)
- [x] STORY-005: Version bump 1.9.0.15 → 1.9.0.16
- [x] STORY-008: Agent Trace format (attribution.sh --format=agent-trace)
- [x] STORY-009: Prompt/Response capture (session-recorder.sh prompt)
- [x] STORY-010: Cost-aware routing (cost-router.sh + routing config)
- [x] STORY-011: Quality primer (agents/_quality-primer.md)
- [x] STORY-012: Rejection tracker (scripts/rejection-tracker.sh)
- [x] STORY-013: Self-improving quality rules (verified — already in rejection-tracker.sh)
- [x] STORY-014: A2A protocol agent cards (scripts/a2a-server.sh — 62 cards)
- [x] STORY-015: Arena mode (scripts/arena-evaluate.sh + agents/_arena-protocol.md)
- [x] STORY-016: Compliance-as-code pipeline (HIPAA/SOC2/GDPR profiles)
- [x] STORY-017: Compliance evidence collection (scripts/compliance-evidence.sh)

## Security Fixes Applied
1. CRITICAL: Removed eval() command injection in rejection-tracker.sh → replaced with jq filtering
2. CRITICAL: Secured mktemp with project-dir + chmod 600 in rejection-tracker.sh
3. HIGH: Replaced unsafe sed with awk for quality primer injection
4. HIGH: Replaced grep with jq for safe category filtering
5. MEDIUM: Added explicit category allowlist validation

## Key Decisions Made
1. jq for safe JSONL filtering (no eval, no grep with user input)
2. mktemp in project dir with chmod 600 (not /tmp)
3. Category validation via allowlist (closed enum)
4. Cost-aware routing disabled by default (opt-in)
5. Quality primer injected at generation time (not just gate validation)
6. Rejection tracker auto-proposes rules after 3+ identical rejections

## Files Created This Session
- .github/workflows/ci.yml: GitHub Actions CI pipeline
- scripts/cost-router.sh: Cost-aware agent routing
- scripts/rejection-tracker.sh: Gate rejection tracking + rule learning
- scripts/a2a-server.sh: A2A protocol agent cards (62 cards)
- scripts/arena-evaluate.sh: Arena mode evaluation engine
- scripts/compliance-evidence.sh: Compliance evidence collection + verification
- agents/_quality-primer.md: Quality-at-generation shared module
- agents/_cost-routing.md: Cost routing protocol
- agents/_prompt-capture.md: Prompt capture protocol
- agents/_arena-protocol.md: Arena competition protocol
- compliance/hipaa/: HIPAA profile (checks.sh, profile.json, README.md)
- compliance/soc2/: SOC2 profile (checks.sh, profile.json, README.md)
- compliance/gdpr/: GDPR profile (checks.sh, profile.json, README.md)
- compliance/evidence/.gitkeep: Evidence directory

## Files Modified This Session
- scripts/harvest.sh: Fixed --status bug (empty file + pipefail)
- scripts/attribution.sh: Added --format=agent-trace output
- scripts/session-recorder.sh: Added prompt capture support
- tests/run-tests.sh: Added 14 competitive-leap tests
- README.md: Added CI badge, fixed convert-to-copilot.sh reference
- CHANGELOG.md: Added [1.9.0.16] entry
- .version: 1.9.0.15 → 1.9.0.16

## Files Deleted This Session
- scripts/convert-to-copilot.sh: Deprecated (superseded by sync-platforms.sh)
- .project-registry-meta.jsonl: Empty 0-byte file

## Pre-existing Issues (Not Fixed)
- 3 test failures: coder.md, tester.md, architect.md missing reflection protocol references (P2)
- Test suite aborts on first failure due to set -e (needs || true on test invocations)
