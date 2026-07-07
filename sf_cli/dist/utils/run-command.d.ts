export interface RunCommandResult {
    ok: boolean;
    output: string;
}
/**
 * Run a shell command synchronously, capturing stdout+stderr. Never throws:
 * on non-zero exit or error it returns `{ ok: false, output }` with the
 * combined streams (or the error message as a last resort).
 *
 * NOTE: `cmd` is a shell string — callers must never interpolate untrusted
 * input into it. Use execFileSync with an argv array for tainted input.
 */
export declare function runCommand(cmd: string, cwd: string, timeoutMs?: number, maxBuffer?: number): RunCommandResult;
