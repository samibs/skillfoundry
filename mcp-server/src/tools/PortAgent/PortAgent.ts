/**
 * PortAgent execution logic — assigns ports and checks port status.
 */

import { exec, commandExists } from "../../agents/exec-utils.js";

export interface PortAssignResult {
  assigned: boolean;
  port: number;
  method: "portman" | "manual" | "scan";
  appName: string;
  conflict: string | null;
  duration: number;
}

export interface PortCheckResult {
  inUse: boolean;
  port: number;
  pid: string | null;
  process: string | null;
}

/**
 * Check if a port is in use.
 */
async function isPortInUse(port: number): Promise<boolean> {
  const result = await exec("lsof", ["-i", `:${port}`, "-sTCP:LISTEN", "-t"], {
    timeout: 5000,
  });
  return result.success && result.stdout.trim().length > 0;
}

/**
 * Assign a port via portman (if available) or find a free one.
 */
export async function assignPort(appName: string): Promise<PortAssignResult> {
  const start = Date.now();

  // Try portman first
  if (await commandExists("portman")) {
    // Check if already registered
    const listResult = await exec("portman", ["list"], { timeout: 10000 });
    if (listResult.success && listResult.stdout.includes(appName)) {
      // Extract port from portman list
      const lines = listResult.stdout.split("\n");
      for (const line of lines) {
        if (line.includes(appName)) {
          const portMatch = line.match(/(\d{4,5})/);
          if (portMatch) {
            const port = parseInt(portMatch[1], 10);
            const inUse = await isPortInUse(port);
            return {
              assigned: true,
              port,
              method: "portman",
              appName,
              conflict: inUse
                ? `Port ${port} already in use by another process`
                : null,
              duration: Date.now() - start,
            };
          }
        }
      }
    }

    // Assign new port
    const assignResult = await exec("portman", ["assign", appName], {
      timeout: 10000,
    });
    if (assignResult.success) {
      const portMatch = assignResult.stdout.match(/port\s+(\d{4,5})/i);
      if (portMatch) {
        return {
          assigned: true,
          port: parseInt(portMatch[1], 10),
          method: "portman",
          appName,
          conflict: null,
          duration: Date.now() - start,
        };
      }
    }
  }

  // Fallback: scan for free port starting at 3000
  for (let port = 3000; port < 9000; port++) {
    if (!(await isPortInUse(port))) {
      return {
        assigned: true,
        port,
        method: "scan",
        appName,
        conflict: null,
        duration: Date.now() - start,
      };
    }
  }

  return {
    assigned: false,
    port: 0,
    method: "scan",
    appName,
    conflict: "No free ports found in range 3000-9000",
    duration: Date.now() - start,
  };
}

/**
 * Check a specific port's status.
 */
export async function checkPort(port: number): Promise<PortCheckResult> {
  const result = await exec("lsof", ["-i", `:${port}`, "-sTCP:LISTEN"], {
    timeout: 5000,
  });

  if (!result.success || !result.stdout.trim()) {
    return { inUse: false, port, pid: null, process: null };
  }

  const lines = result.stdout.split("\n").filter((l) => l.trim());
  if (lines.length > 1) {
    const parts = lines[1].split(/\s+/);
    return { inUse: true, port, pid: parts[1] || null, process: parts[0] || null };
  }

  return { inUse: true, port, pid: null, process: null };
}
