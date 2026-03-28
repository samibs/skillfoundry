import { execFile } from "child_process";
import { promisify } from "util";
import { access, writeFile } from "fs/promises";
import path from "path";

const execFileAsync = promisify(execFile);

export interface SemgrepInput {
  /** Absolute path to project to scan */
  projectPath: string;
  /** Semgrep rule packs (default: p/owasp-top-ten) */
  rules?: string[];
  /** File patterns to include (e.g., ["*.ts", "*.tsx"]) */
  include?: string[];
  /** File patterns to exclude */
  exclude?: string[];
  /** Directory to save scan report */
  evidenceDir?: string;
}

export interface SemgrepResult {
  passed: boolean;
  findings: SemgrepFinding[];
  stats: ScanStats;
  evidence: { name: string; path: string; type: string }[];
  duration: number;
  summary: string;
}

export interface SemgrepFinding {
  ruleId: string;
  severity: "ERROR" | "WARNING" | "INFO";
  message: string;
  filePath: string;
  line: number;
  column: number;
  category: string;
}

interface ScanStats {
  totalFindings: number;
  bySeverity: Record<string, number>;
  filesScanned: number;
  rulesUsed: string[];
}

/**
 * Find semgrep binary — check common install locations.
 */
async function findSemgrep(): Promise<string> {
  const candidates = [
    "semgrep",
    `${process.env.HOME}/.local/bin/semgrep`,
    "/usr/local/bin/semgrep",
  ];

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["--version"]);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(
    "Semgrep not found. Install with: pip3 install --user semgrep"
  );
}

/**
 * Semgrep SAST scanning agent.
 * Runs REAL static analysis — not regex pattern matching, not LLM opinion.
 */
export async function runSemgrepScan(
  input: SemgrepInput
): Promise<SemgrepResult> {
  const start = Date.now();
  const evidence: { name: string; path: string; type: string }[] = [];
  const evidenceDir = input.evidenceDir || "/tmp/sf-semgrep-evidence";

  try {
    // Verify project path exists
    await access(input.projectPath);
  } catch {
    return {
      passed: false,
      findings: [],
      stats: { totalFindings: 0, bySeverity: {}, filesScanned: 0, rulesUsed: [] },
      evidence: [],
      duration: Date.now() - start,
      summary: `Project path does not exist: ${input.projectPath}`,
    };
  }

  const semgrepBin = await findSemgrep();
  const rules = input.rules || ["p/owasp-top-ten"];

  const args = [
    "--json",
    "--quiet",
    ...rules.flatMap((r) => ["--config", r]),
  ];

  if (input.include) {
    args.push(...input.include.flatMap((p) => ["--include", p]));
  }

  // Always exclude node_modules, .next, dist, etc.
  const defaultExcludes = [
    "node_modules",
    ".next",
    "dist",
    "build",
    ".git",
    "*.min.js",
  ];
  const excludes = [...defaultExcludes, ...(input.exclude || [])];
  args.push(...excludes.flatMap((p) => ["--exclude", p]));

  args.push(input.projectPath);

  try {
    const { stdout } = await execFileAsync(semgrepBin, args, {
      timeout: 120000, // 2 minute timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    const report = JSON.parse(stdout);

    const findings: SemgrepFinding[] = (report.results || []).map(
      (r: Record<string, unknown>) => ({
        ruleId: r.check_id as string,
        severity: mapSeverity(
          (r.extra as Record<string, unknown>)?.severity as string
        ),
        message: (r.extra as Record<string, unknown>)?.message as string,
        filePath: path.relative(
          input.projectPath,
          r.path as string
        ),
        line: (r.start as Record<string, unknown>)?.line as number,
        column: (r.start as Record<string, unknown>)?.col as number,
        category: extractCategory(r.check_id as string),
      })
    );

    const bySeverity: Record<string, number> = {};
    for (const f of findings) {
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    }

    const stats: ScanStats = {
      totalFindings: findings.length,
      bySeverity,
      filesScanned: report.paths?.scanned?.length || 0,
      rulesUsed: rules,
    };

    // Save report as evidence
    const reportPath = path.join(evidenceDir, "semgrep-report.json");
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    evidence.push({ name: "semgrep-report.json", path: reportPath, type: "scan_report" });

    const criticalCount = (bySeverity["ERROR"] || 0);
    const passed = criticalCount === 0;

    return {
      passed,
      findings,
      stats,
      evidence,
      duration: Date.now() - start,
      summary: passed
        ? `Clean: ${stats.filesScanned} files scanned, 0 critical findings`
        : `${stats.totalFindings} finding(s): ${criticalCount} critical, ${bySeverity["WARNING"] || 0} warnings`,
    };
  } catch (err) {
    // Semgrep exits with code 1 when findings exist — parse stdout anyway
    const error = err as { stdout?: string; stderr?: string; code?: number; message?: string };
    if (error.stdout) {
      try {
        const report = JSON.parse(error.stdout);
        const findings: SemgrepFinding[] = (report.results || []).map(
          (r: Record<string, unknown>) => ({
            ruleId: r.check_id as string,
            severity: mapSeverity(
              (r.extra as Record<string, unknown>)?.severity as string
            ),
            message: (r.extra as Record<string, unknown>)?.message as string,
            filePath: path.relative(input.projectPath, r.path as string),
            line: (r.start as Record<string, unknown>)?.line as number,
            column: (r.start as Record<string, unknown>)?.col as number,
            category: extractCategory(r.check_id as string),
          })
        );

        const bySeverity: Record<string, number> = {};
        for (const f of findings) {
          bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
        }

        return {
          passed: (bySeverity["ERROR"] || 0) === 0,
          findings,
          stats: {
            totalFindings: findings.length,
            bySeverity,
            filesScanned: report.paths?.scanned?.length || 0,
            rulesUsed: rules,
          },
          evidence,
          duration: Date.now() - start,
          summary: `${findings.length} finding(s) detected`,
        };
      } catch {
        // JSON parse failed — fall through to error return
      }
    }

    return {
      passed: false,
      findings: [],
      stats: { totalFindings: 0, bySeverity: {}, filesScanned: 0, rulesUsed: rules },
      evidence: [],
      duration: Date.now() - start,
      summary: `Semgrep execution failed: ${error.message || "unknown error"}`,
    };
  }
}

function mapSeverity(s: string): "ERROR" | "WARNING" | "INFO" {
  if (!s) return "INFO";
  const upper = s.toUpperCase();
  if (upper === "ERROR" || upper === "CRITICAL" || upper === "HIGH") return "ERROR";
  if (upper === "WARNING" || upper === "MEDIUM") return "WARNING";
  return "INFO";
}

function extractCategory(ruleId: string): string {
  // e.g., "python.lang.security.audit.exec-detected" → "security"
  const parts = ruleId.split(".");
  return parts.find((p) =>
    ["security", "correctness", "performance", "best-practice"].includes(p)
  ) || parts[0] || "unknown";
}
