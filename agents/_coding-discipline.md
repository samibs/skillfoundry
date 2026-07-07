# Coding Discipline Protocol

> **Behavioral guardrails to reduce common LLM coding mistakes. Apply on every implementation task.**

These guidelines bias toward caution over speed. For trivial tasks (typo, version bump, .gitignore line), use judgment and skip the ceremony. For anything that touches production logic, follow all four sections.

This protocol layers on top of, and does **not** override, the project's *Philosophy*, *Mandatory Production Rules*, and *Three-Layer Enforcement* sections in `CLAUDE.md`. Where this protocol and those rules differ, the stricter rule wins.

---

## 1. Think Before Coding

*Don't assume. Don't hide confusion. Surface tradeoffs.*

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them. Don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

This reinforces *Cold-blooded logic over flattery* — no optimistic guesses, no silent reinterpretation of the user's request.

## 2. Simplicity First (Scoped)

*Minimum code that solves the problem. Nothing speculative.*

Applies to **new logic you are writing**:
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- If you write 200 lines and it could be 50, rewrite it.

Does **NOT** override project-mandated production guards:
- Three-Layer Enforcement (DB → Backend → Frontend) is still required for full-stack features.
- Input validation at system boundaries is still required.
- Error handling required by *Mandatory Production Rules* (default arrays to `[]`, no `.method()` on nullable arrays, etc.) is still required.
- "No error handling for impossible scenarios" means **truly impossible** — not "I don't feel like handling it." Boundary validation is never impossible.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify. But: "Would a senior engineer say this skips a required production guard?" If yes, restore the guard.

## 3. Surgical Changes

*Touch only what you must. Clean up only your own mess.*

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it. Don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that **your** changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request. This reinforces *Never break existing features* and the global rule against retroactive scope expansion.

## 4. Goal-Driven Execution

*Define success criteria. Loop until verified.*

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification. Pairs naturally with `/layer-check` for full-stack tasks — define which layers a change must cross, then verify each.

---

## 5. Output Discipline — State the Finding, Not the Machinery

Report results, not the process that produced them. The user cares about *what you found and did*, not the internal routing, phase names, or retrieval steps that got you there.

- **Don't narrate routing or gates.** Not "Per the Anvil protocol I'm now entering Phase 2, running T4b traceability…" — just run it and report the outcome ("Scope check: 1 file changed outside the story"). Naming the machinery is process theater; it adds length, not information.
- **Don't narrate memory or context retrieval.** Never "Based on my memories…", "From what I know about you…", "Looking at your past chats…", "According to the context…". Use recalled facts directly, as a colleague would — state the fact, not where it came from. (Exception: the user explicitly asks what you remember or to cite a source.)
- **Don't announce internal steps as they happen.** No "Let me load the protocol", "Now I'll classify the intent", "Checking my instructions". Do the step; surface only what changes the user's decision.
- **Do surface findings, blockers, and the one decision that needs the user.** Suppressing machinery is not suppressing substance — a gate that BLOCKED, an assumption you made, or a choice only the user can make always gets stated plainly.

The test: would removing this sentence lose information the user needs to act? If it only describes *how* Claude worked rather than *what resulted*, cut it.

---

## Signals This Protocol Is Working

- Fewer unnecessary changes in diffs.
- Fewer rewrites caused by overcomplication.
- Clarifying questions arrive **before** implementation, not after mistakes.
- Adjacent code that wasn't asked about stays untouched.
- Each PR's line count is close to the minimum required for the change.

## When To Skip

- Trivial edits (typo, single-line config, version bump).
- Read-only investigation (`/explain`, `/recall`, status questions).
- Mechanical housekeeping (sync, commit, doc reorg).

For everything else: all four sections apply.
