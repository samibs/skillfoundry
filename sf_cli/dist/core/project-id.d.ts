/**
 * Project ID management — assigns persistent UUIDv4 identifiers to registered projects.
 * Stores IDs in {projectPath}/.skillfoundry/project.json.
 * Updates .project-registry-meta.jsonl with project_id field.
 */
interface ProjectEntry {
    path: string;
    id: string;
    name: string;
}
/**
 * Read or create a persistent UUIDv4 for a project.
 * Creates .skillfoundry/project.json if it doesn't exist.
 */
export declare function ensureProjectId(projectPath: string): string;
/**
 * Read project ID without creating one.
 */
export declare function getProjectId(projectPath: string): string | null;
/**
 * List all projects with their IDs from the registry meta file.
 */
export declare function listProjectIds(frameworkDir: string): ProjectEntry[];
/**
 * Backfill project_id into the registry meta JSONL for a given project path.
 * Updates the line in-place if found, otherwise does nothing.
 */
export declare function updateRegistryMeta(frameworkDir: string, projectPath: string, projectId: string): void;
export {};
