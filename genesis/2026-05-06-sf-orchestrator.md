# PRD: SkillFoundry Web Orchestrator

---
prd_id: sf-orchestrator
title: SkillFoundry Web Orchestrator
version: 1.0
status: READY
created: 2026-05-06
author: samibs
last_updated: 2026-05-06

dependencies:
  requires: []
  recommends: []
  blocks: []
  shared_with: []

tags: [orchestrator, web, docker, github, jobs, fullstack]
priority: high
layers: [database, backend, frontend]
---

---

## 1. Overview

### 1.1 Problem Statement

SkillFoundry CLI and IDE skills require local installation and developer tooling. Non-technical stakeholders and teams who want to trigger AI pipelines from a browser — write a PRD, click Run, get a PR — have no path to do so today. The barrier is the local setup, not the framework.

### 1.2 Proposed Solution

A hosted web application that acts as a cloud shell for SkillFoundry. Users sign in with GitHub OAuth, connect a repository, write PRDs in a browser editor, trigger `sf forge` in an isolated Docker container on the server, watch live progress via SSE, and receive a GitHub Pull Request when the pipeline completes. Devin's model, SkillFoundry's engine.

### 1.3 Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| End-to-end flow works | User can go from PRD to open PR in one session | Manual test of golden path |
| Job isolation | No cross-user data leakage between Docker runs | Security test: User A cannot read User B's output |
| Live log delivery | Logs appear within 2s of container output | Browser SSE latency test |
| Pipeline success rate | sf forge completes without infra errors | Job completion status in DB |

---

## 2. User Stories

### Primary User: Developer

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | sign in with GitHub | I don't need a separate account | MUST |
| US-002 | developer | connect one of my GitHub repos | the orchestrator knows where to run forge | MUST |
| US-003 | developer | write or paste a PRD in a browser editor | I can define requirements without a local IDE | MUST |
| US-004 | developer | click "Run Forge" and pick a mode | the pipeline executes server-side | MUST |
| US-005 | developer | see live terminal output while forge runs | I know what's happening without SSH | MUST |
| US-006 | developer | receive a GitHub PR link when done | I can review and merge the output | MUST |
| US-007 | developer | store my AI provider API key in settings | the orchestrator can make LLM calls on my behalf | MUST |
| US-008 | developer | cancel a running job | I can stop a pipeline that's going wrong | SHOULD |
| US-009 | developer | see my job history | I can review past runs and their PRs | SHOULD |
| US-010 | developer | manage multiple repos | I can run forge on any of my projects | SHOULD |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | GitHub OAuth login | Sign in via GitHub. Session persisted in DB. | Given unauthenticated user, When they click Sign In, Then they are redirected to GitHub OAuth and returned with session |
| FR-002 | Repo connection | User picks a GitHub repo from their account. Stored with github_repo_full_name. | Given authenticated user, When they connect a repo, Then it appears in their repo list and forge can target it |
| FR-003 | PRD editor | Textarea with markdown support. PRD saved to DB, mapped to a repo. | Given connected repo, When user creates/edits a PRD, Then content is persisted and associated with that repo |
| FR-004 | Forge trigger | POST /api/v1/repos/:repoId/jobs creates a job. Job queued in BullMQ. | Given valid PRD + repo, When user clicks Run, Then job is created with status QUEUED |
| FR-005 | Docker execution | Worker clones repo into a temp dir, runs sf forge in a container, cleans up | Given QUEUED job, When worker picks it up, Then container is started, forge runs, container is removed on completion |
| FR-006 | Live log stream | SSE endpoint streams container stdout/stderr to the browser | Given RUNNING job, When user opens job detail, Then logs appear in real time |
| FR-007 | PR creation | On forge success, worker pushes branch and opens a PR via GitHub API | Given completed forge with code changes, Then a PR exists on the repo with branch name sf-forge-{jobId} |
| FR-008 | Job cancellation | DELETE /api/v1/jobs/:jobId kills the container and marks job CANCELLED | Given RUNNING job, When user cancels, Then docker stop is called and job status is CANCELLED |
| FR-009 | API key management | User stores encrypted API keys per provider in settings | Given user in settings, When they save an API key, Then it is AES-256 encrypted in DB and never returned in plaintext |
| FR-010 | Job history | List of all jobs for the user with status, repo, started_at, PR link | Given any state, When user views jobs list, Then all their jobs are shown newest-first |

### 3.2 User Interface Requirements

**Screen: Landing (`/`)**
- Purpose: Marketing + entry point for unauthenticated users
- Key elements: Hero tagline, "Sign in with GitHub" CTA, brief feature description
- User flow: → GitHub OAuth → /dashboard

**Screen: Dashboard (`/dashboard`)**
- Purpose: Home after login. Quick overview of recent activity.
- Key elements: Recent jobs (last 5, with status badges), connected repos list, "Connect a repo" button, "New PRD" shortcut
- User flow: → /repos, → /jobs/:id

**Screen: Repositories (`/repos`)**
- Purpose: Manage connected repos
- Key elements: List of connected repos with last forge date; "Connect Repo" button opens a GitHub repo search/picker
- User flow: → /repos/:id

**Screen: Repo Detail (`/repos/:id`)**
- Purpose: PRDs and job history for one repo
- Key elements: Tabs — "PRDs" (list + New PRD button) and "History" (jobs list); "Run Forge" button prominent
- User flow: → /repos/:repoId/prds/:prdId, → /jobs/:id

**Screen: PRD Editor (`/repos/:repoId/prds/new` and `/repos/:repoId/prds/:prdId`)**
- Purpose: Create or edit a PRD
- Key elements: Title field; large textarea (monospace font, markdown); Save button; "Run Forge with this PRD" button
- Validation: Title required, content min 50 chars
- User flow: Save → stay on page. Run → creates job → redirect to /jobs/:id

**Screen: Job Detail (`/jobs/:id`)**
- Purpose: Live and historical view of a single forge run
- Key elements: Status badge; repo + PRD name; "Cancel" button (RUNNING only); log viewer (dark terminal style, auto-scroll); PR link when status=COMPLETED; elapsed time counter
- SSE: connects to /api/v1/jobs/:id/stream on mount, disconnects on COMPLETED/FAILED/CANCELLED
- User flow: Back → /repos/:repoId

**Screen: Settings (`/settings`)**
- Purpose: API key management
- Key elements: Provider list (Anthropic, OpenAI, xAI, Google) each with "Key configured ✓" or "Add key" state; add/remove key per provider; no key values shown after save
- User flow: standalone

### 3.3 API Requirements

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/health` | GET | Health check | None |
| `/api/ready` | GET | Readiness probe | None |
| `/api/auth/[...nextauth]` | GET/POST | NextAuth GitHub OAuth | None |
| `/api/v1/repos` | GET | List connected repos | Session |
| `/api/v1/repos` | POST | Connect a repo | Session |
| `/api/v1/repos/:id` | DELETE | Disconnect a repo | Session |
| `/api/v1/repos/:repoId/prds` | GET | List PRDs for repo | Session |
| `/api/v1/repos/:repoId/prds` | POST | Create PRD | Session |
| `/api/v1/repos/:repoId/prds/:prdId` | GET | Get PRD | Session |
| `/api/v1/repos/:repoId/prds/:prdId` | PUT | Update PRD | Session |
| `/api/v1/repos/:repoId/prds/:prdId` | DELETE | Delete PRD | Session |
| `/api/v1/repos/:repoId/jobs` | POST | Trigger forge | Session |
| `/api/v1/jobs` | GET | List jobs for user | Session |
| `/api/v1/jobs/:id` | GET | Get job + log tail | Session |
| `/api/v1/jobs/:id` | DELETE | Cancel job | Session |
| `/api/v1/jobs/:id/stream` | GET | SSE live log | Session |
| `/api/v1/api-keys` | GET | List provider key status | Session |
| `/api/v1/api-keys` | POST | Save API key for provider | Session |
| `/api/v1/api-keys/:id` | DELETE | Remove API key | Session |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| API Response Time | < 200ms (95th percentile, excluding job stream) |
| Page Load Time | < 2s |
| SSE first log line | < 3s from job start |
| Concurrent jobs | 3 simultaneous Docker containers (MVP — single server) |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Authentication | GitHub OAuth via NextAuth.js v4. Session token in HttpOnly cookie. |
| Authorization | All resources scoped to authenticated user_id. No RBAC roles for MVP. |
| API Key Storage | AES-256-GCM encryption at rest. Key derived from APP_SECRET. Never returned in plaintext after save. |
| GitHub Token | Stored encrypted in DB alongside session. Minimum required scope: `repo` (clone + push + PR). |
| Input Validation | PRD content max 50,000 chars. Repo full name validated against regex `^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$`. |
| Session Lifecycle | Session expires 7 days. HttpOnly + Secure + SameSite=Lax cookie. |
| Rate Limiting | POST /api/v1/repos/:repoId/jobs: 5 per user per hour. All other endpoints: 60 req/min. |
| CORS Policy | Same-origin only. No external origins permitted. |
| Container isolation | Each job runs in a separate Docker container. Containers removed after completion. |
| Sensitive data in logs | API keys and GitHub tokens must be redacted from all log output using regex before writing to log file or streaming. Redact pattern: `sk-[a-zA-Z0-9-]+` and `ghp_[a-zA-Z0-9]+` and `github_pat_[a-zA-Z0-9_]+`. |
| No stack traces in API responses | All 500 errors return `{ error: { code: "INTERNAL_ERROR", message: "An error occurred" } }` |

### 4.2.1 Multi-Tenant Isolation

| Aspect | Requirement |
|--------|-------------|
| Tenancy Model | per-user isolation |
| Tenant Identifier | `user_id` on every owned entity |
| Data Scoping | Every query filtered by `user_id`. ORM repository layer enforces this by default. |
| File Storage Isolation | Job workspaces at `/tmp/sf-jobs/{jobId}/` — UUID prevents enumeration. Cleaned up after container exits. |
| Log Files | Stored at `logs/jobs/{userId}/{jobId}.log`. Path includes userId for OS-level separation. |
| Cross-Tenant Testing | Required. User A cannot access User B's repos, PRDs, jobs, or log streams. |
| Download Security | Job log endpoint and SSE stream verify `job.user_id === session.user_id` before responding. |

### 4.3 Scalability

Single server for MVP. Horizontal scaling not required. BullMQ concurrency set to 3 (limits to 3 simultaneous containers). If server has Docker and Node 20, the app runs.

### 4.4 Reliability

| Metric | Target |
|--------|--------|
| Uptime | Best-effort (single server, no HA for MVP) |
| RTO | 5 minutes (PM2 auto-restart) |
| RPO | Last committed DB state |
| Backup | Daily PostgreSQL dump via cron |
| Container orphan cleanup | Worker scans for running containers with `sf-job-*` name on startup and kills any older than 2 hours |
| Job stuck detection | Jobs in RUNNING state > 90 minutes are marked FAILED by a cleanup cron |

### 4.5 Observability

| Aspect | Requirement |
|--------|-------------|
| Logging Format | Structured JSON via `pino`. Correlation ID on every request (`x-request-id`). |
| PII in Logs | API keys and tokens redacted. Email not logged. |
| Health Check | `GET /api/health` → `{ status: "ok", version: "..." }` |
| Readiness Probe | `GET /api/ready` → checks DB connection + Redis connection. Returns 503 if either is down. |
| Audit Logging | Job created, job completed, job cancelled, API key added/removed logged to `audit` table with user_id + timestamp. |

---

## 5. Technical Specifications

### 5.0 Technology Maturity Assessment

#### Stack Assessment

| Dependency | Version | Maturity | API Stability | Known Quirks | Verification Required |
|-----------|---------|----------|--------------|-------------|----------------------|
| Next.js | 15.x | Stable | Minor changes from 14 | standalone output needs static copy step | Build + curl |
| NextAuth.js | 4.24.x | Stable | Stable (DO NOT use v5 beta) | trustHost required behind proxy | Build + Playwright login flow |
| Prisma | 5.x | Stable | Stable | None for v5 | Build + seed test |
| BullMQ | 5.x | Stable | Stable | Requires Redis 6+ | Integration test |
| dockerode | 4.x | Stable | Stable | None | Integration test |
| React | 18.x | Stable | Stable | None | Build |
| Tailwind CSS | 3.x | Stable | Stable | None | Build |
| pino | 9.x | Stable | Stable | None | Unit test |

#### Risk Decision

No beta or alpha dependencies. All stable releases. NextAuth v4 explicitly chosen over v5-beta to avoid the 4-rewrite auth incident pattern in KB.

### 5.1 Architecture

```
Browser
  └─ Next.js App (React + Tailwind)
       └─ API Routes (Next.js Route Handlers)
            ├─ NextAuth.js (GitHub OAuth, sessions)
            ├─ Prisma ORM → PostgreSQL
            ├─ BullMQ Producer → Redis → BullMQ Worker
            │                              └─ dockerode → Docker daemon
            │                                   └─ Container: node:20 + sf CLI
            │                                        └─ git clone → sf forge → git push
            └─ SSE endpoint → Redis pub/sub (job log stream)

PM2 manages two processes:
  1. web    — Next.js (next start)
  2. worker — Node.js worker process (src/worker/index.ts compiled)
```

### 5.2 Data Model

**Entity: users**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Internal user ID |
| github_id | VARCHAR(32) | UNIQUE NOT NULL | GitHub user numeric ID |
| github_username | VARCHAR(64) | NOT NULL | GitHub login handle |
| github_access_token_enc | TEXT | NOT NULL | GitHub OAuth token, AES-256-GCM encrypted |
| email | VARCHAR(255) | NULLABLE | From GitHub profile (may be null if private) |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Entity: repos**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| user_id | UUID | FK → users NOT NULL | Owner |
| github_repo_full_name | VARCHAR(255) | NOT NULL | e.g. `samibs/my-app` |
| github_repo_id | VARCHAR(32) | NOT NULL | GitHub numeric repo ID |
| default_branch | VARCHAR(100) | NOT NULL DEFAULT 'main' | |
| connected_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| UNIQUE | (user_id, github_repo_id) | | One connection per user per repo |

**Entity: prds**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| user_id | UUID | FK → users NOT NULL | Owner |
| repo_id | UUID | FK → repos NOT NULL | Target repo |
| title | VARCHAR(255) | NOT NULL | Human-readable name |
| content | TEXT | NOT NULL | Markdown PRD body |
| status | ENUM(DRAFT, READY, ARCHIVED) | NOT NULL DEFAULT 'DRAFT' | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Entity: jobs**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Also used as Docker container name suffix |
| user_id | UUID | FK → users NOT NULL | Owner |
| repo_id | UUID | FK → repos NOT NULL | Target repo |
| prd_id | UUID | FK → prds NULLABLE | PRD used for this run |
| status | ENUM(QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED) | NOT NULL DEFAULT 'QUEUED' | |
| mode | ENUM(FULL, BLITZ, DRY_RUN) | NOT NULL DEFAULT 'FULL' | Maps to sf forge flags |
| container_id | VARCHAR(128) | NULLABLE | Docker container ID while RUNNING |
| log_path | VARCHAR(512) | NOT NULL | Absolute path to log file on server |
| branch_name | VARCHAR(255) | NULLABLE | Git branch created by forge |
| pr_url | VARCHAR(1024) | NULLABLE | GitHub PR URL on COMPLETED |
| error_message | TEXT | NULLABLE | Short error on FAILED |
| started_at | TIMESTAMPTZ | NULLABLE | When container started |
| completed_at | TIMESTAMPTZ | NULLABLE | When job reached terminal state |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

**Entity: api_keys**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| user_id | UUID | FK → users NOT NULL | Owner |
| provider | ENUM(anthropic, openai, xai, google) | NOT NULL | |
| encrypted_key | TEXT | NOT NULL | AES-256-GCM encrypted value |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |
| UNIQUE | (user_id, provider) | | One key per provider per user |

**Entity: audit_log**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | |
| user_id | UUID | NULLABLE | NULL for system events |
| action | VARCHAR(64) | NOT NULL | e.g. JOB_CREATED, API_KEY_ADDED |
| resource_type | VARCHAR(64) | NOT NULL | job / repo / prd / api_key |
| resource_id | UUID | NULLABLE | ID of affected resource |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | |

### 5.3 Dependencies

| Dependency | Version | Purpose |
|-----------|---------|---------|
| next | 15.x latest | App framework |
| react | 18.x | UI |
| react-dom | 18.x | UI |
| next-auth | 4.24.x | GitHub OAuth + session management |
| @prisma/client | 5.x | ORM |
| prisma | 5.x | Migration CLI (devDependency) |
| bullmq | 5.x | Job queue |
| ioredis | 5.x | Redis client (used by BullMQ + pub/sub) |
| dockerode | 4.x | Docker container management from Node |
| @types/dockerode | 3.x | TypeScript types |
| pino | 9.x | Structured logging |
| pino-pretty | 11.x | Dev log formatting (devDependency) |
| tailwindcss | 3.x | CSS utility framework |
| typescript | 5.x | Type safety |
| bcryptjs | 2.x | Not needed (no password auth) |
| zod | 3.x | Input validation |
| uuid | 9.x | UUID generation for job IDs |

### 5.4 Compatibility Notes

| Package A | Package B | Notes |
|-----------|-----------|-------|
| next@15 | next-auth@4 | Compatible. Do NOT use next-auth@5-beta. |
| prisma@5 | node@20 | Compatible. |
| bullmq@5 | ioredis@5 | BullMQ 5 requires ioredis 5. Use matching versions. |
| dockerode@4 | node@20 | Compatible. Requires Docker daemon accessible via /var/run/docker.sock |

### 5.5 Directory Structure

```
sf-orchestrator/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/
│   │   │   └── login/
│   │   │       └── page.tsx          # Landing + Sign In
│   │   ├── (portal)/                 # Authenticated routes
│   │   │   ├── layout.tsx            # Portal layout with nav
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── repos/
│   │   │   │   ├── page.tsx          # Repo list
│   │   │   │   └── [repoId]/
│   │   │   │       ├── page.tsx      # Repo detail (PRDs + history)
│   │   │   │       └── prds/
│   │   │   │           ├── new/
│   │   │   │           │   └── page.tsx
│   │   │   │           └── [prdId]/
│   │   │   │               └── page.tsx
│   │   │   ├── jobs/
│   │   │   │   ├── page.tsx          # Job history
│   │   │   │   └── [jobId]/
│   │   │   │       └── page.tsx      # Job detail + live log
│   │   │   └── settings/
│   │   │       └── page.tsx          # API key management
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── [...nextauth]/
│   │   │   │       └── route.ts      # NextAuth handlers
│   │   │   ├── health/
│   │   │   │   └── route.ts
│   │   │   ├── ready/
│   │   │   │   └── route.ts
│   │   │   └── v1/
│   │   │       ├── repos/
│   │   │       │   ├── route.ts      # GET list, POST connect
│   │   │       │   └── [repoId]/
│   │   │       │       ├── route.ts  # DELETE disconnect
│   │   │       │       ├── jobs/
│   │   │       │       │   └── route.ts  # POST trigger forge
│   │   │       │       └── prds/
│   │   │       │           ├── route.ts  # GET list, POST create
│   │   │       │           └── [prdId]/
│   │   │       │               └── route.ts  # GET, PUT, DELETE
│   │   │       ├── jobs/
│   │   │       │   ├── route.ts      # GET list
│   │   │       │   └── [jobId]/
│   │   │       │       ├── route.ts  # GET detail, DELETE cancel
│   │   │       │       └── stream/
│   │   │       │           └── route.ts  # GET SSE stream
│   │   │       └── api-keys/
│   │   │           ├── route.ts      # GET list status, POST save
│   │   │           └── [keyId]/
│   │   │               └── route.ts  # DELETE remove
│   │   ├── layout.tsx                # Root layout
│   │   └── page.tsx                  # Redirect: / → /dashboard or /login
│   ├── lib/
│   │   ├── auth.ts                   # NextAuth config
│   │   ├── db.ts                     # Prisma client singleton
│   │   ├── redis.ts                  # ioredis client singleton
│   │   ├── queue.ts                  # BullMQ producer
│   │   ├── crypto.ts                 # AES-256-GCM encrypt/decrypt helpers
│   │   ├── github.ts                 # GitHub API helpers (repos list, create PR)
│   │   └── logger.ts                 # pino instance
│   ├── worker/
│   │   ├── index.ts                  # BullMQ worker entrypoint (separate PM2 process)
│   │   ├── executor.ts               # Docker container lifecycle (run, stream logs, stop)
│   │   ├── log-writer.ts             # Write container output to log file + Redis pub/sub
│   │   └── cleanup.ts                # Orphan container + stuck job cleanup on startup
│   ├── components/
│   │   ├── JobLogViewer.tsx          # SSE consumer, terminal-style log display
│   │   ├── StatusBadge.tsx           # Job status chip
│   │   ├── RepoCard.tsx
│   │   └── PrdEditor.tsx             # Controlled textarea + save/run buttons
│   └── types/
│       ├── job.ts
│       ├── repo.ts
│       └── prd.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── logs/
│   └── jobs/                         # {userId}/{jobId}.log
├── ecosystem.config.js               # PM2: web + worker processes
├── .env.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

### 5.6 Integration Points

| System | Integration Type | Purpose |
|--------|------------------|---------|
| GitHub OAuth | OAuth 2.0 via NextAuth | Authentication + access token for repo operations |
| GitHub REST API v3 | HTTPS REST | List repos, create branch, open PR |
| Docker daemon | Unix socket `/var/run/docker.sock` via dockerode | Create/run/stop/remove containers |
| Redis | TCP (localhost) | BullMQ job queue + log pub/sub channel |
| PostgreSQL | TCP (localhost) | Primary data store via Prisma |
| SkillFoundry CLI | Docker image | Pre-installed `sf` binary runs `sf forge` inside containers |

### 5.7 Environment Variables

| Variable | Example / Format | Generation Method | Required | Notes |
|----------|-----------------|-------------------|----------|-------|
| `DATABASE_URL` | `postgresql://sf_web:pass@localhost:5432/sf_orchestrator` | Manual | Yes | Dedicated DB user |
| `REDIS_URL` | `redis://localhost:6379` | Manual | Yes | Local Redis instance |
| `NEXTAUTH_URL` | `https://sf.yourdomain.com` | Manual (your DNS record) | Yes | Must match exact domain |
| `NEXTAUTH_SECRET` | 32-char base64 | `/generate secret --length 32 --encoding base64` | Yes | Session cookie encryption |
| `GITHUB_CLIENT_ID` | `Ov23li...` | Manual (GitHub OAuth App) | Yes | From GitHub Developer Settings |
| `GITHUB_CLIENT_SECRET` | `abc123...` | Manual (GitHub OAuth App) | Yes | From GitHub Developer Settings |
| `APP_ENCRYPTION_KEY` | 32-char hex | `/generate secret --length 32 --encoding hex` | Yes | AES-256 key for API key + token encryption |
| `DOCKER_RUNNER_IMAGE` | `skillfoundry/runner:latest` | Manual | Yes | Docker image with sf CLI pre-installed |
| `JOB_LOG_DIR` | `/home/n00b73/apps/sf-orchestrator/logs/jobs` | Manual | Yes | Absolute path, must be writable |
| `MAX_CONCURRENT_JOBS` | `3` | Manual | No | BullMQ concurrency cap, default 3 |
| `JOB_TIMEOUT_MINUTES` | `90` | Manual | No | Max forge runtime before FAILED, default 90 |
| `PORT` | `3210` | Manual | Yes | Next.js listen port (assign via portman or manually) |
| `NODE_ENV` | `production` | Derived | Yes | |

### 5.8 Deployment Environment

#### Infrastructure

| Aspect | Specification |
|--------|--------------|
| **Port** | Assign via portman or choose a free port. Set in `PORT` env var and PM2 ecosystem. |
| **Process manager** | PM2. Two processes: `sf-web` (Next.js) and `sf-worker` (BullMQ worker). |
| **Reverse proxy** | nginx. Proxy `https://sf.yourdomain.com` → `http://localhost:{PORT}`. Pass headers: `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`. |
| **SSL/TLS** | certbot + webroot or existing wildcard cert already on the server. |
| **Domain** | New DNS A record pointing to server IP. Must match `NEXTAUTH_URL` exactly. |
| **Docker** | Daemon must be running. The PM2 user must have access to `/var/run/docker.sock`. Either add user to `docker` group or use rootful PM2. |
| **Redis** | Must be running locally (`redis-server`). Check with `redis-cli ping`. |
| **PostgreSQL** | Must be running locally. Create dedicated DB and user before first deploy. |

#### Build & Deploy Commands

```bash
# Prerequisites (once)
createdb sf_orchestrator
createuser sf_web --pwprompt
psql -c "GRANT ALL ON DATABASE sf_orchestrator TO sf_web;"
redis-server --daemonize yes  # if not already running
docker pull skillfoundry/runner:latest  # pre-built runner image

# Build
cd ~/apps/sf-orchestrator
npm ci
npx prisma migrate deploy
npm run build

# Copy Next.js standalone static assets
cp -r .next/static .next/standalone/sf-orchestrator/.next/static
cp -r public .next/standalone/sf-orchestrator/public

# Start / restart
pm2 start ecosystem.config.js --env production
# OR on update:
pm2 restart sf-web sf-worker

# Verify
curl -sf http://localhost:{PORT}/api/health
curl -sf http://localhost:{PORT}/api/ready
```

#### PM2 ecosystem.config.js

```javascript
module.exports = {
  apps: [
    {
      name: 'sf-web',
      script: '.next/standalone/sf-orchestrator/server.js',
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT,
      },
    },
    {
      name: 'sf-worker',
      script: 'dist/worker/index.js',
      instances: 1,
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

#### Docker Runner Image

A `Dockerfile.runner` must be built and tagged as `skillfoundry/runner:latest` on the server before first deploy:

```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN npm install -g skillfoundry
WORKDIR /workspace
```

Build once: `docker build -f Dockerfile.runner -t skillfoundry/runner:latest .`

#### Known Deployment Quirks

| Library | Quirk | Fix |
|---------|-------|-----|
| Next.js 15 standalone | `.next/static/` and `public/` not in standalone output | Copy both after build — see commands above |
| NextAuth v4 behind nginx | `trustHost` or incorrect URL causes CSRF errors | Set `NEXTAUTH_URL` to exact public domain including `https://`. Add `trustHost: true` in NextAuth config. |
| dockerode | PM2 user must have Docker socket access | Add PM2 user to `docker` group: `usermod -aG docker {pm2_user}`. Log out and back in (or `newgrp docker`). |
| BullMQ + Redis | Worker fails silently if Redis not running | `GET /api/ready` checks Redis — monitor this endpoint |
| Next.js 15 incremental build | Stale chunks cause `InvariantError` | Always `rm -rf .next` before `npm run build` |

---

## 6. Contract Specification

### 6.1 Entity Cards

**Entity: Job**
| Attribute | Value |
|-----------|-------|
| **Name** | `job` (table: `jobs`) |
| **Purpose** | Represents one execution of `sf forge` against a repo |
| **Owner** | `user_id` |
| **Key Fields** | `id`, `user_id`, `repo_id`, `status`, `mode`, `log_path`, `pr_url` |
| **Sensitive Fields** | `container_id` (internal, not exposed to client after completion) |
| **Retention** | Indefinite (MVP). Log files cleaned after 30 days via cron. |
| **Audit** | Yes — job created, completed, cancelled |
| **Data Ownership** | `user_id` |
| **Access Scope** | own |

### 6.2 State Transitions

**Entity: Job**

```
QUEUED → RUNNING → COMPLETED
                 → FAILED
           ↓
        CANCELLED (from QUEUED or RUNNING)
```

| Current | Action | Next | Who Can Trigger | Side Effects |
|---------|--------|------|-----------------|--------------|
| QUEUED | Worker picks up | RUNNING | Worker process | Docker container started, `started_at` set |
| RUNNING | Forge exits 0 | COMPLETED | Worker process | Container removed, PR created, `completed_at` set |
| RUNNING | Forge exits non-0 | FAILED | Worker process | Container removed, `error_message` set |
| QUEUED | User cancels | CANCELLED | Authenticated user (owner) | BullMQ job removed |
| RUNNING | User cancels | CANCELLED | Authenticated user (owner) | `docker stop` called, container removed |
| RUNNING | Timeout exceeded | FAILED | Cleanup cron | `docker kill` called |

Invalid: COMPLETED → any. FAILED → any. CANCELLED → any. (All terminal.)

### 6.3 Permissions Matrix

| Action | User | Notes |
|--------|------|-------|
| Create repo connection | ✅ | Own repos only |
| Read repo | ✅ | `WHERE user_id = :userId` |
| Delete repo connection | ✅ | Own only |
| Create PRD | ✅ | For own repos only |
| Read PRD | ✅ | `WHERE user_id = :userId` |
| Update PRD | ✅ | Own only, any status |
| Delete PRD | ✅ | Own only |
| Create job (trigger forge) | ✅ | For own repos only |
| Read job | ✅ | `WHERE user_id = :userId` |
| Cancel job | ✅ | Own only, QUEUED or RUNNING only |
| Read job log stream | ✅ | Own only |
| Manage API keys | ✅ | Own only |

### 6.4 API Contract

#### Standard Response Wrapper
```json
{ "data": { ... }, "correlationId": "uuid" }
```
For lists:
```json
{ "data": [...], "meta": { "total": 10 }, "correlationId": "uuid" }
```

#### Standard Error Response
```json
{
  "error": { "code": "NOT_FOUND", "message": "Job not found" },
  "correlationId": "uuid"
}
```

#### Key Endpoints

**`POST /api/v1/repos/:repoId/jobs`** — Trigger forge
Request:
```json
{ "prdId": "uuid-or-null", "mode": "FULL" }
```
Response `201`:
```json
{ "data": { "id": "job-uuid", "status": "QUEUED", "mode": "FULL" }, "correlationId": "..." }
```
Errors: `404` repo not found, `422` no API key configured for any provider, `429` rate limit

**`GET /api/v1/jobs/:id/stream`** — SSE live log
```
Content-Type: text/event-stream
Cache-Control: no-cache

data: {"line": "⚙️  Validating PRDs...", "ts": "2026-05-06T10:00:01Z"}\n\n
data: {"line": "🔨 IGNITE phase started", "ts": "2026-05-06T10:00:02Z"}\n\n
data: {"event": "job_completed", "pr_url": "https://github.com/.../pull/42"}\n\n
```
Closes stream on `job_completed`, `job_failed`, or `job_cancelled` event.

### 6.5 Error Codes

| Code | HTTP | When |
|------|------|------|
| `VALIDATION_FAILED` | 400 | Invalid request body |
| `UNAUTHORIZED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Valid session, wrong owner |
| `NOT_FOUND` | 404 | Resource doesn't exist or belongs to another user |
| `CONFLICT` | 409 | Repo already connected |
| `INVALID_STATE_TRANSITION` | 422 | Cancel on COMPLETED job |
| `NO_API_KEY` | 422 | Forge triggered but no API key stored for any provider |
| `RATE_LIMITED` | 429 | Job trigger rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Unhandled exception |

### 6.6 UI States

Every data screen must handle: Loading (skeleton), Empty (with CTA), Error (message + retry), Success.
Job detail additionally: Running (live SSE), Completed (PR link), Failed (error message), Cancelled.

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- **Infrastructure:** Single server. Docker must be running. Redis must be running. PostgreSQL must be running.
- **Concurrency:** Max 3 simultaneous Docker containers (configurable via `MAX_CONCURRENT_JOBS`).
- **No public GitHub App:** Uses OAuth App (simpler). Requires users to grant `repo` scope.
- **No billing:** MVP does not track per-user LLM spend. Users provide their own API keys.

### 7.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| Docker daemon accessible on server | Worker cannot create containers | Verify `docker ps` works as PM2 user before deploying |
| Redis already running on server | Worker and queue non-functional | `redis-cli ping` in pre-flight. `GET /api/ready` checks Redis. |
| `sf forge` completes within 90 minutes | Containers run indefinitely | Configurable `JOB_TIMEOUT_MINUTES`. Cleanup cron kills long-running jobs. |
| User's repo is public or their OAuth token has `repo` scope | Clone fails in container | GitHub OAuth App configured with `repo` scope. Document clearly in onboarding. |

### 7.3 Out of Scope

- [ ] Team / org features — no shared workspaces, no invite flow
- [ ] Billing / LLM cost tracking
- [ ] GitHub App (using OAuth App instead)
- [ ] PR review / merge workflow inside the app
- [ ] Multiple simultaneous PRDs per forge run (one PRD per job, MVP)
- [ ] Self-hosted runners / bring-your-own Docker host
- [ ] Email notifications
- [ ] Webhook triggers (push → auto-forge)
- [ ] Mobile responsive design (desktop-first MVP)

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R-001 | Docker socket access issues for PM2 user | M | H | Add user to docker group. Document in setup. Test before deploy. |
| R-002 | Container leaks if worker crashes mid-run | M | M | Cleanup cron on worker startup kills orphaned `sf-job-*` containers older than 2h |
| R-003 | Sensitive data (API keys, tokens) in log output | M | H | Log line sanitization with regex before write and before SSE stream |
| R-004 | GitHub OAuth token expiry breaks container clone | L | H | Refresh token check before job start. Mark job FAILED with clear message if token invalid. |
| R-005 | sf forge network calls blocked in container | L | M | No network restrictions on container in MVP. Document that network=host or default bridge is required. |
| R-006 | Redis connection loss during long forge run | L | M | BullMQ reconnects automatically. SSE stream falls back to log file tail on Redis pub/sub failure. |

---

## 9. Implementation Plan

### 9.1 Phases

| Phase | Name | Scope |
|-------|------|-------|
| 1 | Foundation | Project setup, DB schema, GitHub OAuth, repo connection UI |
| 2 | Core Pipeline | PRD editor, job trigger, Docker executor, SSE log stream |
| 3 | Completion | PR creation, job history, cancellation, API key management, settings |
| 4 | Polish | Error states, cleanup cron, health/ready endpoints, PM2 config, nginx config |

### 9.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 | M | Low | Low |
| 2 | XL | High | High (Docker + SSE) |
| 3 | L | Medium | Medium |
| 4 | M | Low | Low |

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

- [ ] User can sign in with GitHub OAuth and be redirected to dashboard
- [ ] User can connect a GitHub repo (public or private with repo scope)
- [ ] User can create and save a PRD associated to a repo
- [ ] User can trigger forge (FULL / BLITZ / DRY_RUN modes)
- [ ] Forge runs in an isolated Docker container with the user's API key injected
- [ ] Live log output appears in browser within 3s of container output
- [ ] On forge success: branch pushed, PR opened, PR URL stored and shown
- [ ] Job can be cancelled from QUEUED or RUNNING state
- [ ] User A cannot access User B's repos, PRDs, jobs, or log streams
- [ ] API keys stored encrypted, never returned in plaintext after save
- [ ] API key regex patterns are redacted from all log output before streaming
- [ ] `GET /api/health` and `GET /api/ready` return 200 when dependencies are up
- [ ] Orphaned containers cleaned up on worker startup
- [ ] PM2 ecosystem.config.js starts both web and worker processes
- [ ] nginx config proxies HTTPS to Next.js port with correct headers

---

## 11. Appendix

### 11.1 Glossary

| Term | Definition | Code Name |
|------|------------|-----------|
| Job | One execution of `sf forge` in a Docker container | `job` / `jobs` table |
| Runner image | Docker image with Node 20 + sf CLI pre-installed | `DOCKER_RUNNER_IMAGE` |
| Forge mode | Pipeline variant: full pipeline, blitz/TDD, or dry-run | `job.mode` |
| PRD | Product Requirements Document — the input to a forge run | `prd` / `prds` table |
| Log stream | SSE channel delivering container stdout/stderr in real time | `/api/v1/jobs/:id/stream` |

### 11.2 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-05-06 | samibs | Initial PRD |
