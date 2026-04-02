/**
 * Stage 1: Prefetch — validate environment configuration.
 *
 * Checks that SKILLFOUNDRY_ROOT resolves to an existing directory
 * and that SKILLFOUNDRY_PORT is a valid number.
 */

import fs from "fs";
import path from "path";
import type { BootstrapStage } from "../pipeline.js";

export function createPrefetchStage(): BootstrapStage {
  return {
    name: "prefetch",
    order: 1,
    required: true,
    async execute(): Promise<void> {
      const root = path.resolve(
        process.env.SKILLFOUNDRY_ROOT || process.cwd()
      );

      if (!fs.existsSync(root)) {
        throw new Error(
          `SKILLFOUNDRY_ROOT does not exist: ${root}`
        );
      }

      if (!fs.statSync(root).isDirectory()) {
        throw new Error(
          `SKILLFOUNDRY_ROOT is not a directory: ${root}`
        );
      }

      const portRaw = process.env.SKILLFOUNDRY_PORT || "9877";
      const port = parseInt(portRaw, 10);

      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error(
          `SKILLFOUNDRY_PORT is not a valid port number: "${portRaw}"`
        );
      }

      console.log(`  Config loaded:`);
      console.log(`    SKILLFOUNDRY_ROOT = ${root}`);
      console.log(`    SKILLFOUNDRY_PORT = ${port}`);
    },
  };
}
