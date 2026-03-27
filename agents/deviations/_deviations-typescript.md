# Known LLM Deviation Patterns — TypeScript/JavaScript

> Per-category extract from _known-deviations.md. Full catalog: agents/_known-deviations.md

---

## CATEGORY 4: TypeScript/JavaScript Deviations

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| TS-001 | Using `any` type | Use specific types or `unknown`. `any` defeats the type system | coder |
| TS-002 | Unhandled Promise rejections | Add `.catch()` or use try/catch with async/await. Handle ALL rejections | coder |
| TS-003 | Using `==` instead of `===` | Always use strict equality `===` and `!==` | coder |
| TS-004 | Mutating function parameters | Clone objects before modifying: `{ ...obj, key: newValue }` | coder |
| TS-005 | Missing optional chaining | Use `obj?.prop?.nested` instead of `obj && obj.prop && obj.prop.nested` | coder |
| TS-006 | Importing entire libraries | `import { specific } from 'lib'` not `import * as lib from 'lib'` | coder, performance |
| TS-007 | Forgetting async on await functions | Every function using `await` MUST be declared `async` | coder |
| TS-008 | Using `.get()` on typed objects | Use attribute access (`obj.field`), not dict-style (`.get('field')`) on Pydantic/TypeScript types | coder |
| TS-009 | Not typing function return values | Every exported function MUST have explicit return type | coder |
| TS-010 | Using `var` instead of `const`/`let` | Always `const` by default, `let` only when reassignment needed | coder |
| TS-011 | `require()` in ESM projects | Use `import` in ESM (`"type": "module"`) projects. Check package.json | coder |
