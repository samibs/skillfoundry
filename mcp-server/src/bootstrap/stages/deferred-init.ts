/**
 * Stage 5: Deferred Init — optional tool availability check.
 *
 * In trusted workspaces, probes for Playwright and Semgrep.
 * In untrusted workspaces (SKILLFOUNDRY_TRUST=false), skips entirely.
 */

import { exec } from "../../agents/exec-utils.js";
import type { BootstrapStage } from "../pipeline.js";

export function createDeferredInitStage(): BootstrapStage {
  return {
    name: "deferred-init",
    order: 5,
    required: false,
    async execute(): Promise<void> {
      const trust = process.env.SKILLFOUNDRY_TRUST;

      if (trust === "false") {
        console.log("  Untrusted workspace — skipping deferred init");
        return;
      }

      // Playwright check
      const playwrightResult = await exec("npx", ["playwright", "--version"], {
        timeout: 30000,
      });
      if (playwrightResult.success) {
        console.log(`  Playwright ${playwrightResult.stdout.trim()} — available`);
      } else {
        console.log("  Playwright — not installed");
      }

      // Semgrep check
      const semgrepResult = await exec("semgrep", ["--version"], {
        timeout: 30000,
      });
      if (semgrepResult.success) {
        console.log(`  Semgrep ${semgrepResult.stdout.trim()} — available`);
      } else {
        console.log("  Semgrep — not installed");
      }
    },
  };
}
