# Threat Modeling Reference

Use this for design reviews, new-feature security reviews, architecture reviews, and "we're about to build X, what could go wrong" conversations. The mental model: threat modeling is *applied paranoia with structure*. The goal is to surface the design-level risks early, when they're cheap to fix, not catalog every possible attack.

## When threat modeling is the right move

- Before a feature ships, especially anything touching auth, payments, PII, multi-tenancy, or external integrations
- During architecture review of a new service or major refactor
- When someone hands you a design doc and asks "is this safe"
- When triaging "should we use approach A or approach B" for a security-relevant choice

It's *not* the right move when the user wants vuln-hunting in existing code (use `code_review.md`) or when they have a specific finding to triage. Don't threat-model in response to "is this exploitable" — answer the actual question.

## The four-question frame

Adam Shostack's framing, and still the cleanest:

1. **What are we building?** Force a clear description of the system: components, data flows, trust boundaries. If the user can't articulate this, that's the first finding — undocumented systems can't be reasoned about.
2. **What can go wrong?** Apply threat enumeration (STRIDE, attack trees, etc.) against each component and each trust boundary crossing.
3. **What are we going to do about it?** Mitigations, accepted risks, deferred risks with tracking.
4. **Did we do a good job?** Validate by walking through specific abuse scenarios end-to-end.

Most threat modeling exercises spend too much time on (1), enumerate weakly in (2), get vague in (3), and skip (4). The value is in doing (2) and (3) rigorously.

## Step 1 — Mapping the system

Get a data flow diagram. If one doesn't exist, sketch one in prose:

- **External entities** — users, third-party services, external APIs the system calls
- **Processes** — services, functions, daemons (each is a separate process for modeling purposes if it runs as a separate identity)
- **Data stores** — DBs, caches, queues, blob stores, secrets stores
- **Data flows** — every connection between the above, labeled with what data crosses

The critical annotations:

- **Trust boundaries** — lines on the diagram crossing a privilege/network/identity boundary. These are where most threats live.
- **Authentication** at each boundary — what verifies the caller's identity? What verifies the callee's identity? mTLS, signed tokens, IAM, "we trust the network" (red flag).
- **Authorization** at each boundary — what verifies the caller is *allowed* to do this specific thing?
- **Sensitive data** flowing across each boundary — PII, secrets, financial data, auth material.

## Step 2 — STRIDE per element

STRIDE is a checklist for "what can go wrong" applied to each element of the diagram. The mnemonic is structured as <threat> ↔ <property violated>:

- **S**poofing ↔ Authentication: can an attacker pretend to be someone else?
- **T**ampering ↔ Integrity: can an attacker modify data in flight or at rest?
- **R**epudiation ↔ Non-repudiation: can an attacker (or insider) take an action and deny it later?
- **I**nformation disclosure ↔ Confidentiality: can an attacker read data they shouldn't?
- **D**enial of service ↔ Availability: can an attacker make the system unavailable?
- **E**levation of privilege ↔ Authorization: can an attacker gain capabilities they shouldn't have?

Apply STRIDE per element, not as a single pass:

- **External entities:** mostly Spoofing and Repudiation
- **Processes:** all six
- **Data stores:** Tampering, Information Disclosure, Denial of Service, Repudiation (audit logs)
- **Data flows:** Tampering, Information Disclosure, Denial of Service

For each (element, threat) pair, ask "can this happen here, and what's the impact?" Record the threats that are real risks, skip the ones that are obviously inapplicable.

## Step 3 — Attack trees for the dangerous ones

For high-impact threats, construct an attack tree: the goal at the root, the alternative methods as branches, and the prerequisites for each method as leaves.

Example — root: "attacker reads other tenant's data."

```
Read other tenant's data
├── Bypass tenant scoping in app layer
│   ├── IDOR on object-by-ID endpoints
│   ├── GraphQL field-level authz gap
│   └── Admin/support tool with unscoped queries
├── Compromise shared infrastructure
│   ├── Compromise DB credentials → bypass app-layer scoping entirely
│   ├── SSRF → reach internal admin tool
│   └── K8s namespace escape (if multi-tenant on shared cluster)
├── Misconfigured data access at infrastructure level
│   ├── Public S3 bucket
│   ├── Database accessible from internet
│   └── Backup files in shared location
└── Insider threat
    ├── Engineer with prod DB access
    └── Support tool used outside scope
```

Walking the tree forces you to think about which branches are realistically defended and which aren't. The undefended branches are the prioritized risks.

## Step 4 — Abuse cases

Concrete scenarios run end-to-end. "What happens if…" scenarios that name actors, paths, and consequences. Examples:

- "A registered user crafts a request with another user's object ID. Walk through every layer of the request: load balancer, auth middleware, controller, service layer, DB query. Where exactly is the tenant check, and is there any code path that skips it?"
- "An attacker compromises a single dev's laptop. What can they reach? Source code? Cloud credentials? Direct prod access? What's the blast radius?"
- "A malicious npm package is added to the dependency tree. What does it have access to at install time, build time, and runtime?"

Abuse cases are how you validate the threat model. If the model says "we're protected against tenant isolation breaks" but the abuse-case walkthrough finds a path the controls miss, the model is wrong.

## Common design-level antipatterns

These come up so often in threat modeling that they deserve a checklist of their own:

**"The frontend enforces it."** Any security check done only client-side is not a check. The threat model should treat the frontend as attacker-controlled.

**Implicit trust between services.** "Internal services trust the network" is a 2010-era model. East-west traffic should be authenticated and authorized too. Service mesh with mTLS is the modern default; minimum is mutually-authenticated tokens.

**Shared databases as integration points.** Multiple services reading/writing the same DB without a service in front means each service needs to enforce the same authz rules consistently. This drifts. Better: one service owns the data, others access via API.

**Authn ≠ authz.** "We checked they're logged in" is not "we checked they can do this." This is the IDOR family in design form.

**Long-lived credentials.** API keys with no rotation, service account keys never rotated, passwords with no expiry on service accounts. Modern equivalent: use short-lived tokens (workload identity, OIDC federation, STS).

**Crypto for the wrong threat.** Encrypting data at rest in a DB you also stored the encryption key in (the key is the data). End-to-end encryption claims that don't survive contact with server-side processing. "We use TLS" as the answer to "how do we protect data in our DB."

**Audit logs nobody reads.** Logging is a control if (and only if) someone or something acts on the logs. Logs that get rotated out without alerting on suspicious patterns are theater.

**Single points of compromise.** A CI/CD system that can deploy to all environments and has its own privileged credentials is a juicy target. A single admin user with no MFA. A single SSH key on a bastion host. Defense in depth means breaking these single points.

**"We're not a target."** Past performance is not predictive. Most breaches happen to organizations that didn't think they were targets. Plan as if you are.

## Output format

Threat modeling output is prose-heavy because the value is in the reasoning. A reasonable shape:

1. **System summary** — a paragraph or two stating what the system does, who uses it, what data it handles, and where the trust boundaries are. Include the data flow at a high level.
2. **Threat enumeration** — organized by element or by trust boundary, calling out the specific concrete threats (not just "STRIDE-S applies"). Use the finding format for the high-priority ones.
3. **Risks not yet mitigated** — explicit list with severity and notes on what mitigation would look like.
4. **Recommendations** — ordered by impact / effort. Quick wins first, then structural changes.
5. **Open questions** — things the design didn't answer that you need to know before you can fully assess the model.

Don't STRIDE-bingo every component. A threat model that says "Spoofing: N/A. Tampering: protected by TLS. Repudiation: logs." for every element is theater. Spend the words on the threats that actually matter for *this* system.

## What good threat modeling output looks like

- It surfaces threats the team hadn't named. If the output is just things they already knew, you didn't add value.
- It's specific to the system, not generic. "SQL injection" generically applies to anything with a database; "the search endpoint builds dynamic ORDER BY clauses from user input" is specific.
- It distinguishes between "we accept this risk because X" and "we have a control because Y." Accepted risks should be documented, not hidden.
- It produces a small number of action items, not a wall of theoretical concerns.

## What bad threat modeling output looks like

- "Make sure to validate input."
- "Implement proper authentication."
- "Follow OWASP best practices."
- A complete STRIDE matrix where every cell says "mitigated by TLS."

If your output has any of these, throw it out and start over.
