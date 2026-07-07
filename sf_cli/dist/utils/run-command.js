// Shared synchronous shell-command runner. Single source of truth so the
// maxBuffer / error-fallback behavior can't drift between call sites (it did:
// gates.ts and dependency-scanner.ts used 5 MB while pipeline.ts used Node's
// 1 MB default with no message fallback — a truncation hazard on large output).
import { execSync } from 'node:child_process';
/** Build/test output routinely exceeds Node's 1 MB execSync default. */
const DEFAULT_MAX_BUFFER = 5 * 1024 * 1024;
/**
 * Run a shell command synchronously, capturing stdout+stderr. Never throws:
 * on non-zero exit or error it returns `{ ok: false, output }` with the
 * combined streams (or the error message as a last resort).
 *
 * NOTE: `cmd` is a shell string — callers must never interpolate untrusted
 * input into it. Use execFileSync with an argv array for tainted input.
 */
export function runCommand(cmd, cwd, timeoutMs = 60_000, maxBuffer = DEFAULT_MAX_BUFFER) {
    try {
        const output = execSync(cmd, {
            cwd,
            timeout: timeoutMs,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            maxBuffer,
        });
        return { ok: true, output: output || '' };
    }
    catch (err) {
        const execErr = err;
        const combined = (execErr.stdout || '') + (execErr.stderr || '');
        return { ok: false, output: combined || execErr.message || 'Command failed' };
    }
}
//# sourceMappingURL=run-command.js.map