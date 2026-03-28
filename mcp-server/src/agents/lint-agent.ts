import { exec, commandExists } from "./exec-utils.js";
import { readFile, access } from "fs/promises";
import path from "path";

export interface LintResult {
  passed: boolean;
  tool: string;
  errorCount: number;
  warningCount: number;
  fixableCount: number;
  issues: LintIssue[];
  autoFixed: boolean;
  duration: number;
}

export interface LintIssue {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning";
  rule: string;
  message: string;
}

async function detectLinter(
  projectPath: string
): Promise<{ tool: string; cmd: string; args: string[] }> {
  try {
    const pkg = JSON.parse(
      await readFile(path.join(projectPath, "package.json"), "utf-8")
    );
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps.biome || deps["@biomejs/biome"])
      return { tool: "biome", cmd: "npx", args: ["biome", "check", "--reporter=json", "."] };
    if (deps.eslint)
      return { tool: "eslint", cmd: "npx", args: ["eslint", ".", "--format=json", "--max-warnings=0"] };
  } catch { /* */ }

  return { tool: "eslint", cmd: "npx", args: ["eslint", ".", "--format=json"] };
}

/**
 * Run linter and return structured results.
 */
export async function runLint(
  projectPath: string,
  autoFix?: boolean
): Promise<LintResult> {
  const { tool, cmd, args } = await detectLinter(projectPath);
  if (autoFix) args.push("--fix");

  const result = await exec(cmd, args, { cwd: projectPath, timeout: 60000 });
  const combined = result.stdout + result.stderr;

  let errorCount = 0;
  let warningCount = 0;
  let fixableCount = 0;
  const issues: LintIssue[] = [];

  // Try JSON parse (eslint --format=json)
  try {
    const jsonMatch = combined.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]) as Array<{
        filePath: string;
        errorCount: number;
        warningCount: number;
        fixableErrorCount: number;
        fixableWarningCount: number;
        messages: Array<{
          line: number;
          column: number;
          severity: number;
          ruleId: string;
          message: string;
        }>;
      }>;

      for (const file of data) {
        errorCount += file.errorCount;
        warningCount += file.warningCount;
        fixableCount += file.fixableErrorCount + file.fixableWarningCount;

        for (const msg of file.messages.slice(0, 10)) {
          issues.push({
            file: path.relative(projectPath, file.filePath),
            line: msg.line,
            column: msg.column,
            severity: msg.severity === 2 ? "error" : "warning",
            rule: msg.ruleId || "unknown",
            message: msg.message,
          });
        }
      }
    }
  } catch { /* not JSON */ }

  return {
    passed: result.success && errorCount === 0,
    tool,
    errorCount,
    warningCount,
    fixableCount,
    issues: issues.slice(0, 50),
    autoFixed: !!autoFix,
    duration: result.duration,
  };
}
