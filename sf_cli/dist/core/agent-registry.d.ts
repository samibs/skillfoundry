import type { ToolDefinition } from './tools.js';
export type ToolCategory = 'FULL' | 'CODE' | 'REVIEW' | 'OPS' | 'INSPECT' | 'DEBUG' | 'NONE';
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
export type AgentArchetype = 'implementer' | 'reviewer' | 'operator' | 'advisor';
/**
 * Maps each registered agent to its archetype for the real Agent class system.
 * - implementer: writes code, runs tools, produces artifacts
 * - reviewer: reads code, produces findings (never writes)
 * - operator: runs diagnostics, produces reports
 * - advisor: answers questions (no tool access)
 */
export declare const AGENT_ARCHETYPE_MAP: Record<string, AgentArchetype>;
/**
 * Get the archetype for a given agent name.
 * Returns 'implementer' as default for unknown agents.
 */
export declare function getAgentArchetype(name: string): AgentArchetype;
import { type Agent } from './agent.js';
/**
 * Create a real Agent class instance from the registry.
 * This is the bridge between the old flat registry and the new Agent system.
 */
export declare function createAgentInstance(name: string): Agent;
