/**
 * Project Context Agent — generates project-specific context from actual project files.
 *
 * Scans package.json, requirements.txt, DB config, .env.example, and project structure
 * to produce a structured context document. This replaces the need for manually writing
 * project-specific CLAUDE.md content.
 */

import { readFile, access } from "fs/promises";
import path from "path";
import { exec } from "./exec-utils.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectContext {
  projectName: string;
  projectPath: string;
  language: string;
  framework: string | null;
  runtime: string | null;
  database: DatabaseContext | null;
  auth: AuthContext | null;
  orm: string | null;
  testFramework: string | null;
  linter: string | null;
  buildTool: string | null;
  packageManager: string;
  cssFramework: string | null;
  uiLibrary: string | null;
  apiStyle: string | null;
  envVars: string[];
  scripts: Record<string, string>;
  ports: number[];
  platforms: string[];
  keyDependencies: DependencyInfo[];
  projectStructure: string[];
  warnings: string[];
  duration: number;
}

interface DatabaseContext {
  type: string; // postgres, sqlite, mysql, mssql, mongodb
  connectionEnvVar: string | null;
  schema: string | null; // prisma, drizzle schema path
}

interface AuthContext {
  library: string;
  version: string;
  providers: string[];
}

interface DependencyInfo {
  name: string;
  version: string;
  role: string;
}

// ─── Detection Logic ────────────────────────────────────────────────────────

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function safeReadJson(p: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(p, "utf-8");
    return JSON.parse(content);
  } catch { return null; }
}

async function safeReadText(p: string): Promise<string | null> {
  try { return await readFile(p, "utf-8"); } catch { return null; }
}

function detectDatabase(deps: Record<string, string>, envContent: string | null): DatabaseContext | null {
  const envStr = envContent || "";

  if (deps["pg"] || deps["postgres"] || deps["@neondatabase/serverless"]) {
    return {
      type: "postgresql",
      connectionEnvVar: envStr.match(/^(DATABASE_URL|POSTGRES_URL|PG_.*)/m)?.[1] || "DATABASE_URL",
      schema: null,
    };
  }
  if (deps["better-sqlite3"] || deps["sqlite3"]) {
    return { type: "sqlite", connectionEnvVar: envStr.match(/^(DATABASE_.*|SQLITE_.*)/m)?.[1] || null, schema: null };
  }
  if (deps["mysql2"] || deps["mysql"]) {
    return { type: "mysql", connectionEnvVar: envStr.match(/^(DATABASE_URL|MYSQL_.*)/m)?.[1] || "DATABASE_URL", schema: null };
  }
  if (deps["mssql"] || deps["tedious"]) {
    return { type: "mssql", connectionEnvVar: envStr.match(/^(DATABASE_URL|MSSQL_.*|SQL_.*)/m)?.[1] || null, schema: null };
  }
  if (deps["mongoose"] || deps["mongodb"]) {
    return { type: "mongodb", connectionEnvVar: envStr.match(/^(MONGODB_URI|MONGO_.*)/m)?.[1] || "MONGODB_URI", schema: null };
  }

  return null;
}

function detectAuth(deps: Record<string, string>): AuthContext | null {
  if (deps["next-auth"] || deps["@auth/core"]) {
    return { library: "next-auth", version: deps["next-auth"] || deps["@auth/core"] || "", providers: [] };
  }
  if (deps["passport"]) {
    return { library: "passport", version: deps["passport"], providers: [] };
  }
  if (deps["lucia"]) {
    return { library: "lucia", version: deps["lucia"], providers: [] };
  }
  if (deps["@clerk/nextjs"] || deps["@clerk/clerk-sdk-node"]) {
    return { library: "clerk", version: deps["@clerk/nextjs"] || deps["@clerk/clerk-sdk-node"] || "", providers: [] };
  }
  if (deps["@supabase/supabase-js"]) {
    return { library: "supabase-auth", version: deps["@supabase/supabase-js"], providers: [] };
  }
  return null;
}

function detectOrm(deps: Record<string, string>): string | null {
  if (deps["prisma"] || deps["@prisma/client"]) return "prisma";
  if (deps["drizzle-orm"]) return "drizzle";
  if (deps["typeorm"]) return "typeorm";
  if (deps["knex"]) return "knex";
  if (deps["sequelize"]) return "sequelize";
  if (deps["mongoose"]) return "mongoose";
  return null;
}

function detectKeyDeps(deps: Record<string, string>): DependencyInfo[] {
  const important: Record<string, string> = {
    "next": "framework",
    "react": "ui-library",
    "vue": "ui-library",
    "svelte": "ui-library",
    "express": "server",
    "fastify": "server",
    "hono": "server",
    "tailwindcss": "css-framework",
    "stripe": "payments",
    "@anthropic-ai/sdk": "ai",
    "openai": "ai",
    "zod": "validation",
    "trpc": "api",
    "@tanstack/react-query": "data-fetching",
    "socket.io": "realtime",
    "bullmq": "queue",
    "redis": "cache",
    "ioredis": "cache",
  };

  const result: DependencyInfo[] = [];
  for (const [name, role] of Object.entries(important)) {
    if (deps[name]) {
      result.push({ name, version: deps[name], role });
    }
  }
  return result;
}

function extractEnvVars(envContent: string): string[] {
  return envContent
    .split("\n")
    .filter((line) => /^[A-Z_][A-Z0-9_]*=/.test(line.trim()))
    .map((line) => line.split("=")[0].trim());
}

function extractPorts(envContent: string, scripts: Record<string, string>): number[] {
  const ports = new Set<number>();

  // From env vars
  const portMatches = envContent.match(/(?:PORT|port)\s*=\s*(\d+)/g);
  if (portMatches) {
    for (const m of portMatches) {
      const num = parseInt(m.split("=")[1].trim(), 10);
      if (num > 0 && num < 65536) ports.add(num);
    }
  }

  // From scripts
  for (const script of Object.values(scripts)) {
    const scriptPorts = script.match(/-p\s+(\d+)|--port\s+(\d+)|PORT=(\d+)/g);
    if (scriptPorts) {
      for (const sp of scriptPorts) {
        const num = parseInt(sp.replace(/\D/g, ""), 10);
        if (num > 0 && num < 65536) ports.add(num);
      }
    }
  }

  return Array.from(ports);
}

// ─── Python Project Detection ───────────────────────────────────────────────

async function detectPythonProject(projectPath: string): Promise<Partial<ProjectContext> | null> {
  const reqPath = path.join(projectPath, "requirements.txt");
  const pyprojectPath = path.join(projectPath, "pyproject.toml");

  const reqContent = await safeReadText(reqPath);
  const pyprojectContent = await safeReadText(pyprojectPath);

  if (!reqContent && !pyprojectContent) return null;

  const deps = reqContent || pyprojectContent || "";

  let framework: string | null = null;
  if (deps.includes("fastapi") || deps.includes("FastAPI")) framework = "fastapi";
  else if (deps.includes("django") || deps.includes("Django")) framework = "django";
  else if (deps.includes("flask") || deps.includes("Flask")) framework = "flask";

  let testFramework: string | null = null;
  if (deps.includes("pytest")) testFramework = "pytest";

  let orm: string | null = null;
  if (deps.includes("sqlalchemy") || deps.includes("SQLAlchemy")) orm = "sqlalchemy";
  else if (deps.includes("django")) orm = "django-orm";
  else if (deps.includes("tortoise")) orm = "tortoise-orm";

  return {
    language: "python",
    framework,
    runtime: "python3",
    testFramework,
    orm,
    buildTool: "pip",
    packageManager: "pip",
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

export async function generateProjectContext(projectPath: string): Promise<ProjectContext> {
  const start = Date.now();
  const warnings: string[] = [];

  const projectName = path.basename(projectPath);
  const pkg = await safeReadJson(path.join(projectPath, "package.json"));

  // Check for Python project
  const pythonProject = await detectPythonProject(projectPath);

  // Read env files
  const envExample = await safeReadText(path.join(projectPath, ".env.example"));
  const envFile = await safeReadText(path.join(projectPath, ".env"));
  const envContent = envExample || envFile || "";

  // Detect platforms
  const platformDirs = [".claude", ".cursor", ".copilot", ".gemini", ".codex"];
  const platforms: string[] = [];
  for (const dir of platformDirs) {
    if (await exists(path.join(projectPath, dir))) {
      platforms.push(dir.replace(".", ""));
    }
  }

  // Detect project structure
  const structResult = await exec("find", [
    projectPath, "-maxdepth", "2", "-type", "d",
    "-not", "-path", "*/node_modules/*",
    "-not", "-path", "*/.git/*",
    "-not", "-path", "*/.next/*",
    "-not", "-path", "*/dist/*",
    "-not", "-name", ".*",
  ], { cwd: projectPath, timeout: 5000 });

  const projectStructure = structResult.success
    ? structResult.stdout.trim().split("\n")
        .map((d) => path.relative(projectPath, d))
        .filter((d) => d && d !== ".")
        .sort()
        .slice(0, 30)
    : [];

  if (pythonProject && !pkg) {
    return {
      projectName,
      projectPath,
      language: pythonProject.language || "python",
      framework: pythonProject.framework || null,
      runtime: pythonProject.runtime || "python3",
      database: null,
      auth: null,
      orm: pythonProject.orm || null,
      testFramework: pythonProject.testFramework || null,
      linter: null,
      buildTool: "pip",
      packageManager: "pip",
      cssFramework: null,
      uiLibrary: null,
      apiStyle: pythonProject.framework === "fastapi" ? "REST" : null,
      envVars: envContent ? extractEnvVars(envContent) : [],
      scripts: {},
      ports: extractPorts(envContent, {}),
      platforms,
      keyDependencies: [],
      projectStructure,
      warnings,
      duration: Date.now() - start,
    };
  }

  if (!pkg) {
    warnings.push("No package.json or requirements.txt found");
    return {
      projectName, projectPath, language: "unknown", framework: null, runtime: null,
      database: null, auth: null, orm: null, testFramework: null, linter: null,
      buildTool: null, packageManager: "unknown", cssFramework: null, uiLibrary: null,
      apiStyle: null, envVars: [], scripts: {}, ports: [], platforms,
      keyDependencies: [], projectStructure, warnings, duration: Date.now() - start,
    };
  }

  // Node.js project analysis
  const allDeps = {
    ...(pkg.dependencies as Record<string, string> || {}),
    ...(pkg.devDependencies as Record<string, string> || {}),
  };
  const scripts = (pkg.scripts as Record<string, string>) || {};

  // Framework detection
  let framework: string | null = null;
  if (allDeps["next"]) framework = `next@${allDeps["next"]}`;
  else if (allDeps["nuxt"]) framework = `nuxt@${allDeps["nuxt"]}`;
  else if (allDeps["svelte"]) framework = "sveltekit";
  else if (allDeps["express"]) framework = "express";
  else if (allDeps["fastify"]) framework = "fastify";
  else if (allDeps["hono"]) framework = "hono";

  // UI library
  let uiLibrary: string | null = null;
  if (allDeps["react"]) uiLibrary = `react@${allDeps["react"]}`;
  else if (allDeps["vue"]) uiLibrary = `vue@${allDeps["vue"]}`;
  else if (allDeps["svelte"]) uiLibrary = `svelte@${allDeps["svelte"]}`;

  // CSS framework
  let cssFramework: string | null = null;
  if (allDeps["tailwindcss"]) cssFramework = "tailwind";
  else if (allDeps["@chakra-ui/react"]) cssFramework = "chakra-ui";
  else if (allDeps["@mui/material"]) cssFramework = "material-ui";
  else if (allDeps["bootstrap"]) cssFramework = "bootstrap";

  // Test framework
  let testFramework: string | null = null;
  if (allDeps["vitest"]) testFramework = "vitest";
  else if (allDeps["jest"]) testFramework = "jest";
  else if (allDeps["mocha"]) testFramework = "mocha";
  else if (allDeps["playwright"]) testFramework = "playwright";

  // Linter
  let linter: string | null = null;
  if (allDeps["@biomejs/biome"]) linter = "biome";
  else if (allDeps["eslint"]) linter = "eslint";

  // API style
  let apiStyle: string | null = null;
  if (allDeps["@trpc/server"]) apiStyle = "tRPC";
  else if (allDeps["graphql"]) apiStyle = "GraphQL";
  else if (allDeps["next"] || allDeps["express"]) apiStyle = "REST";

  const database = detectDatabase(allDeps, envContent);
  const auth = detectAuth(allDeps);
  const orm = detectOrm(allDeps);
  const keyDependencies = detectKeyDeps(allDeps);
  const envVars = envContent ? extractEnvVars(envContent) : [];
  const ports = extractPorts(envContent, scripts);

  // Check for ORM schema
  if (orm === "prisma" && database) {
    const schemaPath = path.join(projectPath, "prisma", "schema.prisma");
    if (await exists(schemaPath)) {
      database.schema = "prisma/schema.prisma";
    }
  }
  if (orm === "drizzle" && database) {
    const schemaPath = path.join(projectPath, "src", "db", "schema.ts");
    if (await exists(schemaPath)) {
      database.schema = "src/db/schema.ts";
    }
  }

  // Warnings
  if (!envExample && envFile) {
    warnings.push(".env exists but no .env.example — other devs won't know required vars");
  }
  if (!testFramework) {
    warnings.push("No test framework detected — add vitest, jest, or mocha");
  }
  if (!linter) {
    warnings.push("No linter detected — add eslint or biome");
  }
  if (auth && orm && database && auth.library === "next-auth" && allDeps["next-auth"]?.includes("beta")) {
    warnings.push(`next-auth is on beta (${allDeps["next-auth"]}) — expect breaking changes with peer deps`);
  }

  return {
    projectName,
    projectPath,
    language: "typescript",
    framework,
    runtime: `node@${process.version}`,
    database,
    auth,
    orm,
    testFramework,
    linter,
    buildTool: scripts.build ? "npm run build" : null,
    packageManager: (await exists(path.join(projectPath, "pnpm-lock.yaml"))) ? "pnpm"
      : (await exists(path.join(projectPath, "yarn.lock"))) ? "yarn" : "npm",
    cssFramework,
    uiLibrary,
    apiStyle,
    envVars,
    scripts,
    ports,
    platforms,
    keyDependencies,
    projectStructure,
    warnings,
    duration: Date.now() - start,
  };
}
