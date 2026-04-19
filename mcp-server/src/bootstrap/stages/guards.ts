/**
 * Stage 2: Guards — verify runtime prerequisites.
 *
 * Ensures Node >= 20, git is available, and npm is available.
 */

import { exec } from "../../agents/exec-utils.js";
import type { BootstrapStage } from "../pipeline.js";

export function createGuardsStage(): BootstrapStage {
  return {
    name: "guards",
    order: 2,
    required: true,
    async execute(): Promise<void> {
      // Node version check
      const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
      if (nodeMajor < 20) {
        throw new Error(
          `Node.js >= 20 required (found ${process.versions.node})`
        );
      }
      console.log(`  Node.js ${process.versions.node} — OK`);

      // git check
      const gitResult = await exec("git", ["--version"]);
      if (!gitResult.success) {
        throw new Error(
          `git is not installed or not on PATH. Install git and try again.`
        );
      }
      console.log(`  ${gitResult.stdout.trim()} — OK`);

      // npm check
      const npmResult = await exec("npm", ["--version"]);
      if (!npmResult.success) {
        throw new Error(
          `npm is not installed or not on PATH. Install npm and try again.`
        );
      }
      console.log(`  npm ${npmResult.stdout.trim()} — OK`);
    },
  };
}
