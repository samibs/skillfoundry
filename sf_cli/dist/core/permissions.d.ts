import type { SfPolicy, PermissionMode, ToolCall } from '../types.js';
export type PermissionDecision = 'allow' | 'deny' | 'ask';
interface PermissionResult {
    decision: PermissionDecision;
    reason: string;
}
export declare function checkPermission(toolCall: ToolCall, policy: SfPolicy, mode: PermissionMode): PermissionResult;
export declare function allowAlways(toolCall: ToolCall): void;
export declare function allowToolAlways(toolName: string): void;
export declare function resetPermissions(): void;
export declare function formatToolCallSummary(toolCall: ToolCall): string;
export {};
