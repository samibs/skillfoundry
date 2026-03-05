import type { ToolDefinition } from './tools.js';
export type ToolCategory = 'FULL' | 'CODE' | 'REVIEW' | 'OPS' | 'INSPECT' | 'NONE';
export declare const TOOL_SETS: Record<ToolCategory, ToolDefinition[]>;
export interface AgentDefinition {
    name: string;
    displayName: string;
    toolCategory: ToolCategory;
    systemPrompt: string;
}
export declare const AGENT_REGISTRY: Record<string, AgentDefinition>;
export declare function getAgent(name: string): AgentDefinition | undefined;
export declare function getAgentTools(name: string): ToolDefinition[];
export declare function getAgentSystemPrompt(name: string): string;
export declare function getAllAgentNames(): string[];
export declare function getAgentsByCategory(category: ToolCategory): string[];
