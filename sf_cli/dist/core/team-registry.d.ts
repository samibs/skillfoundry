export interface TeamDefinition {
    name: string;
    displayName: string;
    description: string;
    members: string[];
    defaultAgent: string;
}
export declare const TEAM_PRESETS: Record<string, TeamDefinition>;
export declare function getTeamPreset(name: string): TeamDefinition | undefined;
export declare function getAllTeamPresetNames(): string[];
export declare function createCustomTeam(agentNames: string[]): {
    team?: TeamDefinition;
    error?: string;
};
