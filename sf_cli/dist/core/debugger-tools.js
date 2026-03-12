// Debug tool definitions for the Anthropic tool_use API.
// Provides 6 debug tools that route to DebugSession for interactive debugging.
export const TOOL_DEBUG_START = {
    name: 'debug_start',
    description: 'Start a debug session for a file or test. Launches the process under debugger control, paused at entry. Returns a session_id for subsequent debug commands. Only one session at a time.',
    input_schema: {
        type: 'object',
        properties: {
            file: {
                type: 'string',
                description: 'Path to the file to debug (absolute or relative to project root)',
            },
            runtime: {
                type: 'string',
                enum: ['node', 'python'],
                description: 'Runtime to use for debugging (default: auto-detected from file extension)',
            },
            args: {
                type: 'array',
                items: { type: 'string' },
                description: 'Arguments to pass to the debugged process',
            },
            test_command: {
                type: 'string',
                description: 'Test runner command (e.g. "jest", "pytest") — overrides direct file execution',
            },
            timeout: {
                type: 'number',
                description: 'Session timeout in milliseconds (default 60000, max 300000)',
            },
        },
        required: ['file'],
    },
};
export const TOOL_DEBUG_BREAKPOINT = {
    name: 'debug_breakpoint',
    description: 'Manage breakpoints in a debug session. Set breakpoints at file:line (with optional condition), remove by ID, or list all active breakpoints.',
    input_schema: {
        type: 'object',
        properties: {
            session_id: {
                type: 'string',
                description: 'Active debug session ID',
            },
            action: {
                type: 'string',
                enum: ['set', 'remove', 'list'],
                description: 'Breakpoint action: "set" to add, "remove" to delete, "list" to show all',
            },
            file: {
                type: 'string',
                description: 'File path for the breakpoint (required for "set")',
            },
            line: {
                type: 'number',
                description: 'Line number for the breakpoint (required for "set")',
            },
            condition: {
                type: 'string',
                description: 'Conditional expression — breakpoint only triggers when this evaluates to true',
            },
            breakpoint_id: {
                type: 'string',
                description: 'Breakpoint ID to remove (required for "remove")',
            },
        },
        required: ['session_id', 'action'],
    },
};
export const TOOL_DEBUG_INSPECT = {
    name: 'debug_inspect',
    description: 'Inspect runtime state when execution is paused. Use target=\'scope\' for all local variables, target=\'callstack\' for the full call stack, or target=\'variableName\' to inspect a specific variable.',
    input_schema: {
        type: 'object',
        properties: {
            session_id: {
                type: 'string',
                description: 'Active debug session ID',
            },
            target: {
                type: 'string',
                description: 'What to inspect: "scope" for locals, "callstack" for call stack, or a variable name',
            },
            depth: {
                type: 'number',
                description: 'Depth for nested object inspection (default 1)',
            },
        },
        required: ['session_id', 'target'],
    },
};
export const TOOL_DEBUG_EVALUATE = {
    name: 'debug_evaluate',
    description: 'Evaluate a JavaScript/Python expression in the context of the current paused frame. Returns the result with type information. Can be used to test fix hypotheses or hot-patch values.',
    input_schema: {
        type: 'object',
        properties: {
            session_id: {
                type: 'string',
                description: 'Active debug session ID',
            },
            expression: {
                type: 'string',
                description: 'Expression to evaluate in the current frame context',
            },
        },
        required: ['session_id', 'expression'],
    },
};
export const TOOL_DEBUG_STEP = {
    name: 'debug_step',
    description: 'Control execution flow in a debug session. \'next\' steps over, \'into\' steps into function calls, \'out\' steps out of current function, \'continue\' resumes execution, \'pause\' pauses running code.',
    input_schema: {
        type: 'object',
        properties: {
            session_id: {
                type: 'string',
                description: 'Active debug session ID',
            },
            action: {
                type: 'string',
                enum: ['next', 'into', 'out', 'continue', 'pause'],
                description: 'Execution control action',
            },
        },
        required: ['session_id', 'action'],
    },
};
export const TOOL_DEBUG_STOP = {
    name: 'debug_stop',
    description: 'Stop a debug session. Terminates the debugged process, cleans up all resources, and frees the session slot for a new session.',
    input_schema: {
        type: 'object',
        properties: {
            session_id: {
                type: 'string',
                description: 'Active debug session ID to terminate',
            },
        },
        required: ['session_id'],
    },
};
export const ALL_DEBUG_TOOLS = [
    TOOL_DEBUG_START,
    TOOL_DEBUG_BREAKPOINT,
    TOOL_DEBUG_INSPECT,
    TOOL_DEBUG_EVALUATE,
    TOOL_DEBUG_STEP,
    TOOL_DEBUG_STOP,
];
export const DEBUG_TOOL_NAMES = new Set(ALL_DEBUG_TOOLS.map((t) => t.name));
// Active session reference — enforces single-session constraint
let activeSessionId = null;
function makeResult(output, isError = false) {
    const serialized = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
    return { toolCallId: '', output: serialized, isError };
}
function validateSessionId(sessionId) {
    if (!activeSessionId) {
        return makeResult({ error: 'No active debug session. Use debug_start first.' }, true);
    }
    if (activeSessionId !== sessionId) {
        return makeResult({
            error: `Session ID mismatch. Active session: ${activeSessionId}, received: ${sessionId}`,
        }, true);
    }
    return null;
}
export async function executeDebugTool(toolName, input, workDir) {
    // Lazy import to avoid circular dependencies and loading debugger when not needed
    const { DebugSession } = await import('./debugger.js');
    try {
        switch (toolName) {
            case 'debug_start': {
                if (activeSessionId) {
                    return makeResult({
                        error: 'A debug session is already active. Stop it first with debug_stop.',
                        active_session_id: activeSessionId,
                    }, true);
                }
                const file = input.file;
                if (!file) {
                    return makeResult({ error: 'Missing required parameter: file' }, true);
                }
                const session = await DebugSession.start({
                    file,
                    workDir,
                    runtime: input.runtime || undefined,
                    args: input.args || [],
                    testCommand: input.test_command || undefined,
                    timeoutMs: Math.min(input.timeout || 60_000, 300_000),
                });
                const info = session.getInfo();
                activeSessionId = info.sessionId;
                return makeResult({
                    session_id: info.sessionId,
                    status: info.status,
                    file: info.file,
                    pid: info.pid,
                    runtime: info.runtime,
                    message: 'Debug session started. Process paused at entry point.',
                });
            }
            case 'debug_breakpoint': {
                const sessionCheck = validateSessionId(input.session_id);
                if (sessionCheck)
                    return sessionCheck;
                const session = DebugSession.getActive();
                if (!session) {
                    return makeResult({ error: 'No active debug session.' }, true);
                }
                const action = input.action;
                if (!action || !['set', 'remove', 'list'].includes(action)) {
                    return makeResult({ error: 'Invalid action. Must be "set", "remove", or "list".' }, true);
                }
                if (action === 'set') {
                    if (!input.file || input.line === undefined) {
                        return makeResult({ error: 'Parameters "file" and "line" are required for action "set".' }, true);
                    }
                    const bp = await session.setBreakpoint(input.file, input.line, input.condition || undefined);
                    return makeResult({
                        action: 'set',
                        breakpoint: bp,
                        message: `Breakpoint set at ${input.file}:${input.line}`,
                    });
                }
                if (action === 'remove') {
                    if (!input.breakpoint_id) {
                        return makeResult({ error: 'Parameter "breakpoint_id" is required for action "remove".' }, true);
                    }
                    await session.removeBreakpoint(input.breakpoint_id);
                    return makeResult({
                        action: 'remove',
                        breakpoint_id: input.breakpoint_id,
                        message: 'Breakpoint removed.',
                    });
                }
                // action === 'list' — not directly supported by CDP, return info
                return makeResult({
                    action: 'list',
                    message: 'Use debug_inspect with target="scope" to see current state.',
                });
            }
            case 'debug_inspect': {
                const sessionCheck = validateSessionId(input.session_id);
                if (sessionCheck)
                    return sessionCheck;
                const session = DebugSession.getActive();
                if (!session) {
                    return makeResult({ error: 'No active debug session.' }, true);
                }
                const target = input.target;
                if (!target) {
                    return makeResult({ error: 'Missing required parameter: target' }, true);
                }
                const result = await session.inspect(target);
                return makeResult({
                    target: result.target,
                    result: result.data,
                });
            }
            case 'debug_evaluate': {
                const sessionCheck = validateSessionId(input.session_id);
                if (sessionCheck)
                    return sessionCheck;
                const session = DebugSession.getActive();
                if (!session) {
                    return makeResult({ error: 'No active debug session.' }, true);
                }
                const expression = input.expression;
                if (!expression) {
                    return makeResult({ error: 'Missing required parameter: expression' }, true);
                }
                const result = await session.evaluate(expression);
                return makeResult({
                    expression,
                    result: result.value,
                    type: result.type,
                    description: result.description,
                });
            }
            case 'debug_step': {
                const sessionCheck = validateSessionId(input.session_id);
                if (sessionCheck)
                    return sessionCheck;
                const session = DebugSession.getActive();
                if (!session) {
                    return makeResult({ error: 'No active debug session.' }, true);
                }
                const action = input.action;
                if (!action || !['next', 'into', 'out', 'continue', 'pause'].includes(action)) {
                    return makeResult({
                        error: 'Invalid action. Must be "next", "into", "out", "continue", or "pause".',
                    }, true);
                }
                const result = await session.step(action);
                return makeResult({
                    action: result.action,
                    status: result.status,
                    location: result.location,
                });
            }
            case 'debug_stop': {
                const sessionCheck = validateSessionId(input.session_id);
                if (sessionCheck)
                    return sessionCheck;
                const session = DebugSession.getActive();
                if (!session) {
                    activeSessionId = null;
                    return makeResult({ error: 'No active debug session.' }, true);
                }
                const result = await session.stop();
                activeSessionId = null;
                return makeResult({
                    status: 'stopped',
                    durationMs: result.durationMs,
                    message: 'Debug session terminated. Resources cleaned up.',
                });
            }
            default:
                return makeResult({ error: `Unknown debug tool: ${toolName}` }, true);
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // If session crashed, clean up the reference
        if (activeSessionId && toolName !== 'debug_start') {
            try {
                await DebugSession.terminateActive();
            }
            catch {
                // Best-effort cleanup
            }
            activeSessionId = null;
        }
        return makeResult({
            error: message,
            tool: toolName,
            hint: toolName === 'debug_start'
                ? 'Check that the file exists and the runtime is installed.'
                : 'The debug session may have crashed. Start a new session with debug_start.',
        }, true);
    }
}
//# sourceMappingURL=debugger-tools.js.map