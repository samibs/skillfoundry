import { readFileSync } from "fs";
import path from "path";

/**
 * Server version, read from mcp-server/package.json so health checks, the MCP
 * handshake and the startup log cannot drift from the released package (they
 * were hardcoded to 5.15.0 while the package moved on). Resolves the same way
 * from src/ (tsx) and dist/ (compiled), both one level below the package root.
 */
export const SERVER_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(import.meta.dirname, "..", "package.json"), "utf8"),
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
})();
