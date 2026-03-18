/**
 * Project ID management — assigns persistent UUIDv4 identifiers to registered projects.
 * Stores IDs in {projectPath}/.skillfoundry/project.json.
 * Updates .project-registry-meta.jsonl with project_id field.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../utils/logger.js';

const SF_DIR = '.skillfoundry';
const PROJECT_JSON = 'project.json';

interface ProjectJson {
  project_id: string;
  created_at: string;
}

interface ProjectEntry {
  path: string;
  id: string;
  name: string;
}

interface RegistryMeta {
  path: string;
  platform?: string;
  framework_version?: string;
  project_id?: string;
  [key: string]: unknown;
}

/**
 * Read or create a persistent UUIDv4 for a project.
 * Creates .skillfoundry/project.json if it doesn't exist.
 */
export function ensureProjectId(projectPath: string): string {
  const log = getLogger();
  const absPath = resolve(projectPath);
  const sfDir = join(absPath, SF_DIR);
  const projectFile = join(sfDir, PROJECT_JSON);

  // Read existing ID
  if (existsSync(projectFile)) {
    try {
      const content = readFileSync(projectFile, 'utf-8');
      const data: ProjectJson = JSON.parse(content);
      if (data.project_id) {
        return data.project_id;
      }
    } catch {
      log.warn('project-id', 'corrupt_project_json', { path: projectFile });
    }
  }

  // Generate new ID
  const projectId = randomUUID();
  const data: ProjectJson = {
    project_id: projectId,
    created_at: new Date().toISOString(),
  };

  try {
    if (!existsSync(sfDir)) {
      mkdirSync(sfDir, { recursive: true });
    }
    writeFileSync(projectFile, JSON.stringify(data, null, 2) + '\n');
    log.info('project-id', 'assigned', { path: absPath, id: projectId });
  } catch (err) {
    log.warn('project-id', 'write_failed', { path: projectFile, error: String(err) });
  }

  return projectId;
}

/**
 * Read project ID without creating one.
 */
export function getProjectId(projectPath: string): string | null {
  const absPath = resolve(projectPath);
  const projectFile = join(absPath, SF_DIR, PROJECT_JSON);

  if (!existsSync(projectFile)) return null;

  try {
    const content = readFileSync(projectFile, 'utf-8');
    const data: ProjectJson = JSON.parse(content);
    return data.project_id || null;
  } catch {
    return null;
  }
}

/**
 * List all projects with their IDs from the registry meta file.
 */
export function listProjectIds(frameworkDir: string): ProjectEntry[] {
  const metaFile = join(resolve(frameworkDir), '.project-registry-meta.jsonl');
  if (!existsSync(metaFile)) return [];

  const content = readFileSync(metaFile, 'utf-8').trim();
  if (!content) return [];

  const entries: ProjectEntry[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const meta: RegistryMeta = JSON.parse(line);
      if (meta.path && meta.project_id) {
        entries.push({
          path: meta.path,
          id: meta.project_id,
          name: basename(meta.path),
        });
      }
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

/**
 * Backfill project_id into the registry meta JSONL for a given project path.
 * Updates the line in-place if found, otherwise does nothing.
 */
export function updateRegistryMeta(frameworkDir: string, projectPath: string, projectId: string): void {
  const log = getLogger();
  const metaFile = join(resolve(frameworkDir), '.project-registry-meta.jsonl');
  if (!existsSync(metaFile)) return;

  try {
    const content = readFileSync(metaFile, 'utf-8');
    const lines = content.split('\n');
    let updated = false;

    const updatedLines = lines.map((line) => {
      if (!line.trim()) return line;
      try {
        const meta: RegistryMeta = JSON.parse(line);
        if (meta.path === projectPath && !meta.project_id) {
          meta.project_id = projectId;
          meta.updated_at = new Date().toISOString();
          updated = true;
          return JSON.stringify(meta);
        }
      } catch {
        // Keep malformed lines as-is
      }
      return line;
    });

    if (updated) {
      writeFileSync(metaFile, updatedLines.join('\n'));
      log.info('project-id', 'registry_meta_updated', { path: projectPath, id: projectId });
    }
  } catch (err) {
    log.warn('project-id', 'registry_meta_update_failed', { error: String(err) });
  }
}
