# SkillFoundry MCP — Bulk Assessment Report

> **Date**: 2026-03-29
> **Scope**: 43 projects across `~/apps/` (37) and `~/wapplications/` (6)
> **Server**: SkillFoundry MCP v4.0.0
> **Agents**: project-context, security-scan-lite, contract-check

---

## Executive Summary

| Metric | Before Enhancement | After Enhancement | Delta |
|--------|-------------------|-------------------|-------|
| Framework Detection NULL | 13 projects | 2 projects | **-85%** |
| Security CRITICAL findings | 98 | 50 | **-49%** |
| Frontend API calls detected | ~650 | 2,233 | **+243%** |
| Files scanned (security) | 7,782 | 9,513 | **+22%** |
| Monorepos correctly detected | 29 | 29 | — |

### Remaining NULL Framework Detection
- `hexalab.dev` — Pure static HTML landing page (no package.json or requirements.txt)
- `wapp:skillfoundry` — Deployed artifact with no build manifest in root

These are correct — they have no framework.

---

## Agent Enhancements Made

### 1. Project Context Agent (`project-context-agent.ts`)

| Enhancement | Impact |
|-------------|--------|
| **Vite detection** | Fixed DORA, regforge.eu, SmartExchange, velamonte, halal, taxnavigator, etc. |
| **NestJS detection** (`@nestjs/core`) | Fixed SmartExchange API service |
| **react-scripts + Craco detection** | Fixed riskframe, miragedocs |
| **Sub-project framework detection** (Vite, NestJS, Express, Fastify) | Sub-projects now report full framework stack |
| **Monorepo fallback** | When root has no framework but sub-projects do, aggregates from subs |
| **Workspaces detection** | `package.json` with `workspaces` field now triggers monorepo detection |
| **pyproject.toml in sub-projects** | Now scanned alongside package.json and requirements.txt |

### 2. Contract Check Agent (`contract-check-agent.ts`)

| Enhancement | Impact |
|-------------|--------|
| **Centralized API clients** (`api.get`, `apiClient.post`, `request.delete`) | Detects imported axios/fetch wrappers |
| **Hardcoded domain fetch** (`fetch("http://localhost:5004/path")`) | compliance-suite pattern |
| **Template literal with baseURL** (`fetch(\`${BASE_URL}/path\`)`) | Dynamic URL composition |
| **Non-/api/ prefix paths** | All patterns now match `/path` not just `/api/path` |
| **NestJS decorators** (`@Get`, `@Post`, `@Put`, etc.) | SmartExchange backend routes |
| **Broader frontend heuristic** (stores/, web/, src/hooks/, src/api/) | More frontend files scanned |
| **Broader backend heuristic** (controllers/, modules/, .controller.ts) | NestJS controller files |
| **File scan limit** 200 → 500 | Large monorepos no longer truncated |

### 3. Security Scan Lite Agent (`security-scan-lite-agent.ts`)

| Enhancement | Impact |
|-------------|--------|
| **Setup script exclusion** (seed.js, create-admin, scripts/) | Eliminated ~30 false CRITICAL |
| **Validation message filter** ("Password is required") | No longer flags form error strings |
| **Localhost DB URL skip** (redis://localhost, postgres://localhost) | Dev connection strings excluded |
| **Parameterized SQL skip** (queries with `$1`, `$2` patterns) | Safe queries no longer flagged |
| **File scan limit** 500 → 1000 | Larger projects fully scanned |

---

## Per-Project Findings

### ~/apps/aidataclean
| Check | Result |
|-------|--------|
| Framework | fastapi |
| Language | typescript (monorepo: 1 sub) |
| Security | 3C / 3H / 1M / 2L (551 files) |
| Contracts | 14 frontend / 147 backend / 0 matched |
| **Remediation** | 3 CRITICAL hardcoded secrets need review. Frontend calls use patterns not yet in detection (likely custom API client). |

### ~/apps/aigovernance.work
| Check | Result |
|-------|--------|
| Framework | next@16.1.5 |
| Security | 1C / 0H / 0M / 7L (131 files) |
| Contracts | 0 frontend / 3 backend / — |
| **Remediation** | 1 CRITICAL secret to review. Minimal API surface — likely uses server actions or SSR. |

### ~/apps/amudfin
| Check | Result |
|-------|--------|
| Framework | fastapi + vite+react@^18.2.0 [MONO] |
| Sub-projects | backend(fastapi), frontend(vite+react), e2e(typescript) |
| Security | **0C** / 6H / 0M / 165L (301 files) |
| Contracts | 122 frontend / 236 backend / 3 matched (2%) |
| **Remediation** | CRITICALs eliminated (were setup scripts). 6 HIGH: auth endpoints need rate limiting. Low contract match rate — frontend likely uses API prefix added at FastAPI mount level. |

### ~/apps/auditsuite
| Check | Result |
|-------|--------|
| Framework | fastapi + angular@^19.2.0 + next@14.0.4 [MONO] |
| Sub-projects | 12 sub-projects across IPR, guardloop.dev, etc. |
| Security | 1C / 7H / 9M / 106L (692 files) |
| Contracts | 342 frontend / 315 backend / 150 matched (44%) |
| **Remediation** | Down from 3C→1C. Good match rate at 44%. Remaining mismatches likely from FastAPI router prefix resolution. |

### ~/apps/axiom.codes
| Check | Result |
|-------|--------|
| Framework | fastapi [MONO] |
| Security | 1C / 2H / 0M / 4L (69 files) |
| Contracts | 0 frontend / 23 backend / — |
| **Remediation** | 1 hardcoded secret, 2 HIGH (eval usage). Backend-only API — no frontend calls to check. |

### ~/apps/circularwatch.lu
| Check | Result |
|-------|--------|
| Framework | next@^14.2.0 [MONO] |
| Security | 0C / 1H / 11M / 402L (365 files) |
| Contracts | 77 frontend / 107 backend / 63 matched **(82%)** |
| **Remediation** | Clean — 0 CRITICAL. High contract match rate. 402 LOW are `:any` types. 1 HIGH: auth endpoint rate limiting. |

### ~/apps/compliance-suite
| Check | Result |
|-------|--------|
| Framework | react@18.2.0 + fastapi + vite+react + react@^19.1.1 [MONO] |
| Sub-projects | 6 sub-projects (app, merged-backend, global-portal, luxtaxflow, luxcompliance, shared-ui) |
| Security | 7C / 16H / 6M / 299L (581 files) |
| Contracts | 29 frontend / 603 backend / 10 matched (34%) |
| **Remediation** | Down from 21C→7C (14 false positives eliminated). Remaining 7 CRITICAL need manual review. 603 backend routes — massive API surface. Low frontend detection suggests hardcoded localhost:PORT fetch patterns in some sub-apps. |

### ~/apps/DORA
| Check | Result |
|-------|--------|
| Framework | **vite** (was NULL) |
| Security | 0C / 0H / 0M / 3L (23 files) |
| Contracts | N/A — frontend-only |
| **Remediation** | Clean project. 3 LOW code quality issues only. |

### ~/apps/financialai-v2
| Check | Result |
|-------|--------|
| Framework | angular@~20.3.0 [MONO] |
| Security | 0C / 1H / 6M / 169L (231 files) |
| Contracts | 127 frontend / 0 backend / 0 matched |
| **Remediation** | Clean. 127 frontend calls detected but 0 backend routes — API may be external or in separate repo. |

### ~/apps/FinancialRatingAI
| Check | Result |
|-------|--------|
| Framework | express [MONO] |
| Sub-projects | backup-old(flask), frontend(next@14.2.5) |
| Security | 1C / 4H / 33M / 7L (173 files) |
| Contracts | 14 frontend / 5 backend / 3 matched (21%) |
| **Remediation** | 33 MEDIUM findings — mostly data leak and cookie issues. Express backend needs better security hardening. |

### ~/apps/frontiercalc
| Check | Result |
|-------|--------|
| Framework | express + vite+react@^19.2.0 [MONO] |
| Security | **0C / 0H** / 0M / 0L (178 files) |
| Contracts | 2 frontend / 3 backend / 0 matched |
| **Remediation** | Perfectly clean security scan. Minimal API surface. |

### ~/apps/intrastat
| Check | Result |
|-------|--------|
| Framework | express |
| Security | 2C / 2H / 6M / 0L (48 files) |
| Contracts | 0 frontend / 35 backend / — |
| **Remediation** | Down from 7C→2C. Remaining 2 CRITICAL hardcoded secrets need review. Backend-only. |

### ~/apps/iznir
| Check | Result |
|-------|--------|
| Framework | next@14.2.29 |
| Security | **0C / 0H** / 1M / 0L (138 files) |
| Contracts | 67 frontend / 57 backend / 57 matched **(85%)** |
| **Remediation** | Excellent — clean security, high contract match rate. Model project. |

### ~/apps/lbrcompliancecockpit
| Check | Result |
|-------|--------|
| Framework | **express + next@^14.1.0** (was NULL) [MONO] |
| Security | 0C / 5H / 2M / 1L (123 files) |
| Contracts | 4 frontend / 58 backend / 1 matched (25%) |
| **Remediation** | 5 HIGH: auth endpoint rate limiting needed. Low frontend detection — may use server components or custom fetch wrapper. |

### ~/apps/LCF
| Check | Result |
|-------|--------|
| Framework | fastify + next@^15.1.0 [MONO] |
| Security | 0C / 2H / 6M / 0L (95 files) |
| Contracts | 6 frontend / 18 backend / 0 matched |
| **Remediation** | 2 HIGH auth issues. Frontend calls not matching backend — likely different path conventions. |

### ~/apps/luxcompliancesuite.com
| Check | Result |
|-------|--------|
| Framework | next@16.2.1 |
| Security | 1C / 0H / 7M / 0L (61 files) |
| Contracts | 14 frontend / 16 backend / 11 matched **(79%)** |
| **Remediation** | Good match rate. 1 CRITICAL to review. 7 MEDIUM cookie/CORS issues. |

### ~/apps/luxopenfin
| Check | Result |
|-------|--------|
| Framework | react@^19.0.0 [MONO] |
| Security | **0C / 0H / 0M / 0L** (51 files) |
| Contracts | N/A |
| **Remediation** | Perfectly clean. |

### ~/apps/miragedocs
| Check | Result |
|-------|--------|
| Framework | **express + react-scripts** (was NULL) [MONO] |
| Security | 0C / 2H / 2M / 0L (77 files) |
| Contracts | 23 frontend / 28 backend / 8 matched (35%) |
| **Remediation** | Down from 1C→0C. 2 HIGH: eval usage. Contract matching is moderate. |

### ~/apps/nasab
| Check | Result |
|-------|--------|
| Framework | next@14.2.15 [MONO] |
| Security | **0C / 0H** / 0M / 7L (29 files) |
| Contracts | N/A |
| **Remediation** | Clean. Code quality improvements possible (7 LOW `:any` types). |

### ~/apps/paiz
| Check | Result |
|-------|--------|
| Framework | **express + angular@^16.2.10 + next@^16.0.3** (was NULL) [MONO] |
| Security | 1C / 25H / 53M / 1248L (847 files) |
| Contracts | 68 frontend / 351 backend / 7 matched (10%) |
| **Remediation** | Largest LOW count (1248) — massive codebase with many `:any` types. 25 HIGH mostly auth endpoint rate limiting. Needs comprehensive security review. |

### ~/apps/partown.eu
| Check | Result |
|-------|--------|
| Framework | fastapi + next@16.1.0 [MONO] |
| Security | 1C / 4H / 2M / 4L (136 files) |
| Contracts | 26 frontend / 44 backend / 9 matched (35%) |
| **Remediation** | 1 CRITICAL hardcoded secret. 4 HIGH: auth endpoints need rate limiting. |

### ~/apps/Phylon
| Check | Result |
|-------|--------|
| Framework | fastapi + vite+react@^19.2.0 [MONO] |
| Security | 7C / 4H / 0M / 127L (771 files) |
| Contracts | 358 frontend / 398 backend / **0 matched (0%)** |
| **Remediation** | Up from 5C→7C (more files scanned). **0% match rate** — FastAPI router prefixes applied at app mount level (`include_router(router, prefix="/classification")`) cause frontend paths like `/classification/jobs/:id` to not match backend paths like `/jobs/{job_id}`. **MCP Enhancement needed**: Parse FastAPI `include_router` prefix resolution. |

### ~/apps/planscan
| Check | Result |
|-------|--------|
| Framework | express |
| Security | 4C / 2H / 9M / 38L (185 files) |
| Contracts | 8 frontend / 16 backend / 6 matched (75%) |
| **Remediation** | Down from 5C→4C. Good match rate. 4 CRITICAL hardcoded secrets need review. |

### ~/apps/portman
| Check | Result |
|-------|--------|
| Framework | express |
| Security | 0C / 1H / 9M / 16L (82 files) |
| Contracts | 0 frontend / 20 backend / — |
| **Remediation** | Backend-only Express API. 1 HIGH rate limiting issue. 9 MEDIUM cookie/data-leak. |

### ~/apps/regforge.eu
| Check | Result |
|-------|--------|
| Framework | **express + vite+react@^19.1.0** (was NULL) [MONO] |
| Security | **0C** / 8H / 4M / 0L (73 files) |
| Contracts | 14 frontend / 45 backend / 0 matched |
| **Remediation** | 0 CRITICAL (clean). 8 HIGH: auth endpoints need rate limiting. Contract paths don't match — likely prefix issue. |

### ~/apps/regpilot
| Check | Result |
|-------|--------|
| Framework | fastapi + vite+react@^19.1.1 [MONO] |
| Security | 7C / 15H / 18M / 0L (1000 files) |
| Contracts | 28 frontend / 67 backend / 1 matched (4%) |
| **Remediation** | Hit 1000-file scan limit (up from 500). 7 CRITICAL secrets need manual review. 15 HIGH: SQL injection + auth rate limiting. Low match rate — FastAPI prefix issue. |

### ~/apps/RestaurantBOB
| Check | Result |
|-------|--------|
| Framework | flask |
| Security | **0C / 0H / 0M / 0L** (17 files) |
| Contracts | N/A |
| **Remediation** | Perfectly clean. Small Flask app. |

### ~/apps/riskframe
| Check | Result |
|-------|--------|
| Framework | **express + react-cra-craco** (was NULL) [MONO] |
| Security | 3C / 2H / 24M / 0L (97 files) |
| Contracts | 30 frontend / 40 backend / 1 matched (3%) |
| **Remediation** | Down from 11C→3C (8 false positives eliminated — seed files, setup scripts). 24 MEDIUM mostly data-leak console.log. Low contract match — frontend may use different API base path. |

### ~/apps/SmartExchange
| Check | Result |
|-------|--------|
| Framework | **fastapi + vite+react@^18.2.0 + nestjs@^10.3.0 + next@14.0.4** (was NULL) [MONO] |
| Sub-projects | 7 (backend, shared-types, eslint-config, web, api/nestjs, frontend/next) |
| Security | 2C / 5H / 13M / 156L (443 files) |
| Contracts | 134 frontend / 104 backend / 2 matched (1%) |
| **Remediation** | Down from 9C→2C. Complex multi-framework monorepo. Low match — NestJS routes use controller-level prefixes. **MCP Enhancement needed**: Parse NestJS `@Controller("/prefix")` prefix resolution. |

### ~/apps/taxnavigator
| Check | Result |
|-------|--------|
| Framework | fastapi + vite+react@^18.2.0 [MONO] |
| Security | 4C / 8H / 0M / 7L (337 files) |
| Contracts | 244 frontend / 303 backend / 7 matched (3%) |
| **Remediation** | Down from 6C→4C. 244 frontend calls now detected (was 0). Low match — centralized API client in `services/api.ts` uses paths without FastAPI mount prefix. |

### ~/apps/taxnavigator_old
| Check | Result |
|-------|--------|
| Framework | fastapi + vite+react@^18.2.0 [MONO] |
| Security | 0C / 5H / 0M / 0L (316 files) |
| Contracts | 50 frontend / 121 backend / 1 matched (2%) |
| **Remediation** | Clean of CRITICALs. Same prefix mismatch issue. |

### ~/apps/tdf
| Check | Result |
|-------|--------|
| Framework | react@18.2.0 + vite [MONO] |
| Sub-projects | tdf-mobile, tdf-ts, tdf-viewer, tdf-desktop-viewer |
| Security | **0C / 0H** / 0M / 28L (43 files) |
| Contracts | N/A — frontend-only |
| **Remediation** | Clean. Multi-platform frontend (mobile, desktop, web). |

### ~/apps/TestimonialCollector
| Check | Result |
|-------|--------|
| Framework | express + vite+react@^19.2.0 [MONO] |
| Security | 3C / 4H / 1M / 137L (141 files) |
| Contracts | 89 frontend / 94 backend / 2 matched (2%) |
| **Remediation** | Down from 5C→3C. 89 frontend calls now detected (was 0). Low match rate — frontend uses centralized API client with different base paths. |

### ~/apps/testmcp_new
| Check | Result |
|-------|--------|
| Framework | next@15.2.0 |
| Security | 1C / 0H / 1M / 0L (2 files) |
| Contracts | 3 frontend / 2 backend / 0 matched |
| **Remediation** | Test project with intentional hardcoded credentials. |

### ~/apps/vatwise
| Check | Result |
|-------|--------|
| Framework | express + vite+react@^18.3.1 [MONO] |
| Security | 0C / 6H / 1M / 0L (40 files) |
| Contracts | 26 frontend / 39 backend / 24 matched **(92%)** |
| **Remediation** | Excellent contract match rate. 6 HIGH: auth endpoints need rate limiting. |

### ~/apps/velamonte
| Check | Result |
|-------|--------|
| Framework | **express + next@^14.2.33 + vite+react@^19.2.0** (was NULL) [MONO] |
| Security | **0C** / 8H / 24M / 369L (355 files) |
| Contracts | 270 frontend / 230 backend / 7 matched (3%) |
| **Remediation** | Down from 2C→0C (setup scripts excluded). 270 frontend calls now detected. Low match — Express routes and frontend paths diverge. |

### ~/wapplications/DORA
| Check | Result |
|-------|--------|
| Framework | **vite** (was NULL) |
| Security | **0C / 0H** / 0M / 3L (23 files) |
| **Remediation** | Clean. Same as ~/apps/DORA. |

### ~/wapplications/halal
| Check | Result |
|-------|--------|
| Framework | **vite** (was NULL) [MONO] |
| Security | **0C / 0H** / 1M / 0L (58 files) |
| Contracts | 16 frontend / 23 backend / 0 matched |
| **Remediation** | Clean. Low contract match — path prefix issue. |

### ~/wapplications/lbrcompliancecockpit
| Check | Result |
|-------|--------|
| Framework | **express + next@^14.1.0** (was NULL) [MONO] |
| Security | **0C / 0H** / 1M / 0L (65 files) |
| Contracts | 0 frontend / 8 backend / — |
| **Remediation** | Clean. |

### ~/wapplications/RealEstate_Charlier_BE
| Check | Result |
|-------|--------|
| Framework | fastapi + vite+react@^19.2.0 [MONO] |
| Security | 0C / 1H / 0M / 5L (16 files) |
| Contracts | 4 frontend / 6 backend / 2 matched (50%) |
| **Remediation** | 1 HIGH: auth rate limiting. Small project with decent match rate. |

### ~/wapplications/stackquadrant
| Check | Result |
|-------|--------|
| Framework | next@16.1.6 |
| Security | **0C / 0H** / 3M / 0L (259 files) |
| Contracts | 24 frontend / 159 backend / 17 matched **(71%)** |
| **Remediation** | Clean security. Good contract match rate. |

### ~/wapplications/skillfoundry
| Check | Result |
|-------|--------|
| Framework | NULL (static site — correct) |
| Security | **0C / 0H / 0M / 0L** (1 file) |
| **Remediation** | None needed. |

---

## Top Projects by Match Rate (Contract Check)

| Project | Match Rate | Frontend | Backend | Matched |
|---------|-----------|----------|---------|---------|
| vatwise | **92%** | 26 | 39 | 24 |
| iznir | **85%** | 67 | 57 | 57 |
| circularwatch.lu | **82%** | 77 | 107 | 63 |
| luxcompliancesuite.com | **79%** | 14 | 16 | 11 |
| planscan | **75%** | 8 | 16 | 6 |
| wapp:stackquadrant | **71%** | 24 | 159 | 17 |
| wapp:RealEstate_Charlier_BE | **50%** | 4 | 6 | 2 |
| auditsuite | **44%** | 342 | 315 | 150 |

---

## Known Limitations & Future Enhancements

### 1. FastAPI Router Prefix Resolution
**Affected**: Phylon, taxnavigator, amudfin, regpilot, auditsuite (partial)
**Issue**: FastAPI's `app.include_router(router, prefix="/classification")` adds a prefix at mount time. Backend route decorators like `@router.get("/jobs/{id}")` become `/classification/jobs/{id}` at runtime, but the scanner only sees `/jobs/{id}`.
**Fix**: Parse `include_router()` calls to resolve full paths.

### 2. NestJS Controller Prefix Resolution
**Affected**: SmartExchange
**Issue**: `@Controller("/api/v1/exchange")` adds a prefix to all `@Get()`, `@Post()` routes in the controller.
**Fix**: Parse `@Controller()` decorator prefix and prepend to route methods.

### 3. Centralized API Client Variable Resolution
**Affected**: Phylon, taxnavigator, TestimonialCollector
**Issue**: `const api = axios.create(...)` exports an instance. Consumer files call `api.get("/path")` — the scanner detects these now, but `api` imported from another file can't be traced to its `baseURL` config.
**Fix**: Two-pass scan — first pass finds `axios.create({ baseURL })` exports, second pass resolves imported clients.

### 4. Type-Evasion LOW Findings Volume
**Issue**: 437 LOW findings across 23 projects for `:any` type usage creates noise.
**Potential**: Add a `--min-severity` flag to filter LOW findings, or separate code-quality from security reports.

---

## Security Scorecard

| Rating | Projects |
|--------|----------|
| **A (0C, 0H)** | frontiercalc, luxopenfin, RestaurantBOB, DORA, wapp:DORA, nasab, tdf, wapp:skillfoundry |
| **B (0C, <5H)** | circularwatch.lu, financialai-v2, LCF, miragedocs, portman, wapp:halal, wapp:lbrcompliancecockpit, wapp:stackquadrant |
| **C (0C, 5+H)** | amudfin, vatwise, lbrcompliancecockpit, taxnavigator_old, velamonte, regforge.eu |
| **D (<5C)** | auditsuite, riskframe, SmartExchange, intrastat, aigovernance.work, luxcompliancesuite.com, testmcp_new, partown.eu, axiom.codes, FinancialRatingAI, planscan, TestimonialCollector, aidataclean, paiz, taxnavigator |
| **F (5+C)** | compliance-suite, regpilot, Phylon |

---

## Aggregate Statistics

- **Total projects scanned**: 43
- **Total files scanned** (security): 9,513
- **Total security findings**: 50 CRITICAL, 149 HIGH, 222 MEDIUM, 2,778 LOW
- **Total frontend API calls detected**: 2,233
- **Total backend routes detected**: 4,268
- **Total contracts matched**: 399
- **Monorepos detected**: 29 / 43 (67%)
- **Frameworks detected**: 41 / 43 (95%)

---

_Generated by SkillFoundry MCP v4.0.0 — Bulk Assessment Pipeline_
