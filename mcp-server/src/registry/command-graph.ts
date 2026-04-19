/**
 * Command Graph Segmentation — partitions registered tools by category.
 *
 * Provides functions to build a segmented graph from a flat tool list,
 * flatten it back, and produce summary counts per category.
 */

import type { ToolCategory, ToolModule } from '../tools/types.js';

/**
 * A tool collection partitioned by category.
 */
export interface CommandGraph {
  builtins: ToolModule[];
  plugins: ToolModule[];
  skills: ToolModule[];
  dynamic: ToolModule[];
}

/**
 * Numeric summary of tools per category.
 */
export interface GraphSummary {
  builtins: number;
  plugins: number;
  skills: number;
  dynamic: number;
  total: number;
}

/** Maps ToolCategory values to CommandGraph keys. */
const CATEGORY_KEY_MAP: Record<ToolCategory, keyof CommandGraph> = {
  builtin: 'builtins',
  plugin: 'plugins',
  skill: 'skills',
  dynamic: 'dynamic',
};

/**
 * Partition a flat array of tools into category-based segments.
 *
 * Tools without a recognized category are placed in the `dynamic` bucket
 * as a safe default (mirrors the catch-all behavior for unknown sources).
 *
 * @param tools - Flat array of registered ToolModule instances.
 * @returns A CommandGraph with tools grouped by category.
 */
export function buildCommandGraph(tools: ToolModule[]): CommandGraph {
  const graph: CommandGraph = {
    builtins: [],
    plugins: [],
    skills: [],
    dynamic: [],
  };

  for (const tool of tools) {
    const key = CATEGORY_KEY_MAP[tool.category] ?? 'dynamic';
    graph[key].push(tool);
  }

  return graph;
}

/**
 * Merge all graph segments back into a single flat array.
 *
 * Order: builtins, plugins, skills, dynamic.
 *
 * @param graph - A CommandGraph to flatten.
 * @returns All tools in a single array.
 */
export function flattenGraph(graph: CommandGraph): ToolModule[] {
  return [
    ...graph.builtins,
    ...graph.plugins,
    ...graph.skills,
    ...graph.dynamic,
  ];
}

/**
 * Produce a numeric summary of how many tools exist in each category.
 *
 * @param graph - A CommandGraph to summarize.
 * @returns Counts per category plus a total.
 */
export function graphSummary(graph: CommandGraph): GraphSummary {
  return {
    builtins: graph.builtins.length,
    plugins: graph.plugins.length,
    skills: graph.skills.length,
    dynamic: graph.dynamic.length,
    total:
      graph.builtins.length +
      graph.plugins.length +
      graph.skills.length +
      graph.dynamic.length,
  };
}
