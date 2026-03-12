// Tool definitions for the Anthropic tool_use API.
// Each tool maps to a capability the AI can invoke during conversation.
export const TOOL_BASH = {
    name: 'bash',
    description: 'Execute a shell command and return stdout/stderr. Use for git operations, build commands, package management, and other terminal tasks. Commands run in the project working directory.',
    input_schema: {
        type: 'object',
        properties: {
            command: {
                type: 'string',
                description: 'The shell command to execute',
            },
            timeout: {
                type: 'number',
                description: 'Timeout in milliseconds (default 120000, max 600000)',
            },
        },
        required: ['command'],
    },
};
export const TOOL_READ = {
    name: 'read',
    description: 'Read a file from the filesystem. Returns file contents with line numbers. Supports text files, and will indicate binary files. Use absolute or project-relative paths.',
    input_schema: {
        type: 'object',
        properties: {
            file_path: {
                type: 'string',
                description: 'Path to the file to read (absolute or relative to project root)',
            },
            offset: {
                type: 'number',
                description: 'Line number to start reading from (1-indexed)',
            },
            limit: {
                type: 'number',
                description: 'Maximum number of lines to read',
            },
        },
        required: ['file_path'],
    },
};
export const TOOL_WRITE = {
    name: 'write',
    description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does. Creates parent directories as needed.',
    input_schema: {
        type: 'object',
        properties: {
            file_path: {
                type: 'string',
                description: 'Path to the file to write (absolute or relative to project root)',
            },
            content: {
                type: 'string',
                description: 'The content to write to the file',
            },
        },
        required: ['file_path', 'content'],
    },
};
export const TOOL_GLOB = {
    name: 'glob',
    description: 'Search for files matching a glob pattern. Returns matching file paths. Use patterns like "**/*.ts", "src/**/*.tsx", "*.json".',
    input_schema: {
        type: 'object',
        properties: {
            pattern: {
                type: 'string',
                description: 'Glob pattern to match files (e.g. "**/*.ts")',
            },
            path: {
                type: 'string',
                description: 'Directory to search in (defaults to project root)',
            },
        },
        required: ['pattern'],
    },
};
export const TOOL_GREP = {
    name: 'grep',
    description: 'Search file contents for a regex pattern. Returns matching lines with file paths and line numbers. Supports full regex syntax.',
    input_schema: {
        type: 'object',
        properties: {
            pattern: {
                type: 'string',
                description: 'Regular expression pattern to search for',
            },
            path: {
                type: 'string',
                description: 'File or directory to search in (defaults to project root)',
            },
            glob: {
                type: 'string',
                description: 'Glob pattern to filter files (e.g. "*.ts", "*.{js,jsx}")',
            },
            context: {
                type: 'number',
                description: 'Number of context lines before and after each match',
            },
        },
        required: ['pattern'],
    },
};
// Re-export debug tools for unified access
export { ALL_DEBUG_TOOLS, DEBUG_TOOL_NAMES } from './debugger-tools.js';
export const ALL_TOOLS = [
    TOOL_BASH,
    TOOL_READ,
    TOOL_WRITE,
    TOOL_GLOB,
    TOOL_GREP,
];
// Map from tool name to its definition for quick lookup
export const TOOL_MAP = Object.fromEntries(ALL_TOOLS.map((t) => [t.name, t]));
// Tools that require shell access (checked against policy.allow_shell)
export const SHELL_TOOLS = new Set(['bash']);
// Tools that modify the filesystem (require extra caution)
export const WRITE_TOOLS = new Set(['write', 'bash']);
// Read-only tools (generally safe)
export const READ_TOOLS = new Set(['read', 'glob', 'grep']);
//# sourceMappingURL=tools.js.map