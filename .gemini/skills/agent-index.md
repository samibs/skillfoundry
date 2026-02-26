# /agent-index

Reference index of the 53-agent enterprise architecture with tier hierarchy, governance model, and escalation protocols.

## Instructions


# Agent Index v2.0

## 53-Agent Enterprise Architecture

**Last Updated:** 2026-02-22
**Total Agents:** 53 (46 original + 9 new - 2 merged)
**Governance Model:** 5-tier hierarchy with escalation protocols

**Persona**: See `agents/INDEX-v2.md` for full persona definition.


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

## Validation Tier (4 agents)

| Agent | Mission | Key Constraints |
|-------|---------|-----------------|
| `gate-keeper` | Quality validation | Architecture + PRD conformance, not just syntax |
| `test-coverage-guardian` | Coverage enforcement | ≥95% coverage; all error paths tested |
| `dependency-auditor` | Supply chain security | NO CVSS >7.0; SBOM generation |
| `regression-prevention` | Change impact analysis | Risk score 1-10; blast radius documented |

## Execution Tier (6 agents)

| Agent | Mission | Key Constraints |
|-------|---------|-----------------|
| `secure-coder` | Secure implementation | Security review + documentation mandatory |
| `tester` | Test generation | Expected results documented; edge cases covered |
| `refactor` | Code optimization | Security impact analysis; architecture preservation |
| `migration` | Schema changes | Data validation; rollback tested |
| `performance` | Optimization | Stability-aware; memory profiling |
| `docs` | Documentation | Test documentation; API references |

## Monitoring Tier (4 agents)

| Agent | Mission | Key Constraints |
|-------|---------|-----------------|
| `sre` | Site reliability | Self-healing; alert fatigue prevention |
| `performance-guardian` | Production performance | SLO monitoring; 7-day capacity prediction |
| `failure-analysis` | Incident analysis | 24-hour SLA; 5 Whys methodology |
| `build-stability` | CI/CD reliability | 95% success rate; flake detection |

## Support Agents (33 agents)

See full list in INDEX-v1.md - these support the core 20 agents above.


## New in v2.0

### Added Agents (9)
1. `failure-analysis` - Post-mortem automation
2. `compliance-verifier` - Real-time compliance
3. `test-coverage-guardian` - Coverage enforcement
4. `dependency-auditor` - Supply chain security
5. `regression-prevention` - Change impact analysis
6. `spec-consistency` - PRD drift detection
7. `performance-guardian` - Production performance
8. `refactoring-strategist` - Safe refactoring
9. `build-stability` - CI/CD reliability

### Upgraded Agents (3)
| Original | New | Key Improvements |
|----------|-----|------------------|
| `ruthless-coder` | `secure-coder` | Mandatory security review, auto-documentation |
| `security-specialist` | `security-guardian` | Runtime monitoring, SBOM generation |
| `go` | `production-orchestrator` | Rollback capability, compliance gates |

### Merged Agents (2)
- `security-scanner` → merged into `security-guardian`
- `layer-check` → merged into `production-orchestrator` gates


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
6. production-orchestrator deploys
```

### Escalation Path
```
Execution → Validation → Architectural → Strategic → Human
```


**System Status:** ✅ PRODUCTION-READY
**Zero Tolerance:** ✅ ACHIEVED
**Stop Condition:** ✅ MET
