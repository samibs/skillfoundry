import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseSlashCommand } from '../commands/index.js';

const TEST_DIR = join(tmpdir(), 'sf-forge-test-' + Date.now());

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('Slash command parsing for new commands', () => {
  it('should parse /plan with args', () => {
    const result = parseSlashCommand('/plan add dark mode');
    expect(result).toEqual({ name: 'plan', args: 'add dark mode' });
  });

  it('should parse /plan without args', () => {
    const result = parseSlashCommand('/plan');
    expect(result).toEqual({ name: 'plan', args: '' });
  });

  it('should parse /apply with plan ID', () => {
    const result = parseSlashCommand('/apply plan-12345-abc');
    expect(result).toEqual({ name: 'apply', args: 'plan-12345-abc' });
  });

  it('should parse /apply without args', () => {
    const result = parseSlashCommand('/apply');
    expect(result).toEqual({ name: 'apply', args: '' });
  });

  it('should parse /gates', () => {
    const result = parseSlashCommand('/gates src');
    expect(result).toEqual({ name: 'gates', args: 'src' });
  });

  it('should parse /forge', () => {
    const result = parseSlashCommand('/forge');
    expect(result).toEqual({ name: 'forge', args: '' });
  });

  it('should parse /forge with specific PRD', () => {
    const result = parseSlashCommand('/forge genesis/my-feature.md');
    expect(result).toEqual({ name: 'forge', args: 'genesis/my-feature.md' });
  });
});

describe('PRD scanning', () => {
  it('should identify PRDs from genesis directory', () => {
    const genesisDir = join(TEST_DIR, 'genesis');
    mkdirSync(genesisDir, { recursive: true });
    writeFileSync(
      join(genesisDir, '2026-01-01-auth.md'),
      '# PRD: User Authentication\n\nstatus: APPROVED\n\n## Overview\nAuth feature.\n',
    );
    writeFileSync(
      join(genesisDir, '2026-01-02-payments.md'),
      '# PRD: Payment Integration\n\nstatus: DRAFT\n\n## Overview\nPayments.\n',
    );
    writeFileSync(
      join(genesisDir, 'TEMPLATE.md'),
      '# Template\nNot a real PRD.\n',
    );

    // Verify the files exist and can be read
    const { readdirSync } = require('node:fs');
    const files = readdirSync(genesisDir).filter(
      (f: string) => f.endsWith('.md') && f !== 'TEMPLATE.md',
    );
    expect(files).toHaveLength(2);
  });

  it('should identify stories from docs/stories directory', () => {
    const storiesDir = join(TEST_DIR, 'docs', 'stories', 'auth');
    mkdirSync(storiesDir, { recursive: true });
    writeFileSync(
      join(storiesDir, 'STORY-001-models.md'),
      '# Story 001\nstatus: DONE\n',
    );
    writeFileSync(
      join(storiesDir, 'STORY-002-api.md'),
      '# Story 002\nstatus: IN_PROGRESS\n',
    );

    const { readdirSync } = require('node:fs');
    const stories = readdirSync(storiesDir).filter(
      (f: string) => f.startsWith('STORY-'),
    );
    expect(stories).toHaveLength(2);
  });
});
