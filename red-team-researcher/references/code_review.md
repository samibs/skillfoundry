# Code Review & SAST Reference

Use this when auditing source code, triaging SAST output, or doing secure code review. The mental model: every vulnerability is a *data flow* from a source the attacker controls to a sink that does something dangerous, with insufficient sanitization in between. Your job is to trace that flow.

## How to actually read code for vulns

Don't read top-to-bottom. Read by following data.

**Pass 1 — Map the trust boundaries.** Where does external data enter? HTTP handlers, message queue consumers, file parsers, IPC endpoints, deserializers, env vars in privileged contexts. Mark every entry point.

**Pass 2 — Map the sinks.** Where does the code do something the attacker would want to influence? Query construction (SQL, NoSQL, LDAP, XPath), command execution, file path resolution, HTTP requests (SSRF), HTML/JS rendering, deserialization, cryptographic operations, authorization decisions, redirects, template rendering, regex compilation.

**Pass 3 — Connect them.** For each (source, sink) pair, ask: can attacker-controlled data reach this sink? What sanitization is in the path? Is the sanitization correct for *this* sink? (URL-encoding for HTML output is wrong. HTML-encoding for SQL is wrong. The right encoder is sink-specific.)

**Pass 4 — Trust assumptions.** What does this code assume about its callers? Is that assumption enforced or just hoped for? Internal services that "trust the network" are a recurring source of pre-auth criticals.

## Vulnerability classes — what to actually look for

### Injection family

**SQL injection.** Look for string concatenation or template interpolation building queries. Parameterized queries are safe; ORMs *usually* are but escape hatches (raw queries, `LIKE` with user-supplied wildcards, `ORDER BY` with user-supplied column names) are common bug sources. Second-order SQLi — data stored safely, then re-used unsafely — is the sneaky one.

**Command injection.** `exec`, `system`, `popen`, `child_process.exec`, `subprocess.Popen(..., shell=True)`, `Runtime.exec`. Anywhere a string becomes a shell command. The fix is almost always "use the array/list form and pass arguments as separate elements." Watch for ostensibly safe wrappers that build shell strings internally (e.g. ImageMagick `convert` with user-supplied filenames — the historical ImageTragik class).

**Template injection.** Server-side template engines (Jinja2, Twig, Freemarker, Velocity, Handlebars in unsafe modes) interpreting attacker-controlled strings. Often escalates straight to RCE. The bug is "user input is the template," not "user input is *in* a template."

**LDAP / XPath / NoSQL injection.** Same shape as SQLi but for those query languages. MongoDB `$where`, `$ne` with object inputs from JSON parsing, etc.

**Log injection / log forging.** Lower severity but real: unescaped newlines in user input let attackers forge log entries. Also a vector for log4shell-style template-eval bugs in logging libraries.

### Memory & deserialization

**Insecure deserialization.** Java `ObjectInputStream`, Python `pickle`, Ruby `Marshal`, .NET `BinaryFormatter`/`SoapFormatter`, PHP `unserialize`, YAML loaders without safe mode. If untrusted bytes hit one of these, assume RCE until proven otherwise. JSON deserialization into typed objects can also be unsafe (Jackson polymorphic deserialization, Newtonsoft.Json with `TypeNameHandling`).

**Memory corruption (C/C++/unsafe Rust/Go cgo).** Buffer overflows, use-after-free, double-free, integer overflows leading to undersized allocations, TOCTOU races, signed/unsigned confusion in length checks. Modern mitigations (ASLR, DEP, CFI, stack canaries) raise the bar for exploitation but don't make the bug not-a-bug.

### Auth / authz / session

**Broken authentication.** Predictable session tokens, session fixation, missing token rotation on privilege change, JWT alg=none, JWT signature not verified, JWT key confusion (HS256 with public key as secret), password reset tokens that are predictable or don't expire, MFA bypass via fallback flows.

**Broken access control / IDOR.** The single most common high-severity finding in real apps. Look for any endpoint that takes an ID and returns or modifies an object — does it check that the *current user* owns or can access *that specific ID*? "Authenticated" is not "authorized." Object-level checks (`obj.owner_id == current_user.id`) must be on the actual code path, not just on a sibling endpoint.

**Mass assignment.** ORM/framework binding request bodies directly to model fields, including fields the user shouldn't control (`is_admin`, `role`, `email_verified`). Allowlist explicit fields, never blocklist.

**Path traversal.** `../` in file paths. Modern frameworks usually handle the obvious cases but path joins with user input followed by canonicalization checks done in the wrong order are still common. The check must happen *after* canonicalization, against the resolved real path.

### Server-side request forgery (SSRF)

Any code that fetches a URL the user (directly or transitively) controls. Modern cloud impact is severe — IMDS access for credential theft, internal service enumeration, bypassing network ACLs. See `cloud_infra.md` for IMDS specifics.

The canonical-but-broken defense: blocklisting `127.0.0.1`/`localhost`/RFC1918 ranges. This fails to DNS rebinding, IPv6 alternates (`[::1]`, `[::ffff:127.0.0.1]`), decimal/octal/hex IP encodings, redirect chains where the final destination isn't checked. The right defense is a fetch library that resolves the hostname, validates the *resolved IP* against an allowlist, and pins the connection to that IP.

### XSS family

**Reflected/stored/DOM XSS.** The output context determines the encoding. HTML body context: HTML-encode. Attribute context: HTML-encode + quote attributes. JS context: JSON-encode (and don't use string interpolation into JS). URL context: URL-encode. CSS context: CSS-encode (and consider not allowing user input there at all). Frameworks like React are XSS-safe by default *except* for `dangerouslySetInnerHTML`, `href={userValue}` (javascript: URIs), and `ref` shenanigans.

**DOM XSS / client-side template injection.** Modern SPA bug class. User input flows into `innerHTML`, `eval`, `Function()`, `setTimeout` with string arg, jQuery's `$()` selector, AngularJS expression contexts.

### Crypto

**The big four mistakes:** ECB mode, static/predictable IVs, no MAC on encrypted data (or MAC-then-encrypt instead of encrypt-then-MAC), home-rolled crypto. If the code uses `AES.new(key, AES.MODE_ECB)` or constructs CBC without an HMAC, that's a finding. Use AEAD (AES-GCM, ChaCha20-Poly1305) or libsodium.

**Weak hashes for passwords.** MD5, SHA-1, SHA-256, SHA-512 are all wrong for passwords. Use Argon2id, scrypt, or bcrypt. PBKDF2 if standards force it, with high iteration count.

**Bad randomness.** `Math.random`, `rand()`, `java.util.Random` for security-sensitive values (tokens, IDs, salts, keys). Must be `crypto.randomBytes`, `secrets.token_bytes`, `SecureRandom`, etc.

**Timing attacks.** String comparison of secrets (HMACs, tokens, passwords) with `==`. Use constant-time comparison (`hmac.compare_digest`, `crypto.timingSafeEqual`).

### Race conditions / concurrency

**TOCTOU.** Check-then-use across a trust boundary where the state can change between check and use. Filesystem TOCTOU (check existence, then open) is classic. Application-level: check balance, then debit, without locking.

**Double-spend / idempotency.** Endpoints that perform side effects without idempotency keys, especially in distributed systems. "Click the buy button twice" is a real exploit class.

### Web-specific (cross-references with `web_api.md`)

CSRF, CORS misconfiguration, request smuggling, open redirects, prototype pollution (Node.js), Host header injection, cache poisoning, HTTP parameter pollution. Details in `web_api.md`.

## Language-specific landmines

**Python.** `pickle` and `yaml.load` without `Loader=SafeLoader`, `eval`, `exec`, `subprocess` with `shell=True`, format string vulns in older versions, `assert` statements for security checks (stripped in `-O`), `ssl._create_unverified_context`, `requests` with `verify=False`, `ZipFile.extractall` without path validation (zip slip).

**JavaScript / Node.** `eval`, `Function()`, `vm` module misused as a sandbox (it isn't), prototype pollution (`Object.assign`, `lodash.merge` pre-fix, `Object.prototype` mutation), `child_process.exec` vs `execFile`, regex DoS (catastrophic backtracking), JWT libraries with `algorithms: undefined`, SSRF in popular fetch libraries that don't validate redirects.

**Java.** `ObjectInputStream` deserialization, XXE in default `DocumentBuilderFactory` configs, SSRF in `URL.openConnection` honoring redirects across protocols, Spring `@RequestMapping` mass assignment, JNDI lookups with attacker-controlled names (log4shell class — any logging or template eval that interpolates user data through a JNDI-aware path).

**C / C++.** Format strings, integer overflow before allocation, `strcpy`/`strcat`/`sprintf` without bounds, off-by-one in length checks, `realloc` patterns that lose pointers on failure, double-free in error paths, missing checks on `recv`/`read` return values.

**Go.** SQL string building (despite `database/sql` being safe, `fmt.Sprintf` into queries is common), template injection with `html/template` vs `text/template` confusion, race conditions in concurrent map access, `exec.Command` with shell strings, path traversal in file servers.

**Ruby / Rails.** `eval`, `send` with user input, `Marshal.load`, mass assignment via `params` (mitigated by strong params if used), regex DoS, dynamic finders, raw SQL via `where("...#{user_input}...")`.

**PHP.** `unserialize`, `eval`, `assert` with string arg, `include`/`require` with user input (LFI → RCE), `extract($_REQUEST)`, type juggling (`==` vs `===`), magic methods triggering on deserialization.

**Rust.** `unsafe` blocks (audit closely — that's where memory safety bugs live), `transmute`, FFI boundaries, `unwrap` in security-critical paths (DoS, not memory corruption, but still). The borrow checker prevents most C-class bugs, but logic bugs, deserialization, command injection, etc. all still apply.

## Reading SAST output

Most SAST findings are false positives. Triage by:

1. **Reachability from a real entry point.** Is the "tainted source" actually attacker-controlled, or is it config the deployer sets? Internal-only?
2. **Sanitization in path.** SAST often misses framework-provided sanitization. React JSX expressions, parameterized ORM calls, `path.Join` with prior canonicalization — these are safe but get flagged.
3. **Severity calibration.** A theoretical XSS in an admin-only debug page is not a critical. A "low-severity weak random" used to generate session IDs is a critical.

The output of triage is a smaller, real list of findings, each with a written rationale for why it's real (not just "SAST flagged it").

## What good output looks like

When asked to audit code, produce findings in the format from `SKILL.md`. Each finding has:
- A specific location (file:line or function name)
- A vulnerability class (CWE-mappable, even if you don't cite the number)
- A reachability statement
- An exploit sketch with the actual data flow
- A fix that's specific enough to implement

If the audit found nothing, say what you checked. "I traced all `request.GET`/`request.POST` reads through the handlers in `views.py` and the only one reaching a sink is the one in `search_view`, which uses parameterized queries correctly. No user input reaches any of the `subprocess` or template-eval paths." That's a finding too — a negative one — and it builds trust.
