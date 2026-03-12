export type DebugRuntime = 'node' | 'python' | 'lldb';
export interface DebugSessionInfo {
    sessionId: string;
    runtime: DebugRuntime;
    pid: number;
    status: 'starting' | 'paused_at_entry' | 'paused' | 'running' | 'terminated';
    file: string;
    startedAt: number;
    timeoutMs: number;
}
export interface DebugStartOptions {
    file: string;
    runtime?: DebugRuntime;
    args?: string[];
    testCommand?: string;
    timeoutMs?: number;
    workDir: string;
}
export interface BreakpointResult {
    breakpointId: string;
    file: string;
    line: number;
    condition?: string;
    verified: boolean;
}
export interface InspectionResult {
    target: string;
    data: unknown;
}
export interface EvalResult {
    value: unknown;
    type: string;
    description?: string;
}
export interface StepResult {
    action: string;
    status: string;
    location?: {
        file: string;
        line: number;
        column: number;
    };
}
export declare function detectRuntime(workDir: string): DebugRuntime;
export declare class DebugSession {
    private static activeSession;
    private readonly sessionId;
    private readonly runtime;
    private readonly file;
    private readonly startedAt;
    private readonly timeoutMs;
    private child;
    private cdp;
    private status;
    private timeoutHandle;
    private cleanupRegistered;
    private cleanupFn;
    private stopped;
    private constructor();
    /**
     * Start a new debug session. Terminates any existing active session first.
     * @param options - Debug session configuration
     * @returns The new active DebugSession
     * @throws Error if the runtime is unsupported or spawning fails
     */
    static start(options: DebugStartOptions): Promise<DebugSession>;
    /**
     * Get the currently active debug session, if any.
     */
    static getActive(): DebugSession | null;
    /**
     * Terminate the currently active debug session.
     */
    static terminateActive(): Promise<void>;
    /**
     * Set a breakpoint at a specific file and line.
     * @param file - Absolute path to the source file
     * @param line - 1-indexed line number
     * @param condition - Optional conditional expression
     * @returns Breakpoint information
     */
    setBreakpoint(file: string, line: number, condition?: string): Promise<BreakpointResult>;
    /**
     * Remove a previously set breakpoint by its ID.
     * @param breakpointId - The breakpoint identifier returned from setBreakpoint
     */
    removeBreakpoint(breakpointId: string): Promise<void>;
    /**
     * Inspect the current debug state.
     * @param target - 'scope' for local variables, 'callstack' for the call stack,
     *                 or an object ID string for a specific remote object.
     * @returns Inspection data
     */
    inspect(target: 'scope' | 'callstack' | string): Promise<InspectionResult>;
    /**
     * Evaluate an expression in the current debug context.
     * @param expression - JavaScript expression to evaluate
     * @returns Evaluation result with value, type, and description
     */
    evaluate(expression: string): Promise<EvalResult>;
    /**
     * Control execution flow.
     * @param action - 'next' (step over), 'into' (step into), 'out' (step out),
     *                 'continue' (resume), or 'pause'
     * @returns Step result with current location when paused
     */
    step(action: 'next' | 'into' | 'out' | 'continue' | 'pause'): Promise<StepResult>;
    /**
     * Stop the debug session, clean up the child process and CDP connection.
     * @returns Status summary with session duration
     */
    stop(): Promise<{
        status: string;
        durationMs: number;
    }>;
    /**
     * Get current session information.
     */
    getInfo(): DebugSessionInfo;
    private assertAlive;
    private spawnAndConnect;
    private waitForDebuggerUrl;
    private registerCleanupHandlers;
    private removeCleanupHandlers;
    private killChild;
}
