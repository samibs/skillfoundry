// Tool executor — runs tools requested by the AI provider.
// Handles Bash (child_process), Read/Write (fs), Glob/Grep (Node APIs).

import { execSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
  lstatSync,
} from 'node:fs';
import { join, resolve, isAbsolute, dirname } from 'node:path';
import { globSync } from 'glob';
import type { ToolResult } from '../types.js';
import type { SfPolicy } from '../types.js';

const MAX_OUTPUT_CHARS = 30000;
const DEFAULT_BASH_TIMEOUT = 120_000;
const MAX_BASH_TIMEOUT = 600_000;
const MAX_READ_LINES = 2000;

// Defense-in-depth: dangerous patterns also checked at executor level
// (primary check is in permissions.ts; this is a safety net)
const DANGEROUS_BASH_PATTERNS = [
  // Unix destructive commands
  /rm\s+-rf\s+[\/~]/,
  /mkfs/,
  /dd\s+if=.*of=\/dev/,
  />\s*\/dev\/sd/,
  /chmod\s+-R\s+777/,
  /curl.*\|\s*(ba)?sh/,
  /wget.*\|\s*(ba)?sh/,
  // Windows destructive commands
  /rd\s+\/s\s+\/q\s+[A-Za-z]:\\/i,
  /del\s+\/[fF]\s+\/[sS]\s+[A-Za-z]:\\/,
  /format\s+[A-Za-z]:/i,
  /diskpart/i,
  /icacls\s+[A-Za-z]:\\.*\/grant.*Everyone/i,
  /powershell.*-[Ee]nc\s/,
];

const IS_WINDOWS = process.platform === 'win32';
const WHICH_CMD = IS_WINDOWS ? 'where' : 'which';

interface ExecutorContext {
  workDir: string;
  policy: SfPolicy;
}

function truncate(text: string, max: number = MAX_OUTPUT_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n... [truncated, ${text.length - max} chars omitted]`;
}

function resolvePath(filePath: string, workDir: string): string {
  if (isAbsolute(filePath)) return filePath;
  return resolve(workDir, filePath);
}

function isSymlink(filePath: string): boolean {
  try {
    return lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}

function isPathAllowed(filePath: string, policy: SfPolicy, workDir: string): boolean {
  const resolved = resolvePath(filePath, workDir);
  const workDirResolved = resolve(workDir);

  // Block symlinks — prevents /allowed/link -> /forbidden/file traversal
  if (isSymlink(resolved)) return false;

  // Always allow paths within the project root
  if (resolved.startsWith(workDirResolved)) return true;

  // Check allowed paths from policy
  for (const allowed of policy.allow_paths) {
    const allowedResolved = resolve(workDir, allowed);
    if (resolved.startsWith(allowedResolved)) return true;
  }

  return false;
}

function executeBash(
  input: { command: string; timeout?: number },
  ctx: ExecutorContext,
): ToolResult {
  if (!ctx.policy.allow_shell) {
    return {
      toolCallId: '',
      output: 'Shell execution is disabled by policy (allow_shell = false). Change policy in .skillfoundry/policy.toml to enable.',
      isError: true,
    };
  }

  // Defense-in-depth: block dangerous patterns at executor level
  const cmd = String(input.command || '');
  for (const pattern of DANGEROUS_BASH_PATTERNS) {
    if (pattern.test(cmd)) {
      return {
        toolCallId: '',
        output: `Dangerous command blocked by executor: ${cmd.slice(0, 100)}`,
        isError: true,
      };
    }
  }

  const timeout = Math.min(input.timeout || DEFAULT_BASH_TIMEOUT, MAX_BASH_TIMEOUT);

  try {
    const result = execSync(input.command, {
      cwd: ctx.workDir,
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return {
      toolCallId: '',
      output: truncate(result || '(no output)'),
      isError: false,
    };
  } catch (err: unknown) {
    const execErr = err as { stderr?: string; stdout?: string; message?: string; status?: number };
    const stderr = execErr.stderr || '';
    const stdout = execErr.stdout || '';
    const combined = stdout + (stderr ? '\nSTDERR:\n' + stderr : '');
    return {
      toolCallId: '',
      output: truncate(combined || execErr.message || 'Command failed'),
      isError: true,
    };
  }
}

function executeRead(
  input: { file_path: string; offset?: number; limit?: number },
  ctx: ExecutorContext,
): ToolResult {
  const filePath = resolvePath(input.file_path, ctx.workDir);

  if (!isPathAllowed(filePath, ctx.policy, ctx.workDir)) {
    return {
      toolCallId: '',
      output: `Path not allowed by policy: ${input.file_path}`,
      isError: true,
    };
  }

  if (!existsSync(filePath)) {
    return {
      toolCallId: '',
      output: `File not found: ${input.file_path}`,
      isError: true,
    };
  }

  try {
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      return {
        toolCallId: '',
        output: `Cannot read directory: ${input.file_path}. Use glob to list files.`,
        isError: true,
      };
    }

    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n');
    const offset = Math.max(0, (input.offset || 1) - 1);
    const limit = input.limit || MAX_READ_LINES;
    const sliced = lines.slice(offset, offset + limit);

    const numbered = sliced
      .map((line, i) => `${String(offset + i + 1).padStart(6)}  ${line}`)
      .join('\n');

    const result = truncate(numbered);
    const info = lines.length > offset + limit
      ? `\n... (showing lines ${offset + 1}-${offset + limit} of ${lines.length})`
      : '';

    return {
      toolCallId: '',
      output: result + info,
      isError: false,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      toolCallId: '',
      output: `Error reading file: ${message}`,
      isError: true,
    };
  }
}

function executeWrite(
  input: { file_path: string; content: string },
  ctx: ExecutorContext,
): ToolResult {
  const filePath = resolvePath(input.file_path, ctx.workDir);

  if (!isPathAllowed(filePath, ctx.policy, ctx.workDir)) {
    return {
      toolCallId: '',
      output: `Path not allowed by policy: ${input.file_path}`,
      isError: true,
    };
  }

  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(filePath, input.content, 'utf-8');

    return {
      toolCallId: '',
      output: `Wrote ${input.content.length} bytes to ${input.file_path}`,
      isError: false,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      toolCallId: '',
      output: `Error writing file: ${message}`,
      isError: true,
    };
  }
}

function executeGlob(
  input: { pattern: string; path?: string },
  ctx: ExecutorContext,
): ToolResult {
  const searchDir = input.path
    ? resolvePath(input.path, ctx.workDir)
    : ctx.workDir;

  if (!isPathAllowed(searchDir, ctx.policy, ctx.workDir)) {
    return {
      toolCallId: '',
      output: `Path not allowed by policy: ${input.path}`,
      isError: true,
    };
  }

  try {
    // Use Node.js globSync (Node 22+)
    const matches = globSync(input.pattern, { cwd: searchDir });
    if (matches.length === 0) {
      return {
        toolCallId: '',
        output: `No files matching "${input.pattern}" in ${input.path || '.'}`,
        isError: false,
      };
    }

    const result = matches.sort().join('\n');
    return {
      toolCallId: '',
      output: truncate(result),
      isError: false,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      toolCallId: '',
      output: `Glob error: ${message}`,
      isError: true,
    };
  }
}

function executeGrep(
  input: { pattern: string; path?: string; glob?: string; context?: number },
  ctx: ExecutorContext,
): ToolResult {
  // Use ripgrep if available, fall back to grep
  const searchPath = input.path
    ? resolvePath(input.path, ctx.workDir)
    : ctx.workDir;

  if (!isPathAllowed(searchPath, ctx.policy, ctx.workDir)) {
    return {
      toolCallId: '',
      output: `Path not allowed by policy: ${input.path}`,
      isError: true,
    };
  }

  try {
    const args: string[] = ['-rn'];

    if (input.context && input.context > 0) {
      args.push(`-C${input.context}`);
    }
    if (input.glob) {
      args.push(`--include=${input.glob}`);
    }

    args.push('--', input.pattern, searchPath);

    // Try ripgrep first, then grep (cross-platform tool detection)
    let cmd: string;
    try {
      execSync(`${WHICH_CMD} rg`, { encoding: 'utf-8', stdio: 'pipe' });
      const rgArgs: string[] = ['-n'];
      if (input.context && input.context > 0) {
        rgArgs.push(`-C${input.context}`);
      }
      if (input.glob) {
        rgArgs.push(`--glob=${input.glob}`);
      }
      rgArgs.push('--', input.pattern, searchPath);
      cmd = `rg ${rgArgs.map((a) => JSON.stringify(a)).join(' ')}`;
    } catch {
      // On Windows without rg, try findstr as last resort
      if (IS_WINDOWS) {
        cmd = `findstr /s /n ${JSON.stringify(input.pattern)} ${JSON.stringify(searchPath + '\\*')}`;
      } else {
        cmd = `grep ${args.map((a) => JSON.stringify(a)).join(' ')}`;
      }
    }

    const result = execSync(cmd, {
      cwd: ctx.workDir,
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!result.trim()) {
      return {
        toolCallId: '',
        output: `No matches for pattern "${input.pattern}"`,
        isError: false,
      };
    }

    return {
      toolCallId: '',
      output: truncate(result),
      isError: false,
    };
  } catch (err: unknown) {
    const execErr = err as { status?: number; stdout?: string; stderr?: string; message?: string };
    // grep returns exit code 1 when no matches found
    if (execErr.status === 1 && !execErr.stderr) {
      return {
        toolCallId: '',
        output: `No matches for pattern "${input.pattern}"`,
        isError: false,
      };
    }
    return {
      toolCallId: '',
      output: `Grep error: ${execErr.stderr || execErr.message || 'Unknown error'}`,
      isError: true,
    };
  }
}

export function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: ExecutorContext,
): ToolResult {
  switch (toolName) {
    case 'bash':
      return executeBash(input as { command: string; timeout?: number }, ctx);
    case 'read':
      return executeRead(input as { file_path: string; offset?: number; limit?: number }, ctx);
    case 'write':
      return executeWrite(input as { file_path: string; content: string }, ctx);
    case 'glob':
      return executeGlob(input as { pattern: string; path?: string }, ctx);
    case 'grep':
      return executeGrep(input as { pattern: string; path?: string; glob?: string; context?: number }, ctx);
    default:
      return {
        toolCallId: '',
        output: `Unknown tool: ${toolName}`,
        isError: true,
      };
  }
}
