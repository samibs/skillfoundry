import type { ToolCall as ToolCallType, ToolResult } from '../types.js';
interface ToolCallProps {
    toolCall: ToolCallType;
    result?: ToolResult;
    isExecuting: boolean;
}
export declare function ToolCallDisplay({ toolCall, result, isExecuting }: ToolCallProps): import("react/jsx-runtime").JSX.Element;
export {};
