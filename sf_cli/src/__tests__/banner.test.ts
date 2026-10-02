import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getBannerStats } from '../core/banner.js';
import { AGENT_REGISTRY } from '../core/agent-registry.js';

describe('getBannerStats', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it('counts agents from the registry and skills from .claude/commands', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sf-banner-'));
    const commands = join(tempDir, '.claude', 'commands');
    mkdirSync(commands, { recursive: true });
    for (const name of ['forge', 'go', 'prd']) writeFileSync(join(commands, `${name}.md`), '# skill');
    writeFileSync(join(commands, 'notes.txt'), 'not a skill');

    expect(getBannerStats(tempDir)).toEqual([
      `${Object.keys(AGENT_REGISTRY).length} Agents`,
      '3 Skills',
      'The Forge',
      '6 Platforms',
    ]);
  });

  it('omits the skill count when the skills directory cannot be read', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'sf-banner-'));
    expect(getBannerStats(tempDir)).not.toContainEqual(expect.stringMatching(/Skills$/));
  });
});
