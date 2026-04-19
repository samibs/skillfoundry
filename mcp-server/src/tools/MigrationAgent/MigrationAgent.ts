/**
 * MigrationAgent execution logic — runs database migrations and returns structured results.
 */

import { exec } from "../../agents/exec-utils.js";
import { readFile } from "fs/promises";
import path from "path";

export interface MigrationResult {
  passed: boolean;
  orm: string;
  action: string;
  output: string;
  duration: number;
  error: string | null;
}

async function detectORM(
  projectPath: string
): Promise<"prisma" | "drizzle" | "typeorm" | "knex" | "unknown"> {
  try {
    const pkg = JSON.parse(
      await readFile(path.join(projectPath, "package.json"), "utf-8")
    );
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps.prisma || deps["@prisma/client"]) return "prisma";
    if (deps.drizzle || deps["drizzle-orm"]) return "drizzle";
    if (deps.typeorm) return "typeorm";
    if (deps.knex) return "knex";
  } catch { /* no package.json */ }

  return "unknown";
}

/**
 * Run database migration.
 */
export async function runMigration(
  projectPath: string,
  action: "deploy" | "status" | "seed" | "reset" = "deploy"
): Promise<MigrationResult> {
  const orm = await detectORM(projectPath);

  let cmd: string;
  let args: string[];

  switch (orm) {
    case "prisma":
      switch (action) {
        case "deploy":
          cmd = "npx"; args = ["prisma", "migrate", "deploy"];
          break;
        case "status":
          cmd = "npx"; args = ["prisma", "migrate", "status"];
          break;
        case "seed":
          cmd = "npx"; args = ["prisma", "db", "seed"];
          break;
        case "reset":
          cmd = "npx"; args = ["prisma", "migrate", "reset", "--force"];
          break;
      }
      break;
    case "drizzle":
      cmd = "npx";
      args = action === "seed" ? ["tsx", "drizzle/seed.ts"] : ["drizzle-kit", action === "deploy" ? "push" : action];
      break;
    case "knex":
      cmd = "npx";
      args = ["knex", action === "deploy" ? "migrate:latest" : `migrate:${action}`];
      break;
    default:
      return {
        passed: false,
        orm: "unknown",
        action,
        output: "",
        duration: 0,
        error: "No supported ORM detected (prisma, drizzle, typeorm, knex)",
      };
  }

  const result = await exec(cmd, args, { cwd: projectPath, timeout: 120000 });

  return {
    passed: result.success,
    orm,
    action,
    output: (result.stdout + result.stderr).slice(-3000),
    duration: result.duration,
    error: result.success ? null : result.stderr.slice(0, 500),
  };
}
