# /preflight — Codebase Comprehension Pre-Flight (Code Map)

> Builds or refreshes a structural **Code Map** of the repo and prints a summary.
> Alias: `/codemap`. Backed by the `sf_codemap` MCP tool.

---

## Usage

```
/preflight                 Refresh the Code Map (incremental) and print a summary
/preflight build           Force a full rebuild
/preflight query <symbol>  Look up a symbol/file and show its node + related edges
/preflight diff-impact     Blast-radius of the working-tree diff (STORY-011 — not yet implemented)
```

---

## Instructions

When invoked, call the `sf_codemap` MCP tool with the current project path:

- no arg / `refresh` → `sf_codemap { projectPath, mode: "refresh" }`
- `build` → `sf_codemap { projectPath, mode: "build" }`
- `query <symbol>` → `sf_codemap { projectPath, mode: "query", symbol: "<symbol>" }`

The map is cached at `.skillfoundry/code-map.json` (git-ignored by default). Refresh
re-parses only files whose content changed, so it is cheap to run on every task.

If the `skillfoundry` MCP server is not connected, run the engine directly:
`node -e "import('@skillfoundry/mcp-server/dist/agents/codemap-agent.js')..."` or
`npx tsx mcp-server/src/agents/codemap-agent.ts` is **not** an entry point — prefer the MCP tool.

## Output Format

```
CODE MAP — <project>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode:        refresh (re-parsed N files)
Nodes:       <n>   Edges: <e>
Endpoints:   <count>          ← API contract surface (feeds sf_contract_check)
Unresolved:  <count> imports  ← feeds sf_import_validator
Built from:  <git sha | null>
Warnings:    <list, if any>
Facts:       <n> recorded to memory_bank (if the project uses SF memory)
```

For `query`, print the matched node (kind, file:line, layer) and its in/out edges
(imports, calls, contains, declares-route, declares-model).

## What the Code Map contains

- **Structure** — file / function / method / class / export nodes; `contains` + same-file `calls` edges.
- **Imports** — resolved `imports` edges + `unresolvedImports[]` (the import-validator baseline).
- **Contract surface** — `endpoints[]` (method, canonical `:param` path, handler, best-effort request shape) for Express/Fastify/Hono/Next/NestJS/FastAPI/Flask. The `sf_contract_check` baseline.
- **DB/layers** — `model` nodes (Prisma/Drizzle/…); every file tagged `db`/`backend`/`frontend`/`shared`.

## Caveats

- The map is a **hint**, not ground truth. LLM semantic labels (when added, STORY-012) are non-authoritative and never satisfy Three-Layer verification.
- A committed/stale map can mislead — `refresh` before relying on it. `builtFromRevision` shows what it was built from.
- `diff-impact` and `semantic` modes are not implemented in the MVP; they return an explicit error rather than fabricated data.

## See also

- `agents/_codemap-preflight-protocol.md` — when/why this runs (manual + auto in `/forge` & `/go`).
- `agents/_env-preflight-protocol.md` — the sibling environment pre-flight.
