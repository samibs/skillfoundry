import { glob } from "glob";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import matter from "gray-matter";

export type SkillModelTier = "haiku" | "sonnet" | "opus";

export interface SkillDefinition {
  name: string;
  description: string;
  filePath: string;
  content: string;
  metadata: Record<string, unknown>;
  minModel: SkillModelTier | null;
}

/**
 * Extract skill name from filename or content.
 * .claude/commands/forge.md → "forge"
 * agents/ruthless-tester.md → "tester" (strip common prefixes)
 */
function extractSkillName(filePath: string, content: string): string {
  const basename = path.basename(filePath, ".md");

  // Try to extract from first H1 heading
  const h1Match = content.match(/^#\s+(.+)/m);
  if (h1Match) {
    // Convert "PRD Architect - Product Requirements Document Generator" → "prd"
    // Convert "/forge - Summon The Forge" → "forge"
    const heading = h1Match[1].trim();
    const slashMatch = heading.match(/^\/(\w+)/);
    if (slashMatch) return slashMatch[1];
  }

  // Strip common prefixes from filename
  return basename
    .replace(/^ruthless-/, "")
    .replace(/^cold-blooded-/, "")
    .replace(/^SKILL$/i, path.basename(path.dirname(filePath)))
    .toLowerCase();
}

/**
 * Extract first meaningful paragraph as description.
 */
function extractDescription(content: string): string {
  // Skip frontmatter, headings, and empty lines — find first paragraph
  const lines = content.split("\n");
  let inFrontmatter = false;
  for (const line of lines) {
    if (line.trim() === "---") {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;
    if (line.startsWith("#")) continue;
    if (line.trim() === "") continue;
    if (line.startsWith("```")) continue;
    if (line.startsWith("|")) continue;
    if (line.startsWith(">")) {
      return line.replace(/^>\s*/, "").trim().slice(0, 200);
    }
    // First non-empty, non-heading line
    return line.trim().slice(0, 200);
  }
  return "SkillFoundry skill";
}

/**
 * Load all .md skill files from specified directories.
 */
export async function loadSkills(
  dirs: string[]
): Promise<Map<string, SkillDefinition>> {
  const skills = new Map<string, SkillDefinition>();
  const seen = new Set<string>();

  for (const dir of dirs) {
    const resolvedDir = path.resolve(dir);
    const pattern = path.join(resolvedDir, "**/*.md");
    const files = await glob(pattern, { nodir: true });

    for (const filePath of files) {
      const basename = path.basename(filePath);

      // Skip non-skill files
      if (
        basename === "TEMPLATE.md" ||
        basename === "README.md" ||
        basename === "CHANGELOG.md" ||
        basename === "INDEX.md" ||
        basename === "MEMORY.md" ||
        basename.startsWith("_") // Protocol files like _anvil-protocol.md
      ) {
        continue;
      }

      const raw = await readFile(filePath, "utf-8");

      let metadata: Record<string, unknown> = {};
      let content: string = raw;
      try {
        const parsed = matter(raw);
        metadata = parsed.data;
        content = parsed.content;
      } catch {
        // Frontmatter parsing failed (malformed YAML) — use raw content
      }

      const name = extractSkillName(filePath, content);

      // Deduplicate: first occurrence wins (commands > agents > skills)
      if (seen.has(name)) continue;
      seen.add(name);

      const rawMinModel = metadata.min_model;
      const minModel: SkillModelTier | null =
        rawMinModel === "haiku" || rawMinModel === "sonnet" || rawMinModel === "opus"
          ? rawMinModel
          : null;

      skills.set(name, {
        name,
        description: extractDescription(content),
        filePath,
        content: raw,
        metadata,
        minModel,
      });
    }
  }

  return skills;
}

const SKIP_BASENAMES = new Set([
  "TEMPLATE.md", "README.md", "CHANGELOG.md", "INDEX.md", "MEMORY.md",
]);

/**
 * Reload a single skill file into an existing skills map.
 * - If the file no longer exists, removes the skill from the map.
 * - If present, re-parses and updates (or inserts) the entry.
 * Returns the skill name affected, or null if the file should be skipped.
 */
export async function reloadSkill(
  filePath: string,
  skills: Map<string, SkillDefinition>,
): Promise<string | null> {
  const basename = path.basename(filePath);
  if (!basename.endsWith(".md") || SKIP_BASENAMES.has(basename) || basename.startsWith("_")) {
    return null;
  }

  if (!existsSync(filePath)) {
    // File deleted — remove from map by finding the entry with this filePath
    for (const [name, skill] of skills) {
      if (skill.filePath === filePath) {
        skills.delete(name);
        return name;
      }
    }
    return null;
  }

  const raw = await readFile(filePath, "utf-8");
  let metadata: Record<string, unknown> = {};
  let content: string = raw;
  try {
    const parsed = matter(raw);
    metadata = parsed.data;
    content = parsed.content;
  } catch {
    // malformed YAML — use raw
  }

  const name = extractSkillName(filePath, content);
  const rawMinModel = metadata.min_model;
  const minModel: SkillModelTier | null =
    rawMinModel === "haiku" || rawMinModel === "sonnet" || rawMinModel === "opus"
      ? rawMinModel
      : null;
  skills.set(name, { name, description: extractDescription(content), filePath, content: raw, metadata, minModel });
  return name;
}

/**
 * Convert loaded skills into MCP tool definitions.
 */
export function skillsToMcpTools(
  skills: Map<string, SkillDefinition>
): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  const tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> = [];

  for (const [name, skill] of skills) {
    const tierSuffix = skill.minModel ? ` [min-model: ${skill.minModel}]` : "";
    tools.push({
      name: `sf_${name}`,
      description: skill.description + tierSuffix,
      inputSchema: {
        type: "object",
        properties: {
          projectPath: {
            type: "string",
            description: "Absolute path to the target project",
          },
          args: {
            type: "string",
            description: "Optional arguments for the skill",
          },
        },
        required: ["projectPath"],
      },
    });
  }

  return tools;
}
