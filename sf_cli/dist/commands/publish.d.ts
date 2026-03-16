/**
 * STORY-008: sf publish — Skill Registry & Platform Distribution
 *
 * Transforms canonical skill files from agents/ and distributes them to
 * platform-specific directories (.claude/commands/, .cursor/rules/, etc.)
 *
 * Usage:
 *   sf publish --platform cursor       Publish to Cursor
 *   sf publish --platform all          Publish to all platforms
 *   sf publish --dry-run               Show what would be published
 */
import type { SlashCommand } from '../types.js';
export interface PlatformTarget {
    name: string;
    dir: string;
    transform: (content: string, skillName: string) => string;
    extension: string;
}
export interface SkillFile {
    name: string;
    path: string;
    content: string;
}
/**
 * Discover all skill files in the agents/ directory.
 */
export declare function discoverSkills(workDir: string): SkillFile[];
/**
 * Publish skills to a specific platform.
 * Returns the count of files written.
 */
export declare function publishToPlatform(workDir: string, platform: PlatformTarget, skills: SkillFile[], dryRun?: boolean): {
    published: number;
    skipped: number;
    errors: string[];
};
export declare const publishCommand: SlashCommand;
