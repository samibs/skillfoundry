/**
 * Tool Registry — defines all tool agent MCP tool schemas.
 * Separated from handler.ts to keep things manageable.
 */

// Tier 1: Verification agents
export const TIER1_TOOLS = [
  {
    name: "sf_build",
    description: "Run the project build and return pass/fail with errors.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Project root path" },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_run_tests",
    description: "Run the project's test suite (vitest/jest/mocha) and return structured results.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Project root path" },
        pattern: { type: "string", description: "Test file pattern filter" },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_check_deps",
    description: "Check all dependencies: version existence, maturity classification, peer conflicts.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Project root path" },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_assign_port",
    description: "Assign a port via portman (if available) or find a free one. Never hardcode 3000.",
    inputSchema: {
      type: "object" as const,
      properties: {
        appName: { type: "string", description: "Application name for registration" },
      },
      required: ["appName"],
    },
  },
  {
    name: "sf_check_port",
    description: "Check if a specific port is in use and what process owns it.",
    inputSchema: {
      type: "object" as const,
      properties: {
        port: { type: "number", description: "Port number to check" },
      },
      required: ["port"],
    },
  },
];

// Tier 2: Development workflow agents
export const TIER2_TOOLS = [
  {
    name: "sf_git_status",
    description: "Get git status: branch, staged/modified/untracked files, ahead/behind.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Project root path" },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_git_commit",
    description: "Stage files and create a git commit.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Project root path" },
        message: { type: "string", description: "Commit message" },
        files: { type: "array", items: { type: "string" }, description: "Files to stage (optional, stages all if omitted)" },
      },
      required: ["projectPath", "message"],
    },
  },
  {
    name: "sf_typecheck",
    description: "Run TypeScript type checker (tsc --noEmit) and return diagnostics.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Project root path" },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_lint",
    description: "Run linter (ESLint/Biome) and return issues. Optionally auto-fix.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Project root path" },
        autoFix: { type: "boolean", description: "Auto-fix fixable issues" },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_migrate",
    description: "Run database migration (Prisma/Drizzle/Knex). Actions: deploy, status, seed, reset.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Project root path" },
        action: { type: "string", enum: ["deploy", "status", "seed", "reset"], description: "Migration action" },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_check_env",
    description: "Compare .env against .env.example. Find missing/empty vars. Optionally auto-generate secrets.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Project root path" },
        autoGenerate: { type: "boolean", description: "Auto-generate missing secrets (SECRET, API_KEY, WEBHOOK)" },
      },
      required: ["projectPath"],
    },
  },
];

// Tier 3: Differentiator agents
export const TIER3_TOOLS = [
  {
    name: "sf_lighthouse",
    description: "Run Lighthouse performance audit on a URL. Returns scores for performance, accessibility, SEO.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to audit" },
      },
      required: ["url"],
    },
  },
  {
    name: "sf_docker_build",
    description: "Build a Docker image from a project's Dockerfile.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Project root path" },
        tag: { type: "string", description: "Image tag (default: sf-<project>:latest)" },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_docker_compose",
    description: "Run docker compose up --build for a project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Project root path" },
        detach: { type: "boolean", description: "Run in background" },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_nginx_config",
    description: "Generate and validate an nginx reverse proxy config for an app.",
    inputSchema: {
      type: "object" as const,
      properties: {
        domain: { type: "string", description: "Domain name" },
        port: { type: "number", description: "Upstream app port" },
        ssl: { type: "boolean", description: "Enable SSL (default: true)" },
      },
      required: ["domain", "port"],
    },
  },
];

// Tier 4: Knowledge & Analysis agents (from cross-project analysis lessons)
export const TIER4_TOOLS = [
  {
    name: "sf_contract_check",
    description:
      "Validate frontend API calls match actual backend endpoints. " +
      "Catches the #1 vibe-coding failure: frontend/backend contract mismatches.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Project root path" },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_project_context",
    description:
      "Generate project-specific context by scanning package.json, DB config, env vars, " +
      "and project structure. Produces what a project-specific CLAUDE.md should contain.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Project root path" },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_security_scan_lite",
    description:
      "Fast regex-based security scan for hardcoded secrets, CORS wildcards, SQL injection, " +
      "eval usage, and missing auth guards. Lighter than sf_security_scan (Semgrep).",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Project root path" },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_version_check",
    description:
      "Compare PRD version specifications against actual installed packages. " +
      "Catches version drift (e.g., PRD says Prisma 5 but npm installed Prisma 7).",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: { type: "string", description: "Project root path" },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "sf_session_record",
    description:
      "Record decisions, corrections, errors, and patterns during development. " +
      "Auto-detects scope (project vs universal) and tags. Use during any dev session, not just forge.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: ["record", "query", "promote"],
          description: "record: save entry, query: search entries, promote: list universal entries",
        },
        projectPath: { type: "string", description: "Project root path" },
        entryType: {
          type: "string",
          enum: ["decision", "correction", "error", "fact", "pattern"],
          description: "Type of knowledge entry",
        },
        content: { type: "string", description: "The knowledge content to record" },
        context: { type: "string", description: "Additional context (what triggered this)" },
        scope: {
          type: "string",
          enum: ["project", "universal"],
          description: "Scope for promotion (auto-detected if omitted)",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags (auto-extracted if omitted)",
        },
        limit: { type: "number", description: "Max results for query action" },
      },
      required: ["action", "projectPath"],
    },
  },
];

export const ALL_TOOL_AGENTS = [...TIER1_TOOLS, ...TIER2_TOOLS, ...TIER3_TOOLS, ...TIER4_TOOLS];
