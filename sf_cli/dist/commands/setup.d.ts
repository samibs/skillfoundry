import type { SlashCommand } from '../types.js';
export interface SetupOptions {
    provider?: string;
    key?: string;
    authToken?: string;
    remove?: boolean;
    list?: boolean;
}
export declare function runSetupNonInteractive(opts: SetupOptions): string;
/**
 * Interactive setup wizard. Called at startup when no credentials are detected.
 * Returns 'configured' | 'skipped' | 'quit'.
 */
export declare function runInteractiveSetup(): Promise<'configured' | 'skipped' | 'quit'>;
export declare const setupCommand: SlashCommand;
