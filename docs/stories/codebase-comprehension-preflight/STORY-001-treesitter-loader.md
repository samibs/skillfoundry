# STORY-001: Tree-sitter Loader + WASM Grammars (TS/JS, Python)

**Phase:** 1 — Deterministic core
**PRD:** codebase-comprehension-preflight
**Priority:** MUST
**Effort:** M
**Status:** DONE
**Dependencies:** None
**Blocks:** STORY-002, STORY-003, STORY-004
**Affects:** FR-001

---

## Description

Establish the parsing foundation: load `web-tree-sitter` (WASM) and the TypeScript/JavaScript and Python grammars, exposing a small `parseFile(path) → Tree` API used by all downstream extraction. WASM-first to keep `npm ci` portable (Risk R-001); the native binding is optional and not required for a green install.

Non-supported languages must degrade gracefully: a parse request for an unsupported extension returns `null` (caller emits a file-level node only), never throws.

---

## Acceptance Contract

**done_when:**
- [x] `web-tree-sitter` added to `mcp-server` deps; TS/JS + Python grammar `.wasm` provided via the `tree-sitter-wasms` dependency (see Implementation Notes — supersedes vendoring under `grammars/`; better satisfies the npm-ci-portable intent)
- [x] `parser.ts` exports `parseFile(absPath): Promise<ParseResult | ParseSkip>` + `langForPath()` keyed by extension (`.ts .mts .cts .tsx .js .jsx .mjs .cjs` → TS/JS; `.py` → Python)
- [x] Unsupported extension returns a typed `ParseSkip {skipped:"unsupported"}` (supersedes bare `null`) with no throw
- [x] A malformed/syntactically broken source file returns a `Tree` with error nodes (does not throw) — caller handles degradation
- [x] `npm ci` on a clean host stays green with no mandatory native build step (deps are pure wasm/js, no `binding.gyp`)
- [x] Unit tests parse one TS, one Python, and one unsupported file and assert the contract above (`tests/codemap-parser.test.ts`)

**fail_when:**
- `npm ci` requires a native toolchain (node-gyp) to succeed
- A broken source file throws instead of returning an error-node tree
- An unsupported extension throws instead of returning a skip/`null`

---

## Technical Approach

1. Add `web-tree-sitter` to `mcp-server/package.json`. Vendor grammar wasm (`tree-sitter-typescript`, `tree-sitter-python`) under `codemap/grammars/`; do NOT rely on a postinstall native compile.
2. `codemap/parser.ts`:
   - `loadParser()` — lazy, memoized `Parser.init()` + `Language.load(wasmPath)` per language; cache `Map<lang, Language>`.
   - `parseFile(absPath)` — pick language by extension, `readFile`, `parser.setLanguage(lang)`, `return parser.parse(src)`; return `null` for unknown extension.
   - Guard file size (skip > configurable max, default 2MB, with a warning) to bound memory.
3. Keep this module pure (no graph logic) — STORY-002 consumes the trees.

---

## Files Affected

| File | Action |
|------|--------|
| `mcp-server/package.json` | MODIFY — add `web-tree-sitter` |
| `mcp-server/src/agents/codemap/grammars/*.wasm` | CREATE — vendored grammars |
| `mcp-server/src/agents/codemap/parser.ts` | CREATE — loader + parseFile |
| `mcp-server/tests/codemap-parser.test.ts` | CREATE — contract tests |

---

## Security / Constraints
- Parser only reads source; never executes/imports target code.
- Respect repo ignore globs (`node_modules`, `.next`, `dist`, `build`, `venv`, `.venv`) — reuse the exclusion list from `project-context-agent.ts`.

---

## Implementation Notes (DONE — 2026-06-04)

- **Grammar source:** depends on `tree-sitter-wasms` (prebuilt `.wasm`) + `web-tree-sitter@0.24.7` rather than vendoring `.wasm` under `grammars/`. Reason: `tree-sitter-wasms@0.1.13` grammars are built on the tree-sitter 0.20 ABI, which pairs with the pre-rewrite `web-tree-sitter` loader (≤0.24), NOT 0.26 (0.26 raised a dylink error). Pinned the proven 0.24.7 + 0.1.13 combo. Both packages are pure wasm/js — `npm ci` needs no native toolchain (R-001 satisfied).
- **API shape:** `parseFile()` returns a typed `ParseResult | ParseSkip` (discriminated by `isSkip()`) instead of `Tree | null`, so callers can tell *unsupported* from *too-large*/*unreadable* and emit the right warning. `loadParser()` was kept internal (`ensureInit`/`loadLanguage`).
- **Delivered:** `src/agents/codemap/parser.ts`, `tests/codemap-parser.test.ts` (5 tests, green).
