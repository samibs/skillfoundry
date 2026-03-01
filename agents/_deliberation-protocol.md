# Deliberation Protocol — Multi-Perspective Design Review

> **INCLUDE IN**: project-orchestrator, cold-blooded-architect, agent-orchestrator
> This protocol defines structured multi-perspective analysis before implementation begins.

---

## Purpose

Before committing to an implementation approach, force structured debate from multiple perspectives. This catches architectural blind spots, security gaps, and maintainability problems that single-perspective design misses.

**Philosophy**: One perspective proposes, others challenge. Consensus emerges from evidence, not authority. Disagreements are surfaced, never buried.

---

## When Deliberation Triggers

Deliberation is **mandatory** when ANY of these conditions are met:

| Trigger | Example |
|---------|---------|
| **Architectural decision** | New system design, major refactoring, new external dependency |
| **Security-sensitive change** | Auth flow, data encryption, API exposure, token handling |
| **Multiple valid approaches** | "Should we use Redis or in-memory cache?" |
| **Cross-cutting concern** | Change affects 3+ modules or layers |
| **User requests it** | "I want to discuss options before we build this" |
| **Irreversible decision** | Database schema, public API contract, third-party commitment |

Deliberation is **skipped** when:
- Single obvious approach with no meaningful alternatives
- Bug fix with clear root cause
- Documentation-only changes
- User explicitly says "just do it"

---

## Deliberation Participants

Minimum **3 perspectives** must weigh in. Select based on the decision type:

| Perspective | Weighs In On | Always Required? |
|-------------|-------------|-----------------|
| **Architect** | Design quality, maintainability, scalability, simplicity | Yes |
| **Security** | Attack surface, data exposure, compliance, trust boundaries | Yes for auth/data changes |
| **Performance** | Latency, memory, scalability under load, resource cost | When perf-sensitive |
| **Tester** | Testability, coverage complexity, edge cases, regression risk | Yes |
| **SRE/Ops** | Operability, monitoring, failure modes, deployment complexity | For infrastructure changes |
| **Data Architect** | Schema design, migration risk, query performance, data integrity | For DB changes |

The **Architect** always opens (proposes) and always closes (synthesizes).

---

## Deliberation Format

### Phase 1: Proposal (Architect)

```markdown
## Proposal: [Decision Title]

### Problem
[What problem are we solving? 2-3 sentences max.]

### Proposed Approach
[The recommended approach. Be specific — name patterns, libraries, structures.]

### Alternatives Considered
| Approach | Pros | Cons | Why Not Chosen |
|----------|------|------|----------------|
| [Alt 1] | ... | ... | ... |
| [Alt 2] | ... | ... | ... |

### Constraints
| Constraint | Type | Impact |
|-----------|------|--------|
| [constraint] | Physical/Conventional/Regulatory/BestPractice | [how it shapes the design] |

### Open Questions
- [Question the architect isn't sure about]
```

### Phase 2: Challenge (Each Perspective)

Each perspective responds independently:

```markdown
## [Perspective] Review

### Position: SUPPORT | CHALLENGE | CONDITIONAL

### Assessment
[2-3 sentences: what this perspective sees that others might miss.]

### Concerns
- [Specific concern with evidence or reasoning]

### Conditions for Approval
- [What must be true for this perspective to approve]

### Counter-Proposal (if CHALLENGE)
[Alternative approach from this perspective, if any.]
```

**Rules for challengers:**
- Concerns must be **specific and actionable**, not vague ("I'm worried about security")
- Every concern must include **what could go wrong** and **under what conditions**
- "It's fine" is not a valid review — find at least one risk or improvement
- If you can't find a real concern, state why the approach is robust

### Phase 3: Synthesis (Architect)

After all perspectives have weighed in:

```markdown
## Deliberation Synthesis

### Decision: [Chosen approach]

### Consensus
- [Points all perspectives agree on]

### Contested Points
| Point | Positions | Resolution |
|-------|-----------|------------|
| [issue] | Architect: X, Security: Y | [How resolved — evidence wins] |

### Conditions Accepted
- [Conditions from reviewers that are incorporated]

### Dissent Record
- [Any unresolved disagreements — preserved, not deleted]

### Final Approach
[Refined approach incorporating feedback. This becomes the implementation spec.]
```

---

## Resolution Rules

When perspectives conflict, apply these rules in order:

1. **Reality anchor wins** — If one perspective has test results, benchmarks, or execution proof, it overrides opinion. (See: `agents/_dissent-resolution.md`)
2. **Security objection escalates** — Security concerns are never auto-resolved. If security challenges and others disagree, escalate to user.
3. **Simplicity tiebreaker** — When two approaches are roughly equivalent, choose the simpler one. Less code = fewer bugs = easier maintenance.
4. **User decides** — If deliberation reaches impasse after synthesis, present both options to the user with clear tradeoffs.

---

## Deliberation Depth

Not every decision needs a full debate. Scale deliberation to the decision weight:

| Depth | When | Format |
|-------|------|--------|
| **Quick** (2 min) | Low-risk, easily reversible | Architect proposes + 1 challenger. Inline in conversation. |
| **Standard** (5 min) | Moderate risk, multi-file change | 3 perspectives, full format above. |
| **Deep** (10 min) | High risk, irreversible, security-critical | All relevant perspectives. Written decision record preserved in scratchpad. |

---

## Decision Records

Every **Standard** or **Deep** deliberation produces a decision record preserved in the scratchpad:

```markdown
### Decision Record: [Title]
- **Date**: [date]
- **Trigger**: [why deliberation happened]
- **Participants**: [which perspectives]
- **Decision**: [chosen approach, 1 sentence]
- **Key tradeoff**: [what was sacrificed for what]
- **Dissent**: [any unresolved disagreements, or "none"]
```

Decision records are **append-only**. If a decision is later reversed, create a new record referencing the old one — never delete.

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Instead |
|-------------|-------------|---------|
| **Rubber-stamp review** | "Looks good" with no analysis | Require at least 1 specific finding per perspective |
| **Loudest voice wins** | Authority overrides evidence | Evidence and reality anchors decide |
| **Analysis paralysis** | Deliberation never ends | Time-box by depth level. Architect synthesizes and moves on. |
| **Ignoring dissent** | Unresolved concerns fester | Record dissent. If the concern materializes later, the record explains why. |
| **Deliberating the obvious** | Wasting tokens on trivial decisions | Skip triggers are explicit. "Just do it" is valid. |

---

## Integration Points

- **project-orchestrator**: Invokes deliberation before Architecture → Implementation transition when triggers are met
- **cold-blooded-architect**: Opens and closes deliberation. Produces the proposal and synthesis.
- **agent-orchestrator**: Routes challenge requests to appropriate perspective agents
- **_dissent-resolution.md**: Applied when deliberation surfaces irreconcilable positions
- **_bidirectional-iteration.md**: If the chosen approach oscillates during implementation, revisit the deliberation record

---

## Context Discipline

- Deliberation output must fit within **500 tokens** for the synthesis section
- Full deliberation (all phases) should not exceed **2000 tokens**
- Decision records in scratchpad: **100 tokens max** each
- If deliberation is consuming too many tokens, the architect calls it and synthesizes with available input
