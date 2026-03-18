import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureProjectId, getProjectId, listProjectIds, updateRegistryMeta } from '../core/project-id.js';

vi.mock('../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
  }),
}));

const TEST_DIR = join(process.cwd(), '.test-project-id-' + process.pid);
const PROJECT_A = join(TEST_DIR, 'project-a');
const PROJECT_B = join(TEST_DIR, 'project-b');

beforeEach(() => {
  mkdirSync(join(PROJECT_A, '.skillfoundry'), { recursive: true });
  mkdirSync(join(PROJECT_B, '.skillfoundry'), { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('ensureProjectId', () => {
  it('generates a new UUID for a project without an ID', () => {
    const id = ensureProjectId(PROJECT_A);
    expect(id).toBeTruthy();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('creates .skillfoundry/project.json', () => {
    ensureProjectId(PROJECT_A);
    const filePath = join(PROJECT_A, '.skillfoundry', 'project.json');
    expect(existsSync(filePath)).toBe(true);

    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(data.project_id).toBeTruthy();
    expect(data.created_at).toBeTruthy();
  });

  it('returns the same ID on subsequent calls', () => {
    const id1 = ensureProjectId(PROJECT_A);
    const id2 = ensureProjectId(PROJECT_A);
    expect(id1).toBe(id2);
  });

  it('generates different IDs for different projects', () => {
    const id1 = ensureProjectId(PROJECT_A);
    const id2 = ensureProjectId(PROJECT_B);
    expect(id1).not.toBe(id2);
  });

  it('creates .skillfoundry directory if missing', () => {
    const newProject = join(TEST_DIR, 'fresh-project');
    mkdirSync(newProject, { recursive: true });
    const id = ensureProjectId(newProject);
    expect(id).toBeTruthy();
    expect(existsSync(join(newProject, '.skillfoundry', 'project.json'))).toBe(true);
  });
});

describe('getProjectId', () => {
  it('returns null when no project.json exists', () => {
    const id = getProjectId(join(TEST_DIR, 'nonexistent'));
    expect(id).toBeNull();
  });

  it('returns the existing project ID', () => {
    const created = ensureProjectId(PROJECT_A);
    const read = getProjectId(PROJECT_A);
    expect(read).toBe(created);
  });

  it('returns null for corrupt project.json', () => {
    writeFileSync(join(PROJECT_A, '.skillfoundry', 'project.json'), 'not json');
    const id = getProjectId(PROJECT_A);
    expect(id).toBeNull();
  });
});

describe('listProjectIds', () => {
  it('returns empty array when meta file does not exist', () => {
    const entries = listProjectIds(TEST_DIR);
    expect(entries).toEqual([]);
  });

  it('reads project IDs from registry meta', () => {
    const meta = [
      JSON.stringify({ path: '/home/test/proj1', project_id: 'id-1', platform: 'claude' }),
      JSON.stringify({ path: '/home/test/proj2', project_id: 'id-2', platform: 'claude' }),
    ].join('\n');
    writeFileSync(join(TEST_DIR, '.project-registry-meta.jsonl'), meta);

    const entries = listProjectIds(TEST_DIR);
    expect(entries.length).toBe(2);
    expect(entries[0].id).toBe('id-1');
    expect(entries[0].name).toBe('proj1');
    expect(entries[1].id).toBe('id-2');
  });

  it('skips entries without project_id', () => {
    const meta = [
      JSON.stringify({ path: '/home/test/proj1', platform: 'claude' }),
      JSON.stringify({ path: '/home/test/proj2', project_id: 'id-2' }),
    ].join('\n');
    writeFileSync(join(TEST_DIR, '.project-registry-meta.jsonl'), meta);

    const entries = listProjectIds(TEST_DIR);
    expect(entries.length).toBe(1);
  });
});

describe('updateRegistryMeta', () => {
  it('adds project_id to matching entry', () => {
    const metaFile = join(TEST_DIR, '.project-registry-meta.jsonl');
    writeFileSync(metaFile, JSON.stringify({ path: PROJECT_A, platform: 'claude' }) + '\n');

    updateRegistryMeta(TEST_DIR, PROJECT_A, 'new-uuid-123');

    const content = readFileSync(metaFile, 'utf-8').trim();
    const updated = JSON.parse(content);
    expect(updated.project_id).toBe('new-uuid-123');
  });

  it('does not modify entries that already have a project_id', () => {
    const metaFile = join(TEST_DIR, '.project-registry-meta.jsonl');
    writeFileSync(metaFile, JSON.stringify({ path: PROJECT_A, platform: 'claude', project_id: 'existing-id' }) + '\n');

    updateRegistryMeta(TEST_DIR, PROJECT_A, 'different-id');

    const content = readFileSync(metaFile, 'utf-8').trim();
    const data = JSON.parse(content);
    expect(data.project_id).toBe('existing-id');
  });

  it('does nothing when meta file does not exist', () => {
    // Should not throw
    updateRegistryMeta(TEST_DIR, PROJECT_A, 'some-id');
  });
});
