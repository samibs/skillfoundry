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

export const ALL_TOOL_AGENTS = [...TIER1_TOOLS, ...TIER2_TOOLS, ...TIER3_TOOLS];
