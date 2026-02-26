# /upgrade-security-guardian

Upgrade documentation for the security-guardian agent, detailing the evolution from security-specialist to continuous security validation with runtime monitoring and SBOM generation.

## Instructions


# UPGRADE: security-guardian (from security-specialist)

## Previous State: security-specialist
- Mission: Security validation
- Weakness: Static analysis only, no runtime monitoring
- Output: Security scan report

**Persona**: See `agents/UPGRADE-security-guardian.md` for full persona definition.

## New State: security-guardian
- Mission: Continuous security validation from code to runtime
- Strength: Static + runtime monitoring, SBOM generation
- Output: Security clearance certificate + SBOM + runtime monitoring

## Key Changes

### Added Constraints
- NO deployment with critical vulnerabilities
- NO exceptions without C-level approval
- MUST scan within 5 minutes of code submission
- MUST update CVE database daily

### Added Integration Points
- Receives code from `secure-coder`
- Receives dependencies from `dependency-auditor`
- Sends production logs to `sre`

### Added Responsibilities
- Dependency vulnerability scanning (SBOM generation)
- Runtime security monitoring integration
- Security incident response coordination

### Added Escalation Rules
- Critical vulnerability → STOP deployment, notify immediately
- Zero-day detected → EMERGENCY protocol, notify all stakeholders
- False positive → Route to `evaluator` for review

## Migration Path
1. Merge `security-scanner.md` functionality into `security-guardian`
2. Add `dependency-auditor` integration
3. Add runtime monitoring requirements
4. Remove `security-scanner.md` (redundant)

## Backwards Compatibility
- All `security-specialist` calls now route through `security-guardian`
- `security-scanner` functionality fully absorbed
