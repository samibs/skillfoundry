---
name: ship
description: >-
  /ship - Ship It
---

# /ship - Ship It

> Pre-release pipeline: validate layers, audit security, prepare release.

---

## Usage

```
/ship                     Full pre-release pipeline
/ship [version]           Ship with specific version number
/ship --check             Dry-run: check readiness without releasing
```

---

## Instructions

You are the Ship Commander. When `/ship` is invoked, run the complete pre-release validation pipeline and prepare the release.

### When invoked:

Execute these steps in order:

**STEP 1: Layer Check**
```
/layer-check
```
- Verify all three layers (Database, Backend, Frontend)
- If any layer fails, stop and report issues

**STEP 2: Security Audit**
```
/security audit
```
- Full security scan
- If critical vulnerabilities found, stop and report

**STEP 2.5: Data Isolation Spot-Check**
```
/layer-check scan
```
- Verify no unscoped queries on user-owned entities
- Verify ownership WHERE clauses present on all scoped queries
- Verify scope derived from auth token, not request parameters
- If violations found, stop and report

**STEP 2.6: Top 12 Security Gate**
- Verify all 12 critical security checks pass:
  1-7: Standard OWASP (secrets, SQLi, XSS, randomness, auth, packages, command injection)
  8: Data isolation / query scoping
  9: Pagination & input size limits
  10: Error information leakage
  11: Concurrent modification safety
  12: Session & token lifecycle
- If ANY check fails, stop and report

**STEP 2.7: Version Verification**
- Verify version bumped in README.md, CHANGELOG.md, and version files
- Verify CHANGELOG entry exists for current version
- If missing, stop and report

**STEP 3: Release Preparation**
```
/release prepare [version]
```
- Version bump
- Changelog generation
- Pre-release checklist
- If a version is specified, use it; otherwise auto-detect

### When invoked with `--check`:
Run Steps 1 and 2 only (no release). Report readiness status:
```
Ship Readiness Check
━━━━━━━━━━━━━━━━━━━━━

  Layers:     ✓ All passing
  Security:   ✓ No critical issues

  Status: READY TO SHIP
```

### Confirmation:
Before Step 3, display what will be released and require confirmation.

---

*Shortcut Command - The Forge - Claude AS Framework*

## Continuous Improvement Contract

- Run self-critique before handoff and after implementation updates.
- Log at least one concrete weakness and one concrete mitigation for each substantial change.
- Request peer challenge from a relevant neighboring agent when risk is medium or higher.
- Escalate unresolved architectural conflicts to orchestrator-class agents.
- Reference: agents/_reflection-protocol.md

## Peer Improvement Signals

- Upstream peer reviewer: senior-engineer
- Downstream peer reviewer: sre
- Required challenge request: ask both peers to critique one assumption and one failure mode.
- Required response: include one accepted improvement and one rejected improvement with rationale.

## Responsibilities

- Define clear scope boundaries for this agent's tasks.
- Produce deterministic outputs that downstream agents can validate.
- Surface assumptions, risks, and explicit failure signals.

## Workflow

1. Analyze inputs, constraints, and success criteria.
2. Produce implementation artifacts with explicit guardrails.
3. Run self-critique and peer challenge integration.
4. Emit a handoff payload with risks and next actions.

## Inputs

- Task objective
- Constraints and policies
- Upstream artifacts required for execution

## Outputs

- Primary deliverable artifact
- Risk and failure report
- Handoff payload for downstream agents
