---
sidebar_position: 2
title: "Monorepo"
---

# SkillFoundry in a TypeScript Monorepo

This recipe covers setting up SkillFoundry in a monorepo that uses pnpm workspaces, Turborepo, or Nx. The key principle: **install at the root, scope PRDs to specific packages, and let gates respect workspace boundaries**.

## Prerequisites

- **Node.js 20+** and a workspace-aware package manager (pnpm 8+, npm 9+, or yarn 4+)
- A monorepo with at least two packages
- **Git** initialized at the monorepo root
- Claude Code CLI installed, or an `ANTHROPIC_API_KEY` set in your environment

## Monorepo Structure Overview

A typical TypeScript monorepo with SkillFoundry installed:

```
my-monorepo/
├── .skillfoundry/
│   └── config.toml            # Single config at root
├── CLAUDE.md                  # Agent rules for the whole repo
├── genesis/                   # PRDs scoped to packages
├── packages/
│   ├── web/                   # Next.js frontend
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── api/                   # Express/Fastify backend
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared/                # Shared types and utilities
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── pnpm-workspace.yaml
├── turbo.json                 # or nx.json
├── tsconfig.base.json
└── package.json
```

## Step 1: Install at the Root

Always install SkillFoundry at the monorepo root, not inside individual packages:

```bash
cd ~/projects/my-monorepo
npm install -g skillfoundry
skillfoundry init --platform=claude
```

This creates a single `.skillfoundry/` directory and `CLAUDE.md` at the root. All packages share the same framework configuration.

:::warning
Do **not** run `skillfoundry init` inside individual packages. Multiple `.skillfoundry/` directories cause config conflicts and inconsistent gate results.
:::

## Step 2: Configure Workspace Awareness

SkillFoundry auto-detects workspace configuration from these files:

| Tool | Detection File | Notes |
|------|---------------|-------|
| **pnpm** | `pnpm-workspace.yaml` | Reads `packages:` glob patterns |
| **npm** | `package.json` `workspaces` field | Reads the `workspaces` array |
| **Turborepo** | `turbo.json` | Reads `pipeline` for task dependencies |
| **Nx** | `nx.json` | Reads `targetDefaults` and project graph |

No additional configuration is required. SkillFoundry reads the workspace manifest to understand package boundaries.

## Step 3: Scope PRDs to Packages

When creating PRDs, specify which package the feature targets. This ensures generated code lands in the correct directory and gates run against the right package:

```bash
skillfoundry prd "Add user search endpoint to api package"
```

In the PRD, use the **Scope** section to declare the target:

```markdown
<!-- genesis/2026-03-16-user-search-endpoint.md -->

# User Search Endpoint

## Scope
- **Primary package:** packages/api
- **Shared types:** packages/shared
- **No changes to:** packages/web

## Problem Statement
The API needs a search endpoint that accepts a query string
and returns matching users with pagination.

## User Stories
...
```

When forge runs this PRD, it will:

1. Generate implementation files under `packages/api/src/`
2. Add shared types to `packages/shared/src/types/`
3. Run gates only against `packages/api` and `packages/shared`
4. Skip `packages/web` entirely

## Step 4: Gate Execution Across Packages

Gates run per-package by default, respecting workspace boundaries:

```bash
# Run gates for all packages (default)
skillfoundry gate run

# Run gates for a specific package
skillfoundry gate run --scope=packages/api

# Run gates for multiple packages
skillfoundry gate run --scope=packages/api --scope=packages/shared
```

Expected output for a multi-package run:

```
  SkillFoundry Gates v2.0.42

  packages/shared
  ✓ T1: Structure — pass
  ✓ T2: Types — pass
  ✓ T3: Logic — pass
  ✓ T4: Security — pass
  ✓ T5: Tests — pass
  ✓ T6: Integration — pass

  packages/api
  ✓ T1: Structure — pass
  ✓ T2: Types — pass
  ✓ T3: Logic — pass
  ✓ T4: Security — pass (1 warning)
  ✓ T5: Tests — pass
  ✓ T6: Integration — pass

  packages/web — skipped (no changes)

  Summary: 12/12 gates passed, 1 warning
```

## Workspace Tool Configuration

### pnpm Workspaces

Ensure your `pnpm-workspace.yaml` lists all packages:

```yaml
packages:
  - "packages/*"
```

SkillFoundry reads this file to discover packages. Packages not listed here are invisible to the framework.

### Turborepo

If you use Turborepo, SkillFoundry integrates with the task pipeline. Add a `gate` task to your `turbo.json`:

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "gate": {
      "dependsOn": ["build"],
      "cache": false
    }
  }
}
```

Then run gates through Turborepo for dependency-aware execution:

```bash
turbo run gate
```

This ensures `packages/shared` is built before `packages/api` gates run, since the API depends on shared types.

### Nx

For Nx workspaces, add a `gate` target to your `project.json` files or use the Nx plugin:

```json
{
  "targets": {
    "gate": {
      "executor": "nx:run-commands",
      "options": {
        "command": "skillfoundry gate run --scope={projectRoot}"
      },
      "dependsOn": ["build"]
    }
  }
}
```

Run gates with Nx's dependency graph awareness:

```bash
nx run-many --target=gate --affected
```

This runs gates only for packages affected by the current changes.

## Tips: Common Monorepo Patterns

### tsconfig Paths and Shared Types

When packages import from each other via TypeScript path aliases, gates resolve imports using your `tsconfig.json` `paths` configuration. Ensure your base config maps workspace packages:

```json
{
  "compilerOptions": {
    "paths": {
      "@my-monorepo/shared/*": ["./packages/shared/src/*"],
      "@my-monorepo/api/*": ["./packages/api/src/*"]
    }
  }
}
```

T2 (Types) will follow these paths when checking type consistency across package boundaries. If a shared type changes, T2 flags all consuming packages that need updates.

### Shared Types Package

A common pattern is a `packages/shared` package that exports types, constants, and utility functions. Gates handle this by:

- **T2 (Types):** Verifying that exported types from `shared` match their usage in consuming packages
- **T5 (Tests):** Requiring tests for utility functions in `shared`, but not for pure type exports
- **T6 (Integration):** Checking that shared package builds successfully before dependent packages are validated

### Test Patterns

Each package should have its own test configuration. Gates look for test files relative to each package root:

```
packages/api/
├── src/
│   └── routes/user.ts
├── tests/
│   └── routes/user.test.ts      # Gates find this
├── jest.config.ts                # Package-level config
└── package.json
```

Gates use the test runner specified in each package's `package.json` scripts. If `packages/api` uses Vitest and `packages/web` uses Jest, both are supported in the same monorepo.

### Cross-Package Dependencies

When a PRD touches multiple packages, forge executes stories in dependency order:

1. Shared types and utilities first (`packages/shared`)
2. Backend services next (`packages/api`)
3. Frontend consumers last (`packages/web`)

This prevents build failures from missing dependencies during implementation.

## Next Steps

- [Configuration](/configuration) — Full config reference including workspace settings
- [Next.js Recipe](/recipes/nextjs) — If your monorepo includes a Next.js app
- [Azure DevOps Recipe](/recipes/azure-devops) — CI/CD pipeline setup for monorepos
