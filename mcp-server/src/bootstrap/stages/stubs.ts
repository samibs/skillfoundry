/**
 * Stub stages for pipeline slots 3, 4, 6, 7.
 *
 * These log readiness messages and will be replaced with real
 * implementations as integration proceeds.
 */

import type { BootstrapStage } from "../pipeline.js";

export function createToolRegistryStage(): BootstrapStage {
  return {
    name: "tool-registry",
    order: 3,
    required: true,
    async execute(): Promise<void> {
      console.log("  Tool registry: ready for integration");
    },
  };
}

export function createSkillLoadStage(): BootstrapStage {
  return {
    name: "skill-load",
    order: 4,
    required: true,
    async execute(): Promise<void> {
      console.log("  Skill loader: ready for integration");
    },
  };
}

export function createPermissionsStage(): BootstrapStage {
  return {
    name: "permissions",
    order: 6,
    required: true,
    async execute(): Promise<void> {
      console.log("  Permission context: ready for integration");
    },
  };
}

export function createTransportStage(): BootstrapStage {
  return {
    name: "transport",
    order: 7,
    required: true,
    async execute(): Promise<void> {
      console.log("  Transport: ready for integration");
    },
  };
}
