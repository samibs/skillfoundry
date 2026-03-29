import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { spawn, type ChildProcess } from "child_process";

let serverProcess: ChildProcess;
const PORT = 9878; // Use different port for tests

beforeAll(async () => {
  // Start the server
  serverProcess = spawn("tsx", ["src/server.ts"], {
    cwd: import.meta.dirname ? import.meta.dirname.replace("/tests", "") : process.cwd(),
    env: { ...process.env, SKILLFOUNDRY_PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Wait for server to be ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server start timeout")), 10000);
    const check = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:${PORT}/health`);
        if (res.ok) {
          clearInterval(check);
          clearTimeout(timeout);
          resolve();
        }
      } catch {
        // Server not ready yet
      }
    }, 200);
  });
});

afterAll(() => {
  serverProcess?.kill("SIGTERM");
});

describe("MCP Server", () => {
  it("health endpoint returns ok", async () => {
    const res = await fetch(`http://localhost:${PORT}/health`);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.skills).toBeGreaterThan(0);
  });

  it("agents endpoint lists skills", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/v1/agents`);
    const data = (await res.json()) as { data: unknown[]; meta: { total: number } };
    expect(data.meta.total).toBeGreaterThan(50);
    expect(data.data.length).toBe(data.meta.total);
  });

  it("MCP client can connect and list tools", async () => {
    const transport = new SSEClientTransport(
      new URL(`http://localhost:${PORT}/mcp/sse`)
    );
    const client = new Client({ name: "test-client", version: "1.0.0" });

    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThan(50);

    // Check a known skill exists
    const forgeSkill = tools.tools.find((t) => t.name === "sf_forge");
    expect(forgeSkill).toBeDefined();
    expect(forgeSkill?.description).toBeTruthy();

    await client.close();
  });

  it("MCP client can invoke a skill", async () => {
    const transport = new SSEClientTransport(
      new URL(`http://localhost:${PORT}/mcp/sse`)
    );
    const client = new Client({ name: "test-client", version: "1.0.0" });

    await client.connect(transport);

    const result = await client.callTool({
      name: "sf_health",
      arguments: { projectPath: "/tmp" },
    });

    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);

    const textContent = result.content[0];
    expect(textContent).toHaveProperty("type", "text");

    await client.close();
  });
});
