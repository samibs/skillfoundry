import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverSkills, publishToPlatform, publishCommand } from '../commands/publish.js';
import type { PlatformTarget, SkillFile } from '../commands/publish.js';
import type { SessionContext, SfConfig, SfPolicy, SfState } from '../types.js';

// Suppress logger file I/O during tests
vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function createAgentsDir(dir: string, files: Record<string, string>): void {
  const agentsDir = join(dir, 'agents');
  mkdirSync(agentsDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(agentsDir, name), content);
  }
}

function makeSession(workDir: string): SessionContext {
  return {
    workDir,
    config: {} as SfConfig,
    policy: {} as SfPolicy,
    state: {} as SfState,
    messages: [],
    permissionMode: 'auto',
    activeAgent: null,
    activeTeam: null,
    addMessage: vi.fn(),
    setState: vi.fn(),
    setActiveAgent: vi.fn(),
    setActiveTeam: vi.fn(),
  };
}

describe('Publish Command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sf-publish-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ── discoverSkills ─────────────────────────────────────────────────────────

  it('discoverSkills returns empty array when agents dir does not exist', () => {
    const skills = discoverSkills(tempDir);
    expect(skills).toEqual([]);
  });

  it('discoverSkills finds markdown files and excludes _ prefix files', () => {
    createAgentsDir(tempDir, {
      'security.md': '# Security Agent',
      'tester.md': '# Tester Agent',
      '_autonomous-protocol.md': '# Internal Protocol',
      '_intent-classifier.md': '# Internal Classifier',
      'readme.txt': 'Not a markdown file',
    });

    const skills = discoverSkills(tempDir);
    const names = skills.map((s) => s.name);
    expect(names).toContain('security');
    expect(names).toContain('tester');
    expect(names).not.toContain('_autonomous-protocol');
    expect(names).not.toContain('_intent-classifier');
    expect(names).not.toContain('readme');
    expect(skills).toHaveLength(2);
  });

  it('discoverSkills returns correct content for each skill', () => {
    createAgentsDir(tempDir, {
      'forge.md': '# Forge Agent\nBuild pipeline automation.',
    });

    const skills = discoverSkills(tempDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('forge');
    expect(skills[0].content).toBe('# Forge Agent\nBuild pipeline automation.');
    expect(skills[0].path).toBe(join(tempDir, 'agents', 'forge.md'));
  });

  // ── publishToPlatform ──────────────────────────────────────────────────────

  it('publishToPlatform writes transformed files to target dir', () => {
    const skills: SkillFile[] = [
      { name: 'security', path: '/fake/security.md', content: '# Security' },
    ];
    const platform: PlatformTarget = {
      name: 'Test Platform',
      dir: '.test/skills',
      transform: (content, name) => `--- ${name} ---\n${content}`,
      extension: '.txt',
    };

    const result = publishToPlatform(tempDir, platform, skills, false);
    expect(result.published).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    const outputPath = join(tempDir, '.test', 'skills', 'security.txt');
    expect(existsSync(outputPath)).toBe(true);
    const content = readFileSync(outputPath, 'utf-8');
    expect(content).toBe('--- security ---\n# Security');
  });

  it('publishToPlatform skips unchanged files', () => {
    const skills: SkillFile[] = [
      { name: 'forge', path: '/fake/forge.md', content: '# Forge' },
    ];
    const platform: PlatformTarget = {
      name: 'Claude Code',
      dir: '.claude/commands',
      transform: (content) => content,
      extension: '.md',
    };

    // First publish
    publishToPlatform(tempDir, platform, skills, false);

    // Second publish with same content
    const result = publishToPlatform(tempDir, platform, skills, false);
    expect(result.published).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('publishToPlatform creates target directory if missing', () => {
    const skills: SkillFile[] = [
      { name: 'test', path: '/fake/test.md', content: 'content' },
    ];
    const platform: PlatformTarget = {
      name: 'Deep Nested',
      dir: '.deep/nested/target',
      transform: (content) => content,
      extension: '.md',
    };

    const targetDir = join(tempDir, '.deep', 'nested', 'target');
    expect(existsSync(targetDir)).toBe(false);

    publishToPlatform(tempDir, platform, skills, false);
    expect(existsSync(targetDir)).toBe(true);
  });

  it('publishToPlatform dry-run does not write files', () => {
    const skills: SkillFile[] = [
      { name: 'security', path: '/fake/security.md', content: '# Security' },
    ];
    const platform: PlatformTarget = {
      name: 'Dry Platform',
      dir: '.dry/skills',
      transform: (content) => content,
      extension: '.md',
    };

    const result = publishToPlatform(tempDir, platform, skills, true);
    expect(result.published).toBe(1);

    const targetDir = join(tempDir, '.dry', 'skills');
    expect(existsSync(targetDir)).toBe(false);
  });

  it('cursor transform adds .mdc frontmatter', () => {
    const skills: SkillFile[] = [
      { name: 'security', path: '/fake/security.md', content: '# Security Agent' },
    ];
    const cursorPlatform: PlatformTarget = {
      name: 'Cursor',
      dir: '.cursor/rules',
      transform: (content, name) => {
        return `---\ndescription: ${name}\nglobs:\nalwaysApply: false\n---\n\n${content}`;
      },
      extension: '.mdc',
    };

    publishToPlatform(tempDir, cursorPlatform, skills, false);

    const outputPath = join(tempDir, '.cursor', 'rules', 'security.mdc');
    const content = readFileSync(outputPath, 'utf-8');
    expect(content).toContain('---\ndescription: security');
    expect(content).toContain('alwaysApply: false');
    expect(content).toContain('# Security Agent');
  });

  it('claude transform keeps markdown content as-is', () => {
    const skills: SkillFile[] = [
      { name: 'forge', path: '/fake/forge.md', content: '# Forge\nPipeline skill.' },
    ];
    const claudePlatform: PlatformTarget = {
      name: 'Claude Code',
      dir: '.claude/commands',
      transform: (content, _name) => content,
      extension: '.md',
    };

    publishToPlatform(tempDir, claudePlatform, skills, false);

    const outputPath = join(tempDir, '.claude', 'commands', 'forge.md');
    const content = readFileSync(outputPath, 'utf-8');
    expect(content).toBe('# Forge\nPipeline skill.');
  });

  // ── publishCommand.execute ──────────────────────────────────────────────────

  it('command returns no-skills message when agents dir is empty', async () => {
    const session = makeSession(tempDir);
    const output = await publishCommand.execute('--platform cursor', session);
    expect(output).toContain('No skills found');
  });

  it('command --platform cursor publishes to cursor directory', async () => {
    createAgentsDir(tempDir, { 'security.md': '# Security Agent' });
    const session = makeSession(tempDir);

    const output = await publishCommand.execute('--platform cursor', session);
    expect(output).toContain('Cursor');
    expect(output).toContain('published');

    const cursorFile = join(tempDir, '.cursor', 'rules', 'security.mdc');
    expect(existsSync(cursorFile)).toBe(true);
  });

  it('command --platform all publishes to all platforms', async () => {
    createAgentsDir(tempDir, { 'forge.md': '# Forge Agent' });
    const session = makeSession(tempDir);

    const output = await publishCommand.execute('--platform all', session);
    expect(output).toContain('Claude Code');
    expect(output).toContain('Cursor');
    expect(output).toContain('GitHub Copilot');
    expect(output).toContain('OpenAI Codex');
    expect(output).toContain('Google Gemini');
  });

  it('command --dry-run shows preview without writing', async () => {
    createAgentsDir(tempDir, { 'tester.md': '# Tester Agent' });
    const session = makeSession(tempDir);

    const output = await publishCommand.execute('--platform cursor --dry-run', session);
    expect(output).toContain('DRY RUN');
    expect(output).toContain('1 skills');

    // Cursor dir should not exist since it was a dry run
    const cursorDir = join(tempDir, '.cursor', 'rules');
    expect(existsSync(cursorDir)).toBe(false);
  });

  it('command with unknown platform shows error', async () => {
    createAgentsDir(tempDir, { 'forge.md': '# Forge' });
    const session = makeSession(tempDir);

    const output = await publishCommand.execute('--platform nonexistent', session);
    expect(output).toContain('Unknown platform: nonexistent');
    expect(output).toContain('Available:');
  });
});
