import { exec } from "./exec-utils.js";

export interface GitStatus {
  branch: string;
  clean: boolean;
  staged: string[];
  modified: string[];
  untracked: string[];
  ahead: number;
  behind: number;
}

export interface GitCommitResult {
  success: boolean;
  hash: string;
  message: string;
  filesChanged: number;
  error: string | null;
}

export async function getStatus(projectPath: string): Promise<GitStatus> {
  const branch = await exec("git", ["branch", "--show-current"], { cwd: projectPath });
  const status = await exec("git", ["status", "--porcelain"], { cwd: projectPath });
  const aheadBehind = await exec("git", ["rev-list", "--left-right", "--count", "HEAD...@{u}"], { cwd: projectPath });

  const lines = status.stdout.split("\n").filter((l) => l.trim());
  const staged = lines.filter((l) => /^[MADRC]/.test(l)).map((l) => l.slice(3));
  const modified = lines.filter((l) => /^.[MADRC]/.test(l)).map((l) => l.slice(3));
  const untracked = lines.filter((l) => l.startsWith("??")).map((l) => l.slice(3));

  let ahead = 0, behind = 0;
  if (aheadBehind.success) {
    const parts = aheadBehind.stdout.trim().split(/\s+/);
    ahead = parseInt(parts[0] || "0", 10);
    behind = parseInt(parts[1] || "0", 10);
  }

  return {
    branch: branch.stdout.trim(),
    clean: lines.length === 0,
    staged,
    modified,
    untracked,
    ahead,
    behind,
  };
}

export async function commit(
  projectPath: string,
  message: string,
  files?: string[]
): Promise<GitCommitResult> {
  // Stage files
  if (files && files.length > 0) {
    const addResult = await exec("git", ["add", ...files], { cwd: projectPath });
    if (!addResult.success) {
      return { success: false, hash: "", message, filesChanged: 0, error: addResult.stderr };
    }
  }

  const result = await exec("git", ["commit", "-m", message], { cwd: projectPath });
  if (!result.success) {
    return { success: false, hash: "", message, filesChanged: 0, error: result.stderr };
  }

  const hashMatch = result.stdout.match(/\[[\w/.-]+\s+([a-f0-9]+)\]/);
  const filesMatch = result.stdout.match(/(\d+)\s+file/);

  return {
    success: true,
    hash: hashMatch?.[1] || "",
    message,
    filesChanged: parseInt(filesMatch?.[1] || "0", 10),
    error: null,
  };
}

export async function createBranch(
  projectPath: string,
  branchName: string
): Promise<{ success: boolean; error: string | null }> {
  const result = await exec("git", ["checkout", "-b", branchName], { cwd: projectPath });
  return { success: result.success, error: result.success ? null : result.stderr };
}

export async function diffSummary(
  projectPath: string,
  base?: string
): Promise<{ files: string[]; insertions: number; deletions: number }> {
  const args = ["diff", "--stat"];
  if (base) args.push(base);
  const result = await exec("git", args, { cwd: projectPath });

  const files = result.stdout.split("\n")
    .filter((l) => l.includes("|"))
    .map((l) => l.split("|")[0].trim());

  const summaryLine = result.stdout.split("\n").pop() || "";
  const insMatch = summaryLine.match(/(\d+)\s+insertion/);
  const delMatch = summaryLine.match(/(\d+)\s+deletion/);

  return {
    files,
    insertions: parseInt(insMatch?.[1] || "0", 10),
    deletions: parseInt(delMatch?.[1] || "0", 10),
  };
}
