// Agent prompt loader — reads agent markdown files at runtime so the CLI
// uses the same detailed prompts as IDE slash-commands. Falls back to the
// hardcoded one-liner in agent-registry.ts if the file can't be loaded.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getFrameworkRoot } from './framework.js';

// ---------------------------------------------------------------------------
// Frontmatter parser (lightweight, no dependency)
// ---------------------------------------------------------------------------

export interface ParsedFrontmatter {
  data: Record<string, string>;
  body: string;
}

/**
 * Parse YAML frontmatter from a markdown file's content.
 * Handles `---\nkey: value\n---\nbody` format.
 * Returns empty data + full content as body if no frontmatter found.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) {
    return { data: {}, body: content.trim() };
  }

  const endIdx = trimmed.indexOf('\n---', 3);
  if (endIdx === -1) {
    return { data: {}, body: content.trim() };
  }

  const frontmatterBlock = trimmed.slice(4, endIdx); // skip opening ---\n
  const body = trimmed.slice(endIdx + 4).trim(); // skip closing ---\n

  const data: Record<string, string> = {};
  for (const line of frontmatterBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key) data[key] = value;
  }

  return { data, body };
}

// ---------------------------------------------------------------------------
// Command → filepath index (lazy, built once)
// ---------------------------------------------------------------------------

let _commandIndex: Map<string, string> | null = null;

function buildCommandIndex(): Map<string, string> {
  const index = new Map<string, string>();
  try {
    const root = getFrameworkRoot();
    const agentsDir = join(root, 'agents');
    const files = readdirSync(agentsDir).filter(
      (f) => f.endsWith('.md') && !f.startsWith('_') && !f.startsWith('INDEX') && !f.startsWith('UPGRADE'),
    );

    for (const file of files) {
      const filePath = join(agentsDir, file);
      try {
        // Read full file — frontmatter can be large (description fields with examples).
        // Extract `command:` line via regex to avoid partial-parse issues.
        const content = readFileSync(filePath, 'utf-8');
        const match = content.match(/^command:\s*(.+)$/m);
        const command = match?.[1]?.trim();
        if (command && command !== 'none') {
          index.set(command, filePath);
        }
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    // Framework root unavailable — return empty index, all agents fall back to hardcoded
  }
  return index;
}

// ---------------------------------------------------------------------------
// Prompt cache (each file read at most once)
// ---------------------------------------------------------------------------

const _promptCache = new Map<string, string | null>();

/**
 * Load the full markdown body from an agent's source file.
 * Returns null if the agent has no markdown file or the file can't be read.
 * Results are cached after first load.
 */
export function loadAgentPromptFromFile(agentName: string): string | null {
  if (_promptCache.has(agentName)) {
    return _promptCache.get(agentName) ?? null;
  }

  if (!_commandIndex) {
    _commandIndex = buildCommandIndex();
  }

  const filePath = _commandIndex.get(agentName);
  if (!filePath) {
    _promptCache.set(agentName, null);
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const { body } = parseFrontmatter(content);
    const prompt = body || null;
    _promptCache.set(agentName, prompt);
    return prompt;
  } catch {
    _promptCache.set(agentName, null);
    return null;
  }
}

/**
 * Reset all caches — used in testing.
 */
export function _resetPromptLoaderCache(): void {
  _commandIndex = null;
  _promptCache.clear();
}
