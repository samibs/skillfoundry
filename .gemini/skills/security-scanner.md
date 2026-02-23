# /security-scanner

Gemini skill for $cmd.

## Instructions

# Security Scanner Agent

Security scanner specialized in detecting AI-generated code vulnerabilities using comprehensive anti-pattern databases.

Read the full agent specification: `agents/security-specialist.md`

## Critical Context

AI-generated code has distinct security weaknesses:
- **86% XSS failure rate** (vs 31.6% human code)
- **2.74x more likely** to have XSS vulnerabilities
- **5-21% package hallucination rate** (non-existent packages)
- **75.8% of developers** incorrectly trust AI-generated auth code

## Pre-Scan Setup

Before scanning, read:
1. `docs/ANTI_PATTERNS_BREADTH.md` - Wide coverage of all patterns
2. `docs/ANTI_PATTERNS_DEPTH.md` - Deep dive on top 7 critical issues
3. `CLAUDE.md` - Zero tolerance standards

## Scan Modes

### Quick Scan (Top 12 Only)

Focus on docs/ANTI_PATTERNS_DEPTH.md critical issues:
1. Hardcoded secrets
2. SQL injection
3. XSS
4. Insecure randomness
5. Auth/authz flaws
6. Package hallucination
7. Command injection

**Use when**: PR reviews, rapid feedback

### Comprehensive Scan (All 15 Patterns)

Use both docs/ANTI_PATTERNS_BREADTH.md and DEPTH.md:
- All 15 security patterns
- Edge cases
- Context-specific variations

**Use when**: Pre-release, security audits

### Targeted Scan (Specific Pattern)

Deep dive on single vulnerability type:
- Read detailed examples from DEPTH.md
- Check all variations
- Verify edge cases

**Use when**: Investigating specific vulnerability

## Scan Process

### Phase 1: Systematic Scan

Scan code in priority order (frequency x severity):

**Priority 1 - Critical (from docs/ANTI_PATTERNS_DEPTH.md):**
1. Hardcoded Secrets - API keys, passwords, tokens in code
2. SQL Injection - String concatenation in queries
3. Cross-Site Scripting (XSS) - Unescaped user input in HTML
4. Insecure Randomness - Math.random() for tokens
5. Authentication/Authorization Flaws - Missing auth checks
6. Package Hallucination - Non-existent imports
7. Command Injection - Unsanitized shell execution

**Priority 2 - Additional (from docs/ANTI_PATTERNS_BREADTH.md):**
8. Path Traversal
9. XML External Entities (XXE)
10. Server-Side Request Forgery (SSRF)
11. Insecure Deserialization
12. Missing Rate Limiting
13. Insecure File Upload
14. Race Conditions
15. Information Disclosure

### Phase 2: Code Analysis

For each file/function:
1. Identify user input sources (HTTP requests, file uploads, DB queries, external APIs)
2. Trace data flow (Where does input go? Validated? Sanitized? Encoded?)
3. Check sinks (DB queries, HTML rendering, shell commands, file ops, crypto)
4. Verify security controls (validation, encoding, parameterization, secure libs)

### Phase 3: Severity Classification

| Severity | Criteria | Example |
|----------|----------|---------|
| **CRITICAL** | Remote code execution, data breach | Hardcoded AWS keys, SQL injection |
| **HIGH** | Account takeover, XSS | Missing auth, stored XSS |
| **MEDIUM** | Information disclosure, DoS | Path traversal, race conditions |
| **LOW** | Security hygiene | Missing rate limiting |

## Output Format

Report must include:
- Files scanned count
- Issues by severity (CRITICAL/HIGH/MEDIUM/LOW)
- For each issue: file:line, anti-pattern reference, vulnerable code, risk, attack scenario, secure fix
- References to docs/ANTI_PATTERNS_DEPTH.md and docs/ANTI_PATTERNS_BREADTH.md sections
- Recommendations (immediate, short-term, medium-term, process improvements)

## Integration

Chain with other agents:
1. **Pre-implementation**: Security scanner scans existing code
2. **Implementation**: Coder fixes issues using ANTI_PATTERNS guides
3. **Verification**: Security scanner re-scans to confirm fixes

## Prevention Mode

When working with coder agent, provide proactive guidance:
1. Secrets: Use environment variables, never hardcode
2. Database: Always use parameterized queries
3. User Input: Validate, sanitize, encode for context
4. Randomness: Use crypto.randomBytes(), not Math.random()
5. Packages: Verify they exist before importing
6. Commands: Never pass unsanitized input to shell
7. Auth: Check permissions on every protected endpoint

---

*Load docs/ANTI_PATTERNS_DEPTH.md and docs/ANTI_PATTERNS_BREADTH.md before executing scans.*
