# Escalation Procedures

## Emergency Escalations (Immediate)

### Critical Security Vulnerability
**Trigger:** CVSS >7.0 detected in production
```
1. STOP all deployments immediately
2. Notify security-guardian (immediate)
3. Isolate affected systems
4. Human notification within 5 minutes
5. Emergency response protocol activated
```

### Compliance Violation
**Trigger:** GDPR/HIPAA/SOC2 violation detected
```
1. STOP all data processing
2. Notify compliance-verifier (immediate)
3. Document violation scope
4. Legal team notification within 15 minutes
5. Regulatory notification (if required)
```

### Production Outage
**Trigger:** >1% error rate or SLO breach
```
1. Alert sre (immediate)
2. Activate incident commander (human)
3. Begin incident response
4. Customer communication (if required)
5. Post-mortem scheduled
```

## Standard Escalations (Within SLA)

### Coverage Shortfall
**Trigger:** Coverage <95% at deployment
```
1. BLOCK deployment
2. Route to test-coverage-guardian (1 hour SLA)
3. Generate missing tests
4. Re-validate coverage
5. Approve or escalate to human
```

### Architecture Conflict
**Trigger:** Two valid architectural approaches
```
1. HOLD decision
2. Both approaches documented by architect (4 hours)
3. evaluator assesses technical merit
4. Strategic tier reviews
5. Human decision if still contested
```

### Dependency Vulnerability
**Trigger:** CVE in dependency
```
1. BLOCK update
2. dependency-auditor identifies alternatives (1 hour)
3. security-guardian assesses risk
4. Approve alternative or escalate
5. Document decision in audit log
```

## Escalation Evidence Requirements

### For Blocking Issues
- [ ] Specific violation identified
- [ ] Impact assessment documented
- [ ] Proposed resolution or options
- [ ] Time-sensitive justification

### For Architecture Decisions
- [ ] Both approaches documented
- [ ] Trade-off matrix provided
- [ ] Prototype results (if available)
- [ ] Recommendation with rationale

### For Compliance Questions
- [ ] Regulatory requirement referenced
- [ ] Implementation details reviewed
- [ ] Risk assessment completed
- [ ] Legal opinion (if required)

## Communication Templates

### Security Escalation Template
```
🚨 SECURITY ESCALATION

Agent: [name]
Timestamp: [time]
Severity: [Critical/High/Medium]
CVE/Severity: [if applicable]

Description:
[What was detected]

Impact:
[Scope of vulnerability]

Immediate Actions Taken:
[What was stopped/blocked]

Recommended Next Steps:
[Options for resolution]

Requires human decision: [YES/NO]
```

### Architecture Escalation Template
```
🏗️ ARCHITECTURE ESCALATION

Agents in Conflict: [agent A] vs [agent B]
Timestamp: [time]
Context: [story/feature]

Approach A:
- Summary: [brief]
- Pros: [list]
- Cons: [list]

Approach B:
- Summary: [brief]
- Pros: [list]
- Cons: [list]

evaluator Recommendation: [if available]

Requires human decision: [YES/NO]
```

## Escalation Tracking

All escalations logged in:
- Location: `.claude/escalations/`
- Format: `YYYY-MM-DD-HHMM-[agent]-[type].md`
- Retention: 2 years
- Review: Weekly by strategic tier
