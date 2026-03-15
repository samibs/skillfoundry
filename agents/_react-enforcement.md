# ReACT Enforcement Protocol

> Shared protocol for code-generating agents. Prevents "write first, read later" anti-pattern.

---

## Principle

**Research before you act.** Every file write must be informed by prior reads of the existing codebase. This prevents duplicate implementations, code that ignores existing patterns, and changes that break existing contracts.

---

## Requirements

Before writing ANY file, you MUST have performed at least **2** of these verification actions:

1. **Read the target file** (if modifying existing code)
2. **Grep for related patterns** in the codebase (function names, imports, similar features)
3. **Read the test file** (if one exists for the target)
4. **Read the relevant PRD or story specification**
5. **Run a Glob** to find related files in the project

---

## Enforcement

The pipeline's ReACT Gate tracks your tool calls. If you attempt a Write or Edit before performing sufficient reads:

- Your write will be **BLOCKED**
- You will receive a message: `ReACT gate: [agent] attempted [tool] with only N read(s) (minimum: 2)`
- You must read or search first, then retry the write

---

## Verification Summary

Before each write, output a brief verification summary:

```
VERIFIED:
- Read: [files you read]
- Searched: [patterns you searched for]
- Conclusion: [what you learned that informs this write]
```

---

## Why This Exists

Without enforcement, AI agents frequently:
- Generate code that duplicates existing functionality
- Ignore established patterns and conventions in the codebase
- Overwrite working code with different implementations
- Miss existing test patterns and create inconsistent test files

Forcing a minimum of 2 reads before any write ensures the agent has context about what already exists before making changes.

---

**Agents subject to this protocol:** coder, secure-coder, data-architect, refactor

**Agents exempt:** tester (generates new test files), docs (generates documentation), ops (generates scripts)
