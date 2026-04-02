/**
 * VerificationAgent execution logic — runs verification strategies against a project
 * and compares actual results to claims made by other agents.
 */

import { exec } from "../../agents/exec-utils.js";
import { readFile } from "fs/promises";
import path from "path";

export type VerificationStrategy = "build" | "test" | "typecheck" | "lint";

export interface VerificationCheck {
  name: string;
  strategy: VerificationStrategy;
  passed: boolean;
  evidence: string;
  expectedClaim?: string;
  actualResult?: string;
}

export interface VerificationReport {
  verified: boolean;
  checks: VerificationCheck[];
  timestamp: string;
  duration: number;
}

/**
 * Detect the build command from package.json scripts.
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
  } catch {
    /* no package.json */
  }
  return { cmd: "npm", args: ["run", "build"] };
}

/**
 * Detect the test command from package.json scripts.
 */
async function detectTestCommand(
  projectPath: string
): Promise<{ cmd: string; args: string[] }> {
  try {
    const pkg = JSON.parse(
      await readFile(path.join(projectPath, "package.json"), "utf-8")
    );
    if (pkg.scripts?.test) return { cmd: "npm", args: ["test"] };
  } catch {
    /* no package.json */
  }
  return { cmd: "npm", args: ["test"] };
}

/**
 * Detect the lint command from package.json scripts.
 */
async function detectLintCommand(
  projectPath: string
): Promise<{ cmd: string; args: string[] }> {
  try {
    const pkg = JSON.parse(
      await readFile(path.join(projectPath, "package.json"), "utf-8")
    );
    if (pkg.scripts?.lint) return { cmd: "npm", args: ["run", "lint"] };
  } catch {
    /* no package.json */
  }
  return { cmd: "npx", args: ["eslint", "."] };
}

/**
 * Summarize command output for evidence, trimming to a reasonable length.
 */
function summarizeOutput(stdout: string, stderr: string, maxLen: number = 2000): string {
  const combined = (stdout + "\n" + stderr).trim();
  if (combined.length <= maxLen) return combined;
  return combined.slice(-maxLen);
}

/**
 * Determine if a claim matches the actual result (case-insensitive substring match).
 */
function claimMatches(claim: string, actual: string): boolean {
  const normClaim = claim.toLowerCase().trim();
  const normActual = actual.toLowerCase().trim();
  return normActual.includes(normClaim) || normClaim.includes(normActual);
}

/**
 * Run the build verification strategy.
 */
async function verifyBuild(
  projectPath: string,
  claim?: string
): Promise<VerificationCheck> {
  const { cmd, args } = await detectBuildCommand(projectPath);
  const result = await exec(cmd, args, { cwd: projectPath, timeout: 300000 });
  const actualResult = result.success ? "passed" : "failed";
  const evidence = summarizeOutput(result.stdout, result.stderr);

  let passed = result.success;
  if (claim) {
    const claimIndicatesPass =
      /pass/i.test(claim) || /success/i.test(claim) || /ok/i.test(claim);
    passed = result.success === claimIndicatesPass;
  }

  return {
    name: "Build verification",
    strategy: "build",
    passed,
    evidence,
    expectedClaim: claim,
    actualResult,
  };
}

/**
 * Run the test verification strategy.
 */
async function verifyTest(
  projectPath: string,
  claim?: string
): Promise<VerificationCheck> {
  const { cmd, args } = await detectTestCommand(projectPath);
  const result = await exec(cmd, args, { cwd: projectPath, timeout: 300000 });
  const combined = result.stdout + "\n" + result.stderr;

  // Extract test counts from output
  const passMatch = combined.match(/(\d+)\s*(?:passing|passed|✓)/i);
  const failMatch = combined.match(/(\d+)\s*(?:failing|failed|✗)/i);
  const passedCount = parseInt(passMatch?.[1] || "0", 10);
  const failedCount = parseInt(failMatch?.[1] || "0", 10);
  const total = passedCount + failedCount;

  const actualResult =
    total > 0
      ? `${passedCount}/${total} passed${failedCount > 0 ? `, ${failedCount} failed` : ""}`
      : result.success
        ? "passed"
        : "failed";

  let passed = result.success && failedCount === 0;
  if (claim && passed) {
    passed = claimMatches(claim, actualResult);
  }

  return {
    name: "Test verification",
    strategy: "test",
    passed,
    evidence: summarizeOutput(result.stdout, result.stderr),
    expectedClaim: claim,
    actualResult,
  };
}

/**
 * Run the typecheck verification strategy (tsc --noEmit).
 */
async function verifyTypecheck(
  projectPath: string,
  claim?: string
): Promise<VerificationCheck> {
  const result = await exec("npx", ["tsc", "--noEmit"], {
    cwd: projectPath,
    timeout: 120000,
  });
  const combined = result.stdout + "\n" + result.stderr;

  // Count TypeScript errors
  const errorMatches = combined.match(/error TS\d+/g);
  const errorCount = errorMatches ? errorMatches.length : 0;

  const actualResult =
    errorCount > 0 ? `${errorCount} type error(s)` : "passed (0 errors)";

  let passed = result.success && errorCount === 0;
  if (claim) {
    const claimIndicatesPass =
      /pass/i.test(claim) || /0\s*error/i.test(claim) || /clean/i.test(claim);
    passed = (errorCount === 0) === claimIndicatesPass;
  }

  return {
    name: "Typecheck verification",
    strategy: "typecheck",
    passed,
    evidence: summarizeOutput(result.stdout, result.stderr),
    expectedClaim: claim,
    actualResult,
  };
}

/**
 * Run the lint verification strategy.
 */
async function verifyLint(
  projectPath: string,
  claim?: string
): Promise<VerificationCheck> {
  const { cmd, args } = await detectLintCommand(projectPath);
  const result = await exec(cmd, args, { cwd: projectPath, timeout: 120000 });
  const combined = result.stdout + "\n" + result.stderr;

  // Count lint errors and warnings
  const errorMatch = combined.match(/(\d+)\s*error/i);
  const warningMatch = combined.match(/(\d+)\s*warning/i);
  const errorCount = parseInt(errorMatch?.[1] || "0", 10);
  const warningCount = parseInt(warningMatch?.[1] || "0", 10);

  const actualResult = result.success
    ? `passed${warningCount > 0 ? ` (${warningCount} warnings)` : ""}`
    : `${errorCount} error(s), ${warningCount} warning(s)`;

  let passed = result.success;
  if (claim) {
    const claimIndicatesPass =
      /pass/i.test(claim) || /clean/i.test(claim) || /0\s*error/i.test(claim);
    passed = result.success === claimIndicatesPass;
  }

  return {
    name: "Lint verification",
    strategy: "lint",
    passed,
    evidence: summarizeOutput(result.stdout, result.stderr),
    expectedClaim: claim,
    actualResult,
  };
}

/**
 * Run all requested verification strategies and produce a report.
 */
export async function verify(
  projectPath: string,
  strategies: VerificationStrategy[],
  claims?: Record<string, string>
): Promise<VerificationReport> {
  const start = Date.now();
  const checks: VerificationCheck[] = [];

  const strategyRunners: Record<
    VerificationStrategy,
    (p: string, c?: string) => Promise<VerificationCheck>
  > = {
    build: verifyBuild,
    test: verifyTest,
    typecheck: verifyTypecheck,
    lint: verifyLint,
  };

  for (const strategy of strategies) {
    const runner = strategyRunners[strategy];
    if (!runner) continue;
    const claim = claims?.[strategy];
    const check = await runner(projectPath, claim);
    checks.push(check);
  }

  const verified = checks.length > 0 && checks.every((c) => c.passed);

  return {
    verified,
    checks,
    timestamp: new Date().toISOString(),
    duration: Date.now() - start,
  };
}
