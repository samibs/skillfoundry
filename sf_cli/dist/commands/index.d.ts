import type { SlashCommand } from '../types.js';
export declare function registerCommand(cmd: SlashCommand): void;
export declare function getCommand(name: string): SlashCommand | undefined;
export declare function getAllCommands(): SlashCommand[];
export declare function parseSlashCommand(input: string): {
    name: string;
    args: string;
} | null;
export declare function initCommands(): void;
