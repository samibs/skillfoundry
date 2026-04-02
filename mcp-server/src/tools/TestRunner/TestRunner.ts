/**
 * TestRunner execution logic — runs the project's test suite and returns structured results.
 */

import { exec } from "../../agents/exec-utils.js";
import { readFile } from "fs/promises";
import path from "path";

export interface TestRunResult {
  passed: boolean;
  framework: string;
  command: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  duration: number;
  failedNames: string[];
  output: string;
}

async function detectFramework(
  projectPath: string
): Promise<{ framework: string; cmd: string; args: string[] }> {
  try {
    const pkg = JSON.parse(
      await readFile(path.join(projectPath, "package.json"), "utf-8")
    );
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const testScript = pkg.scripts?.test || "";

    if (deps.vitest || testScript.includes("vitest"))
      return { framework: "vitest", cmd: "npx", args: ["vitest", "run", "--reporter=json"] };
    if (deps.jest || testScript.includes("jest"))
      return { framework: "jest", cmd: "npx", args: ["jest", "--json", "--forceExit"] };
    if (deps.mocha || testScript.includes("mocha"))
      return { framework: "mocha", cmd: "npx", args: ["mocha", "--reporter", "json"] };
  } catch { /* no package.json */ }

  return { framework: "npm", cmd: "npm", args: ["test", "--", "--if-present"] };
}

function parseTestOutput(
  framework: string,
  stdout: string,
  stderr: string
): Partial<TestRunResult> {
  const combined = stdout + stderr;

  // Try JSON parse (vitest/jest)
  try {
    const jsonMatch = combined.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      return {
        totalTests: data.numTotalTests || 0,
        passedTests: data.numPassedTests || 0,
        failedTests: data.numFailedTests || 0,
        skippedTests: data.numPendingTests || 0,
        failedNames: (data.testResults || [])
          .filter((r: { status: string }) => r.status === "failed")
          .map((r: { name: string }) => r.name)
          .slice(0, 20),
      };
    }
  } catch { /* not JSON */ }

  // Fallback: parse text output
  const passMatch = combined.match(/(\d+)\s*(?:passing|passed|✓)/i);
  const failMatch = combined.match(/(\d+)\s*(?:failing|failed|✗)/i);
  const skipMatch = combined.match(/(\d+)\s*(?:skipped|pending|todo)/i);

  const passed = parseInt(passMatch?.[1] || "0", 10);
  const failed = parseInt(failMatch?.[1] || "0", 10);
  const skipped = parseInt(skipMatch?.[1] || "0", 10);

  return {
    totalTests: passed + failed + skipped,
    passedTests: passed,
    failedTests: failed,
    skippedTests: skipped,
    failedNames: [],
  };
}

/**
 * Run the project's test suite and return structured results.
 */
export async function runTests(
  projectPath: string,
  pattern?: string
): Promise<TestRunResult> {
  const { framework, cmd, args } = await detectFramework(projectPath);
  if (pattern) args.push(pattern);

  const result = await exec(cmd, args, { cwd: projectPath, timeout: 300000 });
  const parsed = parseTestOutput(framework, result.stdout, result.stderr);

  return {
    passed: result.success && (parsed.failedTests || 0) === 0,
    framework,
    command: `${cmd} ${args.join(" ")}`,
    totalTests: parsed.totalTests || 0,
    passedTests: parsed.passedTests || 0,
    failedTests: parsed.failedTests || 0,
    skippedTests: parsed.skippedTests || 0,
    duration: result.duration,
    failedNames: parsed.failedNames || [],
    output: (result.stdout + result.stderr).slice(-3000),
  };
}
