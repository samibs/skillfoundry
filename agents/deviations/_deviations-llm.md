# Known LLM Deviation Patterns — LLM-Specific

> Per-category extract from _known-deviations.md. Full catalog: agents/_known-deviations.md

---

## CATEGORY 16: LLM-Specific Deviations

> AI code creates 1.7x more issues than human code. 66% of devs say AI solutions are "almost right, but not quite."

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| LLM-001 | Goal-completion bias (reporting false success) | Pipeline MUST halt on repeated blockers. Never report success with failures | all |
| LLM-002 | Self-inflicted regression blindness | Never dismiss errors in files the agent just modified as "pre-existing" | debugger, fixer |
| LLM-003 | Investigating complex before simple | Debug: data → binding → flow → THEN timing/race conditions | debugger, fixer |
| LLM-004 | Sourcing .env files in bash | NEVER `source .env`. Use `grep` to extract values | all |
| LLM-005 | Dict access on typed objects | Use `obj.field` not `obj.get('field')` on Pydantic/TypeScript types | coder |
| LLM-006 | Building backend then asking about frontend | Three-layer rule: DB → Backend → Frontend. All three. Every time | all |
| LLM-007 | Generating placeholder/mock/stub code | ONLY REAL LOGIC. No TODOs, no mocks in production, no "coming soon" | all |
| LLM-008 | Losing context and duplicating code | Check for existing code before suggesting changes. Structural diff on context restore | all |
| LLM-009 | Hallucinating API endpoints or library methods | Verify imports exist. Check docs. Don't invent methods | coder |
| LLM-010 | Mixing framework versions/syntax | Check actual installed version before writing code (React 18 vs 19, Next 13 vs 14) | coder |
| LLM-011 | "Almost right" code that passes tests but fails in production | Test with REAL data, not ideal test fixtures. Include edge cases and adversarial input | tester, coder |
| LLM-012 | Suggesting deprecated or removed APIs | Check current docs before using any API. Verify method exists in installed version | coder |
| LLM-013 | Cross-file inconsistency (works in isolation, breaks together) | After multi-file changes, verify: imports resolve, types match, API contracts align | coder, architect |
| LLM-014 | Overcomplicating simple tasks | If a 5-line solution exists, don't write 50 lines. Avoid premature abstraction | coder |
| LLM-015 | Destroying existing data (database drops, file overwrites) | NEVER run destructive operations without explicit user confirmation. Back up first | all |
| LLM-016 | Ignoring the project's existing patterns | Read existing code BEFORE writing new code. Match the project's style, not your default | coder |
| LLM-017 | Generating tests that test the implementation, not behavior | Tests should verify OUTCOMES, not HOW the code works internally | tester |
| LLM-018 | Not reading error messages before "fixing" | Read the ACTUAL error message. Don't guess. The fix is usually in the error text | debugger, fixer |
| LLM-019 | Silent assumption-making (picking one interpretation without asking) | When a request is ambiguous, STOP and present interpretations. Never silently pick one. Use Pre-Execution Verification (`agents/_agent-protocol.md`) | all |
| LLM-020 | Orthogonal/drive-by changes (modifying unrelated code) | Touch ONLY what the task requires. No "while I'm here" cleanup, no unsolicited refactors. Every changed line must trace to the request. See Anvil T4b traceability check | all |
| LLM-021 | Not pushing back when a simpler alternative exists | Before implementing a complex solution, ask: "Is there a simpler way?" If a 1-step solution exists, don't build a 5-step one. Covers decision complexity (distinct from LLM-014 code complexity) | all |
