# Agent Governance Model

## 1. Agent Hierarchy

### Strategic Tier (Final Authority)
| Agent | Decision Rights | Scope |
|-------|----------------|-------|
| `production-orchestrator` | Final veto on all deployments | All production changes |
| `compliance-verifier` | Veto on compliance violations | Regulatory requirements |
| `security-guardian` | Veto on security issues | Security posture |

### Architectural Tier (Design Authority)
| Agent | Decision Rights | Scope |
|-------|----------------|-------|
| `architect` | System design decisions | Overall architecture |
| `data-architect` | Database schema decisions | Data layer |
| `refactoring-strategist` | Structural change approval | Code structure |

### Validation Tier (Quality Gates)
| Agent | Decision Rights | Scope |
|-------|----------------|-------|
| `gate-keeper` | Code quality approval | Implementation quality |
| `test-coverage-guardian` | Coverage enforcement | Test completeness |
| `dependency-auditor` | Dependency approval | Supply chain |
| `regression-prevention` | Risk-based testing | Change safety |

### Execution Tier (Task Completion)
| Agent | Decision Rights | Scope |
|-------|----------------|-------|
| `secure-coder` | Implementation approach | Feature delivery |
| `tester` | Test strategy | Validation approach |
| `refactor` | Refactoring execution | Code improvement |
| `migration` | Migration execution | Schema changes |

### Monitoring Tier (Production Observation)
| Agent | Decision Rights | Scope |
|-------|----------------|-------|
| `sre` | Production health | System reliability |
| `performance-guardian` | Performance SLOs | Latency/capacity |
| `failure-analysis` | Incident analysis | Root cause |
| `build-stability` | Pipeline health | CI/CD reliability |

## 2. Communication Rules

### Who Can Instruct Who
```
Strategic → All tiers (override authority)
Architectural → Execution, Validation (design constraints)
Validation → Execution (feedback loop)
Execution → Monitoring (observability requirements)
```

### Who Can Veto Changes
- `production-orchestrator` → ANY deployment
- `security-guardian` → Security-related
- `compliance-verifier` → Compliance-related
- `test-coverage-guardian` → Coverage-related

### Who Must Review Changes
- ALL code → `security-guardian` + `gate-keeper`
- ALL deployments → `production-orchestrator`
- ALL architecture changes → `architect` + `refactoring-strategist`

## 3. Conflict Resolution Rules

### When Agents Disagree

| Conflict Type | Required Evidence | Required Tests | Required Documentation |
|---------------|-------------------|----------------|------------------------|
| Security vs. Speed | CVE report, exploit PoC | Security test, performance benchmark | Risk assessment, mitigation plan |
| Architecture vs. Delivery | Architecture design, delivery impact | Load test, scalability test | ADR (Architecture Decision Record) |
| Quality vs. Timeline | Coverage report, defect rate | Full regression test | Business impact analysis |
| Two Valid Approaches | Both approaches documented | Prototype comparison | Decision matrix with trade-offs |

### Resolution Process
1. Both agents submit evidence within 1 hour
2. `evaluator` assesses technical merit
3. If still contested, escalate to Strategic tier
4. If Strategic tier split, human decision required
5. Decision logged in `memory` for future reference

## 4. Escalation Matrix

| Issue Type | First Response | Escalation Path | SLA |
|------------|---------------|-----------------|-----|
| Critical security vulnerability | STOP deployment | `security-guardian` → human | Immediate |
| Compliance violation | STOP deployment | `compliance-verifier` → human | Immediate |
| Coverage <95% | BLOCK deployment | `test-coverage-guardian` → `secure-coder` | 1 hour |
| Architecture conflict | HOLD decision | `architect` → Strategic tier | 4 hours |
| Performance SLO breach | ALERT | `performance-guardian` → `sre` | 5 minutes |
| Incident pattern detected | ANALYZE | `failure-analysis` → Strategic tier | 24 hours |

## 5. Decision Authority Levels

### Level 1: Execution (Auto-approved)
- Code implementation within approved architecture
- Test generation for approved stories
- Documentation generation for existing features

### Level 2: Validation (Requires approval)
- Code deployment to staging
- Architecture changes within existing patterns
- Dependency updates (minor versions)

### Level 3: Strategic (Requires human)
- Production deployments
- Breaking API changes
- Security policy changes
- Compliance framework updates

## 6. Audit Requirements

Every decision must log:
- Decision maker (agent or human)
- Timestamp
- Evidence referenced
- Dissenting opinions (if any)
- Escalation path taken
- Outcome

Retention: 7 years for compliance, 1 year for operational decisions
