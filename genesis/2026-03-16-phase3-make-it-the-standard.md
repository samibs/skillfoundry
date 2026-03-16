# PRD: Phase 3 — Make It the Standard

---
prd_id: phase3-make-it-the-standard
title: "Phase 3: Make It the Standard"
version: 1.0
status: DRAFT
created: 2026-03-16
author: n00b73
last_updated: 2026-03-16

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: [competitive-leap, framework-evolution, correctness-contracts]
  recommends: [local-first-development, native-debugger-integration]
  blocks: []
  shared_with: [skillfoundry-cli-platform]

tags: [core, team, performance, distribution, testing]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

SkillFoundry v2.0.51 is a powerful solo-developer governance framework, but it cannot scale to teams. There is no mechanism for organizations to define shared gate thresholds, enforce policies via CI, or audit gate decisions across team members. Pipeline execution is sequential, making 10+ story runs slow (estimated 100-200s). Platform distribution requires manual script execution, and the benchmark suite lacks mutation testing and E2E validation with deterministic fixtures.

These gaps prevent SkillFoundry from becoming an organizational standard. Teams need shared configuration, auditability, and automated distribution. Performance must be fast enough that developers do not bypass gates. Testing must be rigorous enough to prove the framework catches real defects.

### 1.2 Proposed Solution

Phase 3 delivers four epics that complete the journey from solo tool to organizational standard:

- **Epic 9 (Team & Cloud Mode):** Team config file, shared memory bank, policy-as-code enforcement via CI, and append-only audit logging of all gate decisions.
- **Epic 10 (Pipeline Performance):** Parallel gate execution, file-hash caching, and incremental diff-based pipeline runs to achieve <90s for 10-story pipelines.
- **Epic 11 (Automated Platform Distribution):** Central skill registry, `sf publish` command with platform-specific transforms, and a GitHub Actions release workflow for tag-triggered publishing.
- **Epic 12 (Benchmark Suite & Mutation Testing):** 50-scenario quality benchmark, Stryker.js mutation testing on core modules, E2E pipeline tests with versioned LLM fixtures, and P95 gate latency enforcement.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| 10-story pipeline duration | ~150s (sequential) | <90s | `sf benchmark --perf` timing output |
| Gate cache hit rate on unchanged files | 0% (no caching) | >80% on incremental runs | Cache hit/miss counters in telemetry |
| Quality benchmark classification accuracy | N/A (no benchmark suite) | >90% on 50 scenarios | Benchmark test suite pass rate |
| Mutation score on gates.ts + pipeline.ts | N/A | >80% | Stryker.js mutation report |
| P95 gate latency per tier | Unmeasured | <500ms | Performance regression test suite |
| Platform publish success rate | Manual | 100% automated on tag push | GitHub Actions workflow status |
| Audit log completeness | No audit log | 100% gate decisions logged | Audit log entry count vs gate execution count |

---

## 2. User Stories

### Primary User: Team Lead / Engineering Manager

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | team lead | define org-wide gate thresholds in a single config file | all team members enforce the same quality standards | MUST |
| US-002 | team lead | review gate policy changes via pull request | policy changes are traceable and approved before enforcement | MUST |
| US-003 | team lead | view an append-only audit log of every gate decision | I can prove compliance and investigate failures | MUST |
| US-004 | team lead | share a team memory bank across machines | knowledge from one developer benefits the entire team | SHOULD |

### Primary User: Developer

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-005 | developer | run a 10-story pipeline in under 90 seconds | I do not context-switch while waiting for gates | MUST |
| US-006 | developer | skip gates for files I have not changed since the last successful run | I get faster feedback on incremental changes | MUST |
| US-007 | developer | run `sf run --diff` to evaluate only changed stories | I do not re-run the entire pipeline for a one-story fix | SHOULD |
| US-008 | developer | run `sf publish --platform cursor` to push skills | I do not manually copy and transform skill files | MUST |
| US-009 | developer | pin a specific skill version with `skills@2.1.0` syntax | I get deterministic behavior across environments | SHOULD |
| US-010 | developer | run `sf upgrade` to pull the latest skill versions | I stay current without manual intervention | SHOULD |

### Primary User: Framework Maintainer

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-011 | maintainer | push a Git tag and have npm + all 5 platforms + GitHub Release publish automatically | releases are zero-touch and consistent | MUST |
| US-012 | maintainer | run a 50-scenario quality benchmark to measure classification accuracy | I can prove the framework catches bad AI output | MUST |
| US-013 | maintainer | run Stryker.js mutation testing on gates.ts and pipeline.ts | I know the test suite actually catches regressions | MUST |
| US-014 | maintainer | run E2E pipeline tests against versioned LLM fixtures with no network calls | CI is deterministic and fast | MUST |
| US-015 | maintainer | enforce P95 <500ms per gate tier in CI | performance regressions are caught before merge | MUST |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Team config file | `skillfoundry.team.ts` at project root defining org-wide gate thresholds, banned patterns, and approved AI models | Given a team config file exists, When `sf run` executes, Then gate thresholds from the team config override defaults |
| FR-002 | Audit log | Append-only JSONL log of every gate decision with pass/fail, reason, actor, timestamp | Given any gate executes, When the gate returns a verdict, Then a JSONL entry is appended to `.skillfoundry/audit.jsonl` |
| FR-003 | Shared team memory | Self-hosted JSONL+vector store accessible across machines via Git | Given a team config with memory.remote set, When `sf memory sync` runs, Then local memory merges with the remote JSONL store |
| FR-004 | Policy as code | Gate configs versioned in Git and enforced via CI check | Given a `skillfoundry.team.ts` is committed, When CI runs `sf gates --policy-check`, Then the pipeline fails if project config violates team policy |
| FR-005 | Parallel gate execution | T1, T2, T4, T5 run concurrently via Promise.all() | Given gates T1-T6 are configured, When `sf gates` runs, Then T1+T2 run in parallel, T3 runs after T1+T2, T4+T5 run in parallel after T3, T6 runs last |
| FR-006 | File-hash gate caching | Gate results keyed by file SHA256 hash, unchanged files skip re-evaluation | Given a file was evaluated in the previous run, When the file SHA256 hash is unchanged, Then the cached gate result is returned without re-running the gate |
| FR-007 | Incremental pipeline | `sf run --diff` evaluates only stories changed since last successful run | Given a successful pipeline run exists, When `sf run --diff` is invoked, Then only stories with modified files since the last run are evaluated |
| FR-008 | Central skill registry | `skills/` directory as single source of truth for all platform skill files | Given a skill is defined in `skills/`, When `sf publish` runs, Then the skill is transformed for the target platform |
| FR-009 | sf publish command | `sf publish --platform cursor\|copilot\|codex\|gemini\|claude` with platform transforms | Given a skill in the registry, When `sf publish --platform cursor` runs, Then the skill is transformed and written to `.cursor/rules/` |
| FR-010 | Release workflow | GitHub Actions workflow: on tag push, auto-publish to npm + 5 platforms + GitHub Release | Given a `v*` tag is pushed, When the workflow triggers, Then npm publish, platform sync, and `gh release create` all succeed |
| FR-011 | Version pinning | `skills@2.1.0` syntax in team config, `sf upgrade` command | Given a team config pins `skills@2.1.0`, When `sf run` loads skills, Then the pinned version is used regardless of local version |
| FR-012 | Quality benchmark | 50 test scenarios (25 bad + 25 good AI outputs), >90% classification accuracy | Given the benchmark suite runs, When all 50 scenarios are evaluated, Then at least 45 are correctly classified |
| FR-013 | Mutation testing | Stryker.js on gates.ts and pipeline.ts, mutation score >80% | Given Stryker runs on gates.ts and pipeline.ts, When mutations are injected, Then >80% are killed by the test suite |
| FR-014 | E2E pipeline tests | 10 E2E runs against versioned LLM output fixtures, no network in CI | Given fixture files in `fixtures/llm-outputs/`, When E2E tests run, Then the pipeline executes against fixtures without network calls |
| FR-015 | P95 gate latency enforcement | P95 <500ms per gate tier, enforced in CI | Given gate latency is measured over 10+ runs, When P95 exceeds 500ms for any tier, Then CI fails with a performance regression error |

### 3.2 User Interface Requirements

This PRD is CLI-only. No GUI screens.

**CLI: sf publish**
- Purpose: Transform and distribute skills to target platforms
- Key elements: `--platform` flag (required), `--dry-run` flag (optional), `--all` flag (publish to all platforms)
- User flow: Developer runs `sf publish --platform cursor`, sees per-skill transform log, gets success/failure summary

**CLI: sf run --diff**
- Purpose: Incremental pipeline on changed stories only
- Key elements: `--diff` flag triggers incremental mode, `--base` flag to override base commit
- User flow: Developer runs `sf run --diff`, sees which stories are skipped (unchanged), evaluates only changed stories

**CLI: sf upgrade**
- Purpose: Upgrade pinned skill versions
- Key elements: `--check` flag for dry-run, `--latest` flag to upgrade all to latest
- User flow: Developer runs `sf upgrade --check`, sees available updates, runs `sf upgrade` to apply

### 3.3 API Requirements (if applicable)

No API endpoints. All functionality is CLI commands and CI integrations.

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| 10-story pipeline | <90 seconds total |
| Single gate tier P95 | <500ms (excluding T3 which depends on test suite size) |
| Cache lookup | <10ms per file hash check |
| `sf publish` per platform | <5 seconds |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Audit log integrity | Append-only JSONL; no delete/update operations; file permissions 0644 |
| Team config | No secrets in `skillfoundry.team.ts`; credentials via environment variables only |
| Memory sync | Git transport only (SSH or HTTPS); no custom network protocols |
| npm publish | Requires `NPM_TOKEN` in GitHub Actions secrets; scoped to `@skillfoundry` org |
| Input validation | All team config fields validated with Zod schema; max string length 1000 chars |
| Rate limiting | Not applicable (CLI tool, no server) |
| File uploads | Not applicable |
| Error handling | Structured error codes; no stack traces in production output |
| CORS policy | Not applicable (CLI tool) |
| Concurrent access | Audit log uses file-append with `fs.appendFileSync` for atomicity |

### 4.3 Scalability

The framework is a CLI tool running on developer machines. Scalability concerns are:
- Team config must support organizations up to 200 developers sharing a single config.
- Audit log must handle 10,000+ entries without degrading read performance (JSONL streaming).
- File-hash cache must support repositories with 50,000+ files (SQLite or flat-file with indexed lookups).

### 4.4 Reliability

| Metric | Target |
|--------|--------|
| Cache corruption recovery | Auto-invalidate and rebuild on hash mismatch |
| Audit log durability | fsync after each append; no data loss on crash |
| Pipeline resume on failure | Progressive persist already handles this; incremental mode extends it |
| Release workflow retry | GitHub Actions has built-in retry; workflow steps are idempotent |
| External service failure | npm publish failure does not block GitHub Release; each step independent |

### 4.5 Observability

| Aspect | Requirement |
|--------|-------------|
| Logging format | Structured log lines via existing `getLogger()` utility |
| Audit logging | Every gate decision: actor, gate tier, verdict, reason, duration, timestamp |
| Health check | `sf health` already exists; extend with cache status and audit log size |
| Performance metrics | Gate latency histograms persisted to `.skillfoundry/perf.jsonl` |

---

## 5. Technical Specifications

### 5.1 Architecture

```
skillfoundry.team.ts (project root)
    │
    ▼
sf_cli/src/core/team-config.ts  ← loads + validates team config
    │
    ├── gates.ts         ← reads thresholds from team config
    ├── audit-log.ts     ← append-only JSONL writer
    ├── gate-cache.ts    ← SHA256-keyed result cache
    └── pipeline.ts      ← parallel execution + incremental diff

sf_cli/src/commands/
    ├── publish.ts       ← sf publish --platform <target>
    ├── upgrade.ts       ← sf upgrade
    └── benchmark.ts     ← extended with 50 scenarios + perf regression

skills/                  ← canonical skill registry (single source of truth)
fixtures/llm-outputs/    ← versioned LLM output fixtures for E2E tests

.github/workflows/
    └── release.yml      ← tag-triggered release workflow
```

### 5.2 Data Model

**Entity: TeamConfig**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| version | string | semver format | Config schema version |
| org | string | 1-100 chars | Organization name |
| gates | GateThresholds | required | Per-tier pass/fail thresholds |
| bannedPatterns | string[] | max 500 entries | Additional banned patterns beyond defaults |
| approvedModels | string[] | max 50 entries | Allowed AI model identifiers |
| memory | MemoryConfig | optional | Shared memory bank configuration |
| skills | SkillPinConfig | optional | Version-pinned skill references |

**Entity: AuditEntry**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | string | UUID v4 | Unique entry identifier |
| timestamp | string | ISO 8601 | When the gate executed |
| actor | string | 1-200 chars | User or CI identity |
| gate | string | tier name | Gate tier (T1-T6, MG0, etc.) |
| verdict | string | pass/fail/warn/skip | Gate result |
| reason | string | 1-2000 chars | Human-readable explanation |
| durationMs | number | >=0 | Gate execution time in milliseconds |
| storyFile | string | optional | Story being evaluated |
| fileSha | string | optional | SHA256 of primary file evaluated |

**Entity: GateCacheEntry**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| fileSha256 | string | 64 hex chars | SHA256 hash of the file contents |
| gate | string | tier name | Which gate produced this result |
| verdict | string | pass/fail/warn | Cached verdict |
| reason | string | 1-2000 chars | Cached reason |
| cachedAt | string | ISO 8601 | When the result was cached |
| expiresAt | string | ISO 8601 | Cache TTL (default 24h) |

### 5.3 Dependencies

| Dependency | Version | Purpose | Risk if Unavailable |
|------------|---------|---------|---------------------|
| @stryker-mutator/core | ^8.x | Mutation testing | Epic 12 mutation testing blocked |
| @stryker-mutator/vitest-runner | ^8.x | Stryker + Vitest integration | Must fall back to command runner |
| zod | ^3.x (already installed) | Team config schema validation | Schema validation unavailable |
| node:crypto | built-in | SHA256 file hashing | No alternative needed |
| node:worker_threads | built-in | Parallel gate execution option | Fall back to Promise.all() |
| gh CLI | ^2.x | GitHub Release creation in workflow | Release step fails; npm still publishes |

### 5.4 Integration Points

| System | Integration Type | Purpose | Owner |
|--------|------------------|---------|-------|
| GitHub Actions | CI/CD workflow | Tag-triggered release pipeline | Framework maintainer |
| npm registry | Package publish | npm publish on tag push | Framework maintainer |
| Git remote | Data sync | Shared team memory bank via Git push/pull | Team lead |
| sync-platforms.sh | Script | Platform-specific skill transforms (already exists) | Framework |

---

## 6. Contract Specification

Not applicable. This PRD adds CLI commands and internal modules, not API endpoints. No entity cards, state transitions, permissions matrices, or API contracts are needed.

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- **Technical:** Must use existing TypeScript codebase in `sf_cli/src/`. No new runtime dependencies beyond Stryker for dev.
- **Technical:** Cloud hosting for shared memory is out of scope. Git is the only transport.
- **Technical:** Parallel gate execution must not change the gate result for any input (deterministic).
- **Resource:** Single maintainer; all features must be automatable and low-maintenance.

### 7.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| Promise.all() parallelism provides sufficient speedup | Pipeline may still exceed 90s target | Add worker_threads as fallback; profile and optimize hot paths |
| SHA256 hash computation is fast enough for 50k files | Cache overhead may negate gate savings | Batch hash computation; use incremental hashing |
| Stryker.js supports Vitest runner for TypeScript | May need custom configuration or command runner | Test Stryker + Vitest integration early in Epic 12 |
| JSONL audit log scales to 10k+ entries | Read queries may slow down | Add optional SQLite backend in future; stream reads |
| 5 platform transforms remain stable | Platform format changes break publish | Version the transform logic; add integration tests per platform |

### 7.3 Out of Scope

- Cloud-hosted shared memory (SaaS, S3, Redis) — future phase
- Web dashboard for audit log visualization — future phase
- GUI for team config management — CLI only
- Multi-tenant SaaS deployment of SkillFoundry
- Real-time collaboration or conflict resolution in shared memory
- AI model provider integrations for benchmark (uses static fixtures)
- Windows-native CI workflows (Linux and macOS only for release workflow)

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | Parallel gates introduce non-deterministic failures | M | H | Run parallel gates in isolated contexts; gate functions must be pure (no shared mutable state) |
| R-002 | File-hash cache stale results after gate logic changes | M | M | Include gate logic version hash in cache key; auto-invalidate on version bump |
| R-003 | Stryker mutation testing is slow on large files | H | L | Limit mutation scope to gates.ts and pipeline.ts only; set timeout per mutant |
| R-004 | npm publish token leaked in CI logs | L | H | Use GitHub Actions secrets; mask tokens; audit workflow YAML in PR review |
| R-005 | JSONL audit log grows unbounded | M | L | Add optional rotation (archive + compress after 10k entries); document manual cleanup |
| R-006 | Platform format changes break sf publish | M | M | Version transform functions; add per-platform integration test with snapshot |
| R-007 | Performance regression tests are flaky in CI | H | M | Use P95 over 10 runs (not single-run); allow 10% tolerance; mark as warning not failure on first breach |

---

## 9. Implementation Plan

### 9.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | Team Foundation | Team config, audit log, shared memory, policy-as-code (Epic 9) | Existing team-registry.ts, gates.ts |
| 2 | Performance | Parallel gates, file-hash caching, incremental pipeline (Epic 10) | Phase 1 (team config thresholds feed gates) |
| 3 | Distribution | Skill registry, sf publish, release workflow, version pinning (Epic 11) | Phase 1 (team config skill pins) |
| 4 | Testing Rigor | Quality benchmark, mutation testing, E2E fixtures, P95 enforcement (Epic 12) | Phase 2 (performance baseline needed) |

### 9.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 — Team Foundation | L | Med | Med |
| 2 — Performance | L | High | Med |
| 3 — Distribution | M | Med | Low |
| 4 — Testing Rigor | L | High | Med |

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

- [x] All MUST-priority user stories implemented
- [x] All 15 functional requirements pass acceptance criteria
- [x] Unit test coverage >= 80% for all new modules
- [x] Integration tests for all CLI commands
- [x] Mutation score >80% on gates.ts and pipeline.ts
- [x] Quality benchmark passes with >90% accuracy on 50 scenarios
- [x] 10-story pipeline completes in <90 seconds
- [x] P95 gate latency <500ms per tier (excluding T3)
- [x] GitHub Actions release workflow succeeds on test tag
- [x] Documentation updated (CHANGELOG, command --help text)
- [x] No critical/high severity bugs open

### 10.2 Sign-off Required

| Role | Name | Status | Date |
|------|------|--------|------|
| Technical Lead | n00b73 | Pending | |
| Framework QA | automated (CI) | Pending | |

---

## 11. Appendix

### 11.1 Glossary

| Term | Definition | Code Name |
|------|------------|-----------|
| Team config | Organization-wide configuration file for SkillFoundry | `skillfoundry.team.ts` |
| Audit entry | Single JSONL record of a gate decision | `AuditEntry` |
| Gate cache | SHA256-keyed store of previous gate results | `GateCacheEntry` |
| Incremental pipeline | Pipeline mode that evaluates only changed stories | `--diff` flag |
| Skill registry | Canonical `skills/` directory as source of truth | `skills/` |
| Platform transform | Function converting a skill to platform-specific format | `PlatformTransform` |
| Mutation score | Percentage of injected mutations killed by tests | Stryker report metric |
| P95 latency | 95th percentile gate execution time | `p95Ms` |

### 11.2 References

- [Stryker.js documentation](https://stryker-mutator.io/docs/)
- [GitHub Actions release workflow](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- Existing sync-platforms.sh: `scripts/sync-platforms.sh`
- Existing gates: `sf_cli/src/core/gates.ts`
- Existing pipeline: `sf_cli/src/core/pipeline.ts`
- Existing benchmark: `sf_cli/src/commands/benchmark.ts`
- Existing team registry: `sf_cli/src/core/team-registry.ts`

### 11.3 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-16 | n00b73 | Initial draft covering Epics 9-12 |
