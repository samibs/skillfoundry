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
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { getLogger } from '../utils/logger.js';
const PLATFORMS = {
    claude: {
        name: 'Claude Code',
        dir: '.claude/commands',
        transform: (content, _name) => content, // Already markdown
        extension: '.md',
    },
    cursor: {
        name: 'Cursor',
        dir: '.cursor/rules',
        transform: (content, name) => {
            // Cursor uses .mdc format with frontmatter
            return `---\ndescription: ${name}\nglobs:\nalwaysApply: false\n---\n\n${content}`;
        },
        extension: '.mdc',
    },
    copilot: {
        name: 'GitHub Copilot',
        dir: '.copilot/custom-agents',
        transform: (content, name) => {
            return `---\nname: ${name}\ndescription: SkillFoundry skill\n---\n\n${content}`;
        },
        extension: '.md',
    },
    codex: {
        name: 'OpenAI Codex',
        dir: '.agents/skills',
        transform: (content, _name) => content,
        extension: '.md',
    },
    gemini: {
        name: 'Google Gemini',
        dir: '.gemini/skills',
        transform: (content, _name) => content,
        extension: '.md',
    },
};
/**
 * Discover all skill files in the agents/ directory.
 */
export function discoverSkills(workDir) {
    const agentsDir = join(resolve(workDir), 'agents');
    if (!existsSync(agentsDir))
        return [];
    const skills = [];
    try {
        const files = readdirSync(agentsDir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
        for (const file of files) {
            const filePath = join(agentsDir, file);
            const content = readFileSync(filePath, 'utf-8');
            const name = basename(file, '.md');
            skills.push({ name, path: filePath, content });
        }
    }
    catch {
        // Best effort
    }
    return skills;
}
/**
 * Publish skills to a specific platform.
 * Returns the count of files written.
 */
export function publishToPlatform(workDir, platform, skills, dryRun = false) {
    const log = getLogger();
    const targetDir = join(resolve(workDir), platform.dir);
    let published = 0;
    let skipped = 0;
    const errors = [];
    if (!dryRun && !existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
    }
    for (const skill of skills) {
        try {
            const transformed = platform.transform(skill.content, skill.name);
            const targetFile = join(targetDir, `${skill.name}${platform.extension}`);
            // Check if content changed
            if (existsSync(targetFile)) {
                const existing = readFileSync(targetFile, 'utf-8');
                if (existing === transformed) {
                    skipped++;
                    continue;
                }
            }
            if (!dryRun) {
                writeFileSync(targetFile, transformed, 'utf-8');
            }
            published++;
        }
        catch (err) {
            const msg = `${skill.name}: ${err instanceof Error ? err.message : String(err)}`;
            errors.push(msg);
            log.error('publish', 'skill_transform_failed', { skill: skill.name, platform: platform.name, error: msg });
        }
    }
    return { published, skipped, errors };
}
// ── Parse args ────────────────────────────────────────────────────────────────
function parsePublishArgs(args) {
    const parts = args.trim().split(/\s+/);
    const flags = parts.filter((p) => p.startsWith('--'));
    const positional = parts.filter((p) => !p.startsWith('--'));
    const dryRun = flags.includes('--dry-run');
    let platform = 'all';
    const platformFlag = flags.find((f) => f.startsWith('--platform'));
    if (platformFlag) {
        if (platformFlag.includes('=')) {
            platform = platformFlag.split('=')[1];
        }
        else {
            const idx = parts.indexOf('--platform');
            if (idx !== -1 && parts[idx + 1]) {
                platform = parts[idx + 1];
            }
        }
    }
    else if (positional.length > 0) {
        platform = positional[0];
    }
    return { platform, dryRun };
}
// ── Command ───────────────────────────────────────────────────────────────────
export const publishCommand = {
    name: 'publish',
    description: 'Publish skills to platform-specific directories',
    usage: '/publish --platform <cursor|copilot|codex|gemini|claude|all> [--dry-run]',
    execute: async (args, session) => {
        const { platform, dryRun } = parsePublishArgs(args);
        const skills = discoverSkills(session.workDir);
        if (skills.length === 0) {
            return '\n  No skills found in agents/ directory.\n';
        }
        const targetPlatforms = platform === 'all'
            ? Object.values(PLATFORMS)
            : PLATFORMS[platform]
                ? [PLATFORMS[platform]]
                : null;
        if (!targetPlatforms) {
            return `\n  Unknown platform: ${platform}\n  Available: ${Object.keys(PLATFORMS).join(', ')}, all\n`;
        }
        const lines = ['', `  ${dryRun ? '[DRY RUN] ' : ''}Publishing ${skills.length} skills`, ''];
        for (const target of targetPlatforms) {
            const result = publishToPlatform(session.workDir, target, skills, dryRun);
            const status = result.errors.length > 0 ? '\x1b[33m⚠\x1b[0m' : '\x1b[32m✓\x1b[0m';
            lines.push(`  ${status} ${target.name}: ${result.published} published, ${result.skipped} unchanged`);
            for (const err of result.errors) {
                lines.push(`    \x1b[31m✗\x1b[0m ${err}`);
            }
        }
        lines.push('');
        return lines.join('\n');
    },
};
//# sourceMappingURL=publish.js.map