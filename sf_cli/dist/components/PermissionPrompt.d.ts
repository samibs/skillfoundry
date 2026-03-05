import type { ToolCall } from '../types.js';
export type PermissionResponse = 'allow' | 'deny' | 'always-allow' | 'always-allow-tool';
interface PermissionPromptProps {
    toolCall: ToolCall;
    reason: string;
    onRespond: (response: PermissionResponse) => void;
}
export declare function PermissionPrompt({ toolCall, reason, onRespond }: PermissionPromptProps): import("react/jsx-runtime").JSX.Element;
export {};
