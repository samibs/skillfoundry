# Reporting & Communication Reference

Use this when writing up findings — pentest reports, bug bounty submissions, internal vuln disclosures, executive summaries. The mental model: a finding only matters if it gets fixed, and it only gets fixed if the people who can fix it understand it. Reports are conversion events, not artifacts.

## Audience determines structure

A pentest report has three audiences with three different needs:

1. **Executives** want: how exposed are we, how does this compare to last time, what's the spend implication. They read the executive summary and look at the severity bar chart.
2. **Engineering managers** want: how much work is the remediation, who owns each finding, what's blocking us. They read the findings list and the remediation guidance.
3. **Engineers** want: exactly what to fix, how to verify the fix, what was the proof. They read the technical detail.

Write all three. Don't compress them into one mode — the exec summary should not contain CVE references, the engineer detail should not contain risk-register language.

## CVSS — the actually useful version

CVSS v3.1 is the lingua franca for severity. The vector string is what matters; the numerical score is downstream. A working knowledge:

**Attack Vector (AV):**
- `Network` (N) — exploitable over the internet
- `Adjacent` (A) — same network segment / Bluetooth / etc.
- `Local` (L) — local access required (file system, console)
- `Physical` (P) — physical hardware access

**Attack Complexity (AC):**
- `Low` (L) — no special conditions
- `High` (H) — race condition, specific config, etc.

**Privileges Required (PR):**
- `None` (N) — pre-auth
- `Low` (L) — regular user
- `High` (H) — admin

**User Interaction (UI):**
- `None` (N) — fully automatable
- `Required` (R) — victim has to click something

**Scope (S):**
- `Unchanged` (U) — exploitation stays in the same security authority
- `Changed` (C) — exploitation reaches another (e.g., container escape, XSS in iframe → parent)

**CIA impact (C/I/A):** None / Low / High each.

The scoring is mechanical from the vector. The art is in setting the vector correctly:

- Pre-auth RCE: `AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H` → 10.0 Critical
- Authenticated stored XSS with session theft: `AV:N/AC:L/PR:L/UI:R/S:C/C:H/I:L/A:N` → 7.6 High
- IDOR exposing other users' data: `AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N` → 6.5 Medium (or High if data is highly sensitive — adjust C)
- SSRF reaching cloud metadata service: depends on what credentials that grants — if instance role is broad, this is `S:C/C:H/I:H/A:H` territory, easily 9+
- Self-XSS: `UI:R/PR:L`, often Low — the user attacks themselves

**Common scoring mistakes:**

- Inflating Scope to "Changed" when it isn't (Scope:C means crossing a security authority, not just doing damage)
- Setting C/I/A to High when the actual impact is bounded
- Pre-auth attacks scored as PR:L because "you need to be on the network"
- Authenticated attacks scored as PR:N because "registration is open"

When in doubt, write the vector string and explain *why* you set each field. The justification is more useful than the number.

## The finding format (full version)

The compact version lives in SKILL.md. For formal reports, expand:

```
### [Finding ID] [Severity] <Short title>

**Summary**
1–2 sentences a non-technical reader can understand. What's the bug, what's the impact.

**Severity:** <Critical/High/Medium/Low/Info>
**CVSS v3.1:** <vector string> (<score>)
**CWE:** CWE-XXX (only if confident in the mapping)
**Affected:** <component / version / location>

**Description**
Technical explanation of the vulnerability. What's broken, why it's broken,
under what conditions it's reachable. Should be self-contained — a reader
unfamiliar with the system should be able to follow.

**Reproduction**
Step-by-step. Numbered. Includes the exact requests/commands/inputs.
A developer should be able to follow this and observe the bug.

1. Authenticate as a regular user (any role)
2. Capture the request to GET /api/v1/orders/123
3. Modify the order ID to one belonging to another tenant: GET /api/v1/orders/789
4. Observe the response returns the other tenant's order details

Sample request:
GET /api/v1/orders/789 HTTP/1.1
Host: app.example.com
Authorization: Bearer <attacker_token>

**Impact**
What does the attacker get? Be concrete. "Read access to all orders across
all tenants, including PII (customer name, email, address) and financial
data (order totals, payment method last-4). Estimated 200K records exposed."

**Remediation**
What the fix has to do. Specific.

Add tenant scoping to the order lookup. The current handler in
src/api/orders.ts:42 calls `db.orders.findById(req.params.id)` without
checking ownership. Replace with:

  db.orders.findOne({ id: req.params.id, tenantId: req.user.tenantId })

Audit all object-lookup endpoints in the orders, invoices, and contacts
modules for the same pattern — this is likely systemic.

**References**
- OWASP API1:2023
- CWE-639: Authorization Bypass Through User-Controlled Key
```

For bug bounty submissions, the same shape applies but tighter — programs reward concision. Include the impact statement and a clean reproduction; everything else is supporting material.

## Severity calibration — the rough rubric

Different programs use different scales. A workable internal calibration:

**Critical** — Pre-auth RCE. Stored XSS in a high-traffic context with session theft. Direct exposure of bulk PII / payment data / auth secrets. Authentication bypass affecting all users. SQL injection with `xp_cmdshell` / write access. Cloud-credential theft chains. Anything where exploitation is straightforward and the impact is "the company has a really bad week."

**High** — Authenticated RCE. IDOR exposing significant cross-tenant data. Stored XSS with admin-level impact. Privilege escalation from regular user to admin. Sensitive data exposure (smaller scope than Critical). SSRF reaching internal services. Auth bypass with conditions.

**Medium** — Reflected XSS requiring user interaction. CSRF on sensitive actions. IDOR with limited impact (read-only, low-sensitivity data). Open redirects in auth flows. Information disclosure (stack traces, internal hostnames, version numbers). Weak crypto on non-sensitive data. Missing rate limits on auth endpoints (enabling brute force).

**Low** — Self-XSS. Missing security headers. Verbose error messages. Best-practice deviations without exploit path. Click-jacking on non-sensitive pages. Open redirects without auth chaining.

**Informational** — Defense-in-depth gaps without exploit. Hardening recommendations. Architectural concerns that aren't bugs but should be addressed.

When you're uncertain between two levels, lean to the lower one and let the customer / triager argue you up. Inflated severity erodes trust faster than under-reporting.

## Executive summary structure

A 1–2 page section that stands alone. The reader should walk away knowing the security posture without reading any individual finding.

Sensible sections:

1. **Engagement scope** — one paragraph. What was tested, when, what method (gray box / black box / source-available).
2. **Top-line posture** — one paragraph stating overall assessment. Be honest. "The application has a strong baseline but contains three Critical findings concentrated in the authentication layer that require immediate attention" is more useful than "we found vulnerabilities."
3. **Severity summary** — count of findings by severity. A small table or simple list, not a bar chart that obscures the numbers.
4. **Critical themes** — 2–4 bullet points naming the systemic patterns, not individual findings. "Authorization checks are inconsistent across the API surface — some endpoints check tenant scope, others don't" is a theme. "Finding F-12 missing authz check" is a finding.
5. **Comparison to prior assessment** (if applicable) — has the security posture improved? What was fixed, what regressed, what's new.
6. **Strategic recommendations** — 3–5 actions that would meaningfully reduce risk, prioritized.

What the executive summary is *not*: a list of findings (that's the body), a CVSS bar chart with no context, vendor marketing.

## Remediation guidance — making fixes happen

The fix language matters. Compare:

**Bad:** "Implement proper input validation."

**Good:** "In `src/api/search.ts`, the `query` parameter is interpolated directly into the Postgres SQL string at line 87. Replace the string concatenation with a parameterized query using `pg`'s `$1`, `$2` placeholders. The same pattern appears in `src/api/reports.ts` lines 142 and 198 — fix all three."

The pattern: name the file, name the line, name the function or variable, name the change in concrete terms a developer can implement without thinking about it.

For systemic findings (the same bug class in many places), give the pattern fix and a list of locations rather than one finding per location. "Authorization checks missing on object-lookup endpoints — the following 14 endpoints share the same pattern" is more actionable than 14 separate findings.

## Disclosure ethics

When working with third parties — bug bounty programs, vendor disclosure, coordinated disclosure:

- Read the program scope before you start. "Out of scope" means out of scope.
- Stop at proof-of-concept. You don't need to dump the database to prove you can.
- Don't disclose to the public until the vendor has had reasonable time (90 days is the industry standard for serious bugs; less if the bug is being actively exploited; more if the vendor is engaging in good faith and needs more time).
- Don't ransom findings. Don't threaten to disclose for payment outside the bug bounty terms.
- Document everything you did, when, and from where. Your audit trail protects you.

## Anti-patterns in security writing

Things to avoid:

- **Vagueness.** "Sensitive data may be exposed" is not a finding. *What* data, *to whom*, *under what conditions.*
- **Conditional severity.** "This could potentially lead to RCE under certain circumstances" — what circumstances? Either it leads to RCE or it doesn't. If you're not sure, say so.
- **Tooling output as findings.** "Burp flagged this." OK, but did *you* verify it's exploitable?
- **Scope creep narrative.** Reports drifting into general security advice ("you should also implement a SOC, MFA everywhere, etc."). Stay in scope; recommendations belong in a recommendations section.
- **The CISO-pleasing tone.** Reports written to make leadership feel good rather than to convey the actual security state. Honesty over comfort.
- **The breathless tone.** Every finding called "extremely critical" with red exclamation points. Severity inflation makes the legitimately Critical findings invisible.

## What good reports look like

- Findings the customer hadn't found through their own scanners
- Severity that holds up to challenge (the customer's security team can't argue you down on the Criticals)
- Reproduction steps that work on first try when the engineer follows them
- Remediation specific enough that the dev can implement without re-reading the finding
- An executive summary that's honest and actionable
- A consistent voice across the report — one researcher's writeups should feel like they came from the same person

## What bad reports look like

- Vendor scanner output reformatted with a logo
- 200 findings, mostly noise, no theme analysis
- "Critical" on a missing security header
- Reproduction steps that say "use the tool"
- Remediation that says "follow OWASP best practices"
- An executive summary that's longer than the findings section

If you find yourself producing any of these, the report isn't ready.
