/**
 * Bootstrap module — factory for the SkillFoundry startup pipeline.
 *
 * Usage:
 *   const pipeline = createBootstrapPipeline();
 *   await pipeline.run();
 */

export { BootstrapPipeline } from "./pipeline.js";
export type { BootstrapStage, BootstrapState } from "./pipeline.js";

import { BootstrapPipeline } from "./pipeline.js";
import { createPrefetchStage } from "./stages/prefetch.js";
import { createGuardsStage } from "./stages/guards.js";
import {
  createToolRegistryStage,
  createSkillLoadStage,
  createPermissionsStage,
  createTransportStage,
} from "./stages/stubs.js";
import { createDeferredInitStage } from "./stages/deferred-init.js";

/**
 * Create and configure the full bootstrap pipeline with all 7 stages.
 *
 * @returns A BootstrapPipeline ready to run
 */
export function createBootstrapPipeline(): BootstrapPipeline {
  const pipeline = new BootstrapPipeline();

  pipeline.addStage(createPrefetchStage());       // 1 — prefetch (required)
  pipeline.addStage(createGuardsStage());          // 2 — guards (required)
  pipeline.addStage(createToolRegistryStage());    // 3 — tool-registry (required)
  pipeline.addStage(createSkillLoadStage());       // 4 — skill-load (required)
  pipeline.addStage(createDeferredInitStage());    // 5 — deferred-init (optional)
  pipeline.addStage(createPermissionsStage());     // 6 — permissions (required)
  pipeline.addStage(createTransportStage());       // 7 — transport (required)

  return pipeline;
}
