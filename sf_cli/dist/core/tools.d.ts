export interface ToolDefinition {
    name: string;
    description: string;
    input_schema: {
        type: 'object';
        properties: Record<string, unknown>;
        required: string[];
    };
}
export declare const TOOL_BASH: ToolDefinition;
export declare const TOOL_READ: ToolDefinition;
export declare const TOOL_WRITE: ToolDefinition;
export declare const TOOL_GLOB: ToolDefinition;
export declare const TOOL_GREP: ToolDefinition;
export { ALL_DEBUG_TOOLS, DEBUG_TOOL_NAMES } from './debugger-tools.js';
export declare const ALL_TOOLS: ToolDefinition[];
export declare const TOOL_MAP: Record<string, ToolDefinition>;
export declare const SHELL_TOOLS: Set<string>;
export declare const WRITE_TOOLS: Set<string>;
export declare const READ_TOOLS: Set<string>;
