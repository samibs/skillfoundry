// Permission engine — decides whether a tool call should be allowed, denied, or needs user approval.
import { SHELL_TOOLS, WRITE_TOOLS, READ_TOOLS } from './tools.js';
// Patterns that should never be executed (cross-platform)
const DANGEROUS_PATTERNS = [
    // Unix destructive commands
    /rm\s+-rf\s+[\/~]/, // rm -rf from root or home
    /mkfs/, // format filesystem
    /dd\s+if=.*of=\/dev/, // raw disk write
    />\s*\/dev\/sd/, // redirect to disk device
    /chmod\s+-R\s+777/, // open permissions recursively
    /curl.*\|\s*(ba)?sh/, // pipe curl to shell
    /wget.*\|\s*(ba)?sh/, // pipe wget to shell
    // Windows destructive commands
    /rd\s+\/s\s+\/q\s+[A-Za-z]:\\/i, // rd /s /q C:\
    /del\s+\/[fF]\s+\/[sS]\s+[A-Za-z]:\\/, // del /F /S C:\
    /format\s+[A-Za-z]:/i, // format C:
    /diskpart/i, // disk partition tool
    /icacls\s+[A-Za-z]:\\.*\/grant.*Everyone/i, // grant everyone full access
    /powershell.*-[Ee]nc\s/, // encoded PowerShell (obfuscation)
];
// Patterns that always need confirmation
const SENSITIVE_PATTERNS = [
    /git\s+push/, // push to remote
    /git\s+reset\s+--hard/, // destructive reset
    /git\s+branch\s+-[dD]/, // delete branch
    /npm\s+publish/, // publish package
    /docker\s+rm/, // remove container
    /kill\s+-9/, // force kill
];
// Permanently allowed tool calls (accumulated during session)
const alwaysAllowed = new Set();
export function checkPermission(toolCall, policy, mode) {
    // Trusted mode: allow everything
    if (mode === 'trusted') {
        return { decision: 'allow', reason: 'Trusted mode — all tools allowed' };
    }
    // Deny mode: block everything
    if (mode === 'deny') {
        return { decision: 'deny', reason: 'Deny mode — all tools blocked' };
    }
    // Check if this specific tool+input combo was permanently allowed
    const callKey = `${toolCall.name}:${JSON.stringify(toolCall.input)}`;
    if (alwaysAllowed.has(callKey)) {
        return { decision: 'allow', reason: 'Previously approved (always allow)' };
    }
    // Tool-category-specific tool name allowed check
    const toolKey = `tool:${toolCall.name}`;
    if (alwaysAllowed.has(toolKey)) {
        // Even with tool-level always-allow, check for dangerous patterns
        if (toolCall.name === 'bash') {
            const cmd = String(toolCall.input.command || '');
            for (const pattern of DANGEROUS_PATTERNS) {
                if (pattern.test(cmd)) {
                    return { decision: 'deny', reason: `Dangerous command blocked: ${cmd}` };
                }
            }
        }
        return { decision: 'allow', reason: `Tool "${toolCall.name}" always allowed` };
    }
    // Policy-level checks
    if (SHELL_TOOLS.has(toolCall.name) && !policy.allow_shell) {
        return {
            decision: 'deny',
            reason: 'Shell execution disabled by policy (allow_shell = false)',
        };
    }
    // Check for dangerous patterns in bash commands
    if (toolCall.name === 'bash') {
        const cmd = String(toolCall.input.command || '');
        for (const pattern of DANGEROUS_PATTERNS) {
            if (pattern.test(cmd)) {
                return { decision: 'deny', reason: `Dangerous command blocked: ${cmd}` };
            }
        }
    }
    // Auto mode: allow read tools automatically, ask for write/shell tools
    if (mode === 'auto') {
        if (READ_TOOLS.has(toolCall.name)) {
            return { decision: 'allow', reason: 'Read-only tool — auto-approved' };
        }
        // Check for sensitive patterns that always need confirmation
        if (toolCall.name === 'bash') {
            const cmd = String(toolCall.input.command || '');
            for (const pattern of SENSITIVE_PATTERNS) {
                if (pattern.test(cmd)) {
                    return { decision: 'ask', reason: `Sensitive operation: ${cmd}` };
                }
            }
        }
        // In auto mode, allow non-sensitive write operations
        if (WRITE_TOOLS.has(toolCall.name)) {
            return { decision: 'ask', reason: `Write tool "${toolCall.name}" requires approval` };
        }
        return { decision: 'allow', reason: 'Auto mode — tool allowed' };
    }
    // Ask mode: everything needs approval
    return { decision: 'ask', reason: `Tool "${toolCall.name}" requires approval` };
}
export function allowAlways(toolCall) {
    const callKey = `${toolCall.name}:${JSON.stringify(toolCall.input)}`;
    alwaysAllowed.add(callKey);
}
export function allowToolAlways(toolName) {
    alwaysAllowed.add(`tool:${toolName}`);
}
export function resetPermissions() {
    alwaysAllowed.clear();
}
export function formatToolCallSummary(toolCall) {
    switch (toolCall.name) {
        case 'bash':
            return `Run command: ${String(toolCall.input.command || '').slice(0, 100)}`;
        case 'read':
            return `Read file: ${toolCall.input.file_path}`;
        case 'write':
            return `Write file: ${toolCall.input.file_path}`;
        case 'glob':
            return `Search files: ${toolCall.input.pattern}`;
        case 'grep':
            return `Search content: ${toolCall.input.pattern}`;
        default:
            return `Execute: ${toolCall.name}`;
    }
}
//# sourceMappingURL=permissions.js.map