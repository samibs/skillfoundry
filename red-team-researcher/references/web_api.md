# Web Application & API Security Reference

Use this for web apps, REST/GraphQL APIs, auth flows, session handling, and the broader OWASP territory. The mental model: HTTP is a state-reconstruction protocol, every request stands alone, and any security property that depends on "the client did the right thing" is a property the attacker controls.

## The first questions on any web target

Before vuln-hunting, get oriented:

1. **What's the auth model?** Session cookies? JWT? OAuth flows? mTLS? Are there multiple (e.g., session for users, API key for service accounts)?
2. **What are the trust boundaries?** Public internet → edge → app → internal services → DB. Where does each transition happen and what's enforced at each?
3. **What's the multi-tenancy model?** Single-tenant per deployment? Tenant isolation via row-level scoping? Subdomain-per-tenant? This determines where IDOR/cross-tenant bugs live.
4. **What does "admin" mean here?** Often there's an org admin, a platform admin, a support tool, a backoffice. Each is a separate privilege boundary worth probing.

## OWASP API Top 10 — the actually useful framing

Treat the OWASP API list as a checklist to *think through*, not a thing to recite. The high-value ones:

**API1 — Broken Object Level Authorization (BOLA / IDOR).** The bug: an endpoint accepts an object identifier and acts on the object without verifying the caller's relationship to that object. The hunt: enumerate every endpoint that takes an ID in the URL or body. For each, ask — does the handler look up the object *and* verify ownership in the same query, or does it look up first and check after (race condition)? Or does it not check at all? Test with a second account.

**API2 — Broken Authentication.** Token generation, token validation, token rotation. Specific bugs: JWT `alg=none`, `alg=HS256` with the verifier accepting `RS256` (key confusion), tokens without `exp` claims, refresh tokens that don't rotate, password reset tokens that are guessable or don't expire, MFA bypass via the "remember this device" flow, SSO assertion replay.

**API3 — Broken Object Property Level Authorization.** Two flavors: excessive data exposure (returning fields the user shouldn't see — internal IDs, other users' email, PII) and mass assignment (accepting fields the user shouldn't write — `is_admin`, `verified`, `tenant_id`). For excessive exposure, watch for "the frontend filters it" — that's not a control. For mass assignment, allowlist explicit fields server-side.

**API4 — Unrestricted Resource Consumption.** Rate limiting per endpoint, per user, per IP. Pagination caps. File upload size limits. GraphQL query depth/complexity limits. Bulk endpoints that accept arrays without size caps. Regex DoS in input validation.

**API5 — Broken Function Level Authorization.** Admin endpoints reachable by non-admin users because the auth check is a UI concern. Test by hitting `/api/admin/*` paths with a regular user token.

**API8 — Security Misconfiguration.** CORS with `Access-Control-Allow-Origin: *` plus credentials (browsers reject this combo, but `Access-Control-Allow-Origin: <reflected origin>` + `Access-Control-Allow-Credentials: true` is the dangerous pattern). Verbose error messages leaking stack traces. Default credentials. Debug endpoints in prod. Missing security headers (less critical than people think, but worth noting).

**API9 — Improper Inventory Management.** Old API versions still live. `v1` endpoints that lack the auth controls added in `v2`. Staging endpoints reachable from prod. Internal-only services exposed via a misconfigured load balancer.

## Specific vulnerability classes — what to actually test

### SSRF (Server-Side Request Forgery)

Any endpoint that fetches a URL the user controls. Common surfaces: webhook configuration, RSS/feed importers, image proxies, OG-tag preview generators, PDF/screenshot generators (often headless Chrome, often vulnerable to `file://` and `gopher://`), document import features.

**Defense bypasses to test:**
- IPv6 alternates: `[::1]`, `[::ffff:127.0.0.1]`, `[0:0:0:0:0:ffff:127.0.0.1]`
- Decimal/octal/hex IPs: `2130706433` (decimal `127.0.0.1`), `0177.0.0.1`, `0x7f.0.0.1`
- DNS rebinding: domain that resolves to an external IP first, then internal IP on second resolution
- URL parser confusion: `http://allowed.com@evil.com/`, `http://allowed.com#@evil.com/`, `http://evil.com/?@allowed.com`
- Redirect chains: server fetches `http://attacker.com/redirect`, which 302s to `http://169.254.169.254/`
- Protocol smuggling: `file://`, `gopher://`, `dict://`, `ftp://`, `sftp://`

**Cloud impact pivot.** SSRF in cloud environments is almost always an immediate critical. AWS IMDSv1 → instance credentials. GCP metadata → service account tokens. Azure IMDS → managed identity tokens. See `cloud_infra.md` for the full picture.

### Authentication & session bugs

**JWT specifics.** Common bugs:
- `alg: none` accepted by verifier
- `HS256` token verified with the public key as the secret (key confusion attack on RS256 verifiers)
- `kid` header injection (SQL injection or path traversal in key lookup)
- Algorithm confusion via `jku` or `x5u` headers pointing to attacker-controlled URLs
- Missing `exp` validation, missing `aud`/`iss` validation
- Tokens accepted with stale signing keys after rotation

**Session cookie hygiene.** `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict`) for session cookies. Missing `SameSite` on session cookies enables CSRF cross-site. `Domain=` set too broadly leaks cookies to subdomains.

**Password reset.** Token entropy, expiration, single-use, bound to the email at request time (not at consumption time — otherwise email change race), no user enumeration via differential responses.

**OAuth pitfalls.**
- `state` parameter missing or not validated → CSRF on the OAuth callback
- `redirect_uri` validation too loose (substring match, regex with anchored wildcards, allowing subdomains where attacker can register)
- Authorization code reuse not prevented
- PKCE not enforced for public clients
- Implicit flow still in use (deprecated)
- Mixing OIDC ID tokens with OAuth access tokens (using the wrong one for authz)

### Injection (web context)

Cross-references `code_review.md`. Web-specific notes:

**SQLi via headers and JSON.** Don't only test query/body params — `User-Agent`, `Referer`, custom headers logged to DB, JSON keys (not just values) in NoSQL contexts.

**NoSQL injection.** MongoDB: `{"username": "admin", "password": {"$ne": null}}` if the body is parsed as JSON and used directly. Operator injection in any NoSQL with query operators.

**GraphQL specifics.** Introspection enabled in prod (lower severity, useful for recon). Field-level authorization missing — `User.email` accessible via `viewer { friends { email } }` even when direct user-by-ID access is locked down. Batching attacks (1000 mutations in one request bypassing rate limits). Alias-based DoS. Resolver-level injection where the resolver passes args into a downstream system.

### XSS

Stored, reflected, DOM. The output context determines the encoding:
- HTML body: HTML-encode (`&`, `<`, `>`, `"`, `'`)
- HTML attribute (quoted): same as above plus quote the attribute
- HTML attribute (unquoted): don't do this
- JS string literal: JSON-encode and don't break out of the string context (also `</script>` in the data is a context-breaker)
- URL in `href`/`src`: validate scheme allowlist (block `javascript:`, `data:` for HTML contexts)
- CSS: don't allow user input here; if you must, use a strict allowlist

**CSP as defense-in-depth.** A strong CSP (`default-src 'self'; script-src 'nonce-...';` with no `unsafe-inline`/`unsafe-eval`) makes XSS exploitation much harder but isn't a substitute for output encoding. Watch for CSP bypasses via `script-src 'self'` plus a JSONP endpoint, or wide CDN allowances.

### CSRF

Modern frameworks largely handle this via SameSite cookies + token validation. Specific bugs:
- State-changing endpoints accepting `GET`
- POST endpoints with no CSRF token *and* no SameSite cookie protection *and* CORS that allows the request
- CSRF token bound to session but not validated server-side, or validated only on first request
- "Double submit cookie" implementations where the cookie is set without `__Host-` prefix and a subdomain XSS can set it

### Open redirect

Lower severity alone, but useful in chains (phishing, OAuth `redirect_uri` bypass, SSO assertion redirect, password reset link manipulation). Validate redirect targets against an allowlist; if the param is a path, validate it starts with `/` and isn't `//evil.com`.

### Request smuggling

CL.TE, TE.CL, TE.TE — front-end and back-end disagreeing about request boundaries. Usually appears at CDN/load-balancer + origin pairs. Symptoms: responses to other users' requests, cache poisoning, auth bypass via smuggled requests. Tools: HTTP Request Smuggler (Burp extension), `smuggler.py`. Mostly an infrastructure-config bug; mitigation is HTTP/2 end-to-end and strict header parsing.

### Cache poisoning

Unkeyed inputs (headers like `X-Forwarded-Host`, `X-Original-URL`) influencing the response, with the cache keyed only on path/query. Result: attacker pollutes the cached response for everyone. Test by varying weird headers and checking `X-Cache: HIT` or response timing.

### Prototype pollution (Node.js)

Untrusted input merged into objects via `lodash.merge`, `Object.assign` deep variants, query parsers that produce `__proto__` keys. Impact varies: DoS via property override, sometimes RCE via gadget chains in downstream libraries (template engines, etc.).

### XXE

XML parsers with external entities enabled. Most modern parsers default to safe, but legacy code, SOAP services, SAML implementations, and Office document parsing still hit this. Impact: file read, SSRF, sometimes RCE.

### CORS misconfiguration

The dangerous pattern: server reflects `Origin` header into `Access-Control-Allow-Origin` *and* sets `Access-Control-Allow-Credentials: true`. Any attacker site can now make authenticated requests and read responses. Variants: `null` origin allowed (file://, sandboxed iframes), suffix-match bugs (`evil-trusted.com`), allowing `*` origin with credentials (browsers block this, but some servers do it anyway).

## Recon — what to enumerate first

For an authorized engagement on a web target:

1. **Surface enumeration.** Subdomains (passive: cert transparency logs, DNS history; active: brute force against a wordlist). HTTP/HTTPS on each. Tech stack via headers, fingerprinting, error pages.
2. **Endpoint discovery.** robots.txt, sitemap.xml, JS files (extract API paths from minified JS), Wayback Machine, OpenAPI/Swagger specs if exposed, GraphQL introspection.
3. **Auth model mapping.** Login flows, registration flows, password reset, MFA setup, OAuth integrations, API key issuance. Test each separately.
4. **Role mapping.** Create accounts at every available privilege level. Diff their accessible endpoints.

## What good output looks like

For web/API findings, the format from SKILL.md applies. Specific to this domain:

- **Reachability** should specify auth state: pre-auth, authenticated-any-user, authenticated-target-tenant, admin-only.
- **Exploit sketch** should include a sample HTTP request (headers + body) showing the attack. This is more compact than prose for reproducibility.
- **Fix** for auth/authz bugs is usually "add an authorization check at function entry," but be specific about which check and where.
