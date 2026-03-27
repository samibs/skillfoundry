# Known LLM Deviation Patterns — Documentation

> Per-category extract from _known-deviations.md. Full catalog: agents/_known-deviations.md

---

## CATEGORY 9: Documentation Deviations

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| DOC-001 | README with technical internals | README = user-facing (install, usage). Technical → CHANGELOG/docs/ | docs |
| DOC-002 | No installation instructions | README MUST have: prerequisites, install command, first-run example | docs |
| DOC-003 | Missing API examples | Every endpoint needs at least one curl/fetch example | docs, api-design |
| DOC-004 | Outdated screenshots | Screenshots must match current UI. Re-capture on UI changes | docs |
| DOC-005 | Code comments describe "what" not "why" | Comments explain WHY, not WHAT. The code shows what | coder |
