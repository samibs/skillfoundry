/**
 * ToolRegistry — auto-discovers and manages tool modules.
 *
 * Scans a tools directory for subdirectories containing index.js (compiled output)
 * or index.ts (dev mode with tsx). Each must default-export a ToolModule.
 *
 * Usage:
 *   const registry = new ToolRegistry();
 *   await registry.discover(path.join(import.meta.dirname, 'tools'));
 *   const tool = registry.get('sf_build');
 */

import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolModule } from "./types.js";

/**
 * Validates that a loaded module export has the required ToolModule shape.
 * Checks for the three mandatory fields: name, execute, inputSchema.
 */
function isValidToolModule(obj: unknown): obj is ToolModule {
  if (obj === null || typeof obj !== "object") return false;

  const candidate = obj as Record<string, unknown>;

  if (typeof candidate.name !== "string" || candidate.name.length === 0) return false;
  if (typeof candidate.execute !== "function") return false;
  if (candidate.inputSchema === null || typeof candidate.inputSchema !== "object") return false;

  return true;
}

export class ToolRegistry {
  private tools: Map<string, ToolModule> = new Map();

  /**
   * Scan a directory for tool module subdirectories and dynamically import each one.
   *
   * Each subdirectory must contain an index.js (compiled) or index.ts (dev) file
   * that default-exports a ToolModule. Invalid or missing modules are logged and
   * skipped — discovery never crashes the server.
   *
   * @param toolsDir - Absolute path to the directory containing tool folders.
   */
  async discover(toolsDir: string): Promise<void> {
    if (!existsSync(toolsDir)) {
      console.warn(`[ToolRegistry] Tools directory does not exist: ${toolsDir} — skipping discovery`);
      return;
    }

    let entries: string[];
    try {
      entries = readdirSync(toolsDir);
    } catch (err) {
      console.error(
        `[ToolRegistry] Failed to read tools directory: ${toolsDir}`,
        (err as Error).message
      );
      return;
    }

    for (const entry of entries) {
      const entryPath = join(toolsDir, entry);

      // Only process directories
      let isDir = false;
      try {
        isDir = statSync(entryPath).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;

      // Look for index.js (compiled output) first, then index.ts (dev with tsx)
      const indexJs = join(entryPath, "index.js");
      const indexTs = join(entryPath, "index.ts");

      let indexPath: string | null = null;
      if (existsSync(indexJs)) {
        indexPath = indexJs;
      } else if (existsSync(indexTs)) {
        indexPath = indexTs;
      }

      if (indexPath === null) {
        console.warn(`[ToolRegistry] Skipping ${entry}: no index.js or index.ts found`);
        continue;
      }

      // Dynamic import using file:// URL (works in ESM contexts)
      let loaded: unknown;
      try {
        const moduleUrl = pathToFileURL(indexPath).href;
        const mod = await import(moduleUrl);
        loaded = mod.default ?? mod;
      } catch (err) {
        console.error(
          `[ToolRegistry] Failed to load tool from ${entry}:`,
          (err as Error).message
        );
        continue;
      }

      // Support both single ToolModule exports and arrays of ToolModules
      if (Array.isArray(loaded)) {
        for (const item of loaded) {
          if (isValidToolModule(item)) {
            this.registerInternal(item, entry);
          } else {
            console.warn(
              `[ToolRegistry] Skipping array element in ${entry}: missing required fields (name, execute, inputSchema)`
            );
          }
        }
        continue;
      }

      if (!isValidToolModule(loaded)) {
        console.warn(
          `[ToolRegistry] Skipping ${entry}: export missing required fields (name, execute, inputSchema)`
        );
        continue;
      }

      this.registerInternal(loaded, entry);
    }
  }

  /**
   * Manually register a tool module.
   * Overwrites any existing tool with the same name (case-insensitive).
   *
   * @param tool - A valid ToolModule to register.
   */
  register(tool: ToolModule): void {
    this.registerInternal(tool, "manual");
  }

  /**
   * Get a tool by name (case-insensitive lookup).
   *
   * @param name - Tool name to look up.
   * @returns The ToolModule, or undefined if not found.
   */
  get(name: string): ToolModule | undefined {
    return this.tools.get(name.toLowerCase());
  }

  /**
   * Check if a tool is registered (case-insensitive).
   *
   * @param name - Tool name to check.
   * @returns true if the tool exists in the registry.
   */
  has(name: string): boolean {
    return this.tools.has(name.toLowerCase());
  }

  /**
   * List all registered tools.
   *
   * @returns Array of all registered ToolModule instances.
   */
  list(): ToolModule[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get the count of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Internal registration with logging.
   */
  private registerInternal(tool: ToolModule, source: string): void {
    const key = tool.name.toLowerCase();
    if (this.tools.has(key)) {
      console.warn(`[ToolRegistry] Overwriting existing tool: ${tool.name} (source: ${source})`);
    }
    this.tools.set(key, tool);
    console.log(`[ToolRegistry] Discovered: ${tool.name} (${tool.tier ?? "UNKNOWN"})`);
  }
}
