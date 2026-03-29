import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
  duration: number;
}

/**
 * Execute a command and capture output. Never throws — returns exitCode instead.
 */
export async function exec(
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number; env?: Record<string, string> }
): Promise<ExecResult> {
  const start = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options?.cwd,
      timeout: options?.timeout || 120000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, ...options?.env },
    });
    return {
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      exitCode: 0,
      success: true,
      duration: Date.now() - start,
    };
  } catch (err) {
    const error = err as {
      stdout?: string;
      stderr?: string;
      code?: number;
      killed?: boolean;
      message?: string;
    };
    return {
      stdout: error.stdout?.toString() || "",
      stderr: error.stderr?.toString() || error.message || "",
      exitCode: typeof error.code === "number" ? error.code : 1,
      success: false,
      duration: Date.now() - start,
    };
  }
}

/**
 * Check if a command exists on the system.
 */
export async function commandExists(command: string): Promise<boolean> {
  const result = await exec("which", [command]);
  return result.success;
}
