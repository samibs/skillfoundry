/**
 * Chrome DevTools Protocol (CDP) adapter for debugging external Node.js/Bun processes.
 *
 * Connects to a target process started with `node --inspect-brk=0 <file>` via
 * WebSocket, sends CDP commands, and handles debugger events.
 *
 * WebSocket strategy: uses a minimal text-frame-only WS client built on
 * `node:http` + `node:net` for Node 20 compatibility (no dependency on the
 * global WebSocket constructor introduced in Node 21).
 */
export interface CDPBreakpoint {
    id: string;
    file: string;
    line: number;
    condition?: string;
    verified: boolean;
}
export interface CDPPauseLocation {
    file: string;
    line: number;
    column: number;
    functionName: string;
}
export interface CDPVariable {
    name: string;
    type: string;
    value: unknown;
    preview?: string;
}
export interface CDPStackFrame {
    id: string;
    functionName: string;
    file: string;
    line: number;
    column: number;
}
export declare class CDPAdapter {
    private ws;
    private msgId;
    private pending;
    private paused;
    private pauseLocation;
    private callFrames;
    private scriptMap;
    private connected;
    /** Connect to a CDP endpoint via WebSocket. Only localhost connections allowed. */
    connect(wsUrl: string): Promise<void>;
    /** Close the CDP connection (alias for disconnect). */
    close(): void;
    /** Gracefully disconnect from the debuggee. */
    disconnect(): Promise<void>;
    /** Enable the Debugger and Runtime domains. */
    enableDebugger(): Promise<void>;
    /** Set a breakpoint by file path and 0-based line number. */
    setBreakpoint(file: string, line: number, condition?: string): Promise<CDPBreakpoint>;
    /** Remove a breakpoint by its CDP breakpoint ID. */
    removeBreakpoint(breakpointId: string): Promise<void>;
    /** Resume execution. */
    resume(): Promise<void>;
    /** Step over the current statement and wait for the next pause. */
    stepOver(): Promise<CDPPauseLocation>;
    /** Step into the current call and wait for the next pause. */
    stepInto(): Promise<CDPPauseLocation>;
    /** Step out of the current function and wait for the next pause. */
    stepOut(): Promise<CDPPauseLocation>;
    /** Pause execution immediately. */
    pause(): Promise<void>;
    /**
     * Evaluate an expression in the context of the current paused call frame.
     * If not paused, evaluates in the global scope.
     */
    evaluate(expression: string): Promise<{
        type: string;
        value: unknown;
        preview?: string;
    }>;
    /**
     * Return variables visible in the top call frame's scope chain.
     * Only available when paused.
     */
    getScope(): Promise<CDPVariable[]>;
    /** Return the current call stack. Only available when paused. */
    getCallStack(): Promise<CDPStackFrame[]>;
    getPauseLocation(): CDPPauseLocation | null;
    isPaused(): boolean;
    isConnected(): boolean;
    /**
     * Send a CDP method call and wait for the matching response.
     * Rejects if the response contains an `error` field or if the
     * connection drops before a response arrives.
     */
    /** Build a short preview string from a CDP RemoteObject (for scope variables). */
    private formatVariablePreview;
    /**
     * Send a CDP method call and wait for the matching response.
     * Rejects if the response contains an `error` field or if the
     * connection drops before a response arrives.
     */
    send(method: string, params: Record<string, unknown>): Promise<any>;
    /** Dispatch an incoming CDP message (response or event). */
    private onMessage;
    /** Handle CDP events. */
    private handleEvent;
    private onClose;
    private onError;
    /**
     * Issue a step command, then wait for the next `Debugger.paused` event
     * by polling internal state (the event is processed via onMessage).
     */
    private stepAndWait;
    /**
     * Wait until the adapter enters the paused state (driven by incoming
     * Debugger.paused events processed on the socket).  Times out after 30 s.
     */
    private waitForPause;
    private ensurePaused;
    /** Map a CDP scriptId to its source URL / file path. */
    private resolveScriptUrl;
    /**
     * Format a CDP RemoteObject into a friendlier shape.
     * Large string values are truncated to VALUE_PREVIEW_LIMIT.
     */
    private formatRemoteObject;
    /** Build a human-readable preview string from a CDP ObjectPreview. */
    private stringifyPreview;
}
