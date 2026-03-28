/**
 * iznir.hexalab.dev client — dynamic skill generation.
 *
 * iznir can create project-specific skills on the fly.
 * This client fetches generated skills and registers them as MCP tools
 * without requiring a server restart.
 */

import type { SkillDefinition } from "./loader.js";

export interface IznirSkillRequest {
  /** What the skill should do */
  description: string;
  /** Project context (tech stack, framework, etc.) */
  context?: string;
  /** Skill name (auto-generated if not provided) */
  name?: string;
}

export interface IznirSkillResponse {
  name: string;
  description: string;
  content: string;
  metadata: Record<string, unknown>;
}

const DEFAULT_IZNIR_URL =
  process.env.IZNIR_API_URL || "https://iznir.hexalab.dev/api";

/**
 * Request a dynamically generated skill from iznir.
 */
export async function requestSkill(
  request: IznirSkillRequest,
  iznirUrl?: string
): Promise<IznirSkillResponse | null> {
  const baseUrl = iznirUrl || DEFAULT_IZNIR_URL;

  try {
    const res = await fetch(`${baseUrl}/v1/skills/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: request.description,
        context: request.context,
        name: request.name,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.error(`[iznir] Error: ${res.status} ${res.statusText}`);
      return null;
    }

    return (await res.json()) as IznirSkillResponse;
  } catch (err) {
    console.error(`[iznir] Connection failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Convert an iznir response into a SkillDefinition that can be registered.
 */
export function iznirResponseToSkill(
  response: IznirSkillResponse
): SkillDefinition {
  return {
    name: response.name,
    description: response.description,
    filePath: `iznir://${response.name}`,
    content: response.content,
    metadata: { ...response.metadata, source: "iznir", dynamic: true },
  };
}

/**
 * Register a dynamically generated skill into the live skills map.
 * Returns true if registered, false if name already exists.
 */
export function registerDynamicSkill(
  skills: Map<string, SkillDefinition>,
  skill: SkillDefinition
): boolean {
  if (skills.has(skill.name)) {
    console.warn(`[iznir] Skill '${skill.name}' already exists, skipping`);
    return false;
  }

  skills.set(skill.name, skill);
  console.log(`[iznir] Registered dynamic skill: ${skill.name}`);
  return true;
}

/**
 * Check if iznir service is reachable.
 */
export async function isIznirAvailable(
  iznirUrl?: string
): Promise<boolean> {
  const baseUrl = iznirUrl || DEFAULT_IZNIR_URL;
  try {
    const res = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
