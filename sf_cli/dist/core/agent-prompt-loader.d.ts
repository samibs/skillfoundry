export interface ParsedFrontmatter {
    data: Record<string, string>;
    body: string;
}
/**
 * Parse YAML frontmatter from a markdown file's content.
 * Handles `---\nkey: value\n---\nbody` format.
 * Returns empty data + full content as body if no frontmatter found.
 */
export declare function parseFrontmatter(content: string): ParsedFrontmatter;
/**
 * Load the full markdown body from an agent's source file.
 * Returns null if the agent has no markdown file or the file can't be read.
 * Results are cached after first load.
 */
export declare function loadAgentPromptFromFile(agentName: string): string | null;
/**
 * Reset all caches — used in testing.
 */
export declare function _resetPromptLoaderCache(): void;
