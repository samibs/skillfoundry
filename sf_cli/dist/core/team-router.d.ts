export interface RoutingKeyword {
    pattern: RegExp;
    weight: number;
}
export interface RoutingResult {
    agent: string;
    displayName: string;
    score: number;
    confidence: 'high' | 'medium' | 'low' | 'fallback';
}
export declare const AGENT_ROUTING_KEYWORDS: Record<string, RoutingKeyword[]>;
export declare function routeToAgent(message: string, teamMembers: string[], defaultAgent: string): RoutingResult;
