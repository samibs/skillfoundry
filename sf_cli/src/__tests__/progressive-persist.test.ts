import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  persistStoryDeliverable,
  saveForgeState,
  loadForgeState,
  getCompletionPercentage,
} from '../core/progressive-persist.js';
import type { ForgeState, StoryDeliverable } from '../core/progressive-persist.js';

const TEST_DIR = join(process.cwd(), '.test-persist-tmp');

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe('persistStoryDeliverable', () => {
  it('creates delivery manifest file', () => {
    const deliverable: StoryDeliverable = {
      storyFile: 'STORY-001-auth-models.md',
      status: 'completed',
      filesCreated: ['src/models/user.ts', 'src/models/session.ts'],
      filesModified: ['src/index.ts'],
      testFiles: ['src/__tests__/user.test.ts'],
      commitStub: 'feat: add user and session models',
      decisions: ['Used UUID for primary keys', 'Chose bcrypt over argon2'],
    };

    const path = persistStoryDeliverable(TEST_DIR, 'auth-service', deliverable);

    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('STORY-001-auth-models');
    expect(content).toContain('completed');
    expect(content).toContain('src/models/user.ts');
    expect(content).toContain('src/models/session.ts');
    expect(content).toContain('src/index.ts');
    expect(content).toContain('user.test.ts');
    expect(content).toContain('feat: add user and session models');
    expect(content).toContain('Used UUID for primary keys');
  });

  it('creates directory structure if missing', () => {
    const deliverable: StoryDeliverable = {
      storyFile: 'STORY-002.md',
      status: 'completed',
      filesCreated: ['a.ts'],
      filesModified: [],
      testFiles: [],
      commitStub: '',
      decisions: [],
    };

    const path = persistStoryDeliverable(TEST_DIR, 'new-prd', deliverable);
    expect(existsSync(join(TEST_DIR, 'delivery', 'new-prd'))).toBe(true);
    expect(existsSync(path)).toBe(true);
  });

  it('handles failed story status', () => {
    const deliverable: StoryDeliverable = {
      storyFile: 'STORY-003.md',
      status: 'failed',
      filesCreated: [],
      filesModified: [],
      testFiles: [],
      commitStub: '',
      decisions: [],
    };

    const path = persistStoryDeliverable(TEST_DIR, 'test-prd', deliverable);
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('**Status:** failed');
  });
});

describe('saveForgeState / loadForgeState', () => {
  it('round-trips forge state', () => {
    const state: ForgeState = {
      runId: 'test-run-001',
      prdId: 'auth-service',
      startedAt: '2026-03-15T10:00:00Z',
      updatedAt: '',
      phases: [{ name: 'IGNITE', status: 'completed', durationMs: 100 }],
      stories: {
        'STORY-001': { status: 'completed', deliverable: 'delivery/auth/STORY-001.md' },
        'STORY-002': { status: 'running' },
        'STORY-003': { status: 'pending' },
      },
      issueCount: 1,
    };

    saveForgeState(TEST_DIR, state);
    const loaded = loadForgeState(TEST_DIR);

    expect(loaded).not.toBeNull();
    expect(loaded!.runId).toBe('test-run-001');
    expect(loaded!.stories['STORY-001'].status).toBe('completed');
    expect(loaded!.stories['STORY-003'].status).toBe('pending');
    expect(loaded!.updatedAt).not.toBe('');
  });

  it('returns null when no state file exists', () => {
    const result = loadForgeState(TEST_DIR);
    expect(result).toBeNull();
  });

  it('creates .skillfoundry directory if missing', () => {
    const state: ForgeState = {
      runId: 'test-run-002',
      prdId: 'test',
      startedAt: new Date().toISOString(),
      updatedAt: '',
      phases: [],
      stories: {},
      issueCount: 0,
    };

    saveForgeState(TEST_DIR, state);
    expect(existsSync(join(TEST_DIR, '.skillfoundry'))).toBe(true);
  });
});

describe('getCompletionPercentage', () => {
  it('returns 0 for no stories', () => {
    const state: ForgeState = {
      runId: 'x', prdId: 'x', startedAt: '', updatedAt: '',
      phases: [], stories: {}, issueCount: 0,
    };
    expect(getCompletionPercentage(state)).toBe(0);
  });

  it('returns correct percentage', () => {
    const state: ForgeState = {
      runId: 'x', prdId: 'x', startedAt: '', updatedAt: '',
      phases: [],
      stories: {
        'S-1': { status: 'completed' },
        'S-2': { status: 'completed' },
        'S-3': { status: 'failed' },
        'S-4': { status: 'pending' },
      },
      issueCount: 0,
    };
    expect(getCompletionPercentage(state)).toBe(50);
  });

  it('returns 100 when all completed', () => {
    const state: ForgeState = {
      runId: 'x', prdId: 'x', startedAt: '', updatedAt: '',
      phases: [],
      stories: {
        'S-1': { status: 'completed' },
        'S-2': { status: 'completed' },
      },
      issueCount: 0,
    };
    expect(getCompletionPercentage(state)).toBe(100);
  });
});
