# STORY-003: Import Graph Resolution + unresolvedImports

**Phase:** 1 — Deterministic core
**PRD:** codebase-comprehension-preflight
**Priority:** MUST
**Effort:** M
**Status:** DONE
**Dependencies:** STORY-002
**Blocks:** STORY-005, STORY-009, STORY-011
**Affects:** FR-003

---

## Description

Resolve the raw module specifiers recorded as `import` edges in STORY-002 into concrete repo files, and flag the ones that don't resolve. The resolved import graph + `unresolvedImports[]` are the artifact `sf_import_validator` consumes (STORY-009).

---

## Acceptance Contract

**done_when:**
- [x] Relative specifiers (`./x`, `../y`) resolved against the importing file, trying TS/JS extension + index resolution (`.ts/.tsx/.js/.jsx/.mjs/.cjs`, `/index.*`) and Python module/package resolution (`pkg/mod.py`, `pkg/__init__.py`)
- [x] `tsconfig`/`jsconfig` `paths` + `baseUrl` aliases honored when present (parse, don't execute)
- [x] Bare specifiers matching a `dependencies`/`devDependencies` entry are classified `external` (not unresolved)
- [x] Specifiers that match neither a repo file nor a declared dependency are recorded in `unresolvedImports[]` with `{ fromFile, specifier, line }`
- [x] `imports` edges rewritten to point at resolved repo `file` node ids where resolution succeeds
- [x] Tests cover: relative hit, alias hit, external dep, and a genuine unresolved import

**fail_when:**
- A declared dependency is reported as unresolved (false positive)
- A real broken import is silently dropped (false negative)
- Resolution executes or imports target code

---

## Technical Approach

1. `codemap/resolve.ts` — `resolveImport(fromFile, specifier, ctx)` where `ctx` holds the file set, package.json deps, and parsed tsconfig paths.
2. Reuse `project-context-agent.ts` helpers for reading package.json/deps; do not duplicate detection.
3. Resolution order: relative → tsconfig alias → bare(dep) → unresolved.
4. Wire into `buildGraph` as a post-pass after all `file` nodes exist (resolution needs the full file set).

---

## Files Affected

| File | Action |
|------|--------|
| `mcp-server/src/agents/codemap/resolve.ts` | CREATE — import resolver |
| `mcp-server/src/agents/codemap/graph.ts` | MODIFY — `unresolvedImports[]` + edge rewrite |
| `mcp-server/tests/codemap-resolve.test.ts` | CREATE — resolution tests |

---

## Security / Constraints
- Static resolution only (filesystem + config parsing); never `require()`/`import()` the target.

---

## Implementation Notes (DONE — 2026-06-04)

- **Delivered:** `src/agents/codemap/resolve.ts` (relative + tsconfig-alias + dep-classification + Python-relative resolution), `tests/codemap-resolve.test.ts` (6 tests, green). `unresolvedImports[]` is the artifact `sf_import_validator` will consume (STORY-009).
- **All acceptance criteria met.** Python absolute/stdlib imports classified `external` (no false unresolved); only genuine relative misses are flagged.
