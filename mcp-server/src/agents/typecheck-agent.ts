import { exec } from "./exec-utils.js";
import { access } from "fs/promises";
import path from "path";

export interface TypeCheckResult {
  passed: boolean;
  errorCount: number;
  errors: TypeDiagnostic[];
  command: string;
  duration: number;
}

export interface TypeDiagnostic {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
}

/**
 * Run TypeScript type checker on a project.
 */
export async function runTypeCheck(projectPath: string): Promise<TypeCheckResult> {
  // Check if tsconfig exists
  try {
    await access(path.join(projectPath, "tsconfig.json"));
  } catch {
    return {
      passed: true,
      errorCount: 0,
      errors: [],
      command: "skipped (no tsconfig.json)",
      duration: 0,
    };
  }

  const result = await exec("npx", ["tsc", "--noEmit", "--pretty", "false"], {
    cwd: projectPath,
    timeout: 120000,
  });

  const diagnostics: TypeDiagnostic[] = [];
  const lines = (result.stdout + result.stderr).split("\n");

  for (const line of lines) {
    // Format: src/file.ts(10,5): error TS2345: message
    const match = line.match(/^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)/);
    if (match) {
      diagnostics.push({
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        code: match[4],
        message: match[5],
      });
    }
  }

  return {
    passed: result.success && diagnostics.length === 0,
    errorCount: diagnostics.length,
    errors: diagnostics.slice(0, 50),
    command: "npx tsc --noEmit",
    duration: result.duration,
  };
}
