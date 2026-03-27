# Known LLM Deviation Patterns — Security

> Per-category extract from _known-deviations.md. Full catalog: agents/_known-deviations.md

---

## CATEGORY 7: Security Deviations (beyond BPSBS)

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| SEC-001 | Not validating file upload types/sizes | Validate MIME type, extension, and size server-side. Never trust client | security |
| SEC-002 | Missing Content-Security-Policy header | Set CSP header to prevent XSS and data injection | security |
| SEC-003 | Not rate limiting login attempts | Max 5 attempts per 15 min per IP. Lock after 10 failed attempts | security |
| SEC-004 | Storing sessions in memory only | Use Redis or DB for sessions. Memory sessions lost on restart | security, sre |
| SEC-005 | Not invalidating tokens on password change | Invalidate ALL active tokens when password changes | security |
| SEC-006 | Missing HTTPS redirect in production | Force HTTPS. Set HSTS header | security, devops |
| SEC-007 | Tokens in localStorage/sessionStorage | Access tokens in memory only. Refresh tokens in HttpOnly cookies | security |
| SEC-008 | Logging PII (email, password, phone) | Never log personal data. Use anonymized identifiers | privacy, security |

---

## STATISTICS (Source: Research 2025-2026)

| Metric | Value | Source |
|--------|-------|--------|
| AI code with security vulnerabilities | 45-53% | Veracode GenAI Report 2025 |
| AI code issues vs human code | 1.7x more | CodeRabbit AI vs Human Report 2026 |
| XSS vulnerability increase with AI | 2.74x | IEEE/CodeRabbit |
| Silent logic failures in AI code | 60% of faults | IEEE Spectrum |
| Happy path bias | Majority of AI code | Multiple sources |
| Error handling gaps vs human code | 2x more common | CodeRabbit |
| Excessive I/O in AI code | 8x higher | CodeRabbit |
| Hallucinated package names | 5.2% (commercial), 21.7% (open-source) | USENIX Security 2025 |
| Teams discovering post-ship security issues | 53% | Autonoma |
| Devs saying AI code is "almost right" | 66% | Developer survey 2026 |
