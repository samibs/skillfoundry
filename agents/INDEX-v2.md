---
name: agent-index-v2
command: agent-index
description: Reference index of the enterprise agent architecture with tier hierarchy, governance model, and escalation protocols.
color: gray
---

# Agent Index v2.0

## Enterprise Agent Architecture

**Last Updated:** 2026-07-06
**Total Agents:** 61 (AGENT_REGISTRY, test-enforced) · 56 persona files · 52 slash-command skills
**New Agents (Pass 2):** hotfix, health
**New Protocol Modules (Pass 2):** _convention-discovery, _evaluator-calibration, _audit-export, _profile-resolution
**New Protocol Modules (v5.20.0):** _ralph-loop-protocol, _self-prompt-protocol
**New Commands (v5.20.0):** /improve (continuous improvement loop)
**New Capability (v5.21.0):** /docs wiki — Codebase Agent Wiki (documentation-codifier Phase 7)
**Refinement Pass (v5.22.0):** reflection/peer/context boilerplate collapsed, /gosm·/goma·/blitz thin aliases, Anvil tiers → A-namespace (distinct from CLI gates T0–T7)
**State Isolation:** .claude/local/ (gitignored) + .claude/shared/ (committed)
**Governance Model:** 5-tier hierarchy with escalation protocols
**Loop Engine:** Ralph Loop (_ralph-loop-protocol.md) — agent-prompts-self pattern

---

## Strategic Tier (3 agents)

| Agent | Mission | Key Constraints |
|-------|---------|-----------------|
| `production-orchestrator` | End-to-end PRD-to-production pipeline | NO deployment without compliance + dependency + coverage gates |
| `compliance-verifier` | Real-time compliance validation | NO deployment without compliance pass; 7-year audit retention |
| `security-guardian` | Continuous security validation | NO critical vulnerabilities; daily CVE updates |

## Architectural Tier (3 agents)

| Agent | Mission | Key Constraints |
|-------|---------|-----------------|
| `architect` | System design decisions | Cost-aware; operational complexity considered |
| `data-architect` | Database design | Query performance validated; N+1 prevention |
| `refactoring-strategist` | Safe refactoring guidance | Security preservation; architecture conformance |

## Validation Tier (5 agents)

| Agent | Mission | Key Constraints |
|-------|---------|-----------------|
| `gate-keeper` | Quality validation | Architecture + PRD conformance, not just syntax |
| `test-coverage-guardian` | Coverage enforcement | ≥95% coverage; all error paths tested |
| `dependency-auditor` | Supply chain security | NO CVSS >7.0; SBOM generation |
| `regression-prevention` | Change impact analysis | Risk score 1-10; blast radius documented |
| `web-security-checker` | Live URL surface validation | Mandatory for public-facing URLs; BLOCKER stops promotion |

## Execution Tier (8 agents)

| Agent | Mission | Key Constraints |
|-------|---------|-----------------|
| `feature-lifecycle` | Per-feature pipeline: implement→testloop→challenge→document→commit | No commit without ✅ evaluator; no docs without green tests; 🚫 verdict always halts |
| `secure-coder` | Secure implementation | Security review + documentation mandatory |
| `tester` | Test generation | Expected results documented; edge cases covered |
| `testloop` | Implement→test→fix feedback loop | Max 5 iterations; oscillation detection halts loop; Playwright-first for E2E |
| `refactor` | Code optimization | Security impact analysis; architecture preservation |
| `migration` | Schema changes | Data validation; rollback tested |
| `performance` | Optimization | Stability-aware; memory profiling |
| `docs` | Documentation | Test documentation; API references |

## Execution Tier — Emergency (1 agent)

| Agent | Mission | Key Constraints |
|-------|---------|-----------------|
| `hotfix` | Emergency production fix | Semgrep hard blocks always active; mandatory follow-up story; audit trail entry required |

## Monitoring Tier (5 agents)

| Agent | Mission | Key Constraints |
|-------|---------|-----------------|
| `sre` | Site reliability | Self-healing; alert fatigue prevention |
| `performance-guardian` | Production performance | SLO monitoring; 7-day capacity prediction |
| `failure-analysis` | Incident analysis | 24-hour SLA; 5 Whys methodology |
| `build-stability` | CI/CD reliability | 95% success rate; flake detection |
| `health` | Framework health diagnostics | Detects config drift, stale state, audit gaps; never reports PASS without checking |

## Support Agents (33 agents)

See full list in INDEX-v1.md - these support the core 20 agents above.

---

## New in v2.0

### Added Agents — Pass 1 (12)
1. `failure-analysis` - Post-mortem automation
2. `compliance-verifier` - Real-time compliance
3. `test-coverage-guardian` - Coverage enforcement
4. `dependency-auditor` - Supply chain security
5. `regression-prevention` - Change impact analysis
6. `spec-consistency` - PRD drift detection
7. `performance-guardian` - Production performance
8. `refactoring-strategist` - Safe refactoring
9. `build-stability` - CI/CD reliability
10. `web-security-checker` - Live URL surface validation (pre-production promotion gate)
11. `testloop` - Closed-loop implementation validator: run tests → parse failures → fix → repeat until green or oscillation detected
12. `feature-lifecycle` - Per-feature pipeline orchestrator: implement → testloop → evaluator challenge → coder feedback → document → commit

### Added Agents — Pass 2 (2)
13. `hotfix` - Emergency fix pathway: Semgrep hard blocks always active, smoke test only, mandatory follow-up story, audit entry
14. `health` - Framework health diagnostics: config integrity, stale state cleanup, audit trail validity, protocol module presence

### New Protocol Modules — Pass 2 (4)
- `_convention-discovery` - Detects project conventions (changelog, commit format, test naming) before applying SkillFoundry defaults
- `_evaluator-calibration` - Stores project-specific evaluator corrections; loaded as context on every evaluation run
- `_audit-export` - Append-only audit trail (logs/audit-trail.jsonl) + optional webhook for external durability
- `_profile-resolution` - Merge order: global profile → team profile → project config → CLI flags

### State Architecture (Pass 2)
- `.claude/local/` — gitignored, machine-specific: execution-context.json, *-state.json, *-results.json
- `.claude/shared/` — committed, team-visible: config.json, stack-profile.json, conventions.json, evaluator-calibration.json, team-profile.json

### Upgraded Agents (3)
| Original | New | Key Improvements |
|----------|-----|------------------|
| `ruthless-coder` | `secure-coder` | Mandatory security review, auto-documentation |
| `security-specialist` | `security-guardian` | Runtime monitoring, SBOM generation |
| `go` | `production-orchestrator` | Rollback capability, compliance gates |

### Merged Agents (2)
- `security-scanner` → merged into `security-guardian`
- `layer-check` → merged into `production-orchestrator` gates

---

## Governance

See `_governance-model.md` for:
- Agent hierarchy
- Communication rules
- Conflict resolution
- Escalation procedures

## Quick Reference

### Deployment Gate Sequence
```
1. secure-coder implements
2. security-guardian validates
3. test-coverage-guardian validates ≥95%
4. dependency-auditor scans
5. compliance-verifier validates
6. web-security-checker validates live URL (public-facing projects)
7. production-orchestrator deploys
```

### Escalation Path
```
Execution → Validation → Architectural → Strategic → Human
```

---

**System Status:** ✅ PRODUCTION-READY
**Zero Tolerance:** ✅ ACHIEVED
**Stop Condition:** ✅ MET
