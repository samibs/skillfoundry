# MCP Server — Shared Skills for Every Project

The SkillFoundry MCP server (`mcp-server/`) is one long-running local process that serves
SkillFoundry's skills and tool agents to any AI client that speaks the
[Model Context Protocol](https://modelcontextprotocol.io) — Claude Code, Cursor, and others.
Instead of copying skill files into every project, each client connects to the server and gets
the same, always-current set of `sf_*` tools.

---

## What it provides

Every tool is named `sf_<name>`. There are two kinds:

| Kind | What a call does | Examples |
|------|------------------|----------|
| **Skill tools** (one per skill in `.claude/commands/` and `agents/`) | Returns the skill's instructions, adapted to the `projectPath` you pass. **Your AI client then carries them out** — the server does not call an LLM for these. | `sf_forge`, `sf_prd`, `sf_security`, `sf_tester`, `sf_review` |
| **Tool agents** | Run real work on your machine and return a structured result. | see below |

Tool agents by area:

| Area | Tools |
|------|-------|
| Knowledge | `sf_memory_search`, `sf_query_corrections`, `sf_query_quirks`, `sf_harvest_knowledge`, `sf_session_record`, `sf_memory_gate`, `sf_fleet_health` |
| Code checks | `sf_secret_guard`, `sf_import_validator`, `sf_deviation_enforcer`, `sf_contract_check`, `sf_codemap`, `sf_security_scan`, `sf_security_scan_lite`, `sf_verify_auth` |
| Build & test | `sf_build`, `sf_lint`, `sf_typecheck`, `sf_run_tests`, `sf_lighthouse`, `sf_check_deps`, `sf_version_check` |
| Ops | `sf_git_status`, `sf_git_commit`, `sf_docker_build`, `sf_docker_compose`, `sf_check_port`, `sf_assign_port`, `sf_check_env`, `sf_migrate`, `sf_nginx_config` |
| Other | `sf_project_context`, `sf_parallel_analyze`, `sf_cron_compile`, `sf_token_report`, `sf_create_skill`, `sf_list_dynamic_skills` |

The exact list your server exposes is whatever `tools/list` returns; skills are hot-reloaded when
a file in `.claude/commands/` or `agents/` changes, so no restart is needed after editing one.

---

## 1. Start the server

Requires Node.js 20+.

```bash
cd <framework>/mcp-server
npm ci
npm run build
pm2 start ecosystem.config.cjs      # runs as "skillfoundry-mcp", restarts automatically
pm2 save                            # keep it across reboots (after `pm2 startup`)
```

Without PM2, run it in the foreground with `npm start`.

Check it is up:

```bash
curl -s http://localhost:9877/health
# {"status":"healthy","name":"skillfoundry-mcp-server","version":"…","tools":{"registered":…}}
```

After pulling framework updates, rebuild and restart — in `mcp-server/`, run `npm ci`, then
`npm run build`, then `pm2 restart skillfoundry-mcp`.

## 2. Connect your AI client

Every `/mcp` and `/api/v1` request needs a bearer token. The server creates one on first start
and stores it in `<framework>/data/.api-token` (mode `0600`). It is never printed to the logs.

**Claude Code** — register once at user scope so it works in every project:

```bash
claude mcp add --scope user --transport sse skillfoundry http://localhost:9877/mcp/sse \
  --header "Authorization: Bearer $(cat <framework>/data/.api-token)"

claude mcp list        # should show: skillfoundry … (SSE) - ✔ Connected
```

**Other clients** (Cursor, Windsurf, …) — add the same URL and header to the client's MCP
configuration, for example:

```json
{
  "mcpServers": {
    "skillfoundry": {
      "url": "http://localhost:9877/mcp/sse",
      "headers": { "Authorization": "Bearer <contents of data/.api-token>" }
    }
  }
}
```

Clients that support the newer Streamable HTTP transport can use `http://localhost:9877/mcp/http`
with the same header instead.

## 3. Use it

Ask in plain language and the AI picks the matching tool — *"scan my staged changes for
secrets"* calls `sf_secret_guard`; *"what do we know about SQLite migration quirks?"* calls
`sf_memory_search`. You can also name a tool explicitly: *"use sf_forge on this project"*.

---

### Fleet health

`sf_fleet_health` reports on every project the knowledge harvester has seen: framework version
drift against the current release, projects never assessed by a forge run, memory-bank coverage,
platform mix, and the latest nightly health grades. Pass `app` to narrow it to one project.

The report includes a `freshness` block. Fleet data is only as current as the last
`sf_harvest_knowledge` run (or nightly harvest); when it is more than 7 days old the report marks
it `stale` and says to refresh — ask *"harvest knowledge from ~/apps, then show fleet health"*.

Projects the most recent harvest did not see — deleted folders, projects that no longer contain
SkillFoundry files, or folders outside the roots that harvest scanned — are listed under
`notRefreshedApps` and left out of every count, so old data is never mixed into current numbers.
Harvest all your project roots in one run (`sf_harvest_knowledge` accepts one root; the REST
endpoint `POST /api/v1/knowledge/harvest` accepts `appsRoots: [...]`).

---

## Endpoints

| Path | Auth | Purpose |
|------|------|---------|
| `GET /health` | public | Liveness, version, registered tool count |
| `GET /ready` | public | Readiness (503 until bootstrap completes) |
| `GET /mcp/sse` + `POST /mcp/messages` | token | MCP over SSE |
| `GET/POST/DELETE /mcp/http` | token | MCP over Streamable HTTP |
| `GET /api/v1/agents`, `/api/v1/agents/:name` | token | List skills / one skill |
| `GET /api/v1/knowledge/quirks`, `POST /api/v1/knowledge/harvest`, `GET /api/v1/knowledge/recordings` | token | Knowledge store |
| `GET /api/v1/fleet/health?app=` | token | Fleet report (same as `sf_fleet_health`) |
| `GET /api/v1/metrics`, `/api/v1/metrics/agents/:name`, `/api/v1/routing` | token | Usage metrics and routing data |
| `GET /api/v1/sessions`, `/api/v1/sessions/:id` | token | Recorded sessions |

Rate limits: 300 requests/minute on `/mcp`, 500/minute on `/api`.

## Configuration

Set these in the environment (or in `ecosystem.config.cjs` for PM2):

| Variable | Default | Purpose |
|----------|---------|---------|
| `SKILLFOUNDRY_PORT` | `9877` | Listen port |
| `SKILLFOUNDRY_ROOT` | parent of `mcp-server/` | Framework root |
| `SKILLFOUNDRY_COMMANDS_DIR` | `<root>/.claude/commands` | Skill source directory |
| `SKILLFOUNDRY_AGENTS_DIR` | `<root>/agents` | Agent source directory |
| `SKILLFOUNDRY_API_TOKEN` | contents of `data/.api-token` | Use a fixed token instead of the file |
| `SKILLFOUNDRY_DB_PATH` | `<root>/data/skillfoundry.db` | SQLite knowledge/metrics database |
| `SKILLFOUNDRY_CORS_ORIGIN` | `http://localhost:3666` | Allowed browser origin (dashboard) |
| `SKILLFOUNDRY_MODEL_TIER` | `sonnet` | Adds a warning to skills that declare a higher `min_model` |
| `SKILLFOUNDRY_DENY_TOOLS` | — | Comma-separated tool names to block |
| `SKILLFOUNDRY_DENY_PREFIXES` | — | Comma-separated name prefixes to block |
| `SKILLFOUNDRY_SIMPLE_MODE` | `false` | `true` exposes only the small core tool set |
| `SKILLFOUNDRY_TRUST` | trusted | `false` blocks tools that need a trusted workspace (`sf_security_scan`, `sf_verify_auth`, `sf_harvest_knowledge`, `sf_create_skill`, `sf_memory_gate`) |
| `ANTHROPIC_API_KEY` | — | Optional: enables LLM summarization of long contexts; without it a plain truncation note is used |

**Rotating the token:** delete `data/.api-token`, restart the server, then re-run the
`claude mcp add` command (after `claude mcp remove --scope user skillfoundry`) in every client.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Dynamic Client Registration rejected (HTTP 404) … Cannot POST /register` | The client got a 401 (missing/wrong token or wrong URL) and fell back to OAuth, which the server does not offer. | Use the `/mcp/sse` URL **and** the `Authorization` header shown above. A URL of just `http://localhost:9877/mcp` is wrong. |
| `401 UNAUTHORIZED` | Token missing or stale (e.g. after rotation). | Re-add the client with the current `data/.api-token`. |
| `Unknown session` on `/mcp/http` | Server built before the Streamable HTTP session fix (October 2026). | Update the framework, rebuild, restart — or use `/mcp/sse`. |
| `claude mcp list` shows ✘ | Server not running. | `pm2 status skillfoundry-mcp`; `curl localhost:9877/health`. |
| New/edited skill not visible | Hot-reload watches only `.claude/commands/` and `agents/`. | Check the server log for `[hot-reload]`; restart if the watcher failed to start. |

---

## Legacy prototypes: `mcp-servers/`

The `mcp-servers/` folder holds four early stand-alone stdio servers (filesystem, database,
testing, security) from the January 2026 MCP design. They are not installed, started, or wired
into any SkillFoundry workflow, and their dependencies are not installed by the installers. The
`mcp-server/` described above supersedes them — its tool agents cover testing
(`sf_run_tests`), security (`sf_security_scan`, `sf_secret_guard`) and migrations (`sf_migrate`).
