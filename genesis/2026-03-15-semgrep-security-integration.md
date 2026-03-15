# PRD: Semgrep Security Integration

---
prd_id: semgrep-security-integration
title: Semgrep Security Integration
version: 1.0
status: DRAFT
created: 2026-03-15
author: SkillFoundry Team
last_updated: 2026-03-15

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []
  recommends: []
  blocks: []
  shared_with: [real-autonomous-agents]

tags: [security, core, quality-gates]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

SkillFoundry's README and `/security audit` command claim "OWASP top 10 scan" capability, but the actual implementation is regex-based pattern matching. The T4 gate in `gates.ts` greps for hardcoded secrets (`password=`, `api_key=`, `secret=`, `PRIVATE KEY`) and `anvil.sh` does banned pattern detection. While useful, this is not OWASP scanning — it cannot detect injection flaws, broken authentication patterns, XSS sinks, insecure deserialization, or any of the language-aware semantic vulnerabilities that OWASP covers. This was flagged as a credibility gap by external assessment.

### 1.2 Proposed Solution

Integrate Semgrep — an open-source, fast, language-aware SAST engine — into the Anvil T4 gate and `/security audit` command. Semgrep supports custom rules, has official OWASP rule packs, runs locally (no data leaves the machine), and supports TypeScript, JavaScript, Python, Go, Java, C#, and more. The existing regex patterns remain as a fast fallback when Semgrep is not installed.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| OWASP coverage | 0/10 categories | 10/10 categories scanned | Semgrep OWASP rule pack covers all 10 |
| Vulnerability detection | Regex for 4 secret patterns | Language-aware SAST across all supported languages | Run against known-vulnerable test fixtures |
| Scan speed | <1s (regex) | <30s for full project scan | Time the T4 gate |
| False positive rate | N/A (too few detections) | <10% false positive rate on real projects | Manual review of findings |

---

## 2. User Stories

### Primary User: Developer

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | run `/security audit` and get real OWASP findings | I know if my code has actual security vulnerabilities | MUST |
| US-002 | developer | see findings with severity levels (CRITICAL/HIGH/MEDIUM/LOW) | I can prioritize what to fix first | MUST |
| US-003 | developer | have the T4 gate use Semgrep automatically when installed | security scanning improves without changing my workflow | MUST |
| US-004 | developer | get a clear report with file paths, line numbers, and fix suggestions | I can fix vulnerabilities efficiently | MUST |
| US-005 | developer | have the framework work without Semgrep (graceful fallback) | I can still use the framework if Semgrep isn't installed | MUST |
| US-006 | developer | add custom Semgrep rules for my project | I can enforce project-specific security policies | SHOULD |
| US-007 | developer | see which OWASP categories were scanned | I can verify coverage claims | SHOULD |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Semgrep Detection | Detect if Semgrep is installed (`semgrep --version`) and cache the result | Given a system with Semgrep installed, When T4 runs, Then Semgrep is used. Given a system without Semgrep, When T4 runs, Then regex fallback is used with a warning |
| FR-002 | OWASP Rule Pack | Use Semgrep's `p/owasp-top-ten` rule pack for comprehensive scanning | Given a TypeScript project with XSS vulnerability, When T4 runs with Semgrep, Then the XSS finding is reported with OWASP category |
| FR-003 | Severity Mapping | Map Semgrep findings to CRITICAL/HIGH/MEDIUM/LOW/INFO severity levels | Given Semgrep JSON output, When findings are processed, Then each finding has a normalized severity level |
| FR-004 | T4 Gate Integration | Replace the regex-only T4 gate with Semgrep-first, regex-fallback scanning | Given a project, When runT4() executes, Then Semgrep runs first (if available), then regex patterns run for anything Semgrep doesn't cover (secrets detection) |
| FR-005 | Structured Report | Generate a structured security report from scan results | Given scan results, When the report is generated, Then it includes: summary counts by severity, OWASP categories covered, per-finding details (file, line, rule, severity, message, fix suggestion) |
| FR-006 | /security audit Integration | Update the `/security audit` command to use Semgrep when available | Given Semgrep is installed, When `/security audit` runs, Then it executes Semgrep with OWASP rules and presents findings |
| FR-007 | Custom Rules Support | Support project-local `.semgrep/` rules directory | Given a `.semgrep/` directory with custom rules, When Semgrep runs, Then custom rules are included alongside OWASP rules |
| FR-008 | Gate Verdict Logic | T4 verdict: FAIL on any CRITICAL/HIGH, WARN on MEDIUM/LOW, PASS on clean | Given findings with severity HIGH, When T4 produces its verdict, Then status is 'fail' |
| FR-009 | Install Guide | Provide clear install instructions when Semgrep is not found | Given Semgrep is not installed, When T4 runs, Then output includes install instructions for the detected platform |
| FR-010 | Scan Target Filtering | Exclude node_modules, dist, .git, and other non-source directories from scanning | Given a project with node_modules, When Semgrep runs, Then node_modules is excluded |

### 3.2 OWASP Top 10 Coverage Matrix

| # | OWASP Category | Semgrep Rule Pack | Detection Type |
|---|----------------|-------------------|----------------|
| A01 | Broken Access Control | `p/owasp-top-ten` | Semantic: missing auth checks, IDOR patterns |
| A02 | Cryptographic Failures | `p/owasp-top-ten` | Semantic: weak algorithms, hardcoded secrets |
| A03 | Injection | `p/owasp-top-ten` | Semantic: SQL injection, command injection, XSS |
| A04 | Insecure Design | Custom rules | Pattern: missing rate limiting, missing validation |
| A05 | Security Misconfiguration | `p/owasp-top-ten` | Semantic: debug mode, verbose errors, default creds |
| A06 | Vulnerable Components | Separate (npm audit) | Dependency check — out of scope for Semgrep |
| A07 | Auth Failures | `p/owasp-top-ten` | Semantic: weak passwords, missing MFA, session issues |
| A08 | Data Integrity Failures | `p/owasp-top-ten` | Semantic: insecure deserialization, unsigned updates |
| A09 | Logging Failures | Custom rules | Pattern: missing audit logging, PII in logs |
| A10 | SSRF | `p/owasp-top-ten` | Semantic: unvalidated URL inputs |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| Full scan time | < 30s for a 10,000-line project |
| Incremental scan | Support `--include` for scanning only changed files |
| Memory usage | Semgrep process should not exceed 512MB |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Data locality | All scanning happens locally — no data sent to external services |
| Rule integrity | OWASP rules downloaded from official Semgrep registry |
| Output sanitization | Scan results must not include file contents that could contain secrets in CI logs |

---

## 5. Technical Specifications

### 5.1 Architecture

```
┌──────────────────────────────────────────────┐
│           /security audit  OR  T4 Gate        │
└──────┬───────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│          semgrep-scanner.ts                   │
│  ┌─────────────────────────────────────┐     │
│  │ detectSemgrep()                      │     │
│  │ runSemgrepScan(target, rules)        │     │
│  │ parseSemgrepOutput(json)             │     │
│  │ generateSecurityReport(findings)     │     │
│  │ mapSeverity(semgrepSeverity)         │     │
│  └─────────────────────────────────────┘     │
└──────┬───────────────────────────────────────┘
       │
       ├──→ Semgrep CLI (if installed)
       │     semgrep scan --config p/owasp-top-ten
       │                  --config .semgrep/
       │                  --json --quiet
       │
       └──→ Regex Fallback (if Semgrep not installed)
             (existing pattern matching from gates.ts)
```

### 5.2 Data Model

**SecurityFinding:**
| Field | Type | Description |
|-------|------|-------------|
| id | `string` | Unique finding ID (from Semgrep rule ID or generated) |
| severity | `'CRITICAL' \| 'HIGH' \| 'MEDIUM' \| 'LOW' \| 'INFO'` | Normalized severity |
| category | `string` | OWASP category (e.g., "A03:2021 Injection") |
| rule | `string` | Semgrep rule ID or regex pattern name |
| message | `string` | Human-readable description |
| file | `string` | Relative file path |
| line | `number` | Line number |
| column | `number` | Column number |
| snippet | `string` | Code snippet showing the finding (max 200 chars) |
| fix | `string \| null` | Suggested fix (if available from Semgrep) |
| source | `'semgrep' \| 'regex'` | Which scanner produced this finding |

**SecurityReport:**
| Field | Type | Description |
|-------|------|-------------|
| scannerVersion | `string` | Semgrep version or 'regex-fallback' |
| scanDurationMs | `number` | Total scan time |
| target | `string` | Scanned directory |
| findings | `SecurityFinding[]` | All findings |
| summary | `{ critical: number, high: number, medium: number, low: number, info: number }` | Counts by severity |
| owaspCoverage | `string[]` | OWASP categories that were scanned |
| verdict | `'PASS' \| 'WARN' \| 'FAIL'` | Overall verdict |

### 5.3 Dependencies

| Dependency | Version | Purpose | Risk if Unavailable |
|------------|---------|---------|---------------------|
| Semgrep CLI | >= 1.0.0 | SAST scanning engine | Graceful fallback to regex patterns |
| `p/owasp-top-ten` | latest | Official OWASP rule pack | Falls back to default rules |

### 5.4 Semgrep Command

```bash
semgrep scan \
  --config p/owasp-top-ten \
  --config .semgrep/ \
  --json \
  --quiet \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='.git' \
  --exclude='*.test.*' \
  --exclude='*.spec.*' \
  --timeout 60 \
  <target>
```

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- **External dependency:** Semgrep is not bundled — user must install it separately
- **Fallback required:** Framework must work fully without Semgrep installed (regex fallback)
- **No cloud:** Semgrep must run in local mode only (no Semgrep App/Cloud integration)
- **No new npm deps:** Scanner implemented using child_process to invoke Semgrep CLI

### 7.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| Semgrep's p/owasp-top-ten covers all 10 categories | Some categories may need custom rules | We define custom rules for gaps (A04, A09) |
| Semgrep JSON output format is stable | Parser breaks on version update | Pin minimum version, add version check |
| Scan completes within 30s for typical projects | Timeout on large codebases | Configurable timeout, incremental scan support |

### 7.3 Out of Scope

- [ ] Semgrep Cloud/App integration (local-only)
- [ ] Auto-fix of security findings (report only)
- [ ] DAST (dynamic application security testing)
- [ ] Container/infrastructure scanning
- [ ] License compliance scanning (handled by dependency agent)
- [ ] CI/CD integration (user configures their own pipeline)

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | Semgrep not installed on user's machine | H | M | Graceful fallback to regex + clear install instructions in output |
| R-002 | False positives overwhelm users | M | M | Default to CRITICAL+HIGH only for T4 verdict; MEDIUM/LOW are warnings |
| R-003 | Scan timeout on large codebases | M | L | Configurable timeout (default 60s), support `--include` for changed files only |
| R-004 | Semgrep JSON output format changes | L | M | Version check at startup, defensive parsing with fallback |

---

## 9. Implementation Plan

### 9.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | Semgrep Scanner Module | `semgrep-scanner.ts`: detection, execution, JSON parsing, report generation | None |
| 2 | T4 Gate Integration | Modify `runT4()` in `gates.ts` to use Semgrep-first + regex fallback, update verdict logic | Phase 1 |
| 3 | /security audit Upgrade | Update security agent prompt and command to use scanner module, add OWASP coverage display | Phase 2 |

### 9.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 | M | Medium | Low |
| 2 | S | Low | Low |
| 3 | S | Low | Low |

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

- [ ] `semgrep-scanner.ts` module created with detectSemgrep(), runSemgrepScan(), parseSemgrepOutput(), generateSecurityReport()
- [ ] T4 gate uses Semgrep when available, falls back to regex when not
- [ ] `/security audit` command produces OWASP-categorized findings with severity levels
- [ ] SecurityFinding and SecurityReport types defined and exported
- [ ] Graceful fallback: framework works fully without Semgrep installed
- [ ] Install instructions displayed when Semgrep not found
- [ ] Custom rules in `.semgrep/` directory are picked up automatically
- [ ] Verdict logic: FAIL on CRITICAL/HIGH, WARN on MEDIUM/LOW, PASS on clean
- [ ] Unit tests for: detection, JSON parsing, severity mapping, report generation, fallback behavior
- [ ] Integration test with known-vulnerable test fixtures (at least XSS, SQLi, hardcoded secrets)
- [ ] All existing tests pass (backward compatibility)

---

## 11. Appendix

### 11.1 Glossary

| Term | Definition | Code Name |
|------|------------|-----------|
| SAST | Static Application Security Testing | N/A |
| Semgrep | Open-source static analysis tool by Semgrep Inc. | N/A |
| OWASP | Open Worldwide Application Security Project | N/A |
| Finding | A single security issue detected by the scanner | `SecurityFinding` |
| Rule Pack | A collection of Semgrep rules for a specific domain | N/A |
| T4 | Anvil quality gate tier 4 — security scanning | `runT4()` |

### 11.2 References

- `sf_cli/src/core/gates.ts` — Current T4 gate implementation (lines 498-537)
- `scripts/anvil.sh` — Shell-based quality gate script
- Semgrep OWASP rules: `p/owasp-top-ten`
- `.claude/commands/security.md` — Current `/security audit` command

### 11.3 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-15 | SkillFoundry Team | Initial draft |
