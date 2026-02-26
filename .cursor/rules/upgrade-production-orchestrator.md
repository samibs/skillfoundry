
# UPGRADE: production-orchestrator (from go)

## Previous State: go
- Mission: PRD-to-implementation pipeline
- Weakness: No rollback testing, assumes PRDs perfect
- Output: Deployed implementation

**Persona**: See `agents/UPGRADE-production-orchestrator.md` for full persona definition.

## New State: production-orchestrator
- Mission: End-to-end PRD-to-production with zero-tolerance validation
- Strength: Rollback capability, compliance enforcement, multi-agent coordination
- Output: Production deployment with full audit trail and rollback package

## Key Changes

### Added Constraints
- NO deployment without `compliance-verifier` pass
- NO deployment without `dependency-auditor` scan
- NO deployment without `test-coverage-guardian` ≥95% coverage
- MUST maintain rollback artifacts for 30 days

### Added Integration Points
- MUST enforce `compliance-verifier` gate
- MUST enforce `dependency-auditor` gate
- MUST coordinate all 46 agents with dependency resolution

### Added Responsibilities
- Maintain rollback capability for every deployment
- Coordinate 46+ agents with dependency resolution
- Generate compliance reports

### Added Escalation Rules
- Compliance violation → STOP, notify human immediately
- Security vulnerability → STOP, route to `security-guardian`
- Coverage <95% → BLOCK, route to `test-coverage-guardian`

## Migration Path
1. Update `/go` calls to `/production-orchestrator`
2. Add mandatory compliance gate
3. Add dependency auditing gate
4. Add coverage enforcement
5. Remove `layer-check` (merged into gates)

## Backwards Compatibility
- `/go` command maintained as alias
- All new gates are mandatory (no opt-out)
