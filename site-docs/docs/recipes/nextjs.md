---
sidebar_position: 1
title: "Next.js"
---

# Add SkillFoundry to a Next.js Project

This recipe walks through installing SkillFoundry in an existing Next.js project, creating your first PRD, running the forge pipeline, and understanding how quality gates interact with Next.js patterns.

## Prerequisites

- **Node.js 20+** and npm 9+ (or pnpm 8+)
- An existing **Next.js 14+** project (App Router or Pages Router)
- **Git** initialized in the project
- Claude Code CLI installed, or an `ANTHROPIC_API_KEY` set in your environment

## Step 1: Install SkillFoundry

Install the CLI globally and initialize it in your Next.js project:

```bash
npm install -g skillfoundry
```

Navigate to your Next.js project root and run the initializer:

```bash
cd ~/projects/my-nextjs-app
skillfoundry init --platform=claude
```

Expected output:

```
  SkillFoundry v2.0.42
  ✓ Created .skillfoundry/config.toml
  ✓ Created CLAUDE.md with framework instructions
  ✓ Created genesis/ directory
  ✓ Platform configured: claude
  ✓ Initialization complete
```

Your project structure now includes:

```
my-nextjs-app/
├── .skillfoundry/
│   └── config.toml
├── CLAUDE.md
├── genesis/
├── src/
│   └── app/           # Next.js App Router
├── next.config.js
├── tsconfig.json
└── package.json
```

## Step 2: Configure TypeScript

SkillFoundry generates TypeScript code by default. Verify your `tsconfig.json` includes these settings for compatibility with generated code:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Key considerations:

- **`strict: true`** — SkillFoundry-generated code assumes strict mode. Disabling it may cause gates to flag issues that TypeScript would otherwise catch.
- **Path aliases** — If your project uses `@/` imports, keep them. Generated code will respect the alias configuration in your `tsconfig.json`.
- **`moduleResolution`** — Use `"bundler"` (Next.js 14 default) or `"node"`. Both are supported.

## Step 3: Create Your First PRD

Create a PRD for a typical Next.js feature. This example builds an API route with a corresponding page:

```bash
skillfoundry prd "User profile page with API route"
```

This creates a file in `genesis/`. Open it and refine the generated content:

```markdown
<!-- genesis/2026-03-16-user-profile-page.md -->

# User Profile Page with API Route

## Problem Statement
Users need a profile page that displays their account information,
fetched from a server-side API route with proper authentication.

## User Stories

### Story 1: Profile API Route
**As a** logged-in user
**I want** a GET /api/profile endpoint
**So that** my profile data is served securely from the server

**Acceptance Criteria:**
- Given an authenticated request, return user profile JSON
- Given an unauthenticated request, return 401
- Given a server error, return 500 with a safe error message

### Story 2: Profile Page
**As a** logged-in user
**I want** to view my profile at /profile
**So that** I can see my account details

**Acceptance Criteria:**
- Page fetches data from /api/profile on load
- Loading state displayed while fetching
- Error state displayed on failure
- Profile fields: name, email, joined date

## Security Requirements
- API route validates session token
- No sensitive data in client-side logs
- Server-side rendering for initial load

## Out of Scope
- Profile editing (separate PRD)
- Avatar upload
```

## Step 4: Run Forge

Execute the forge pipeline to implement the PRD:

```bash
skillfoundry forge run
```

Expected output:

```
  SkillFoundry Forge v2.0.42

  Phase 1: PRD Validation
  ✓ genesis/2026-03-16-user-profile-page.md — valid

  Phase 2: Story Decomposition
  ✓ STORY-001: Profile API Route
  ✓ STORY-002: Profile Page Component

  Phase 3: Implementation
  ✓ src/app/api/profile/route.ts — created
  ✓ src/app/profile/page.tsx — created
  ✓ src/app/profile/loading.tsx — created
  ✓ src/app/profile/error.tsx — created
  ✓ src/lib/services/profile.ts — created
  ✓ src/lib/types/profile.ts — created

  Phase 4: Gate Execution
  Running T1-T6 quality gates...
  ✓ T1: Structure — pass
  ✓ T2: Types — pass
  ✓ T3: Logic — pass
  ✓ T4: Security — pass
  ✓ T5: Tests — pass
  ✓ T6: Integration — pass

  Phase 5: Validation
  ✓ All stories implemented
  ✓ All gates passed
  ✓ 6/6 files created

  Done in 42s
```

## Step 5: Review Gate Results

Each gate (T1 through T6) checks a different quality dimension. Here is what they look for in a Next.js project:

| Gate | Name | What It Checks in Next.js |
|------|------|---------------------------|
| **T1** | Structure | File placement follows App Router conventions (`route.ts` in `api/`, `page.tsx` in route segments). Verifies `loading.tsx` and `error.tsx` exist for pages that fetch data. |
| **T2** | Types | All props, API responses, and service return types are explicitly typed. No `any` usage. Ensures `searchParams` and `params` types match Next.js expectations. |
| **T3** | Logic | Business logic is extracted into `lib/services/` rather than inlined in route handlers or components. Validates error handling covers expected failure modes. |
| **T4** | Security | API routes validate authentication. No secrets in client components. `headers()` and `cookies()` usage follows secure patterns. Server Actions (if used) include CSRF protection. |
| **T5** | Tests | Test files exist for API routes and service functions. Tests cover success, auth failure, and error cases. Minimum 80% coverage on business logic. |
| **T6** | Integration | API routes return correct status codes and response shapes. Pages render without hydration errors. Loading and error states function correctly. |

To view a detailed gate report:

```bash
skillfoundry gate report --html
```

This generates an HTML report at `.skillfoundry/reports/` that you can open in a browser.

## Tips: Next.js-Specific Patterns

### Dynamic Imports

Gates understand `next/dynamic` for client-side-only components. If a gate flags a component for missing server-side rendering, wrapping it with `dynamic(() => import(...), { ssr: false })` is a valid resolution and the gate will accept it on re-run.

### API Routes vs Server Actions

SkillFoundry generates API routes (`route.ts`) by default for data operations. If your project uses Server Actions, note that:

- T4 (Security) checks that Server Actions include the `"use server"` directive at the top of the file
- T3 (Logic) validates that Server Actions handle revalidation (`revalidatePath` / `revalidateTag`) when mutating data

### Middleware

If your project uses `middleware.ts` for authentication or redirects, SkillFoundry gates will:

- Verify that protected API routes are covered by middleware matchers
- Check that middleware does not block static assets or `_next/` paths
- Validate that middleware response headers include security headers

### Static vs Dynamic Rendering

T3 (Logic) detects whether a page should be static or dynamic based on its data fetching pattern:

- Pages using `fetch()` with `{ cache: 'force-cache' }` or `generateStaticParams` are expected to be static
- Pages using `cookies()`, `headers()`, or `searchParams` are expected to be dynamic
- Mismatches produce a warning, not a failure

## Next Steps

- [Configuration](/configuration) — Customize gate thresholds and framework settings
- [Monorepo Recipe](/recipes/monorepo) — If your Next.js app is part of a monorepo
- [Azure DevOps Recipe](/recipes/azure-devops) — Run gates in CI/CD pipelines
