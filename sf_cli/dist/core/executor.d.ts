import type { ToolResult } from '../types.js';
import type { SfPolicy } from '../types.js';
interface ExecutorContext {
    workDir: string;
    policy: SfPolicy;
}
export declare function executeTool(toolName: string, input: Record<string, unknown>, ctx: ExecutorContext): ToolResult;
export {};
