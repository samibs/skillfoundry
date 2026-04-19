/**
 * BuildAgent execution logic — runs the project build and returns structured results.
 */

import { exec } from "../../agents/exec-utils.js";
import { readFile } from "fs/promises";
import path from "path";

export interface BuildResult {
  passed: boolean;
  command: string;
  exitCode: number;
  errors: string[];
  warnings: string[];
  duration: number;
  output: string;
}

/**
 * Detect build command from package.json scripts.
 */
async function detectBuildCommand(
  projectPath: string
): Promise<{ cmd: string; args: string[] }> {
  try {
    const pkg = JSON.parse(
      await readFile(path.join(projectPath, "package.json"), "utf-8")
    );
    if (pkg.scripts?.build) return { cmd: "npm", args: ["run", "build"] };
    if (pkg.scripts?.compile) return { cmd: "npm", args: ["run", "compile"] };
  } catch { /* no package.json */ }

  return { cmd: "npm", args: ["run", "build"] };
}

/**
 * Extract errors and warnings from build output.
 */
function parseOutput(output: string): { errors: string[]; warnings: string[] } {
  const lines = output.split("\n");
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/error\s*(TS|:|\[)/i.test(trimmed) || /^✗|^ERROR/i.test(trimmed)) {
      errors.push(trimmed);
    } else if (/warning\s*(TS|:|\[)/i.test(trimmed) || /^⚠|^WARN/i.test(trimmed)) {
      warnings.push(trimmed);
    }
  }

  return { errors: errors.slice(0, 50), warnings: warnings.slice(0, 20) };
}

/**
 * Run the project build and return structured results.
 */
export async function runBuild(projectPath: string): Promise<BuildResult> {
  const { cmd, args } = await detectBuildCommand(projectPath);
  const result = await exec(cmd, args, { cwd: projectPath, timeout: 300000 });
  const combined = result.stdout + "\n" + result.stderr;
  const { errors, warnings } = parseOutput(combined);

  return {
    passed: result.success,
    command: `${cmd} ${args.join(" ")}`,
    exitCode: result.exitCode,
    errors,
    warnings,
    duration: result.duration,
    output: combined.slice(-3000),
  };
}
