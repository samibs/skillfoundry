// Debug session manager — spawns processes under debugger control,
// connects to debug protocol, manages session lifecycle and cleanup.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../utils/logger.js';
// ── Constants ───────────────────────────────────────────────────────
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 300_000;
const KILL_GRACE_MS = 2_000;
const MAX_STDERR_BUFFER = 1024 * 1024; // 1 MB limit for stderr accumulation
const WS_URL_PATTERN = /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+)/;
// Allowed test runner commands — prevents command injection via testCommand
const ALLOWED_TEST_RUNNERS = new Set([
    'node', 'npx', 'tsx', 'ts-node', 'bun',
    'jest', 'vitest', 'mocha', 'ava', 'tap', 'uvu',
    'pytest', 'python', 'python3',
]);
// ── Runtime detection ───────────────────────────────────────────────
export function detectRuntime(workDir) {
    if (existsSync(join(workDir, 'tsconfig.json')))
        return 'node';
    if (existsSync(join(workDir, 'package.json')))
        return 'node';
    if (existsSync(join(workDir, 'requirements.txt')))
        return 'python';
    if (existsSync(join(workDir, 'pyproject.toml')))
        return 'python';
    if (existsSync(join(workDir, 'Cargo.toml')))
        return 'lldb';
    return 'node';
}
// ── DebugSession ────────────────────────────────────────────────────
export class DebugSession {
    static activeSession = null;
    sessionId;
    runtime;
    file;
    startedAt;
    timeoutMs;
    child = null;
    cdp = null;
    status = 'starting';
    timeoutHandle = null;
    cleanupRegistered = false;
    cleanupFn = null;
    stopped = false;
    constructor(sessionId, runtime, file, timeoutMs) {
        this.sessionId = sessionId;
        this.runtime = runtime;
        this.file = file;
        this.startedAt = Date.now();
        this.timeoutMs = timeoutMs;
    }
    // ── Static lifecycle ────────────────────────────────────────────
    /**
     * Start a new debug session. Terminates any existing active session first.
     * @param options - Debug session configuration
     * @returns The new active DebugSession
     * @throws Error if the runtime is unsupported or spawning fails
     */
    static async start(options) {
        const log = getLogger();
        // Terminate any existing session (singleton enforcement)
        if (DebugSession.activeSession) {
            log.debug('debugger', 'terminating_previous_session', {
                sessionId: DebugSession.activeSession.sessionId,
            });
            await DebugSession.terminateActive();
        }
        const runtime = options.runtime ?? detectRuntime(options.workDir);
        // Phase 2/3 stubs: unsupported runtimes return clear errors
        if (runtime === 'python') {
            throw new Error('Python debugging requires debugpy. Install with: pip install debugpy. (Coming in Phase 2)');
        }
        if (runtime === 'lldb') {
            throw new Error('Native code debugging via LLDB coming in Phase 3.');
        }
        const timeoutMs = Math.min(Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1000), MAX_TIMEOUT_MS);
        const session = new DebugSession(randomUUID(), runtime, options.file, timeoutMs);
        log.debug('debugger', 'session_starting', {
            sessionId: session.sessionId,
            runtime,
            file: options.file,
            timeoutMs,
        });
        await session.spawnAndConnect(options);
        DebugSession.activeSession = session;
        return session;
    }
    /**
     * Get the currently active debug session, if any.
     */
    static getActive() {
        return DebugSession.activeSession;
    }
    /**
     * Terminate the currently active debug session.
     */
    static async terminateActive() {
        if (DebugSession.activeSession) {
            await DebugSession.activeSession.stop();
            DebugSession.activeSession = null;
        }
    }
    // ── Instance methods ────────────────────────────────────────────
    /**
     * Set a breakpoint at a specific file and line.
     * @param file - Absolute path to the source file
     * @param line - 1-indexed line number
     * @param condition - Optional conditional expression
     * @returns Breakpoint information
     */
    async setBreakpoint(file, line, condition) {
        this.assertAlive();
        const params = {
            location: {
                scriptId: undefined,
                lineNumber: line - 1, // CDP uses 0-indexed lines
                columnNumber: 0,
            },
            url: `file://${file}`,
        };
        if (condition) {
            params.condition = condition;
        }
        const response = await this.cdp.send('Debugger.setBreakpointByUrl', {
            lineNumber: line - 1,
            url: `file://${file}`,
            columnNumber: 0,
            condition: condition ?? '',
        });
        return {
            breakpointId: response.breakpointId,
            file,
            line,
            condition,
            verified: Array.isArray(response.locations) && response.locations.length > 0,
        };
    }
    /**
     * Remove a previously set breakpoint by its ID.
     * @param breakpointId - The breakpoint identifier returned from setBreakpoint
     */
    async removeBreakpoint(breakpointId) {
        this.assertAlive();
        await this.cdp.send('Debugger.removeBreakpoint', { breakpointId });
    }
    /**
     * Inspect the current debug state.
     * @param target - 'scope' for local variables, 'callstack' for the call stack,
     *                 or an object ID string for a specific remote object.
     * @returns Inspection data
     */
    async inspect(target) {
        this.assertAlive();
        if (target === 'callstack') {
            const response = await this.cdp.send('Debugger.getStackTrace', {});
            return { target: 'callstack', data: response };
        }
        if (target === 'scope') {
            // Get the top frame's scope chain
            const pausedState = await this.cdp.send('Debugger.evaluateOnCallFrame', {
                callFrameId: '0',
                expression: 'JSON.stringify(Object.keys(this))',
                returnByValue: true,
            });
            return { target: 'scope', data: pausedState };
        }
        // Treat as a remote object ID
        const response = await this.cdp.send('Runtime.getProperties', {
            objectId: target,
            ownProperties: true,
            generatePreview: true,
        });
        return { target, data: response };
    }
    /**
     * Evaluate an expression in the current debug context.
     * @param expression - JavaScript expression to evaluate
     * @returns Evaluation result with value, type, and description
     */
    async evaluate(expression) {
        this.assertAlive();
        const response = await this.cdp.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            generatePreview: true,
        });
        const result = response.result;
        if (response.exceptionDetails) {
            const exDetails = response.exceptionDetails;
            throw new Error(`Evaluation error: ${exDetails.text || 'unknown error'}`);
        }
        return {
            value: result?.value,
            type: result?.type ?? 'undefined',
            description: result?.description,
        };
    }
    /**
     * Control execution flow.
     * @param action - 'next' (step over), 'into' (step into), 'out' (step out),
     *                 'continue' (resume), or 'pause'
     * @returns Step result with current location when paused
     */
    async step(action) {
        this.assertAlive();
        const methodMap = {
            next: 'Debugger.stepOver',
            into: 'Debugger.stepInto',
            out: 'Debugger.stepOut',
            continue: 'Debugger.resume',
            pause: 'Debugger.pause',
        };
        const method = methodMap[action];
        if (!method) {
            throw new Error(`Unknown step action: ${action}`);
        }
        await this.cdp.send(method, {});
        if (action === 'continue') {
            this.status = 'running';
        }
        else if (action === 'pause') {
            this.status = 'paused';
        }
        else {
            // Step actions: debugger will pause at next location
            this.status = 'paused';
        }
        return {
            action,
            status: this.status,
        };
    }
    /**
     * Stop the debug session, clean up the child process and CDP connection.
     * @returns Status summary with session duration
     */
    async stop() {
        if (this.stopped) {
            return { status: 'already_terminated', durationMs: Date.now() - this.startedAt };
        }
        this.stopped = true;
        this.status = 'terminated';
        const log = getLogger();
        log.debug('debugger', 'session_stopping', { sessionId: this.sessionId });
        // Clear the timeout guard
        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
            this.timeoutHandle = null;
        }
        // Attempt graceful CDP shutdown
        if (this.cdp) {
            try {
                await this.cdp.send('Runtime.terminateExecution', {});
            }
            catch {
                // Process may already be exiting — ignore
            }
            try {
                this.cdp.close();
            }
            catch {
                // Already closed — ignore
            }
            this.cdp = null;
        }
        // Remove signal handlers before killing to prevent double cleanup
        this.removeCleanupHandlers();
        // Terminate the child process
        await this.killChild();
        // Remove from active session if this is it
        if (DebugSession.activeSession === this) {
            DebugSession.activeSession = null;
        }
        const durationMs = Date.now() - this.startedAt;
        log.debug('debugger', 'session_stopped', { sessionId: this.sessionId, durationMs });
        return { status: 'terminated', durationMs };
    }
    /**
     * Get current session information.
     */
    getInfo() {
        return {
            sessionId: this.sessionId,
            runtime: this.runtime,
            pid: this.child?.pid ?? -1,
            status: this.status,
            file: this.file,
            startedAt: this.startedAt,
            timeoutMs: this.timeoutMs,
        };
    }
    // ── Private helpers ─────────────────────────────────────────────
    assertAlive() {
        if (this.stopped || this.status === 'terminated') {
            throw new Error('Debug session has been terminated.');
        }
        if (!this.cdp) {
            throw new Error('CDP connection is not available.');
        }
    }
    async spawnAndConnect(options) {
        const log = getLogger();
        const { CDPAdapter: CDPAdapterClass } = await import('./debugger-cdp.js');
        // Build spawn arguments
        let command;
        let args;
        if (options.testCommand) {
            // Debug via test runner: inject --inspect-brk into the test command
            const parts = options.testCommand.split(/\s+/).filter(Boolean);
            command = parts[0];
            // Security: validate test runner against whitelist to prevent command injection
            const baseCommand = command.replace(/^.*[/\\]/, ''); // strip path prefix
            if (!ALLOWED_TEST_RUNNERS.has(baseCommand)) {
                throw new Error(`Unknown test runner: ${baseCommand}. Allowed: ${[...ALLOWED_TEST_RUNNERS].join(', ')}`);
            }
            args = [...parts.slice(1)];
            // Inject --inspect-brk=0 after the node/npx/tsx command
            const nodeCommands = ['node', 'npx', 'tsx', 'ts-node'];
            if (nodeCommands.includes(command)) {
                args.unshift('--inspect-brk=0');
            }
            else {
                // For other runners (jest, vitest, etc.), prepend node with inspect flag
                args = ['--inspect-brk=0', command, ...args];
                command = 'node';
            }
            // Append the file if not already in the command
            if (!options.testCommand.includes(options.file)) {
                args.push(options.file);
            }
        }
        else {
            command = 'node';
            args = [
                '--inspect-brk=0',
                '--enable-source-maps',
                options.file,
                ...(options.args ?? []),
            ];
        }
        log.debug('debugger', 'spawning_process', { command, args });
        // Spawn the child process
        const child = spawn(command, args, {
            cwd: options.workDir,
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: false,
            env: { ...process.env },
        });
        this.child = child;
        if (!child.pid) {
            throw new Error(`Failed to spawn debugger process: ${command} ${args.join(' ')}`);
        }
        log.debug('debugger', 'process_spawned', { pid: child.pid });
        // Register process cleanup handlers
        this.registerCleanupHandlers();
        // Parse stderr for the WebSocket URL
        const wsUrl = await this.waitForDebuggerUrl(child);
        log.debug('debugger', 'debugger_url_found', { url: wsUrl });
        // Connect CDP adapter
        const cdp = new CDPAdapterClass();
        await cdp.connect(wsUrl);
        this.cdp = cdp;
        // Enable debugger and runtime domains
        await cdp.send('Debugger.enable', {});
        await cdp.send('Runtime.enable', {});
        this.status = 'paused_at_entry';
        // Start the session timeout
        this.timeoutHandle = setTimeout(async () => {
            log.debug('debugger', 'session_timeout', {
                sessionId: this.sessionId,
                timeoutMs: this.timeoutMs,
            });
            await this.stop();
        }, this.timeoutMs);
        // Ensure the timeout doesn't prevent Node from exiting
        if (this.timeoutHandle && typeof this.timeoutHandle === 'object' && 'unref' in this.timeoutHandle) {
            this.timeoutHandle.unref();
        }
    }
    waitForDebuggerUrl(child) {
        return new Promise((resolve, reject) => {
            let stderrBuffer = '';
            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    reject(new Error(`Timed out waiting for debugger URL (10s). stderr: ${stderrBuffer.slice(0, 500)}`));
                }
            }, 10_000);
            const onData = (data) => {
                if (resolved)
                    return;
                stderrBuffer += data.toString();
                // Security: prevent unbounded memory growth from malicious stderr output
                if (stderrBuffer.length > MAX_STDERR_BUFFER) {
                    resolved = true;
                    clearTimeout(timeout);
                    child.stderr?.off('data', onData);
                    reject(new Error('Debugger stderr exceeded 1 MB limit — possible runaway output'));
                    return;
                }
                const match = WS_URL_PATTERN.exec(stderrBuffer);
                if (match) {
                    resolved = true;
                    clearTimeout(timeout);
                    child.stderr?.off('data', onData);
                    resolve(match[1]);
                }
            };
            child.stderr?.on('data', onData);
            child.on('error', (err) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    reject(new Error(`Failed to start debug process: ${err.message}`));
                }
            });
            child.on('exit', (code) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    reject(new Error(`Debug process exited before debugger connected (code ${code}). stderr: ${stderrBuffer.slice(0, 500)}`));
                }
            });
        });
    }
    registerCleanupHandlers() {
        if (this.cleanupRegistered)
            return;
        this.cleanupRegistered = true;
        const cleanup = () => {
            if (this.child && !this.child.killed) {
                try {
                    this.child.kill('SIGKILL');
                }
                catch {
                    // Process may already be gone — ignore
                }
            }
        };
        this.cleanupFn = cleanup;
        process.on('exit', cleanup);
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        // Remove listeners when child exits naturally
        this.child?.on('exit', () => this.removeCleanupHandlers());
    }
    removeCleanupHandlers() {
        if (this.cleanupFn) {
            process.removeListener('exit', this.cleanupFn);
            process.removeListener('SIGINT', this.cleanupFn);
            process.removeListener('SIGTERM', this.cleanupFn);
            this.cleanupFn = null;
        }
        this.cleanupRegistered = false;
    }
    async killChild() {
        if (!this.child || this.child.killed)
            return;
        const child = this.child;
        const pid = child.pid;
        // Send SIGTERM first for graceful shutdown
        try {
            child.kill('SIGTERM');
        }
        catch {
            // Already dead — return
            return;
        }
        // Wait for graceful exit or force-kill after KILL_GRACE_MS
        await new Promise((resolve) => {
            let forceKillTimeout = null;
            const onExit = () => {
                if (forceKillTimeout)
                    clearTimeout(forceKillTimeout);
                resolve();
            };
            child.once('exit', onExit);
            forceKillTimeout = setTimeout(() => {
                const log = getLogger();
                log.debug('debugger', 'force_killing_child', { pid });
                try {
                    child.kill('SIGKILL');
                }
                catch {
                    // Already dead
                }
                child.removeListener('exit', onExit);
                resolve();
            }, KILL_GRACE_MS);
        });
    }
}
//# sourceMappingURL=debugger.js.map