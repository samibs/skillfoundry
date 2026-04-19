/**
 * GitAgent execution logic — git status and commit operations.
 */

import { exec } from "../../agents/exec-utils.js";

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
